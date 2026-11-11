/* =====================================================================
 * store.js — 선박 목록과 설정의 보관소 (기기 내 저장, 서버 없음)
 * ---------------------------------------------------------------------
 * 선박(vessel) 한 척의 구조
 *   id, name, imo, mmsi, callsign, type, flag, dwt, loa      : 제원
 *   cargo            : 화물 태그 (SM / AN / BD / MMA / BPA / 기타 문구)
 *   laycanStart/End  : 도착 허용 기간 (YYYY-MM-DD, 비워 둘 수 있음)
 *   originPortId     : 출항지 (사용자가 고르거나, 조회된 직전 항만으로 자동 설정)
 *   destPortId       : 목적지 (사용자가 고르면 AIS 목적지보다 우선)
 *   fixes[]          : 정밀 위치 기록 {t, lat, lon, sog, cog, src, note}  ← 지나온 항적이 된다
 *   src{}            : 소스별 마지막 조회 결과 (성공/실패, 시각, 읽은 값)
 * ===================================================================== */
(function (root) {
  'use strict';
  var FST = root.FST = root.FST || {};
  var U = FST.Util;
  var S = FST.Store = {};
  var KEY = 'fst_state_v1';                            // localStorage 키
  var MAX_FIXES = 300;                                 // 선박당 보관할 위치 기록 수

  // 피클마린트래킹에서 옮겨 온 초기 선대. 좌표는 2026-11-11 저녁 기준 마지막 값이며
  // 이 앱이 직접 확인한 값이 아니므로 src:'seed' (이관값) 로 표시된다.
  function seedFleet() {
    var t1 = Date.UTC(2026, 10, 11, 8, 44);            // SUNRISE SAMBU: 11/11 17:44 KST 로 기록된 값
    var t2 = Date.UTC(2026, 10, 11, 9, 15);            // 나머지: 이관 커밋 시각(11/11 18:15 KST)으로 간주
    return [
      mk('SUNRISE SAMBU', '9288007', { mmsi: '440213000', callsign: 'DSNR6', cargo: 'SM', originPortId: 'anping', destPortId: 'yeosu',
        fix: { t: t1, lat: 33.0287, lon: 126.6602, sog: 11.1, cog: 73 } }),
      mk('MI LAN', '9342047', { mmsi: '413378950', callsign: 'BPPB8', cargo: '', originPortId: 'jinshan', destPortId: 'panjin',
        fix: { t: t2, lat: 40.4404, lon: 121.8409, sog: 0.2, cog: 299, timeAssumed: true } }),
      mk('YC COSMOS', '9409364', { mmsi: '441878000', callsign: 'DSRJ2', cargo: '', destPortId: 'yeosu',
        fix: { t: t2, lat: 33.8707, lon: 128.1509, sog: 7.4, cog: 248, timeAssumed: true } }),
      mk('PACIFIC SAMBU', '9268306', { mmsi: '441312000', cargo: 'BD', destPortId: 'yeosu',
        fix: { t: t2, lat: 33.72, lon: 126.85, sog: 8.4, cog: 15, timeAssumed: true } }),
      mk('TN IDUN', '9244879', { mmsi: '440437000', callsign: 'D7AT', cargo: '', originPortId: 'daesan', destPortId: 'yeosu',
        fix: { t: t2, lat: 36.6814, lon: 125.9045, sog: 7.9, cog: 190, timeAssumed: true } })
    ];
    function mk(name, imo, o) {
      var v = S.newVessel({ name: name, imo: imo });
      v.id = 'v-' + imo;                             // 피클 때와 같은 IMO 기준 id (PACIFIC SAMBU 는 교정된 IMO 사용)
      ['mmsi', 'callsign', 'cargo', 'destPortId'].forEach(function (k) { if (o[k] != null) v[k] = o[k]; });
      if (o.originPortId) v.originHint = o.originPortId;       // 피클 이관 출항지: 갱신 전까지 쓰는 예비값
      if (o.fix) { o.fix.src = 'seed'; v.fixes.push(o.fix); }
      return v;
    }
  }

  // 빈 선박 객체 만들기
  S.newVessel = function (o) {
    return {
      id: U.uid('v'), name: String(o.name || '').toUpperCase().trim(), imo: o.imo || '', mmsi: o.mmsi || '', callsign: o.callsign || '',
      type: o.type || '', flag: o.flag || '', dwt: o.dwt || null, loa: o.loa || null,
      cargo: '', laycanStart: '', laycanEnd: '', originPortId: '', destPortId: '',
      fixes: [], src: {}, voyage: {}, pilotRows: [], lastRefresh: 0, addedAt: Date.now()
    };
  };

  var state = null;                                    // 메모리에 올린 현재 상태
  var listeners = [];                                  // 상태가 바뀔 때 부를 함수들

  function defaults() {
    return {
      vessels: seedFleet(),
      selectedId: null,
      settings: {
        mapStyle: 'sat',                               // sat(위성) / chart(일반)
        customSources: []                              // [{id, name, url}] 사용자 지정 소스 (Wingo 등)
      }
    };
  }

  // 저장된 상태 불러오기 (깨져 있으면 초기 선대로 시작)
  S.load = function () {
    var raw = null;
    try { raw = root.localStorage ? root.localStorage.getItem(KEY) : null; } catch (e) { raw = null; }
    try { state = raw ? JSON.parse(raw) : null; } catch (e2) { state = null; }
    if (!state || !Array.isArray(state.vessels)) state = defaults();
    var d = defaults().settings;                       // 새 버전에서 추가된 설정 항목 보충
    state.settings = state.settings || {};
    Object.keys(d).forEach(function (k) { if (state.settings[k] == null) state.settings[k] = d[k]; });
    state.vessels.forEach(function (v) {               // 누락 필드 보충
      v.fixes = v.fixes || []; v.src = v.src || {}; v.voyage = v.voyage || {}; v.pilotRows = v.pilotRows || [];
      // 이전 버전은 출항지를 '고정값'으로 저장했다 (피클 이관값·VesselFinder 직전 항만).
      // 사용자가 고른 값이 아니면 고정은 풀되, 버리지 않고 가장 낮은 순위의 예비값(originHint)으로 남긴다
      if (v.originPortId && !v.originUser) { if (!v.originHint) v.originHint = v.originPortId; v.originPortId = ''; }
    });
    if (!state.selectedId && state.vessels[0]) state.selectedId = state.vessels[0].id;
    return state;
  };

  // 저장 + 구독자에게 알림
  S.save = function () {
    try { if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* 저장 공간 부족 등: 화면 동작은 계속한다 */ }
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { /* 한 구독자의 오류가 다른 구독자를 막지 않게 */ } });
  };

  S.get = function () { return state || S.load(); };
  S.onChange = function (fn) { listeners.push(fn); };

  S.vessel = function (id) {
    var list = S.get().vessels;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  S.selected = function () { return S.vessel(S.get().selectedId) || S.get().vessels[0] || null; };
  S.select = function (id) { S.get().selectedId = id; S.save(); };

  // 선박 추가 (같은 IMO·MMSI 가 이미 있으면 그 선박을 돌려준다)
  S.addVessel = function (o) {
    var st = S.get();
    var dup = st.vessels.filter(function (v) {
      return (o.imo && v.imo === o.imo) || (o.mmsi && v.mmsi === o.mmsi) || (!o.imo && !o.mmsi && v.name === String(o.name).toUpperCase().trim());
    })[0];
    if (dup) { st.selectedId = dup.id; S.save(); return dup; }
    var v = S.newVessel(o);
    st.vessels.unshift(v);
    st.selectedId = v.id;
    S.save();
    return v;
  };

  // 추적 종료 (목록에서 제거)
  S.removeVessel = function (id) {
    var st = S.get();
    st.vessels = st.vessels.filter(function (v) { return v.id !== id; });
    if (st.selectedId === id) st.selectedId = st.vessels[0] ? st.vessels[0].id : null;
    S.save();
  };

  // 위치 기록 추가 (같은 소스의 같은 값이 연속으로 들어오면 무시)
  S.addFix = function (v, fix) {
    if (fix.lat == null || fix.lon == null || !isFinite(fix.lat) || !isFinite(fix.lon)) return false;
    var same = v.fixes.some(function (f) {
      return Math.abs(f.t - fix.t) < 60000 && Math.abs(f.lat - fix.lat) < 1e-4 && Math.abs(f.lon - fix.lon) < 1e-4;
    });
    if (same) return false;
    v.fixes.push(fix);
    v.fixes.sort(function (a, b) { return a.t - b.t; }); // 시간순 유지
    if (v.fixes.length > MAX_FIXES) v.fixes = v.fixes.slice(-MAX_FIXES);
    return true;
  };

  // 초기 선대로 되돌리기 (설정 화면)
  S.reset = function () { state = defaults(); state.selectedId = state.vessels[0].id; S.save(); };

  // 백업용 내보내기 / 가져오기
  S.exportJson = function () { return JSON.stringify(S.get(), null, 2); };
  S.importJson = function (txt) {
    var o = JSON.parse(txt);                           // 형식이 틀리면 여기서 예외 → 호출부가 안내문 표시
    if (!o || !Array.isArray(o.vessels)) throw new Error('format');
    state = o;
    S.save();
    S.load();
  };
})(typeof window !== 'undefined' ? window : globalThis);
