/* =====================================================================
 * parsers.js — 직접 조회 소스별 "페이지에서 값 읽기" 규칙
 * ---------------------------------------------------------------------
 * 직접 조회 방식
 *   1) 앱(네이티브)이 숨은 웹뷰로 소스 페이지를 연다  (API·키 없음, 갱신 버튼을 눌렀을 때만)
 *   2) 아래의 "추출 스크립트"를 그 페이지 안에서 실행해 화면의 글자를 그대로 가져온다
 *      - 스크립트는 결과를 window.__FST_OUT (문자열) 에 넣으면 된다
 *   3) 가져온 글자를 여기의 parse* 함수가 숫자·시각으로 해석한다
 * 사이트 화면이 바뀌면 이 파일의 해당 소스 부분만 고치면 된다.
 * 검증 현황 (2026-11-11 실제 페이지 기준)
 *   - VesselFinder 선박 상세·검색 : 검증됨 (무료 화면은 좌표가 1도 단위로만 나옴)
 *   - 여수항도선사회 도선예보     : 검증됨
 *   - 사용자 지정 소스(Wingo 등)  : 범용 규칙. 실제 화면 확인 후 보정 필요
 * ===================================================================== */
(function (root) {
  'use strict';
  var FST = root.FST = root.FST || {};
  var U = FST.Util;
  var P = FST.Parsers = {};

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  /* ================= 공통 ================= */

  // 페이지가 봇 확인(보안 확인) 화면인지 판별
  P.isChallenge = function (title, text) {
    var s = (title || '') + ' ' + String(text || '').slice(0, 400);
    return /just a moment|잠시만 기다리|attention required|access denied|보안 확인|verify you are human|captcha/i.test(s);
  };

  // "4 days ago", "19 hours ago", "5 mins ago" → 경과 밀리초 (모르면 null)
  P.agoToMs = function (txt) {
    if (!txt) return null;
    var s = String(txt).toLowerCase();
    if (/\b(now|just now)\b/.test(s)) return 0;
    var m = s.match(/(\d+)\s*(sec|second|min|minute|hour|hr|day|week|month)s?/);
    if (!m) return null;
    var unit = { sec: 1e3, second: 1e3, min: 6e4, minute: 6e4, hour: 36e5, hr: 36e5, day: 864e5, week: 6048e5, month: 2592e6 }[m[2]];
    return +m[1] * unit;
  };

  // "Nov 11, 22:00" (연도 없음, UTC 로 간주) → 타임스탬프. 지금과 가장 가까운 연도를 고른다.
  P.monthDayTimeToTs = function (txt, now) {
    var m = String(txt || '').match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var mon = MONTHS[m[1].toLowerCase()];
    if (!mon) return null;
    var base = new Date(now || Date.now()).getUTCFullYear();
    var best = null;
    [base - 1, base, base + 1].forEach(function (y) {  // 연말·연초 경계를 위해 3개 연도 후보 비교
      var ts = Date.UTC(y, mon - 1, +m[2], +m[3], +m[4]);
      if (best == null || Math.abs(ts - (now || Date.now())) < Math.abs(best - (now || Date.now()))) best = ts;
    });
    return best;
  };

  // 탭/줄바꿈으로 나뉜 "라벨 → 값" 을 화면 글자에서 찾는다
  function field(text, label) {
    var re = new RegExp('(?:^|\\n)\\s*' + label.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '\\s*[\\t\\n:]+\\s*([^\\t\\n]*)', 'i');
    var m = String(text || '').match(re);
    return m ? m[1].trim() : '';
  }

  function toNum(s) {
    var m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  /* ================= 범용 페이지 덤프 스크립트 ================= */

  // 페이지 제목·주소·보이는 글자를 그대로 가져오는 스크립트 (waitMs 동안 화면이 그려지길 기다린다)
  // readySelector 가 있으면 그 요소가 나타나는 즉시 가져온다.
  P.dumpScript = function (waitMs, readySelector) {
    return '(function(){' +
      'if(window.__FST_RUN)return;window.__FST_RUN=1;' +
      'var t0=Date.now(),sel=' + JSON.stringify(readySelector || '') + ',wait=' + (waitMs || 2500) + ';' +
      'function grab(){' +
      ' var dj=document.getElementById("djson");' +
      ' window.__FST_OUT=JSON.stringify({title:document.title,url:location.href,' +
      '  djson:dj?dj.getAttribute("data-json"):null,' +
      '  text:(document.body?document.body.innerText:"").slice(0,40000)});' +
      '}' +
      '(function tick(){' +
      ' var ready=sel?!!document.querySelector(sel):false;' +
      ' var ch=/just a moment|잠시만|attention required|보안 확인/i.test(document.title);' + // 보안 확인 화면이면 통과될 때까지 기다린다
      ' if(!ch&&(ready||Date.now()-t0>=wait)){grab();}else{setTimeout(tick,300);}' +
      '})();' +
      '})();';
  };

  /* ================= VesselFinder 선박 상세 ================= */

  P.vfDetailUrl = function (v) {
    var key = v.imo || v.mmsi;                          // IMO 우선, 없으면 MMSI
    return key ? 'https://www.vesselfinder.com/vessels/details/' + encodeURIComponent(key) : null;
  };

  P.parseVesselFinder = function (dump, now) {
    now = now || Date.now();
    var text = String(dump && dump.text || '');
    if (P.isChallenge(dump && dump.title, text)) return { ok: false, error: 'challenge' };
    if (!/IMO\s*\/\s*MMSI|Course\s*\/\s*Speed/i.test(text)) return { ok: false, error: 'layout' }; // 예상한 화면이 아님

    var out = { ok: true };
    var lines = text.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    out.name = lines[0] || '';                          // 첫 줄이 선명

    var ids = field(text, 'IMO / MMSI').match(/(\d{7})?\s*\/\s*(\d{9})?/);
    if (ids) { out.imo = ids[1] || ''; out.mmsi = ids[2] || ''; }
    out.callsign = field(text, 'Callsign');
    out.type = field(text, 'Ship Type') || field(text, 'AIS Type');
    out.flag = field(text, 'AIS Flag') || field(text, 'Flag');
    out.dwt = toNum(field(text, 'Deadweight (t)'));
    out.gt = toNum(field(text, 'Gross Tonnage'));
    out.built = toNum(field(text, 'Year of Build'));
    var lb = field(text, 'Length / Beam').match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (lb) { out.loa = +lb[1]; out.beam = +lb[2]; }

    var cs = field(text, 'Course / Speed').match(/(\d+(?:\.\d+)?)\s*°\s*\/\s*(\d+(?:\.\d+)?)\s*kn/i);
    if (cs) { out.cog = +cs[1]; out.sog = +cs[2]; }
    out.draught = toNum(field(text, 'Current draught'));
    var nav = field(text, 'Navigation Status');
    out.navStatus = nav && nav !== '-' ? nav : '';

    // 목적지와 ETA(또는 도착 후 ATA)
    var dm = text.match(/\nDestination\s*\n\s*([^\n]+)\n\s*(ETA|ATA):\s*([^\n(]+)/i);
    if (dm) {
      out.destText = dm[1].trim();
      out.etaKind = dm[2].toUpperCase();                // ETA=예정, ATA=도착 완료
      out.etaText = dm[3].trim();
      out.etaTs = P.monthDayTimeToTs(out.etaText, now); // 선박이 AIS 에 입력한 값, UTC 로 간주
    }
    // 직전 항만과 출항 시각
    var lp = text.match(/\nLast Port\s*\n\s*([^\n]+)\n\s*ATD:\s*([^\n(]+)/i);
    if (lp) { out.lastPortText = lp[1].trim(); out.atdText = lp[2].trim(); out.atdTs = P.monthDayTimeToTs(out.atdText, now); }

    // 위치 수신 시각 ("4 days ago")
    var pr = text.match(/Position Received\s*[\t\n]+\s*([^\n]+)/i);
    out.posAgeText = pr ? pr[1].trim() : '';
    var ageMs = P.agoToMs(out.posAgeText);
    out.posTs = ageMs == null ? null : now - ageMs;

    // 좌표: 페이지에 심어진 data-json (무료 화면은 정수 도 단위로 뭉개져 있다)
    try {
      var dj = dump.djson ? JSON.parse(dump.djson) : null;
      if (dj && typeof dj.ship_lat === 'number' && typeof dj.ship_lon === 'number') {
        out.lat = dj.ship_lat; out.lon = dj.ship_lon;
        out.coarse = (dj.ship_lat === Math.round(dj.ship_lat) && dj.ship_lon === Math.round(dj.ship_lon)); // 1도 단위면 개략값
        if (out.cog == null && typeof dj.ship_cog === 'number') out.cog = dj.ship_cog;
        if (out.sog == null && typeof dj.ship_sog === 'number') out.sog = dj.ship_sog;
        if (!out.mmsi && dj.mmsi) out.mmsi = String(dj.mmsi);
      }
    } catch (e) { /* data-json 이 깨져 있으면 좌표 없이 진행 */ }

    // 유료 위성 위치가 따로 있다는 안내 문구 (값 자체는 무료 화면에 없음)
    var sat = text.match(/Satellite position:\s*([^\n]+)/i);
    out.satNote = sat ? sat[1].trim() : '';
    return out;
  };

  /* ================= VesselFinder 선박 검색 (선명 → IMO) ================= */

  P.vfSearchUrl = function (name) {
    return 'https://www.vesselfinder.com/vessels?name=' + encodeURIComponent(name);
  };

  // 검색 결과 표를 읽어 오는 스크립트
  P.vfSearchScript = function () {
    return '(function(){' +
      'if(window.__FST_RUN)return;window.__FST_RUN=1;var t0=Date.now();' +
      '(function tick(){' +
      ' var rows=document.querySelectorAll("table tbody tr a.ship-link");' +
      ' if(rows.length||Date.now()-t0>4000){' +
      '  var out=[];for(var i=0;i<rows.length&&i<20;i++){var a=rows[i],tr=a.closest("tr");' +
      '   var q=function(s){var e=tr.querySelector(s);return e?e.textContent.trim():"";};' +
      '   var f=tr.querySelector(".flag-icon");' +
      '   out.push({href:a.getAttribute("href"),name:q(".slna"),type:q(".slty"),flag:f?f.getAttribute("title"):"",' +
      '    built:q("td.v3"),gt:q("td.v4"),dwt:q("td.v5"),size:q("td.v6")});}' +
      '  window.__FST_OUT=JSON.stringify({title:document.title,url:location.href,rows:out,' +
      '   text:(document.body?document.body.innerText:"").slice(0,600)});' +
      ' }else{setTimeout(tick,300);}' +
      '})();' +
      '})();';
  };

  P.parseVfSearch = function (dump) {
    if (P.isChallenge(dump && dump.title, dump && dump.text)) return { ok: false, error: 'challenge', list: [] };
    var list = ((dump && dump.rows) || []).map(function (r) {
      var id = (String(r.href || '').match(/details\/(\d+)/) || [])[1] || ''; // 7자리면 IMO, 9자리면 MMSI
      return {
        name: r.name, type: r.type, flag: r.flag || '',
        imo: id.length === 7 ? id : '', mmsi: id.length === 9 ? id : '',
        built: toNum(r.built), gt: toNum(r.gt), dwt: toNum(r.dwt), size: r.size && r.size !== '-' ? r.size : ''
      };
    }).filter(function (x) { return x.name && (x.imo || x.mmsi); });
    return { ok: true, list: list };
  };

  /* ================= 여수항도선사회 도선예보 ================= */

  P.YSPILOT_URL = 'http://www.yspilot.co.kr/forecast/status';

  // 지정한 날짜들(YYYYMMDD)의 도선예보 표를 같은 사이트에 차례로 요청해 모으는 스크립트
  P.yspilotScript = function (dates) {
    return '(function(){' +
      'if(window.__FST_RUN)return;window.__FST_RUN=1;' +
      'var dates=' + JSON.stringify(dates) + ',out=[],i=0;' +
      'function done(err){window.__FST_OUT=JSON.stringify({title:document.title,url:location.href,days:out,error:err||""});}' +
      'function next(){' +
      ' if(i>=dates.length){done();return;}' +
      ' var d=dates[i++];' +
      ' fetch("/forecast/status",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"yn_cond=N&searchDate="+d})' +
      ' .then(function(r){return r.text();}).then(function(h){' +
      '  var doc=new DOMParser().parseFromString(h,"text/html");var ts=doc.querySelectorAll("table");var t=ts[ts.length-1];' +
      '  var rows=[];if(t){var trs=t.querySelectorAll("tr");for(var k=0;k<trs.length;k++){var c=[];var cs=trs[k].cells;' +
      '   for(var j=0;j<cs.length;j++)c.push(cs[j].textContent.replace(/\\s+/g," ").trim());rows.push(c);}}' +
      '  out.push({date:d,rows:rows});next();' +
      ' }).catch(function(e){done(String(e));});' +
      '}' +
      'next();' +
      '})();';
  };

  // 도선예보에서 해당 선박 행만 골라 해석한다
  P.parseYsPilot = function (dump, vessel) {
    if (!dump || !dump.days) return { ok: false, error: dump && dump.error ? 'fetch' : 'layout', rows: [] };
    var wantName = U.normName(vessel.name), wantCs = U.normName(vessel.callsign);
    var rows = [], total = 0;
    dump.days.forEach(function (day) {
      var all = day.rows || [];
      if (!all.length) return;
      var head = all[0].map(function (h) { return h.toUpperCase(); }); // 머리글 행
      var iV = head.indexOf('VESSEL'), iSpec = head.indexOf('SPEC'), iPob = head.indexOf('POB'),
        iFrom = head.indexOf('FROM'), iTo = head.indexOf('TO'), iDft = head.indexOf('DFT'), iGrt = head.indexOf('GRT'), iSide = head.indexOf('B');
      if (iV < 0 || iPob < 0) return;                    // 표 구조가 바뀜
      for (var k = 1; k < all.length; k++) {
        var c = all[k];
        if (c.length < head.length) continue;            // 구분 행 등은 건너뜀
        total++;
        var n = c.length;                                // 뒤쪽 4칸은 [입출구분, 대리점, 예선사, 호출부호] 고정
        var cs = c[n - 1];
        var hit = (wantName && U.normName(c[iV]) === wantName) || (wantCs && U.normName(cs) === wantCs);
        if (!hit) continue;
        var hm = String(c[iPob]).match(/(\d{1,2}):(\d{2})/);
        var y = +day.date.slice(0, 4), mo = +day.date.slice(4, 6), d = +day.date.slice(6, 8);
        rows.push({
          date: day.date, no: c[0], spec: c[iSpec], vessel: c[iV], grt: c[iGrt], draft: c[iDft],
          pob: c[iPob], from: c[iFrom], to: c[iTo], side: iSide >= 0 ? c[iSide] : '',
          kind: c[n - 4], agent: c[n - 3], line: c[n - 2], callsign: cs,
          ts: hm ? U.kstToTs(y, mo, d, +hm[1], +hm[2]) : null // 도선사 승선(POB) 예정 시각, 한국 시간
        });
      }
    });
    rows.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    return { ok: true, rows: rows, scanned: total };
  };

  /* ================= 범용 해석 (사용자 지정 소스: Wingo 등) ================= */

  // 주소 틀의 {IMO} {MMSI} {NAME} {CALLSIGN} 자리를 선박 값으로 바꾼다
  P.fillTemplate = function (tpl, v) {
    return String(tpl || '')
      .replace(/\{IMO\}/gi, encodeURIComponent(v.imo || ''))
      .replace(/\{MMSI\}/gi, encodeURIComponent(v.mmsi || ''))
      .replace(/\{CALLSIGN\}/gi, encodeURIComponent(v.callsign || ''))
      .replace(/\{NAME\}/gi, encodeURIComponent(v.name || ''));
  };

  // 도·분·초 → 십진수 도
  function dms(d, m, s, hemi) {
    var v = (+d) + (+m || 0) / 60 + (+s || 0) / 3600;
    return /[SW]/i.test(hemi) ? -v : v;
  }

  // 화면 글자에서 위도·경도·속력·침로·ETA·목적지를 찾아낸다 (여러 표기 형식을 차례로 시도)
  P.parseGeneric = function (text) {
    var t = String(text || '').replace(/ /g, ' ');
    var out = { ok: false };
    var m;

    // 1) 십진수 + 방위 문자: 33.0287° N / 126.6602° E , 33.0287N 126.6602E
    m = t.match(/(\d{1,2}\.\d{2,})\s*°?\s*([NS])[\s,\/|]+(\d{1,3}\.\d{2,})\s*°?\s*([EW])/i);
    if (m) { out.lat = /S/i.test(m[2]) ? -m[1] : +m[1]; out.lon = /W/i.test(m[4]) ? -m[3] : +m[3]; }
    // 2) 방위 문자가 앞: N 33.0287 E 126.6602
    if (out.lat == null) {
      m = t.match(/\b([NS])\s*(\d{1,2}\.\d{2,})\s*°?[\s,\/|]+([EW])\s*(\d{1,3}\.\d{2,})/i);
      if (m) { out.lat = /S/i.test(m[1]) ? -m[2] : +m[2]; out.lon = /W/i.test(m[3]) ? -m[4] : +m[4]; }
    }
    // 3) 도·분(·초): 33°01'43"N 126°39'36"E , 33-01.72N 126-39.61E , 33° 01.72' N
    if (out.lat == null) {
      m = t.match(/(\d{1,2})\s*[°\-\s]\s*(\d{1,2}(?:\.\d+)?)\s*['′]?\s*(?:(\d{1,2}(?:\.\d+)?)\s*["″])?\s*([NS])[\s,\/|]+(\d{1,3})\s*[°\-\s]\s*(\d{1,2}(?:\.\d+)?)\s*['′]?\s*(?:(\d{1,2}(?:\.\d+)?)\s*["″])?\s*([EW])/i);
      if (m) { out.lat = dms(m[1], m[2], m[3], m[4]); out.lon = dms(m[5], m[6], m[7], m[8]); }
    }
    // 4) 라벨 방식: Latitude 33.0287 ... Longitude 126.6602 , 위도 33.0287 경도 126.6602
    if (out.lat == null) {
      var la = t.match(/(?:Lat(?:itude)?|위도)\s*[:=\t\n ]\s*(-?\d{1,2}\.\d{2,})/i);
      var lo = t.match(/(?:Lon(?:g(?:itude)?)?|Lng|경도)\s*[:=\t\n ]\s*(-?\d{1,3}\.\d{2,})/i);
      if (la && lo) { out.lat = +la[1]; out.lon = +lo[1]; }
    }
    if (out.lat != null && (Math.abs(out.lat) > 90 || Math.abs(out.lon) > 180)) { out.lat = null; out.lon = null; } // 범위를 벗어난 값은 버림

    m = t.match(/(?:SOG|Speed|속력|속도)[^\d\n]{0,12}(\d{1,2}(?:\.\d+)?)\s*(?:kn|kts?|knots?|노트)?/i) || t.match(/(\d{1,2}(?:\.\d+)?)\s*(?:kn\b|kts?\b|knots?\b|노트)/i);
    if (m) out.sog = +m[1];
    m = t.match(/(?:COG|Course|Heading|침로|방향)[^\d\n]{0,12}(\d{1,3}(?:\.\d+)?)\s*°?/i);
    if (m && +m[1] <= 360) out.cog = +m[1];
    m = t.match(/\bETA\b\s*[:\t\n ]\s*([^\n\t]{4,30})/i);
    if (m) out.etaText = m[1].trim();
    m = t.match(/(?:Destination|목적지|도착지)\s*[:\t\n ]\s*([^\n\t]{2,40})/i);
    if (m) out.destText = m[1].trim();
    m = t.match(/(?:Position Received|Last (?:Position|Update|Report)|Received|수신\s*시각|수신)\s*[:\t\n ]\s*([^\n\t]{3,40})/i);
    if (m) out.posTimeText = m[1].trim();

    out.ok = out.lat != null && out.lon != null;
    if (!out.ok) out.error = 'nopos';
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
