/* =====================================================================
 * engine.js — 갱신(직접 조회) 순서 제어와 항차 상태 계산
 * ---------------------------------------------------------------------
 * [갱신] 사용자가 갱신 버튼을 누르면 선박 한 척에 대해 차례로
 *   ① Wingo Marine 공개 선박 페이지 : 정밀 좌표·24시간 항적·속력·침로·목적지 (주 소스, 로그인 불필요)
 *      MMSI 를 모르면 Wingo 공개 검색으로 먼저 알아낸다
 *   ② VesselFinder 선박 상세 : 직전 항만·출항 시각·AIS 입력 ETA·제원 (보조 소스, Wingo 에 없는 값)
 *   ③ 목적 항만 도선예보(여수) : 도선사 승선 예정 시각·선석
 *   ④ 사용자 지정 소스 : 추가 교차 확인용
 *   을 직접 열어 읽는다. 주기적 수신·백그라운드 통신은 없다.
 * [계산] 화면은 view() 가 만든 "항차 상태" 한 덩어리만 보고 그린다.
 *   - 실측(fix)과 추정(추측항법, DR)을 섞지 않고 따로 담는다.
 * ===================================================================== */
(function (root) {
  'use strict';
  var FST = root.FST = root.FST || {};
  var U = FST.Util, R = FST.Route, P = FST.Parsers, B = FST.Bridge, S = FST.Store;
  var E = FST.Engine = {};

  var DR_MAX_HOURS = 96;                               // 이보다 오래된 실측으로는 추정 위치를 만들지 않는다
  var routeCache = {};                                 // 항로 계산 결과 캐시 (같은 입력이면 다시 계산하지 않음)

  /* ================= 갱신 ================= */

  // 선명·번호로 선박 후보 찾기: Wingo 공개 검색 우선, 실패하면 VesselFinder 검색 화면
  E.searchByName = function (name) {
    return B.scrape({ url: P.wingoSearchUrl(name), script: P.wingoSearchScript(), timeoutMs: 15000 }).then(function (res) {
      var r = res.ok ? P.parseWingoSearch(res.data) : { ok: false, error: res.error, list: [] };
      if (r.ok) { r.src = 'wingo'; return r; }
      return B.scrape({ url: P.vfSearchUrl(name), script: P.vfSearchScript(), timeoutMs: 20000 }).then(function (res2) {
        if (!res2.ok) return { ok: false, error: res2.error, list: [] };
        var r2 = P.parseVfSearch(res2.data);
        r2.src = 'vf';
        return r2;
      });
    });
  };

  // 선박 한 척 갱신. onStep(단계이름, 상태) 으로 진행 상황을 알려 준다. → Promise<요약>
  E.refreshVessel = function (v, onStep) {
    var now = Date.now();
    var step = onStep || function () {};
    var summary = { vessel: v.id, steps: [] };

    function record(id, label, r) {                    // 소스별 결과를 선박에 기록
      v.src[id] = { ok: !!r.ok, at: Date.now(), error: r.ok ? '' : (r.error || 'unknown'), label: label, info: r.info || '' };
      summary.steps.push({ id: id, label: label, ok: !!r.ok, error: v.src[id].error, info: v.src[id].info });
      step(label, r.ok ? 'ok' : 'fail');
    }

    // ⓪ MMSI 확보: Wingo 선박 주소는 MMSI 기준이라, 없으면 공개 검색으로 알아낸다
    function doResolve() {
      if (v.mmsi) return Promise.resolve();
      var q = v.imo || v.name;
      if (!q) return Promise.resolve();
      step('Wingo 검색', 'run');
      return B.scrape({ url: P.wingoSearchUrl(q), script: P.wingoSearchScript(), timeoutMs: 15000 }).then(function (res) {
        if (!res.ok) { record('wingo-find', 'Wingo 검색', { ok: false, error: res.error }); return; }
        var r = P.parseWingoSearch(res.data);
        if (!r.ok) { record('wingo-find', 'Wingo 검색', r); return; }
        var hit = P.pickWingoMatch(r.list, v);
        if (!hit) { record('wingo-find', 'Wingo 검색', { ok: false, error: 'notfound' }); return; }
        v.mmsi = hit.mmsi;
        if (!v.imo && hit.imo) v.imo = hit.imo;
        record('wingo-find', 'Wingo 검색', { ok: true, info: hit.name + ' · MMSI ' + hit.mmsi });
      });
    }

    // ① Wingo 선박 페이지 (정밀 좌표·24시간 항적·속력·침로·목적지)
    function doWingo() {
      var url = P.wingoShipUrl(v.mmsi);
      if (!url) { record('wingo', 'Wingo Marine', { ok: false, error: 'noid' }); return Promise.resolve(); }
      step('Wingo Marine', 'run');
      return B.scrape({ url: url, script: P.wingoShipScript(), timeoutMs: 25000 }).then(function (res) {
        if (!res.ok) { record('wingo', 'Wingo Marine', { ok: false, error: P.isChallenge(res.title, '') ? 'challenge' : res.error }); return; }
        var d = P.parseWingo(res.data, Date.now());
        if (!d.ok) { record('wingo', 'Wingo Marine', d); return; }
        applyWingo(v, d);
        record('wingo', 'Wingo Marine', { ok: true, info: (d.live ? '실시간 수신' : '마지막 수신') + (d.posTs ? ' · ' + U.ago(d.posTs, Date.now()) : '') });
      });
    }

    // ② VesselFinder (직전 항만·출항 시각·AIS ETA·제원 보충)
    function doVf() {
      var url = P.vfDetailUrl(v);
      if (!url) { record('vf', 'VesselFinder', { ok: false, error: 'noid' }); return Promise.resolve(); }
      step('VesselFinder', 'run');
      return B.scrape({ url: url, script: P.dumpScript(2500, '#djson'), timeoutMs: 22000 }).then(function (res) {
        if (!res.ok) { record('vf', 'VesselFinder', { ok: false, error: P.isChallenge(res.title, '') ? 'challenge' : res.error }); return; }
        var d = P.parseVesselFinder(res.data, Date.now());
        if (!d.ok) { record('vf', 'VesselFinder', d); return; }
        applyVf(v, d);
        record('vf', 'VesselFinder', { ok: true, info: d.posAgeText ? '위치 수신 ' + d.posAgeText : '' });
      });
    }

    // ② 사용자 지정 소스 (설정에 등록한 순서대로)
    function doCustom() {
      var list = (S.get().settings.customSources || []).filter(function (c) { return c.url; });
      return list.reduce(function (chain, c) {
        return chain.then(function () {
          var url = P.fillTemplate(c.url, v);
          step(c.name, 'run');
          return B.scrape({ url: url, script: P.dumpScript(9000, ''), timeoutMs: 30000 }).then(function (res) {
            var sid = 'c:' + c.id;
            if (!res.ok) { record(sid, c.name, { ok: false, error: P.isChallenge(res.title, '') ? 'challenge' : res.error }); return; }
            if (P.isChallenge(res.data.title, res.data.text)) { record(sid, c.name, { ok: false, error: 'challenge' }); return; }
            var g = P.parseGeneric(res.data.text);
            if (!g.ok) { record(sid, c.name, g); return; }
            var ageMs = P.agoToMs(g.posTimeText);      // "12 min ago" 같은 표기가 있으면 그만큼 과거로
            S.addFix(v, {
              t: Date.now() - (ageMs || 0), lat: g.lat, lon: g.lon, sog: g.sog, cog: g.cog,
              src: sid, timeAssumed: ageMs == null       // 수신 시각을 못 읽었으면 '조회 시각으로 간주' 표시
            });
            if (g.destText && !v.voyage.destText) v.voyage.destText = g.destText;
            record(sid, c.name, { ok: true, info: U.fmtPos(g.lat, g.lon) });
          });
        });
      }, Promise.resolve());
    }

    // ③ 도선예보 (목적 항만이 지원 대상일 때만)
    function doPilot() {
      var port = E.destPort(v);
      if (!port || port.pilot !== 'yspilot') return Promise.resolve();
      step('여수 도선예보', 'run');
      var dates = [0, 1, 2].map(function (k) { return U.kstYmd(Date.now(), k); }); // 오늘·내일·모레
      return B.scrape({ url: P.YSPILOT_URL, script: P.yspilotScript(dates), timeoutMs: 25000 }).then(function (res) {
        if (!res.ok) { record('yspilot', '여수 도선예보', { ok: false, error: res.error }); return; }
        var d = P.parseYsPilot(res.data, v);
        if (!d.ok) { record('yspilot', '여수 도선예보', d); return; }
        v.pilotRows = d.rows;
        record('yspilot', '여수 도선예보', { ok: true, info: d.rows.length ? d.rows.length + '건 일치' : '예보에 아직 없음' });
      });
    }

    return doResolve().then(doWingo).then(doVf).then(doCustom).then(doPilot).then(function () {
      v.lastRefresh = now;
      routeCache = {};                                 // 위치가 바뀌었을 수 있으니 항로 캐시 비움
      S.save();
      return summary;
    });
  };

  // 항적에서 마지막 '정지 구간'을 찾아 근처 항만을 출항지로 추정한다.
  // 조건: 0.5해리 안에 2점 이상 모여 있고, 지금은 그곳에서 3해리 넘게 떠났고, 15해리 안에 등록 항만이 있을 것
  function trackOrigin(track, here, sog) {
    if (!track || track.length < 3 || sog == null || sog < 3) return null; // 지금 움직이고 있을 때만 의미가 있다
    for (var i = track.length - 2; i >= 0; i--) {                          // 끝(현재)에서 거꾸로 훑는다
      if (U.distNm(track[i], track[i + 1]) > 0.5) continue;                // 정지 구간이 아님
      var c = track[i];
      if (U.distNm(c, here) < 3) continue;                                 // 아직 그 자리 근처: 출항 전·직후
      var port = R.nearPort(c, 15);
      if (!port) return null;                                              // 바다 위 대기(투묘)였음 → 기항 아님
      var along = 0;                                                       // 정지 지점 → 현재까지 항적 길이
      for (var k = i + 1; k < track.length; k++) along += U.distNm(track[k - 1], track[k]);
      along += U.distNm(track[track.length - 1], here);
      return { portId: port.id, lat: c[0], lon: c[1], alongNm: along };
    }
    return null;
  }

  // Wingo 에서 읽은 값을 선박에 반영: 정밀 좌표·항적은 실측으로 기록
  function applyWingo(v, d) {
    ['imo', 'mmsi', 'callsign', 'type'].forEach(function (k) { if (d[k]) v[k] = d[k]; });
    if (d.flag && !v.flag) v.flag = d.flag;
    if (d.dwt) v.dwt = d.dwt;
    if (d.loa) v.loa = d.loa;
    if (d.name && !v.name.replace(/^(IMO|MMSI) \d+$/, '')) v.name = d.name.toUpperCase(); // 번호로만 등록했던 배는 선명을 채운다
    else if (d.name && /^(IMO|MMSI) \d+$/.test(v.name)) v.name = d.name.toUpperCase();
    var posTs = d.posTs || Date.now();
    var here = [d.lat, d.lon];
    // 현재 실측을 먼저 기록 (수신 시각이 확실한 값)
    S.addFix(v, { t: posTs, lat: d.lat, lon: d.lon, sog: d.sog, cog: d.cog != null ? d.cog : d.heading, src: 'wingo' });
    // 24시간 항적: 각 점의 시각은 페이지에 없으므로 현재 속력으로 거슬러 계산한 근사값 (지나온 길 표시용)
    var raw = (d.track || []).filter(function (q) { return U.distNm(q, here) > 0.05; }); // 현재 위치와 같은 점 제외
    if (raw.length) {
      var pts = raw.filter(function (q, i, arr) {                           // 너무 촘촘한 점은 솎아 낸다 (정박 중 흔들림 등)
        return i === 0 || U.distNm(arr[i - 1], q) > 0.3;
      }).slice(-40);
      var spd = Math.max(d.sog || 0, 6);                                   // 정지 중이면 6노트로 가정해 시각을 벌린다
      var back = 0;                                                         // 현재 위치에서 거꾸로 따라간 거리
      var prev = here;
      for (var i = pts.length - 1; i >= 0; i--) {
        back += U.distNm(prev, pts[i]);
        prev = pts[i];
        var t = Math.round(posTs - Math.min(24 * 36e5, back / spd * 36e5) - (pts.length - i)); // 같은 시각이 겹치지 않게 1ms씩 차이
        S.addFix(v, { t: t, lat: pts[i][0], lon: pts[i][1], sog: null, cog: null, src: 'wingo', timeAssumed: true });
      }
    }
    // 항적 안에 '멈춰 있던 구간'이 항만 근처에 있으면 그곳을 실제 출항지로 본다
    // (VesselFinder 의 직전 항만 기록은 기항을 놓쳐 며칠 전 항만으로 남아 있는 경우가 있다)
    var to = trackOrigin(d.track || [], here, d.sog);
    v.voyage = v.voyage || {};
    if (to) {
      to.dest = d.destText || d.destCode || '';                             // 어느 항차에 대한 추정인지 표시
      to.depTs = to.alongNm != null ? Math.round(posTs - to.alongNm / Math.max(d.sog || 0, 6) * 36e5) : null;
      v.voyage.trackOrigin = to;
    } else if (v.voyage.trackOrigin && v.voyage.trackOrigin.dest !== (d.destText || d.destCode || '')) {
      v.voyage.trackOrigin = null;                                          // 목적지가 바뀌었으면 이전 추정은 버린다
    }
    v.voyage = v.voyage || {};
    var dest = d.destText || d.destCode;
    if (dest) v.voyage.destText = dest;                                      // Wingo 목적지가 가장 최신
    if (d.draught) v.voyage.draught = d.draught;
    if (d.sog != null) v.voyage.sog = d.sog;
    if (d.cog != null) v.voyage.cog = d.cog;
    v.voyage.posTs = posTs;
    if (d.etaTs) { v.voyage.etaTs = d.etaTs; v.voyage.etaText = d.etaText; v.voyage.etaKind = 'ETA'; }
    if (d.nearText) v.voyage.nearText = d.nearText;
    v.voyage.wingoLive = !!d.live;
    v.voyage.at = Date.now();
  }

  // VesselFinder 에서 읽은 값을 선박에 반영 (Wingo 가 이미 채운 값은 덮지 않는 보조 소스)
  function applyVf(v, d) {
    ['imo', 'mmsi', 'callsign', 'type', 'flag'].forEach(function (k) { if (d[k]) v[k] = d[k]; });
    if (d.dwt) v.dwt = d.dwt;
    if (d.loa) v.loa = d.loa;
    if (d.name && U.normName(d.name) && !v.name) v.name = d.name.toUpperCase();
    var vo = v.voyage = v.voyage || {};
    var hasWingo = !!(v.src && v.src.wingo && v.src.wingo.ok);
    if (!hasWingo || !vo.destText) { vo.destText = d.destText || vo.destText || ''; }
    if (d.etaTs && (!hasWingo || !vo.etaTs)) { vo.etaTs = d.etaTs; vo.etaText = d.etaText || ''; vo.etaKind = d.etaKind || ''; }
    vo.lastPortText = d.lastPortText || vo.lastPortText || '';
    vo.atdTs = d.atdTs || vo.atdTs || null;
    if (!hasWingo) {
      vo.draught = d.draught; vo.sog = d.sog; vo.cog = d.cog; vo.posTs = d.posTs;
    }
    vo.navStatus = d.navStatus || '';
    vo.posAgeText = d.posAgeText || '';
    vo.satNote = d.satNote || '';
    vo.at = Date.now();
    if (d.lat != null && d.coarse) {                   // 1도 단위 개략 위치는 항적에 넣지 않고 따로 보관
      v.voyage.coarse = { lat: d.lat, lon: d.lon, ts: d.posTs };
    } else if (d.lat != null && d.posTs) {             // 정밀 좌표가 나온 경우에만 실측으로 기록
      S.addFix(v, { t: d.posTs, lat: d.lat, lon: d.lon, sog: d.sog, cog: d.cog, src: 'vf' });
    }
  }

  // 손으로 위치 입력 (대리점 통보, Wingo 화면을 보고 옮겨 적는 경우)
  E.addManualFix = function (v, o) {
    var ok = S.addFix(v, { t: o.t || Date.now(), lat: +o.lat, lon: +o.lon, sog: o.sog === '' || o.sog == null ? null : +o.sog,
      cog: o.cog === '' || o.cog == null ? null : +o.cog, src: 'manual' });
    routeCache = {};
    S.save();
    return ok;
  };

  /* ================= 계산 ================= */

  // 목적 항만: 사용자가 고른 값 우선, 없으면 AIS 목적지 문구에서 추정
  E.destPort = function (v) {
    return (v.destPortId && R.portById(v.destPortId)) || R.matchPort(v.voyage && v.voyage.destText) || null;
  };
  // 출항 항만과 그 근거. 우선순위: 사용자가 고른 값 > Wingo 항적의 정지 지점 > VesselFinder 직전 항만
  // → {port, kind:'user'|'track'|'vf', ts, tsEst, text}
  E.originInfo = function (v) {
    var vo = v.voyage || {};
    var vfPort = R.matchPort(vo.lastPortText);
    if (v.originPortId && v.originUser) {
      var up = R.portById(v.originPortId);
      if (up) return { port: up, kind: 'user', ts: vfPort && vfPort.id === up.id ? vo.atdTs : null, tsEst: false, text: up.ko };
    }
    var to = vo.trackOrigin;
    if (to && R.portById(to.portId)) {
      var tp = R.portById(to.portId);
      return { port: tp, kind: 'track', ts: to.depTs || null, tsEst: true, text: tp.ko };
    }
    if (vfPort || vo.lastPortText) {
      return { port: vfPort, kind: 'vf', ts: vo.atdTs || null, tsEst: false, text: (vfPort && vfPort.ko) || vo.lastPortText };
    }
    return null;
  };
  E.originPort = function (v) { var o = E.originInfo(v); return o ? o.port : null; };

  // 소스 id → 화면 표시 이름
  E.srcName = function (src) {
    if (src === 'wingo') return 'Wingo Marine';
    if (src === 'wingo-find') return 'Wingo 검색';
    if (src === 'vf') return 'VesselFinder';
    if (src === 'manual') return '수동 입력';
    if (src === 'seed') return '피클 이관값';
    if (src && src.indexOf('c:') === 0) {
      var id = src.slice(2), hit = (S.get().settings.customSources || []).filter(function (c) { return c.id === id; })[0];
      return hit ? hit.name : '사용자 소스';
    }
    return src || '-';
  };

  function cached(key, fn) {
    if (!routeCache[key]) routeCache[key] = fn();
    return routeCache[key];
  }

  // 화면이 쓰는 항차 상태 한 덩어리
  E.view = function (v, now) {
    now = now || Date.now();
    var vw = { v: v, now: now };
    var fixes = v.fixes || [];
    var fix = fixes.length ? fixes[fixes.length - 1] : null; // 가장 최근 실측
    vw.fix = fix;
    vw.coarse = (!fix && v.voyage && v.voyage.coarse) ? v.voyage.coarse : null; // 실측이 없을 때만 개략 위치 사용
    vw.dest = E.destPort(v);
    var oi = E.originInfo(v);
    vw.originInfo = oi;
    vw.origin = oi ? oi.port : null;
    vw.destText = (vw.dest && vw.dest.ko) || (v.voyage && v.voyage.destText) || '';
    vw.originText = oi ? oi.text : '';
    vw.originTs = oi ? oi.ts : null;                    // 출항 시각 (tsEst 면 항적으로 계산한 대략값)
    vw.originTsEst = oi ? oi.tsEst : false;
    vw.originDoubt = false;
    // VesselFinder 직전 항만이 목적지와 같은데 배가 그곳에서 멀리 있으면, 기항을 놓친 오래된 기록일 가능성이 크다
    if (oi && oi.kind === 'vf' && vw.origin && vw.dest && vw.origin.id === vw.dest.id && fix &&
        U.distNm([fix.lat, fix.lon], [vw.dest.lat, vw.dest.lon]) > 20) {
      vw.originDoubt = true;
      vw.origin = null;                                  // 지도에 엉뚱한 추정선을 그리지 않는다
      vw.originText = '직전 항만 미확인';
      vw.originTs = null;
    }

    // 속력·침로: 실측에 없으면 VesselFinder 값으로 보충
    vw.sog = fix && fix.sog != null ? fix.sog : (v.voyage && v.voyage.sog != null ? v.voyage.sog : null);
    vw.cog = fix && fix.cog != null ? fix.cog : (v.voyage && v.voyage.cog != null ? v.voyage.cog : null);

    // 실측 신선도
    vw.fixAgeH = fix ? (now - fix.t) / 36e5 : null;
    vw.fresh = !fix ? 'none' : vw.fixAgeH < 1 ? 'fresh' : vw.fixAgeH < 6 ? 'ok' : vw.fixAgeH < 24 ? 'aging' : 'stale';

    // 앞으로 갈 항로 (실측 위치 → 목적 항만)
    vw.future = [];
    if (fix && vw.dest) {
      vw.future = cached('f|' + fix.lat.toFixed(3) + '|' + fix.lon.toFixed(3) + '|' + vw.dest.id, function () {
        return R.toPort([fix.lat, fix.lon], vw.dest);
      });
    }
    var totalAhead = vw.future.length > 1 ? U.pathNm(vw.future) : null; // 실측 시점의 잔여 거리

    // 추측항법(DR): 실측 이후 같은 속력으로 항로를 따라갔다고 가정한 "지금쯤 위치"
    vw.dr = null;
    vw.arrivedEst = false;
    if (fix && totalAhead != null && vw.sog != null && vw.sog >= 0.5 && vw.fixAgeH > 0.05 && vw.fixAgeH <= DR_MAX_HOURS) {
      var adv = vw.sog * vw.fixAgeH;                   // 그동안 갔을 거리
      var pa = U.pointAlong(vw.future, adv);
      vw.dr = { lat: pa.pos[0], lon: pa.pos[1], bearing: pa.bearing, advNm: Math.min(adv, totalAhead) };
      vw.arrivedEst = adv >= totalAhead;               // 계산상 이미 도착했을 시간
    }
    vw.cur = vw.dr ? { lat: vw.dr.lat, lon: vw.dr.lon, est: true } : fix ? { lat: fix.lat, lon: fix.lon, est: false } : null;
    vw.heading = vw.dr ? vw.dr.bearing : vw.cog != null ? vw.cog : (vw.future.length > 1 ? U.bearing(vw.future[0], vw.future[1]) : 0);

    // 잔여 거리와 계산 ETA
    vw.remainNm = totalAhead == null ? null : Math.max(0, totalAhead - (vw.dr ? vw.dr.advNm : 0));
    vw.etaCalc = (vw.remainNm != null && vw.sog != null && vw.sog >= 0.5) ? now + vw.remainNm / vw.sog * 36e5 : null;

    // 지나온 길: 출항지 → 첫 실측(추정선) + 실측들 사이
    vw.pastEst = [];                                   // 출항지 ~ 첫 실측 (기록이 없어 추정)
    vw.pastTrack = [];                                 // 실측 기록을 이은 선
    if (fixes.length) {
      var f0 = fixes[0];
      if (vw.origin) {
        vw.pastEst = cached('p|' + vw.origin.id + '|' + f0.lat.toFixed(3) + '|' + f0.lon.toFixed(3), function () {
          return R.fromPort(vw.origin, [f0.lat, f0.lon]);
        });
      }
      vw.pastTrack = cached('t|' + fixes.length + '|' + f0.t + '|' + fix.t, function () {
        var pts = [[f0.lat, f0.lon]];
        for (var i = 1; i < fixes.length; i++) {
          var a = [fixes[i - 1].lat, fixes[i - 1].lon], b = [fixes[i].lat, fixes[i].lon];
          if (U.distNm(a, b) < 0.05) continue;         // 사실상 같은 자리
          // 실측점은 실제로 배가 있던 자리라 그대로 잇는다. 기록 공백이 길고(30해리+) 직선이 육지를 관통할 때만 우회선으로 메운다
          var seg = (U.distNm(a, b) >= 30 && R.lineHitsLand(a, b)) ? R.seaPath(a, b) : [a, b];
          pts = pts.concat(seg.slice(1));
        }
        return pts;
      });
    }
    var sailed = (vw.pastEst.length > 1 ? U.pathNm(vw.pastEst) : 0) + (vw.pastTrack.length > 1 ? U.pathNm(vw.pastTrack) : 0) + (vw.dr ? vw.dr.advNm : 0);
    vw.sailedNm = sailed;
    vw.progress = (vw.remainNm != null && sailed + vw.remainNm > 0) ? Math.max(0, Math.min(1, sailed / (sailed + vw.remainNm))) : null;

    // 운항 상태
    var berthDist = (vw.cur && vw.dest) ? U.distNm([vw.cur.lat, vw.cur.lon], [vw.dest.lat, vw.dest.lon]) : null;
    vw.state = !vw.cur ? 'unknown'
      : (berthDist != null && berthDist < 1.5 && !vw.cur.est) ? 'arrived'
      : vw.arrivedEst ? 'arrived-est'
      : vw.sog == null ? 'unknown'
      : vw.sog < 0.5 ? 'stopped' : vw.sog < 6 ? 'slow' : 'underway';

    // 도선예보: 아직 끝나지 않은 접안(B) 일정 중 가장 이른 것
    var rows = (v.pilotRows || []).filter(function (r) { return r.ts && r.ts > now - 3 * 36e5 && r.spec !== '완료'; });
    vw.pilotNext = rows.filter(function (r) { return r.kind === 'B'; })[0] || rows[0] || null;
    vw.pilotRows = v.pilotRows || [];

    // AIS 에 선박이 입력한 ETA (UTC 로 간주한 값)
    vw.etaAis = (v.voyage && v.voyage.etaKind !== 'ATA' && v.voyage.etaTs) ? v.voyage.etaTs : null;

    // 대표 ETA: 도선예보 > 계산값 > AIS 입력값 순으로 신뢰
    vw.eta = vw.pilotNext && vw.pilotNext.kind === 'B' ? { ts: vw.pilotNext.ts, kind: 'pilot', label: '도선 승선 예정' }
      : (vw.etaCalc && vw.state !== 'stopped') ? { ts: vw.etaCalc, kind: 'calc', label: '계산 ETA' }
      : vw.etaAis ? { ts: vw.etaAis, kind: 'ais', label: 'AIS 입력 ETA' } : null;

    // 레이캔(도착 허용 기간) 대비
    vw.laycan = null;
    if (vw.eta && (v.laycanStart || v.laycanEnd)) {
      var ds = v.laycanStart ? ymdToTs(v.laycanStart, 0, 0) : null;
      var de = v.laycanEnd ? ymdToTs(v.laycanEnd, 23, 59) : null;
      vw.laycan = (de && vw.eta.ts > de) ? { level: 'late', hours: (vw.eta.ts - de) / 36e5 }
        : (ds && vw.eta.ts < ds) ? { level: 'early', hours: (ds - vw.eta.ts) / 36e5 }
        : { level: 'ok', hours: de ? (de - vw.eta.ts) / 36e5 : null };
    }
    return vw;
  };

  // 'YYYY-MM-DD' (한국 날짜) → 타임스탬프
  function ymdToTs(s, hh, mm) {
    var m = String(s).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? U.kstToTs(+m[1], +m[2], +m[3], hh, mm) : null;
  }

  // 상태 코드를 한글로
  E.stateText = function (st) {
    return { underway: '항해 중', slow: '저속 항해', stopped: '정지·정박', arrived: '도착', 'arrived-est': '도착 추정', unknown: '상태 미확인' }[st] || st;
  };

  E.clearCache = function () { routeCache = {}; };
})(typeof window !== 'undefined' ? window : globalThis);
