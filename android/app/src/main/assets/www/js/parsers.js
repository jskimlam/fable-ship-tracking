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
 *   - Wingo Marine 공개 선박 페이지·검색 : 검증됨 (주 소스. 로그인 불필요, 정밀 좌표·24시간 항적)
 *   - VesselFinder 선박 상세·검색       : 검증됨 (보조 소스. 직전 항만·출항 시각·AIS ETA 용, 좌표는 1도 단위)
 *   - 여수항도선사회 도선예보           : 검증됨
 *   - 사용자 지정 소스                  : 범용 규칙. 실제 화면 확인 후 보정 필요
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

  /* ================= Wingo Marine (주 소스, 로그인 불필요) ================= */
  // 공개 선박 페이지: https://wingo-marine.com/ship/{아무 글자}-{MMSI}  → 정식 주소로 자동 이동한다
  // 페이지 안 <script id="vessel-map-data" type="application/json"> 에
  //   {position:[위도,경도], rotation:선수방향, track:[[위도,경도]...최근 24시간], port:{lat,lon,name}} 이 들어 있다
  // 검색: https://wingo-marine.com/api/v1/seo/search?q=선명|IMO|MMSI&limit=10  (사이트 검색창이 쓰는 공개 주소, 키 없음)

  P.WINGO = 'https://wingo-marine.com';

  P.wingoShipUrl = function (mmsi) {
    return mmsi ? P.WINGO + '/ship/v-' + encodeURIComponent(mmsi) : null;
  };

  P.wingoSearchUrl = function (q) {
    return P.WINGO + '/api/v1/seo/search?q=' + encodeURIComponent(q) + '&limit=10';
  };

  // 선박 페이지에서 지도 데이터와 보이는 글자를 읽어 오는 스크립트
  P.wingoShipScript = function () {
    return '(function(){' +
      'if(window.__FST_RUN)return;window.__FST_RUN=1;var t0=Date.now();' +
      '(function tick(){' +
      ' var m=document.getElementById("vessel-map-data");' +
      ' var ch=/just a moment|잠시만|attention required|보안 확인/i.test(document.title);' +
      ' if(!ch&&(m||Date.now()-t0>9000)){' +
      '  window.__FST_OUT=JSON.stringify({title:document.title,url:location.href,map:m?m.textContent:null,' +
      '   text:(document.body?document.body.innerText:"").slice(0,12000)});' +
      ' }else{setTimeout(tick,300);}' +
      '})();' +
      '})();';
  };

  // 검색 결과(JSON 이 글자로 표시된 화면)를 읽어 오는 스크립트
  P.wingoSearchScript = function () {
    return '(function(){' +
      'if(window.__FST_RUN)return;window.__FST_RUN=1;var t0=Date.now();' +
      '(function tick(){' +
      ' var t=document.body?document.body.innerText:"";' +
      ' if(/^\\s*\\{/.test(t)||Date.now()-t0>8000){window.__FST_OUT=JSON.stringify({title:document.title,url:location.href,text:t.slice(0,20000)});}' +
      ' else{setTimeout(tick,300);}' +
      '})();' +
      '})();';
  };

  // 검색 결과 해석 → [{name, mmsi, imo, category, flag, lastSeenTs}]
  P.parseWingoSearch = function (dump) {
    if (!dump) return { ok: false, error: 'badjson', list: [] };
    if (P.isChallenge(dump.title, dump.text)) return { ok: false, error: 'challenge', list: [] };
    var o;
    try { o = JSON.parse(String(dump.text || '').trim()); } catch (e) { return { ok: false, error: 'layout', list: [] }; }
    var list = ((o && o.items) || []).map(function (i) {
      return {
        name: String(i.name || '').trim(), mmsi: i.mmsi ? String(i.mmsi) : '', imo: i.imo ? String(i.imo) : '',
        category: i.category || '', flag: i.flag || '', lastSeenTs: i.lastSeen ? Date.parse(i.lastSeen) : null
      };
    }).filter(function (x) { return x.name && x.mmsi; });
    return { ok: true, list: list };
  };

  // 검색 결과 중 이 선박에 해당하는 것 고르기: MMSI → IMO → 선명 완전 일치 순
  P.pickWingoMatch = function (list, v) {
    var n = U.normName(v.name);
    return list.filter(function (x) { return v.mmsi && x.mmsi === String(v.mmsi); })[0] ||
      list.filter(function (x) { return v.imo && x.imo === String(v.imo); })[0] ||
      list.filter(function (x) { return n && U.normName(x.name) === n; })[0] || null;
  };

  // "11 Nov 2026, 11:01 UTC" → 타임스탬프
  P.dayMonYearToTs = function (txt) {
    var m = String(txt || '').match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var mon = MONTHS[m[2].toLowerCase()];
    return mon ? Date.UTC(+m[3], mon - 1, +m[1], +m[4], +m[5]) : null;
  };

  // 선박 페이지 해석
  P.parseWingo = function (dump, now) {
    now = now || Date.now();
    if (!dump) return { ok: false, error: 'badjson' };
    if (P.isChallenge(dump.title, dump.text)) return { ok: false, error: 'challenge' };
    var out = { ok: false };
    var map = null;
    try { map = dump.map ? JSON.parse(dump.map) : null; } catch (e) { map = null; }
    var full = String(dump.text || '').replace(/ /g, ' ');
    var cut = full.search(/\n\s*About [^\n]+\n|Vessels nearby/);        // 아래쪽 '주변 선박' 목록은 다른 배 정보라 잘라 낸다
    var t = cut > 0 ? full.slice(0, cut) : full;

    // 정밀 좌표: 지도 데이터 우선, 없으면 화면 글자 "33.9038° N, 128.3128° E"
    if (map && Array.isArray(map.position) && isFinite(map.position[0]) && isFinite(map.position[1])) {
      out.lat = +map.position[0]; out.lon = +map.position[1];
    } else {
      var g = P.parseGeneric(t);
      if (g.ok) { out.lat = g.lat; out.lon = g.lon; }
    }
    if (out.lat == null) return { ok: false, error: /not found|404/i.test(dump.title || '') ? 'notfound' : 'nopos' };

    out.heading = map && isFinite(map.rotation) ? +map.rotation : null;
    out.track = (map && Array.isArray(map.track) ? map.track : []).filter(function (q) {
      return Array.isArray(q) && isFinite(q[0]) && isFinite(q[1]) && Math.abs(q[0]) <= 90 && Math.abs(q[1]) <= 180;
    }).map(function (q) { return [+q[0], +q[1]]; });
    out.portNear = map && map.port && map.port.name ? map.port.name : '';
    out.openSea = !!(map && map.openSea);

    var m;
    m = (dump.title || '').match(/^(.+?)\s+—\s+Position/);                   // 제목 "YC COSMOS — Position, IMO …"
    out.name = m ? m[1].trim() : '';
    m = t.match(/\bIMO\s*(\d{7})/); out.imo = m ? m[1] : '';
    m = t.match(/\bMMSI\s*(\d{9})/); out.mmsi = m ? m[1] : '';
    m = t.match(/Call sign\s*([A-Z0-9]{3,8})/); out.callsign = m ? m[1] : '';
    m = t.match(/Flag\s*\n?\s*(?:[\uD83C][\uDDE6-\uDDFF]){0,2}\s*([A-Za-z][A-Za-z .'-]+)/); out.flag = m ? m[1].trim() : '';
    m = t.match(/\nType\s*\n\s*([^\n]+)/); out.type = m ? m[1].trim() : '';
    m = t.match(/Speed\s*([\d.]+)\s*kn/); out.sog = m ? +m[1] : null;
    m = t.match(/Course\s*(\d{1,3}(?:\.\d+)?)\s*°/); out.cog = m && +m[1] <= 360 ? +m[1] : null;
    if (out.heading == null) { m = t.match(/Heading\s*(\d{1,3})\s*°/); out.heading = m ? +m[1] : null; }
    m = t.match(/Draught\s*([\d.]+)\s*m/); out.draught = m ? +m[1] : null;
    m = t.match(/Deadweight\s*([\d,]+)\s*t/); out.dwt = m ? +m[1].replace(/,/g, '') : null;
    m = t.match(/Length\s*([\d.]+)\s*m/); out.loa = m ? +m[1] : null;
    m = t.match(/Last report\s*([^\n]*?\d{1,2}\s+[A-Za-z]{3}\s+\d{4},?\s+\d{1,2}:\d{2}(?:\s*UTC)?)/);
    out.posTs = m ? P.dayMonYearToTs(m[1]) : null;
    if (out.posTs && out.posTs > now + 10 * 6e4) out.posTs = now;           // 기기 시계가 틀린 경우의 안전장치
    // 목적지: "Voyage / Destination / Yeosu, South Korea / AIS: KR YOS / Speed" (줄바꿈이 없는 형태도 허용)
    m = t.match(/Voyage\s*Destination\s*([\s\S]*?)\s*(?:AIS:\s*([\s\S]*?)\s*)?Speed\s*[\d.]/);
    if (m) { out.destText = m[1].replace(/\s+/g, ' ').trim(); out.destCode = (m[2] || '').replace(/\s+/g, ' ').trim(); }
    // ETA 는 선박이 방송할 때만 나온다 ("Not broadcast: ETA." 면 없음)
    if (!/Not broadcast:[^\n]*ETA/i.test(t)) {
      m = t.match(/\bETA\s*\n?\s*([^\n]{4,40})/);
      if (m) { out.etaText = m[1].trim(); out.etaTs = P.dayMonYearToTs(out.etaText) || P.monthDayTimeToTs(out.etaText, now); }
    }
    m = t.match(/\n\s*([\d.,]+\s*km\s+[NSEW]{1,3}\s+of\s+[^\n]+)\n/); out.nearText = m ? m[1].trim() : '';
    out.live = /Live\s*·/.test(t);                                          // "Live ·" = 최근 수신 / "Last seen" = 끊김
    out.ok = true;
    return out;
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
