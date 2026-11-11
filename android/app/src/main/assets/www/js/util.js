/* =====================================================================
 * util.js — 공통 유틸리티 (거리·방위 계산, 시각 표시, 문자열 처리)
 * 모든 모듈은 전역 네임스페이스 FST 아래에 기능을 등록한다.
 * ===================================================================== */
(function (root) {
  'use strict';
  var FST = root.FST = root.FST || {};                 // 전역 네임스페이스 (없으면 생성)
  var RAD = Math.PI / 180;                             // 도 → 라디안 변환 계수
  var EARTH_NM = 3440.065;                             // 지구 반지름 (해리)
  var KST = 'Asia/Seoul';                              // 화면 표시는 항상 한국 시간 기준
  var DAY_KO = ['일', '월', '화', '수', '목', '금', '토']; // 요일 한글 표기

  var U = FST.Util = {};

  /* ---------- 거리·방위 ---------- */

  // 두 지점 [위도, 경도] 사이의 대권 거리(해리)
  U.distNm = function (a, b) {
    var dLat = (b[0] - a[0]) * RAD;                    // 위도 차
    var dLon = (b[1] - a[1]) * RAD;                    // 경도 차
    var h = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.pow(Math.sin(dLon / 2), 2); // haversine 공식
    return 2 * EARTH_NM * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  // a 에서 b 를 바라보는 방위각(0~360도, 북쪽이 0)
  U.bearing = function (a, b) {
    var y = Math.sin((b[1] - a[1]) * RAD) * Math.cos(b[0] * RAD);
    var x = Math.cos(a[0] * RAD) * Math.sin(b[0] * RAD) -
      Math.sin(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.cos((b[1] - a[1]) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  };

  // 경로(점 배열)의 전체 길이(해리)
  U.pathNm = function (pts) {
    var sum = 0;                                       // 누적 거리
    for (var i = 1; i < pts.length; i++) sum += U.distNm(pts[i - 1], pts[i]);
    return sum;
  };

  // 경로를 따라 nm 해리만큼 간 지점을 구한다 → {pos:[위도,경도], bearing, index, done}
  U.pointAlong = function (pts, nm) {
    if (!pts || !pts.length) return null;              // 경로가 없으면 계산 불가
    if (pts.length === 1 || nm <= 0) {
      return { pos: pts[0], bearing: pts.length > 1 ? U.bearing(pts[0], pts[1]) : 0, index: 0, done: false };
    }
    var left = nm;                                     // 남은 진행 거리
    for (var i = 1; i < pts.length; i++) {
      var seg = U.distNm(pts[i - 1], pts[i]);          // 이번 구간 길이
      if (left <= seg && seg > 0) {                    // 이 구간 안에서 멈춘다
        var t = left / seg;                            // 구간 내 진행 비율
        return {
          pos: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t],
          bearing: U.bearing(pts[i - 1], pts[i]), index: i - 1, done: false
        };
      }
      left -= seg;                                     // 다음 구간으로
    }
    var n = pts.length;                                // 경로 끝을 넘어선 경우: 마지막 점에서 멈춤
    return { pos: pts[n - 1], bearing: U.bearing(pts[n - 2], pts[n - 1]), index: n - 2, done: true };
  };

  // 방위각을 16방위 한글 약칭으로 (예: 73 → "동북동")
  U.compassKo = function (deg) {
    if (deg == null || isNaN(deg)) return '';
    var names = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
    return names[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  };

  /* ---------- 시각 ---------- */

  // 타임스탬프(ms)를 한국 시간 부품으로 분해
  U.kstParts = function (ts) {
    var f = new Intl.DateTimeFormat('en-GB', {
      timeZone: KST, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
    }).formatToParts(new Date(ts));
    var o = {};                                        // 부품 모음
    f.forEach(function (p) { o[p.type] = p.value; });
    var wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday]; // 요일 번호
    return { y: +o.year, m: +o.month, d: +o.day, hh: o.hour === '24' ? '00' : o.hour, mm: o.minute, wd: wd };
  };

  // "11/12(목) 06:00" 형식
  U.fmtKst = function (ts) {
    if (!ts) return '-';
    var p = U.kstParts(ts);
    return p.m + '/' + p.d + '(' + DAY_KO[p.wd] + ') ' + p.hh + ':' + p.mm;
  };

  // "06:00" 형식
  U.fmtHm = function (ts) {
    if (!ts) return '-';
    var p = U.kstParts(ts);
    return p.hh + ':' + p.mm;
  };

  // 한국 시간 기준 YYYYMMDD (offsetDays 만큼 날짜 이동)
  U.kstYmd = function (ts, offsetDays) {
    var p = U.kstParts(ts + (offsetDays || 0) * 86400000);
    return '' + p.y + (p.m < 10 ? '0' : '') + p.m + (p.d < 10 ? '0' : '') + p.d;
  };

  // 한국 시간의 연·월·일·시·분을 타임스탬프(ms)로 (KST = UTC+9, 서머타임 없음)
  U.kstToTs = function (y, m, d, hh, mm) {
    return Date.UTC(y, m - 1, d, (hh || 0) - 9, mm || 0);
  };

  // 경과 시간 표현: "12분 전", "3시간 20분 전", "4일 전"
  U.ago = function (ts, now) {
    if (!ts) return '시각 미상';
    var min = Math.max(0, Math.round(((now || Date.now()) - ts) / 60000)); // 경과 분
    if (min < 1) return '방금';
    if (min < 60) return min + '분 전';
    if (min < 60 * 48) return Math.floor(min / 60) + '시간' + (min % 60 ? ' ' + (min % 60) + '분' : '') + ' 전';
    return Math.floor(min / 1440) + '일 전';
  };

  // 남은 시간 표현: "D-14시간 20분", "D-2일 3시간", 지났으면 "+3시간 경과"
  U.remain = function (ts, now) {
    if (!ts) return '-';
    var min = Math.round((ts - (now || Date.now())) / 60000);
    var abs = Math.abs(min);                           // 절댓값(분)
    var txt = abs >= 1440 ? Math.floor(abs / 1440) + '일 ' + Math.floor(abs % 1440 / 60) + '시간'
      : abs >= 60 ? Math.floor(abs / 60) + '시간 ' + (abs % 60) + '분' : abs + '분';
    return min >= 0 ? 'D-' + txt : '+' + txt + ' 경과';
  };

  /* ---------- 숫자·문자열 ---------- */

  // 소수 자릿수를 맞춘 숫자 문자열 (값이 없으면 '-')
  U.num = function (v, digits) {
    return (v == null || isNaN(v)) ? '-' : Number(v).toFixed(digits == null ? 1 : digits);
  };

  // 좌표 표기: "33.029°N 126.660°E"
  U.fmtPos = function (lat, lon) {
    if (lat == null || lon == null) return '-';
    return Math.abs(lat).toFixed(3) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' + Math.abs(lon).toFixed(3) + '°' + (lon >= 0 ? 'E' : 'W');
  };

  // HTML 특수문자 이스케이프 (외부에서 읽어 온 글자를 화면에 넣을 때 반드시 거친다)
  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // 선박명 비교용 정규화: 대문자, 영숫자만
  U.normName = function (s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  };

  // 간단한 고유 id
  U.uid = function (prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  };
})(typeof window !== 'undefined' ? window : globalThis);
