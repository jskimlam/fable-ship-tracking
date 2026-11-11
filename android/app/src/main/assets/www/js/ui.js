/* =====================================================================
 * ui.js — 화면 조립과 사용자 조작 처리
 * ---------------------------------------------------------------------
 * 화면 구성: 상단 바 / 선대 카드 / 지도(+항차 진행 카드) / 브리핑(대화) / 대화상자 3종
 * 통신은 사용자가 '갱신'·'찾기'를 눌렀을 때만 일어난다. 1분마다 도는 타이머는
 * 경과 시간·추정 위치를 다시 계산해 그릴 뿐, 어떤 요청도 보내지 않는다.
 * ===================================================================== */
(function (root) {
  'use strict';
  var FST = root.FST;
  var U = FST.Util, S = FST.Store, E = FST.Engine, BR = FST.Brief, M = FST.MapView, B = FST.Bridge, P = FST.Parsers, R = FST.Route;
  var doc = root.document;
  var $ = function (id) { return doc.getElementById(id); };

  var chats = {};                                      // 선박 id → 대화 기록 (앱을 닫으면 사라짐)
  var busy = {};                                       // 선박 id → 갱신 중 여부
  var CARGOS = ['SM', 'AN', 'BD', 'MMA', 'BPA'];       // 화물 태그 후보

  /* ================= 공통 도우미 ================= */

  var toastTimer = null;
  function toast(text) {                               // 화면 아래 잠깐 뜨는 안내
    var t = $('toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }

  function views() {                                   // 모든 선박의 항차 상태
    var now = Date.now();
    return S.get().vessels.map(function (v) { return E.view(v, now); });
  }
  function curView() {
    var v = S.selected();
    return v ? E.view(v, Date.now()) : null;
  }
  function chatOf(id) { return chats[id] || (chats[id] = []); }

  // 브리핑 묶음을 대화에 넣고, 그 첫 줄이 보이도록 스크롤한다
  function pushBriefing(id, list) {
    list.forEach(function (m, i) { m.at = Date.now(); m.anchor = i === 0; chatOf(id).push(m); });
    while (chatOf(id).length > 60) chatOf(id).shift();
    if (S.get().selectedId === id) renderChat('brief');
  }

  function pushMsg(id, m) {                            // 대화에 한 줄 추가
    m.at = Date.now();
    chatOf(id).push(m);
    if (chatOf(id).length > 60) chatOf(id).shift();
    if (S.get().selectedId === id) renderChat(true);
  }

  /* ================= 그리기 ================= */

  // 선대 카드
  function renderFleet(vws) {
    var sel = S.get().selectedId;
    var html = vws.map(function (vw) {
      var v = vw.v;
      var eta = vw.eta ? '<b class="num">' + U.fmtKst(vw.eta.ts) + '</b><span class="num">' + U.remain(vw.eta.ts, vw.now) + '</span>' : '<span>ETA 미확인</span>';
      return '<button class="fcard' + (v.id === sel ? ' on' : '') + (busy[v.id] ? ' busy' : '') + (vw.laycan && vw.laycan.level === 'late' ? ' late' : '') + '" data-id="' + v.id + '">' +
        '<div class="nm"><i class="dot ' + vw.fresh + '"></i>' + U.esc(v.name) + (v.cargo ? '<span class="cg">' + U.esc(v.cargo) + '</span>' : '') + '</div>' +
        '<div class="to">' + U.esc(vw.originText || '출항지 미확인') + ' → ' + U.esc(vw.destText || '목적지 미확인') + '</div>' +
        '<div class="eta">' + eta + '</div>' +
        '<div class="bar"><i style="width:' + Math.round((vw.progress || 0) * 100) + '%"></i></div></button>';
    }).join('');
    $('fleet').innerHTML = html || '<div class="hint" style="padding:8px 4px;color:var(--mut)">추적 중인 선박이 없습니다. 상단의 ＋ 로 추가해 주세요.</div>';
  }

  // 선박 머리글 + 핵심 지표
  function renderHead(vw) {
    if (!vw) { $('shipHead').innerHTML = ''; $('kpis').innerHTML = ''; return; }
    var v = vw.v;
    var sub = [v.imo ? 'IMO ' + v.imo : '', v.callsign, v.type, v.dwt ? U.num(v.dwt, 0) + ' DWT' : ''].filter(Boolean).join(' · ');
    $('shipHead').innerHTML =
      '<div class="ttl"><h1>' + U.esc(v.name) + '</h1><div class="sub">' +
      (v.cargo ? '<span class="pill cg">' + U.esc(v.cargo) + '</span>' : '') +
      '<span class="pill st ' + vw.state + '">' + E.stateText(vw.state) + '</span>' + U.esc(sub || '제원 미확인') + '</div></div>' +
      '<button class="btn ghost" id="btnInfo" title="선박 정보·편집">ⓘ</button>' +
      '<button class="btn solid' + (busy[v.id] ? ' spinning' : '') + '" id="btnRefresh"' + (busy[v.id] ? ' disabled' : '') + '><span class="ico spin-target">⟳</span>갱신</button>';

    var etaK = vw.eta
      ? kpi(vw.eta.label, U.fmtKst(vw.eta.ts), U.remain(vw.eta.ts, vw.now), (vw.laycan && vw.laycan.level === 'late') ? 'warn' : vw.eta.kind === 'calc' ? 'est' : '')
      : kpi('ETA', '미확인', '목적지·위치 필요', '');
    var remK = vw.remainNm != null ? kpi('남은 항정', U.num(vw.remainNm, 0) + ' 해리', vw.progress != null ? '진행 ' + Math.round(vw.progress * 100) + '%' : '', vw.dr ? 'est' : '') : kpi('남은 항정', '-', '', '');
    var spdK = vw.sog != null ? kpi('속력·침로', U.num(vw.sog, 1) + ' 노트', vw.cog != null ? Math.round(vw.cog) + '° ' + U.compassKo(vw.cog) : '', '') : kpi('속력·침로', '-', '', '');
    var fixK = vw.fix ? kpi('마지막 실측', U.ago(vw.fix.t, vw.now), E.srcName(vw.fix.src), vw.fresh === 'stale' ? 'warn' : '') : kpi('마지막 실측', '없음', vw.coarse ? '개략 위치만 있음' : '갱신 필요', 'warn');
    $('kpis').innerHTML = etaK + remK + spdK + fixK;
  }
  function kpi(label, value, note, cls) {
    return '<div class="kpi ' + cls + '"><small>' + U.esc(label) + '</small><b class="num">' + U.esc(value) + '</b><i>' + U.esc(note || ' ') + '</i></div>';
  }

  // 지도 아래 항차 진행 카드
  function renderVoy(vw) {
    if (!vw || (!vw.originText && !vw.destText)) { $('voy').innerHTML = ''; return; }
    var pct = Math.round((vw.progress || 0) * 100);
    var atd = vw.v.voyage && vw.v.voyage.atdTs ? U.fmtKst(vw.v.voyage.atdTs) + ' 출항' : '출항지';
    $('voy').innerHTML =
      '<div class="voy-ends"><div><small>' + U.esc(atd) + '</small><b>' + U.esc(vw.originText || '미확인') + '</b></div>' +
      '<div><small>' + (vw.eta ? U.esc(vw.eta.label) + ' ' + U.fmtKst(vw.eta.ts) : '목적지') + '</small><b>' + U.esc(vw.destText || '미확인') + '</b></div></div>' +
      '<div class="voy-bar"><i class="end o"></i><i class="end d"></i><div class="done" style="width:' + pct + '%"></div>' +
      '<div class="ship" style="left:' + pct + '%">' + M.shipSvg(vw.cur && vw.cur.est ? '#ffc24d' : '#35d0ff') + '</div></div>' +
      '<div class="voy-meta"><span>항해 <b class="num">' + U.num(vw.sailedNm, 0) + '</b> 해리</span>' +
      '<span>' + (vw.cur && vw.cur.est ? '추정 위치 기준 ' : '') + '<b class="num">' + pct + '%</b></span>' +
      '<span>잔여 <b class="num">' + U.num(vw.remainNm, 0) + '</b> 해리</span></div>';
  }

  // 대화 영역
  function renderChat(scroll) {
    var v = S.selected();
    var el = $('chat');
    if (!v) { el.innerHTML = ''; return; }
    el.innerHTML = chatOf(v.id).map(function (m) {
      if (m.kind === 'me') return '<div class="msg me">' + U.esc(m.text) + '</div>';
      if (m.kind === 'sys') return '<div class="msg sys">' + U.esc(m.text) + '</div>';
      if (m.kind === 'run') {
        return '<div class="msg run"><h3>직접 조회 중</h3><div class="steps">' +
          m.steps.map(function (s) { return '<span class="' + s.state + '">' + U.esc(s.label) + '</span>'; }).join('') + '</div></div>';
      }
      return '<div class="msg' + (m.anchor ? ' anchor' : '') + '"><h3>' + U.esc(m.title || '') + '<em>' + U.fmtHm(m.at) + '</em></h3>' + m.html + '</div>'; // html 은 brief.js 가 이스케이프해서 만든 것
    }).join('');
    if (scroll === 'brief') {                          // 새 브리핑의 첫 줄이 맨 위에 오도록
      var marks = el.querySelectorAll('.msg.anchor');
      var last = marks[marks.length - 1];
      el.scrollTop = last ? last.offsetTop - el.offsetTop - 4 : el.scrollHeight;
    } else if (scroll) el.scrollTop = el.scrollHeight;
  }

  function renderChips(vw) {
    $('chips').innerHTML = vw ? BR.chips(vw).map(function (c) { return '<button type="button">' + U.esc(c) + '</button>'; }).join('') : '';
  }

  // 전체 다시 그리기. mapOpts: {fit, animate, center}
  function renderAll(mapOpts) {
    var vws = views();
    var sel = S.selected();
    var vw = sel ? vws.filter(function (x) { return x.v.id === sel.id; })[0] : null;
    renderFleet(vws);
    renderHead(vw);
    renderVoy(vw);
    renderChips(vw);
    if (vw && mapOpts !== false) M.draw(vw, mapOpts || {}, vws, selectVessel);
  }

  /* ================= 동작 ================= */

  // 선박 선택
  function selectVessel(id) {
    S.select(id);
    var vw = curView();
    if (vw && !chatOf(id).length) {                    // 처음 고른 선박이면 저장된 값으로 브리핑부터 보여 준다
      pushMsg(id, { kind: 'sys', text: vw.v.lastRefresh ? '마지막 갱신 ' + U.fmtKst(vw.v.lastRefresh) + ' 기준입니다.' : '아직 이 앱에서 직접 조회한 적이 없습니다. 갱신을 눌러 주세요.' });
      pushBriefing(id, BR.briefing(vw).slice(0, 3));
    }
    renderAll({ fit: true });
    renderChat('brief');
  }

  // 한 척 갱신 (직접 조회)
  function refreshOne(id, quiet) {
    var v = S.vessel(id);
    if (!v || busy[id]) return Promise.resolve();
    if (!B.available && !B.demo) {
      toast('직접 조회는 안드로이드 앱에서만 됩니다. 저장된 값으로 표시합니다.');
      return Promise.resolve();
    }
    busy[id] = true;
    var run = { kind: 'run', steps: [] };
    pushMsg(id, run);
    renderAll(false);
    return E.refreshVessel(v, function (label, state) {
      var s = run.steps.filter(function (x) { return x.label === label; })[0];
      if (!s) { s = { label: label, state: state }; run.steps.push(s); } else { s.state = state; }
      if (S.get().selectedId === id) renderChat(true);
    }).then(function (sum) {
      busy[id] = false;
      var log = chatOf(id);
      var i = log.indexOf(run);
      if (i >= 0) log.splice(i, 1);                    // 진행 표시를 지우고 결과 브리핑으로 바꾼다
      var vw = E.view(v, Date.now());
      pushBriefing(id, BR.briefing(vw));
      if (S.get().selectedId === id) renderAll({ animate: true, fit: !quiet });
      else renderAll(false);
      var failed = sum.steps.filter(function (s) { return !s.ok; }).length;
      if (!quiet) toast(failed ? '갱신 완료 · ' + failed + '개 소스는 읽지 못했습니다.' : '갱신 완료');
    }).catch(function () {
      busy[id] = false;
      renderAll(false);
      toast('갱신 중 오류가 발생했습니다. 다시 시도해 주세요.');
    });
  }

  // 전체 갱신 (사이트에 부담을 주지 않도록 한 척씩 차례로)
  function refreshAll() {
    var btn = $('btnRefreshAll');
    if (btn.disabled) return;
    if (!B.available && !B.demo) { toast('직접 조회는 안드로이드 앱에서만 됩니다.'); return; }
    btn.disabled = true;
    btn.classList.add('spinning');
    var ids = S.get().vessels.map(function (v) { return v.id; });
    ids.reduce(function (chain, id) { return chain.then(function () { return refreshOne(id, true); }); }, Promise.resolve()).then(function () {
      btn.disabled = false;
      btn.classList.remove('spinning');
      var sel = S.selected();
      if (sel) pushMsg(sel.id, BR.fleetSummary(views()));
      renderAll({ fit: true });
      toast('전체 ' + ids.length + '척 갱신 완료');
    });
  }

  // 질문 처리
  function ask(text) {
    var v = S.selected();
    var q = String(text || '').trim();
    if (!v || !q) return;
    pushMsg(v.id, { kind: 'me', text: q });
    var all = views();
    var vw = all.filter(function (x) { return x.v.id === v.id; })[0];
    setTimeout(function () { pushMsg(v.id, BR.answer(q, vw, all)); }, 180);
  }

  /* ================= 대화상자: 선박 추가 ================= */

  function openAdd() {
    $('addQuery').value = '';
    $('addResults').innerHTML = '';
    $('dlgAdd').showModal();
    setTimeout(function () { $('addQuery').focus(); }, 50);
  }

  function addAndRefresh(o) {
    var v = S.addVessel(o);
    $('dlgAdd').close();
    selectVessel(v.id);
    if (B.available || B.demo) refreshOne(v.id);
  }

  function searchVessel() {
    var q = $('addQuery').value.trim();
    var box = $('addResults');
    if (!q) return;
    if (/^\d{7}$/.test(q)) { addAndRefresh({ name: 'IMO ' + q, imo: q }); return; }   // IMO 번호면 바로 추가
    if (/^\d{9}$/.test(q)) { addAndRefresh({ name: 'MMSI ' + q, mmsi: q }); return; } // MMSI 번호
    if (!B.available && !B.demo) { box.innerHTML = '<div class="empty">선명 검색은 앱에서만 됩니다. IMO 번호를 넣거나 ‘이름만으로 추가’를 눌러 주세요.</div>'; return; }
    box.innerHTML = '<div class="empty">Wingo 공개 검색을 조회하는 중…</div>';
    E.searchByName(q).then(function (r) {
      if (!r.ok) { box.innerHTML = '<div class="empty">' + U.esc(B.errorText(r.error)) + '</div>'; return; }
      if (!r.list.length) { box.innerHTML = '<div class="empty">일치하는 선박이 없습니다. 철자를 확인하거나 IMO 번호로 넣어 주세요.</div>'; return; }
      // 탱커만 추적 대상이므로 탱커를 먼저 보여 준다. 탱커가 하나도 없으면(철자 특이 등) 전체를 보여 준다.
      var tankers = r.list.filter(function (x) { return /tanker/i.test((x.category || '') + ' ' + (x.type || '')); });
      var list = tankers.length ? tankers : r.list;
      box.innerHTML = (tankers.length ? '' : '<div class="empty">탱커가 없어 전체 결과를 보여 줍니다.</div>') + list.slice(0, 12).map(function (x, i) {
        var kind = x.type || ({ tanker: '탱커', cargo: '화물선', fishing: '어선', sailing: '요트', passenger: '여객선' }[x.category] || x.category); // Wingo 는 category, VF 는 type
        var seen = x.lastSeenTs ? '수신 ' + U.ago(x.lastSeenTs, Date.now()) : '';
        return '<button type="button" data-i="' + i + '">' + U.esc(x.name) + '<small>' +
          U.esc([kind, x.flag, x.imo ? 'IMO ' + x.imo : 'MMSI ' + x.mmsi, x.dwt ? x.dwt + ' DWT' : '', seen].filter(Boolean).join(' · ')) + '</small></button>';
      }).join('');
      box.onclick = function (ev) {
        var b = ev.target.closest('button');
        if (b) addAndRefresh(list[+b.dataset.i]);
      };
    });
  }

  /* ================= 대화상자: 선박 정보·편집 ================= */

  function portOptions(selId, autoLabel) {
    return '<option value="">' + U.esc(autoLabel) + '</option>' + (root.FST_PORTS || []).map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === selId ? ' selected' : '') + '>' + U.esc(p.ko + ' (' + p.en + ')') + '</option>';
    }).join('');
  }

  function openInfo() {
    var v = S.selected();
    if (!v) return;
    var vw = E.view(v, Date.now());
    var srcRows = Object.keys(v.src || {}).map(function (k) {
      var s = v.src[k];
      return '<div class="src-row"><div>' + (s.ok ? '✅ ' : '⚠️ ') + U.esc(s.label) + '<small>' + U.fmtKst(s.at) + ' · ' + U.esc(s.ok ? (s.info || '읽기 성공') : B.errorText(s.error)) + '</small></div></div>';
    }).join('') || '<div class="hint">아직 직접 조회한 기록이 없습니다.</div>';
    var fixRows = (v.fixes || []).slice(-5).reverse().map(function (f) {
      return '<div class="src-row"><div class="num">' + U.fmtKst(f.t) + ' · ' + U.fmtPos(f.lat, f.lon) + '<small>' + U.esc(E.srcName(f.src)) +
        (f.sog != null ? ' · ' + U.num(f.sog, 1) + '노트' : '') + (f.timeAssumed ? ' · 시각 추정' : '') + '</small></div>' +
        '<button class="btn ghost" type="button" data-delfix="' + f.t + '">삭제</button></div>';
    }).join('') || '<div class="hint">기록된 실측 위치가 없습니다.</div>';
    var vfUrl = P.vfDetailUrl(v);

    $('infoBox').innerHTML =
      '<h2>' + U.esc(v.name) + '</h2>' +
      '<p class="hint">' + U.esc([v.imo ? 'IMO ' + v.imo : '', v.mmsi ? 'MMSI ' + v.mmsi : '', v.callsign, v.flag, v.type].filter(Boolean).join(' · ') || '제원은 갱신하면 채워집니다.') + '</p>' +
      '<h4>화물·일정</h4>' +
      '<div class="row"><label>화물</label><div class="cargo-pick" id="cargoPick">' + CARGOS.map(function (c) { return '<button type="button" class="' + (v.cargo === c ? 'on' : '') + '">' + c + '</button>'; }).join('') +
      '<input id="cargoFree" type="text" placeholder="기타" value="' + U.esc(CARGOS.indexOf(v.cargo) < 0 ? v.cargo : '') + '" style="max-width:110px" /></div></div>' +
      '<div class="row"><label>레이캔</label><input id="lcStart" type="date" value="' + U.esc(v.laycanStart) + '" /><input id="lcEnd" type="date" value="' + U.esc(v.laycanEnd) + '" /></div>' +
      '<div class="row"><label>출항지</label><select id="selOrigin">' + portOptions(v.originPortId, '자동 (직전 항만: ' + ((v.voyage && v.voyage.lastPortText) || '미확인') + ')') + '</select></div>' +
      '<div class="row"><label>목적지</label><select id="selDest">' + portOptions(v.destPortId, '자동 (AIS 목적지: ' + ((v.voyage && v.voyage.destText) || '미확인') + ')') + '</select></div>' +
      '<h4>위치 직접 입력</h4>' +
      '<p class="hint">대리점 통보나 Wingo 화면의 좌표를 옮겨 적으면 실측으로 기록됩니다. 예: 33.0287 / 126.6602</p>' +
      '<div class="row"><input id="mLat" type="text" inputmode="decimal" placeholder="위도 (북위 +)" /><input id="mLon" type="text" inputmode="decimal" placeholder="경도 (동경 +)" /></div>' +
      '<div class="row"><input id="mSog" type="text" inputmode="decimal" placeholder="속력(노트)" /><input id="mCog" type="text" inputmode="decimal" placeholder="침로(도)" /><input id="mTime" type="datetime-local" /></div>' +
      '<div class="row"><button class="btn ghost" type="button" id="btnManual">위치 기록</button></div>' +
      '<h4>최근 실측 기록</h4>' + fixRows +
      '<h4>소스별 조회 결과</h4>' + srcRows +
      '<div class="dlg-foot">' +
      (v.mmsi ? '<button class="btn ghost" type="button" id="btnOpenWingo">Wingo 원문</button>' : '') +
      (vfUrl ? '<button class="btn ghost" type="button" id="btnOpenVf">VesselFinder 원문</button>' : '') +
      (vw.dest && vw.dest.pilot === 'yspilot' ? '<button class="btn ghost" type="button" id="btnOpenPilot">도선예보 원문</button>' : '') +
      '<button class="btn danger" type="button" id="btnEnd">추적 종료</button>' +
      '<button class="btn solid" type="button" id="btnInfoSave">저장</button></div>';
    $('dlgInfo').showModal();
  }

  function infoClick(ev) {
    var v = S.selected();
    var t = ev.target.closest('button');
    if (!v || !t) return;
    if (t.parentNode && t.parentNode.id === 'cargoPick') { // 화물 태그 고르기 (다시 누르면 해제)
      var on = t.classList.contains('on');
      [].forEach.call(t.parentNode.querySelectorAll('button'), function (b) { b.classList.remove('on'); });
      if (!on) { t.classList.add('on'); $('cargoFree').value = ''; }
      return;
    }
    if (t.dataset.delfix) {
      v.fixes = v.fixes.filter(function (f) { return String(f.t) !== t.dataset.delfix; });
      E.clearCache(); S.save(); openInfo(); renderAll({ fit: true });
      return;
    }
    if (t.id === 'btnManual') {
      var lat = parseFloat($('mLat').value), lon = parseFloat($('mLon').value);
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { toast('위도·경도를 숫자로 넣어 주세요. 예: 33.0287 / 126.6602'); return; }
      var ts = $('mTime').value ? new Date($('mTime').value).getTime() : Date.now();
      if (!isFinite(ts) || ts > Date.now() + 6e5) { toast('수신 시각이 올바르지 않습니다.'); return; }
      E.addManualFix(v, { lat: lat, lon: lon, sog: $('mSog').value, cog: $('mCog').value, t: ts });
      $('dlgInfo').close();
      pushMsg(v.id, { kind: 'sys', text: '수동 입력 위치를 실측으로 기록했습니다.' });
      pushBriefing(v.id, BR.briefing(E.view(v, Date.now())).slice(0, 3));
      renderAll({ fit: true, animate: true });
      return;
    }
    if (t.id === 'btnOpenWingo') { B.openBrowser(P.wingoShipUrl(v.mmsi), v.name + ' · Wingo Marine'); return; }
    if (t.id === 'btnOpenVf') { B.openBrowser(P.vfDetailUrl(v), v.name + ' · VesselFinder'); return; }
    if (t.id === 'btnOpenPilot') { B.openBrowser(P.YSPILOT_URL, '여수항도선사회 도선예보'); return; }
    if (t.id === 'btnEnd') {
      if (t.dataset.sure !== '1') { t.dataset.sure = '1'; t.textContent = '한 번 더 누르면 종료'; return; } // 실수 방지: 두 번 눌러야 삭제
      $('dlgInfo').close();
      S.removeVessel(v.id);
      var next = S.selected();
      if (next) selectVessel(next.id); else { renderAll(false); renderChat(); }
      toast(v.name + ' 추적을 종료했습니다.');
      return;
    }
    if (t.id === 'btnInfoSave') {
      var picked = $('cargoPick').querySelector('button.on');
      v.cargo = picked ? picked.textContent : $('cargoFree').value.trim().toUpperCase().slice(0, 12);
      v.laycanStart = $('lcStart').value; v.laycanEnd = $('lcEnd').value;
      v.originPortId = $('selOrigin').value; v.destPortId = $('selDest').value;
      E.clearCache(); S.save();
      $('dlgInfo').close();
      renderAll({ fit: true });
      toast('저장했습니다.');
    }
  }

  /* ================= 대화상자: 설정 ================= */

  function openSettings() {
    var st = S.get().settings;
    var rows = (st.customSources || []).map(function (c) {
      return '<div class="src-row"><div>' + U.esc(c.name) + '<small>' + U.esc(c.url) + '</small></div>' +
        '<button class="btn ghost" type="button" data-open="' + c.id + '">열기·로그인</button>' +
        '<button class="btn ghost" type="button" data-del="' + c.id + '">삭제</button></div>';
    }).join('') || '<div class="hint">등록된 소스가 없습니다.</div>';
    $('settingsBox').innerHTML =
      '<h2>설정</h2>' +
      '<h4>사용자 지정 소스 (추가 교차 확인)</h4>' +
      '<p class="hint">선박 한 척의 위치가 나오는 페이지 주소를 등록하면, 갱신할 때 그 페이지를 직접 열어 좌표·속력·침로를 읽습니다. ' +
      '주소에서 선박마다 달라지는 부분은 {IMO} {MMSI} {NAME} {CALLSIGN} 으로 바꿔 넣으세요. ' +
      '로그인이 필요한 사이트는 ‘열기·로그인’에서 한 번 로그인해 두면 됩니다. 비밀번호는 이 앱이 저장하거나 읽지 않습니다.</p>' +
      rows +
      '<div class="row"><input id="csName" type="text" placeholder="이름 (예: Wingo)" style="max-width:140px" /><input id="csUrl" type="url" placeholder="https://…/{IMO}" /></div>' +
      '<div class="row"><button class="btn ghost" type="button" id="csAdd">소스 추가</button></div>' +
      '<h4>기본 조회 소스</h4>' +
      '<p class="hint">① Wingo Marine 공개 선박 페이지(정밀 좌표·24시간 항적·속력·목적지, 로그인 불필요) ② VesselFinder 상세(직전 항만·출항 시각·AIS ETA 보충) ③ 여수항도선사회 도선예보(목적지가 여수·광양일 때). ' +
      '모두 갱신 버튼을 눌렀을 때만 페이지를 직접 열어 읽으며, API 키나 상시 수신은 없습니다. Wingo 에 로그인해 두면(선택) 위성 조회 같은 계정 기능도 같은 세션으로 쓸 수 있습니다.</p>' +
      '<div class="row"><button class="btn ghost" type="button" id="openPortmis">PORT-MIS 선박입출항현황 열기</button></div>' +
      '<h4>백업</h4>' +
      '<textarea id="bkText" placeholder="내보내기를 누르면 여기에 표시됩니다. 다른 기기에서 붙여 넣고 가져오기를 누르세요."></textarea>' +
      '<div class="row"><button class="btn ghost" type="button" id="bkExport">내보내기</button><button class="btn ghost" type="button" id="bkImport">가져오기</button>' +
      '<button class="btn danger" type="button" id="bkReset">초기 선대로 되돌리기</button></div>' +
      '<div class="dlg-foot"><button class="btn solid" value="close">닫기</button></div>';
    $('dlgSettings').showModal();
  }

  function settingsClick(ev) {
    var t = ev.target.closest('button');
    if (!t) return;
    var st = S.get().settings;
    if (t.id === 'csAdd') {
      var name = $('csName').value.trim() || '사용자 소스', url = $('csUrl').value.trim();
      if (!/^https?:\/\/.+/i.test(url)) { toast('주소는 http:// 또는 https:// 로 시작해야 합니다.'); return; }
      st.customSources.push({ id: U.uid('s').slice(2), name: name, url: url });
      S.save(); openSettings();
      return;
    }
    if (t.dataset.del) {
      st.customSources = st.customSources.filter(function (c) { return c.id !== t.dataset.del; });
      S.save(); openSettings();
      return;
    }
    if (t.dataset.open) {
      var c = st.customSources.filter(function (x) { return x.id === t.dataset.open; })[0];
      var v = S.selected();
      if (c) B.openBrowser(v ? P.fillTemplate(c.url, v) : c.url.replace(/\{[A-Z]+\}/gi, ''), c.name);
      return;
    }
    if (t.id === 'openPortmis') { B.openBrowser('https://new.portmis.go.kr/portmis/websquare/websquare.jsp?w2xPath=/portmis/w2/main/index.xml&page=/portmis/w2/sp/vssl/vsch/UI-PM-SP-104-02.xml&menuId=1319&menuCd=M0182', 'PORT-MIS 선박입출항현황'); return; }
    if (t.id === 'bkExport') { $('bkText').value = S.exportJson(); $('bkText').select(); toast('전체 내용을 복사해 보관하세요.'); return; }
    if (t.id === 'bkImport') {
      try { S.importJson($('bkText').value); chats = {}; $('dlgSettings').close(); boot(true); toast('가져왔습니다.'); }
      catch (e) { toast('가져오지 못했습니다. 내보내기로 받은 내용 전체를 그대로 붙여 넣어 주세요.'); }
      return;
    }
    if (t.id === 'bkReset') {
      if (t.dataset.sure !== '1') { t.dataset.sure = '1'; t.textContent = '한 번 더 누르면 초기화'; return; }
      S.reset(); chats = {}; $('dlgSettings').close(); boot(true); toast('초기 선대로 되돌렸습니다.');
    }
  }

  /* ================= 시작 ================= */

  function setTab(tab) {
    $('app').dataset.tab = tab;
    setTimeout(M.resize, 60);                          // 가려졌던 지도가 다시 보일 때 크기 재계산
  }

  // 안드로이드 뒤로 가기 버튼: 열린 대화상자 닫기 → 지도 탭으로 → (false 면 앱이 뒤로 물러남)
  root.FST_BACK = function () {
    var open = doc.querySelector('dialog[open]');
    if (open) { open.close(); return true; }
    if ($('app').dataset.tab !== 'map' && root.innerWidth < 720) { setTab('map'); return true; }
    return false;
  };

  function boot(again) {
    S.load();
    var st = S.get();
    $('modeNote').textContent = B.available ? '' : B.demo ? '예시 데이터 모드 (2026-11-11 캡처)' : '미리보기 — 직접 조회는 앱에서만';
    M.init($('map'), st.settings.mapStyle);
    $('btnStyle').textContent = M.style() === 'sat' ? '위성' : '일반';
    var sel = S.selected();
    if (sel) selectVessel(sel.id); else { renderAll(false); renderChat(); }
    if (again) return;                                 // 아래 이벤트 연결은 처음 한 번만

    $('fleet').addEventListener('click', function (ev) {
      var c = ev.target.closest('.fcard');
      if (!c) return;
      selectVessel(c.dataset.id);
      if ($('app').dataset.tab === 'fleet') setTab('map'); // 좁은 화면: 선대에서 고르면 지도로
    });
    $('shipHead').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      if (b.id === 'btnRefresh') refreshOne(S.get().selectedId);
      if (b.id === 'btnInfo') openInfo();
    });
    $('btnRefreshAll').addEventListener('click', refreshAll);
    $('btnAdd').addEventListener('click', openAdd);
    $('btnSettings').addEventListener('click', openSettings);
    $('addSearch').addEventListener('click', searchVessel);
    $('addQuery').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); searchVessel(); } });
    $('addNameOnly').addEventListener('click', function () {
      var q = $('addQuery').value.trim();
      if (!q) { toast('선박명을 넣어 주세요.'); return; }
      var v = S.addVessel({ name: q });
      $('dlgAdd').close();
      selectVessel(v.id);
      toast('이름만 등록했습니다. IMO 를 알면 다시 추가하는 편이 정확합니다.');
    });
    $('infoBox').addEventListener('click', infoClick);
    $('settingsBox').addEventListener('click', settingsClick);
    $('chips').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) ask(b.textContent); });
    $('askForm').addEventListener('submit', function (ev) { ev.preventDefault(); ask($('askInput').value); $('askInput').value = ''; });
    doc.querySelector('.tabs').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) setTab(b.dataset.tab); });
    $('btnStyle').addEventListener('click', function () {
      var next = M.style() === 'sat' ? 'chart' : 'sat';
      M.setStyle(next); S.get().settings.mapStyle = next; S.save();
      $('btnStyle').textContent = next === 'sat' ? '위성' : '일반';
    });
    $('btnFit').addEventListener('click', function () { renderAll({ fit: true }); });
    $('btnReplay').addEventListener('click', function () {
      var vw = curView();
      if (!vw || !vw.cur) { toast('재생할 항적이 없습니다. 위치가 확인된 뒤에 쓸 수 있습니다.'); return; }
      M.draw(vw, {}, views(), selectVessel);
      M.replay(vw, function (ok) { if (!ok) toast('재생할 항적이 없습니다.'); });
    });
    root.addEventListener('resize', function () { setTimeout(M.resize, 80); });
    // 1분마다 화면만 다시 계산 (통신 없음): 경과 시간·추정 위치·남은 시간 갱신
    root.setInterval(function () { if (!doc.hidden) renderAll({}); }, 60000);
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) renderAll({}); });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { boot(false); });
  else boot(false);
})(window);
