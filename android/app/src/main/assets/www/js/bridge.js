/* =====================================================================
 * bridge.js — 화면(JS)과 안드로이드 네이티브 사이의 다리
 * ---------------------------------------------------------------------
 * 네이티브(MainActivity.java)가 제공하는 것
 *   FstNative.scrape(요청id, 주소, 추출스크립트, 제한시간ms)  → 숨은 웹뷰로 페이지를 열어 값을 읽음
 *   FstNative.openBrowser(주소, 제목)                         → 앱 안 브라우저 (로그인·원문 보기)
 *   결과는 window.FST_NATIVE_CB(요청id, JSON문자열) 로 돌아온다
 * PC 브라우저처럼 네이티브가 없는 환경에서는 직접 조회가 불가능하므로
 *   - 주소에 ?demo=1 이 있으면 2026-11-11 에 실제로 받아 둔 예시 응답으로 동작하고
 *   - 그렇지 않으면 "앱에서만 가능"이라는 실패를 돌려준다.
 * ===================================================================== */
(function (root) {
  'use strict';
  var FST = root.FST = root.FST || {};
  var B = FST.Bridge = {};
  var pending = {};                                    // 요청id → {resolve, timer}
  var seq = 0;                                         // 요청 일련번호
  var native = root.FstNative || null;                 // 안드로이드가 주입한 객체 (없으면 null)

  B.available = !!native;                              // 직접 조회 가능 여부
  B.demo = !native && /[?&]demo=1/.test((root.location && root.location.search) || ''); // 예시 데이터 모드

  // 네이티브가 결과를 돌려줄 때 부르는 전역 함수
  root.FST_NATIVE_CB = function (id, payload) {
    var p = pending[id];
    if (!p) return;                                    // 이미 시간 초과로 정리된 요청
    delete pending[id];
    clearTimeout(p.timer);
    var res;
    try { res = JSON.parse(payload); } catch (e) { res = { ok: false, error: 'badjson' }; }
    if (res.ok && typeof res.data === 'string') {      // 추출 스크립트가 남긴 문자열을 객체로
      try { res.data = JSON.parse(res.data); } catch (e2) { res = { ok: false, error: 'badjson' }; }
    }
    p.resolve(res);
  };

  // 페이지를 직접 열어 값을 읽는다 → Promise<{ok, data} | {ok:false, error, title}>
  // error 종류: no-native(앱 아님) / timeout(시간 초과) / load(접속 실패) / badjson(결과 해석 실패)
  B.scrape = function (req) {
    var timeoutMs = req.timeoutMs || 20000;
    if (B.demo) return demoScrape(req);
    if (!native) return Promise.resolve({ ok: false, error: 'no-native' });
    return new Promise(function (resolve) {
      var id = 'r' + (++seq) + '_' + Date.now();
      var timer = setTimeout(function () {             // 네이티브가 응답하지 않는 경우의 안전장치
        if (pending[id]) { delete pending[id]; resolve({ ok: false, error: 'timeout' }); }
      }, timeoutMs + 5000);
      pending[id] = { resolve: resolve, timer: timer };
      try { native.scrape(id, req.url, req.script, timeoutMs); }
      catch (e) { delete pending[id]; clearTimeout(timer); resolve({ ok: false, error: 'load' }); }
    });
  };

  // 앱 안 브라우저로 주소 열기 (로그인, 보안 확인 통과, 원문 확인용)
  B.openBrowser = function (url, title) {
    if (native && native.openBrowser) { native.openBrowser(url, title || ''); return true; }
    if (root.open) root.open(url, '_blank', 'noopener');
    return false;
  };

  // 예시 데이터 모드: demo.js 에 담아 둔 실제 응답을 주소 규칙으로 찾아 돌려준다
  function demoScrape(req) {
    return new Promise(function (resolve) {
      var hit = null;
      (root.FST_DEMO || []).forEach(function (d) { if (!hit && req.url.indexOf(d.match) >= 0) hit = d; });
      setTimeout(function () {
        resolve(hit ? { ok: true, data: JSON.parse(JSON.stringify(hit.data)) } : { ok: false, error: 'timeout' });
      }, 500 + Math.random() * 700);
    });
  }

  // 실패 코드를 사용자에게 보여 줄 한글 문장으로
  B.errorText = function (code) {
    return {
      'no-native': '직접 조회는 안드로이드 앱에서만 됩니다.',
      'timeout': '응답이 없어 중단했습니다. 연결 상태를 확인해 주세요.',
      'load': '페이지에 접속하지 못했습니다.',
      'badjson': '받은 내용을 해석하지 못했습니다.',
      'challenge': '사이트가 보안 확인을 요구합니다. 원문 열기에서 한 번 통과한 뒤 다시 갱신해 주세요.',
      'layout': '사이트 화면 구성이 바뀌어 값을 읽지 못했습니다.',
      'nopos': '페이지에서 위치 값을 찾지 못했습니다.',
      'noid': 'IMO·MMSI 번호가 없어 조회하지 못했습니다.',
      'fetch': '조회 요청이 거절되었습니다.'
    }[code] || '알 수 없는 오류로 조회하지 못했습니다.';
  };
})(typeof window !== 'undefined' ? window : globalThis);
