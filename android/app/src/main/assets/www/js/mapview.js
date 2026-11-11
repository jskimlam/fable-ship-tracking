/* =====================================================================
 * mapview.js — 지도 그리기와 선박 이동 애니메이션 (Leaflet, API 키 없음)
 * ---------------------------------------------------------------------
 * 선 종류
 *   실측 항적   : 청록 실선            (기록된 위치들을 이은 선)
 *   추정 구간   : 청록 가는 점선       (출항지 ~ 첫 실측, 기록이 없어 계산한 선)
 *   예정 항로   : 호박색 흐르는 점선   (현재 → 목적 항만)
 * 표식
 *   실측 지점(점) / 선박(실측이면 청록, 추측항법 추정이면 호박색 + '추정')
 *   출항지·목적지 이름표 / 개략 위치(넓은 원) / 다른 추적 선박(작은 점)
 * ===================================================================== */
(function (root) {
  'use strict';
  var FST = root.FST = root.FST || {};
  var U = FST.Util;
  var M = FST.MapView = {};
  var L = root.L;                                      // Leaflet

  var map = null, layer = null, base = {}, labels = null; // 지도·그림 층·배경 지도
  var shipMarker = null;                               // 선택 선박 표식
  var anim = null;                                     // 진행 중인 애니메이션 핸들
  var lastPos = {};                                    // 선박 id → 직전에 그린 위치 (갱신 시 이동 애니메이션 출발점)
  var styleNow = 'sat';

  // 위에서 내려다본 탱커 모양 (위쪽이 선수)
  M.shipSvg = function (color) {
    return '<svg viewBox="0 0 32 32"><path d="M16 2c4 4 6 8 6 12v12c0 2-1 4-3 4h-6c-2 0-3-2-3-4V14c0-4 2-8 6-12z" fill="' + color +
      '" stroke="#04121e" stroke-width="1.6"/><rect x="13" y="21" width="6" height="5" rx="1" fill="#04121e" opacity=".75"/>' +
      '<path d="M16 8v11" stroke="#04121e" stroke-width="1.6" stroke-linecap="round" opacity=".6"/></svg>';
  };

  // 지도 만들기 (한 번만)
  M.init = function (el, style) {
    if (map || !L) return;
    map = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true, zoomSnap: 0.25 }).setView([33.5, 126.5], 6);
    map.attributionControl.setPrefix(false);
    // 위성 사진 (Esri World Imagery) + 지명 겹침 층
    base.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 17, attribution: '위성: Esri, Maxar, Earthstar Geographics' });
    labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 17, opacity: 0.85 });
    // 일반 지도 (OpenStreetMap)
    base.chart = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' });
    layer = L.layerGroup().addTo(map);
    M.setStyle(style || 'sat');
  };

  // 배경 지도 바꾸기: 'sat' 위성 / 'chart' 일반
  M.setStyle = function (style) {
    if (!map) return;
    styleNow = style === 'chart' ? 'chart' : 'sat';
    [base.sat, base.chart, labels].forEach(function (t) { if (t && map.hasLayer(t)) map.removeLayer(t); });
    if (styleNow === 'sat') { base.sat.addTo(map); labels.addTo(map); } else { base.chart.addTo(map); }
  };
  M.style = function () { return styleNow; };

  // 화면 크기가 바뀌었을 때 (폴드 접기·펴기, 탭 전환)
  M.resize = function () { if (map) map.invalidateSize(); };

  function icon(html, size, anchor) {
    return L.divIcon({ className: '', html: html, iconSize: size || [0, 0], iconAnchor: anchor || [0, 0] });
  }

  function stopAnim() {
    if (anim) { root.cancelAnimationFrame(anim); anim = null; }
  }

  // 선박 표식 만들기/옮기기
  function placeShip(pos, heading, vw) {
    var est = !!(vw.cur && vw.cur.est);
    var html = '<div class="mk-ship' + (est ? ' est' : '') + '">' +
      '<span class="rot" style="position:absolute;inset:0;transform:rotate(' + Math.round(heading || 0) + 'deg);transition:transform .4s">' + M.shipSvg(est ? '#ffc24d' : '#35d0ff') + '</span>' +
      '<span class="mk-label">' + U.esc(vw.v.name) + (est ? '<small>추정</small>' : '') + '</span></div>';
    if (shipMarker) layer.removeLayer(shipMarker);
    shipMarker = L.marker(pos, { icon: icon(html, [44, 44], [22, 22]), zIndexOffset: 1000, interactive: false }).addTo(layer);
  }

  // 표식만 빠르게 옮기기 (애니메이션 프레임용)
  function moveShip(pos, heading) {
    if (!shipMarker) return;
    shipMarker.setLatLng(pos);
    var el = shipMarker.getElement();
    var rot = el && el.querySelector('.rot');
    if (rot && heading != null) rot.style.transform = 'rotate(' + Math.round(heading) + 'deg)';
  }

  // 경로를 따라 표식을 움직인다. onEnd 는 끝났을 때 호출.
  function animateAlong(pts, ms, onEnd, trail) {
    stopAnim();
    var total = U.pathNm(pts);
    if (!pts || pts.length < 2 || total < 0.05) { if (onEnd) onEnd(); return; }
    var t0 = null;
    function frame(ts) {
      if (t0 == null) t0 = ts;
      var k = Math.min(1, (ts - t0) / ms);             // 0 → 1 진행률
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // 부드러운 가감속
      var pa = U.pointAlong(pts, total * e);
      moveShip(pa.pos, pa.bearing);
      if (trail) trail.setLatLngs(pts.slice(0, pa.index + 1).concat([pa.pos])); // 지나온 만큼만 선을 그린다
      if (k < 1) anim = root.requestAnimationFrame(frame);
      else { anim = null; if (onEnd) onEnd(); }
    }
    anim = root.requestAnimationFrame(frame);
  }

  // 항차 상태 그리기. opts.fit=true 면 전체 항로가 보이게 맞춘다. others = 다른 선박들의 view.
  M.draw = function (vw, opts, others, onPick) {
    if (!map) return;
    opts = opts || {};
    stopAnim();
    layer.clearLayers();
    shipMarker = null;
    var bounds = [];

    // 다른 추적 선박 (작은 점, 누르면 선택)
    (others || []).forEach(function (o) {
      if (!o.cur || o.v.id === vw.v.id) return;
      var p = [o.cur.lat, o.cur.lon];
      L.marker(p, { icon: icon('<div class="mk-other"></div>', [14, 14], [7, 7]) }).addTo(layer).on('click', function () { if (onPick) onPick(o.v.id); });
      L.marker(p, { icon: icon('<span class="mk-otherlabel">' + U.esc(o.v.name) + '</span>'), interactive: false }).addTo(layer);
    });

    // 추정 구간: 출항지 ~ 첫 실측
    if (vw.pastEst.length > 1) {
      L.polyline(vw.pastEst, { color: '#35d0ff', weight: 2, opacity: 0.55, dashArray: '4 7', interactive: false }).addTo(layer);
      bounds = bounds.concat(vw.pastEst);
    }
    // 실측 항적
    if (vw.pastTrack.length > 1) {
      L.polyline(vw.pastTrack, { color: '#062436', weight: 7, opacity: 0.55, interactive: false }).addTo(layer); // 가독성용 어두운 테두리
      L.polyline(vw.pastTrack, { color: '#35d0ff', weight: 3.5, opacity: 0.95, lineCap: 'round', interactive: false }).addTo(layer);
      bounds = bounds.concat(vw.pastTrack);
    }
    // 예정 항로 (흐르는 점선). 추측항법으로 이미 지난 구간은 '추정 항적'으로 따로 그린다.
    if (vw.future.length > 1) {
      var ahead = vw.future, behind = null;
      if (vw.dr) {
        var pa = U.pointAlong(vw.future, vw.dr.advNm);
        behind = vw.future.slice(0, pa.index + 1).concat([pa.pos]);
        ahead = [pa.pos].concat(vw.future.slice(pa.index + 1));
      }
      if (behind && behind.length > 1) L.polyline(behind, { color: '#ffc24d', weight: 2.5, opacity: 0.8, dashArray: '3 6', interactive: false }).addTo(layer);
      L.polyline(ahead, { color: '#1a1206', weight: 6, opacity: 0.45, interactive: false }).addTo(layer);
      L.polyline(ahead, { color: '#ffc24d', weight: 3, opacity: 0.95, lineCap: 'round', className: 'route-future', interactive: false }).addTo(layer);
      bounds = bounds.concat(vw.future);
    }
    // 출항지·목적지 이름표
    if (vw.origin && !(vw.dest && vw.dest.id === vw.origin.id)) { // 출항지와 목적지가 같은 항만이면 이름표는 하나만
      L.marker([vw.origin.lat, vw.origin.lon], { icon: icon('<div class="mk-port">' + U.esc(vw.origin.ko) +
        (vw.v.voyage && vw.v.voyage.atdTs ? '<small>' + U.fmtKst(vw.v.voyage.atdTs) + ' 출항</small>' : '<small>출항지</small>') + '</div>'), interactive: false }).addTo(layer);
      bounds.push([vw.origin.lat, vw.origin.lon]);
    }
    if (vw.dest) {
      L.marker([vw.dest.lat, vw.dest.lon], { icon: icon('<div class="mk-port dest">' + U.esc(vw.dest.ko) +
        '<small>' + (vw.eta ? vw.eta.label + ' ' + U.fmtKst(vw.eta.ts) : '목적지') + '</small></div>'), interactive: false }).addTo(layer);
      bounds.push([vw.dest.lat, vw.dest.lon]);
    }
    // 실측 지점들 (최근 12개만 점으로, 마지막 것에는 시각 표시)
    var fixes = vw.v.fixes || [];
    fixes.slice(-12).forEach(function (f, i, arr) {
      var last = i === arr.length - 1;
      L.marker([f.lat, f.lon], { icon: icon('<div class="mk-fix"></div>', [12, 12], [6, 6]), interactive: false, opacity: last ? 1 : 0.6 }).addTo(layer);
      if (last) L.marker([f.lat, f.lon], { icon: icon('<span class="mk-fixlabel">실측 ' + U.fmtKst(f.t) + '</span>'), interactive: false }).addTo(layer);
    });
    // 개략 위치 (정밀 위치가 없을 때): 반경 약 60해리 원
    if (vw.coarse) {
      L.circle([vw.coarse.lat, vw.coarse.lon], { radius: 111000, color: '#c7b3ff', weight: 1.5, dashArray: '6 6', fillColor: '#c7b3ff', fillOpacity: 0.08, interactive: false }).addTo(layer);
      L.marker([vw.coarse.lat, vw.coarse.lon], { icon: icon('<span class="mk-otherlabel" style="color:#c7b3ff">개략 위치 (' + U.ago(vw.coarse.ts, vw.now) + ')</span>'), interactive: false }).addTo(layer);
      bounds.push([vw.coarse.lat + 1, vw.coarse.lon + 1], [vw.coarse.lat - 1, vw.coarse.lon - 1]);
    }

    // 선박 표식 + 이동 애니메이션
    if (vw.cur) {
      var target = [vw.cur.lat, vw.cur.lon];
      var from = lastPos[vw.v.id];
      placeShip(target, vw.heading, vw);
      bounds.push(target);
      if (opts.animate && from && U.distNm(from, target) > 0.2 && U.distNm(from, target) < 400) {
        moveShip(from, U.bearing(from, target));       // 직전 위치에서 새 위치로 미끄러지듯 이동
        animateAlong([from, target], 1600, function () { moveShip(target, vw.heading); });
      }
      lastPos[vw.v.id] = target;
    }

    if (opts.fit && bounds.length) {
      map.flyToBounds(L.latLngBounds(bounds), { paddingTopLeft: [70, 110], paddingBottomRight: [90, 215], maxZoom: 9, duration: 0.9 });
    } else if (opts.center && vw.cur) {
      map.flyTo([vw.cur.lat, vw.cur.lon], Math.max(map.getZoom(), 8), { duration: 0.8 });
    }
  };

  // 항적 재생: 출항지부터 현재 위치까지 선박을 움직여 보여 준다
  M.replay = function (vw, onEnd) {
    if (!map || !vw.cur) { if (onEnd) onEnd(false); return; }
    var pts = [];
    if (vw.pastEst.length > 1) pts = pts.concat(vw.pastEst);
    if (vw.pastTrack.length > 1) pts = pts.concat(pts.length ? vw.pastTrack.slice(1) : vw.pastTrack);
    if (vw.dr && vw.future.length > 1) {               // 마지막 실측 이후 추정 구간까지 이어서
      var pa = U.pointAlong(vw.future, vw.dr.advNm);
      var seg = vw.future.slice(0, pa.index + 1).concat([pa.pos]);
      pts = pts.concat(pts.length ? seg.slice(1) : seg);
    }
    if (pts.length < 2) { if (onEnd) onEnd(false); return; }
    map.flyToBounds(L.latLngBounds(pts.concat(vw.dest ? [[vw.dest.lat, vw.dest.lon]] : [])), { paddingTopLeft: [70, 110], paddingBottomRight: [90, 215], maxZoom: 9, duration: 0.6 });
    var trail = L.polyline([pts[0]], { color: '#ffffff', weight: 4, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(layer);
    moveShip(pts[0], U.bearing(pts[0], pts[1]));
    root.setTimeout(function () {
      animateAlong(pts, 5200, function () {
        layer.removeLayer(trail);
        moveShip([vw.cur.lat, vw.cur.lon], vw.heading);
        if (onEnd) onEnd(true);
      }, trail);
    }, 700);
  };

  // 현재 그려진 선박으로 화면 이동
  M.focus = function (vw) {
    if (map && vw.cur) map.flyTo([vw.cur.lat, vw.cur.lon], 9, { duration: 0.8 });
  };
})(typeof window !== 'undefined' ? window : globalThis);
