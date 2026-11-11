/* =====================================================================
 * route.js — 육지를 피하는 해상 항로 계산
 * ---------------------------------------------------------------------
 * 원리
 *   1) 육지 다각형(land.js)으로 "이 직선이 바다만 지나는가"를 검사한다
 *   2) 직선으로 못 가면 해상 경유 노드 그래프(seagraph.js)에서 최단 경로를 찾는다 (다익스트라)
 *   3) 찾은 경로에서 불필요한 꺾임을 지워 자연스럽게 만든다
 *   4) 항만 구간은 ports.js 의 진입 경유점(approach)을 그대로 붙인다
 * 주의: 표시·ETA 추정용 개략 항로이며 실제 항해 계획이 아니다.
 * ===================================================================== */
(function (root) {
  'use strict';
  var FST = root.FST = root.FST || {};
  var U = FST.Util;
  var R = FST.Route = {};

  var land = null;                                     // 외접 사각형이 붙은 육지 고리 목록
  var graph = null;                                    // {nodes, adj}
  var portIndex = null;                                // 항만 검색용 색인
  var margin = 0.07;                                   // 해안 여유 폭(도), seagraph.js 값으로 덮어쓴다

  // 처음 쓸 때 한 번만 자료를 준비한다
  function ensure() {
    if (land) return;
    land = (root.FST_LAND || []).map(function (r) {
      var w = 999, e = -999, s = 999, n = -999;        // 고리의 외접 사각형
      for (var i = 0; i < r.length; i++) {
        if (r[i][0] < w) w = r[i][0]; if (r[i][0] > e) e = r[i][0];
        if (r[i][1] < s) s = r[i][1]; if (r[i][1] > n) n = r[i][1];
      }
      return { r: r, w: w, e: e, s: s, n: n };
    });
    var g = root.FST_SEAGRAPH || { nodes: [], edges: [], maxEdgeNm: 420 };
    var adj = g.nodes.map(function () { return []; }); // 인접 목록
    g.edges.forEach(function (e) { adj[e[0]].push([e[1], e[2]]); adj[e[1]].push([e[0], e[2]]); });
    var corr = {};                                     // "노드a|노드b" → a→b 방향 경유점들 (통항 회랑)
    (g.corridors || []).forEach(function (c) {
      adj[c[0]].push([c[1], c[2]]);
      adj[c[1]].push([c[0], c[2]]);
      corr[c[0] + '|' + c[1]] = c[3];
    });
    if (g.margin) margin = g.margin;
    graph = { nodes: g.nodes.map(function (n) { return [n[1], n[2]]; }), adj: adj, corr: corr, maxEdgeNm: g.maxEdgeNm };
  }

  // 점이 육지 안인지 (ray casting)
  R.isLand = function (lat, lon) {
    ensure();
    for (var k = 0; k < land.length; k++) {
      var g = land[k];
      if (lon < g.w || lon > g.e || lat < g.s || lat > g.n) continue; // 범위 밖 고리는 건너뜀
      var r = g.r, inside = false;
      for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
        var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  };

  // 두 점을 이은 직선이 바다만 지나는지 (약 2해리 간격 표본)
  // skipEndsNm: 양 끝에서 이 거리만큼은 검사하지 않는다 (항내·연안에 있는 선박/부두 좌표 보정용)
  R.seaClear = function (a, b, skipEndsNm) {
    ensure();
    var d = U.distNm(a, b);                            // 구간 길이
    var n = Math.max(2, Math.ceil(d / 2));             // 표본 수
    var skip = d > 0 ? Math.min(0.45, (skipEndsNm || 0) / d) : 0; // 건너뛸 비율
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      if (t < skip || t > 1 - skip) continue;          // 양 끝 보정 구간은 통과
      var la = a[0] + (b[0] - a[0]) * t, lo = a[1] + (b[1] - a[1]) * t; // 표본 지점
      if (R.isLand(la, lo)) return false;              // 중심선이 육지에 닿음
      if (R.isLand(la + margin, lo) || R.isLand(la - margin, lo) ||
          R.isLand(la, lo + margin) || R.isLand(la, lo - margin)) return false; // 해안 여유 폭(약 4해리) 침범
    }
    return true;
  };

  // 두 점을 이은 직선의 중심선이 육지에 닿는지 (여유 폭 없이, 약 1해리 간격 표본)
  // 실측점끼리 이을 때 쓴다: 실측은 실제로 배가 있던 자리라 해안에 붙어 있어도 정상이다
  R.lineHitsLand = function (a, b) {
    ensure();
    var n = Math.max(2, Math.ceil(U.distNm(a, b)));
    for (var i = 1; i < n; i++) {                       // 양 끝(실측점 자체)은 검사하지 않는다
      var t = i / n;
      if (R.isLand(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return true;
    }
    return false;
  };

  // 임의의 점에서 직선으로 갈 수 있는 그래프 노드 목록 → [[노드번호, 거리], ...]
  function linksFrom(p) {
    var out = [];
    for (var i = 0; i < graph.nodes.length; i++) {
      var d = U.distNm(p, graph.nodes[i]);
      if (d <= graph.maxEdgeNm && R.seaClear(p, graph.nodes[i], 8)) out.push([i, d]);
    }
    if (!out.length) {                                 // 연결이 하나도 없으면 가장 가까운 노드 2개에 강제로 잇는다
      var all = graph.nodes.map(function (n, i) { return [i, U.distNm(p, n)]; });
      all.sort(function (x, y) { return x[1] - y[1]; });
      out = all.slice(0, 2);
    }
    return out;
  }

  // 바다 위 두 점 사이의 항로 (점 배열). 직선이 가능하면 직선, 아니면 그래프 최단 경로.
  R.seaPath = function (a, b) {
    ensure();
    if (U.distNm(a, b) < 0.3) return [a, b];           // 사실상 같은 점
    if (R.seaClear(a, b, 8)) return [a, b];            // 직선으로 갈 수 있다
    var N = graph.nodes.length;                        // 실제 노드 수
    var S = N, E = N + 1;                              // 가상 출발·도착 노드 번호
    var startLinks = linksFrom(a), endLinks = linksFrom(b);
    var endMap = {};                                   // 노드번호 → 도착점까지 거리
    endLinks.forEach(function (l) { endMap[l[0]] = l[1]; });

    var dist = [], prev = [], done = [];               // 다익스트라 상태
    for (var i = 0; i < N + 2; i++) { dist.push(Infinity); prev.push(-1); done.push(false); }
    dist[S] = 0;
    while (true) {
      var u = -1, best = Infinity;                     // 아직 확정 안 된 노드 중 가장 가까운 것
      for (var k = 0; k < N + 2; k++) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
      if (u < 0 || u === E) break;                     // 더 갈 곳이 없거나 도착
      done[u] = true;
      var nbrs = u === S ? startLinks : graph.adj[u].slice(); // 이웃 목록
      if (u !== S && endMap[u] != null) nbrs.push([E, endMap[u]]); // 도착점과 이어진 노드면 도착 간선 추가
      for (var m = 0; m < nbrs.length; m++) {
        var v = nbrs[m][0], nd = dist[u] + nbrs[m][1];
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      }
    }
    if (dist[E] === Infinity) return [a, b];           // 경로를 못 찾으면 직선으로 돌려준다 (호출부에서 '개략' 표시)

    var seq = [];                                      // 지나간 노드 번호 (도착 쪽부터)
    for (var c = prev[E]; c !== S && c >= 0; c = prev[c]) seq.push(c);
    seq.reverse();                                     // 출발 → 도착 순서로

    var pts = [a];                                     // 경유점을 끼워 가며 경로를 조립한다
    var locked = {};                                   // 회랑 경유점 위치 (smooth 가 지우면 안 되는 점)
    for (var k2 = 0; k2 < seq.length; k2++) {
      if (k2 > 0) {                                    // 직전 노드와 이번 노드 사이가 회랑이면 경유점 삽입
        var p0 = seq[k2 - 1], p1 = seq[k2];
        var via = graph.corr[p0 + '|' + p1] ||
          (graph.corr[p1 + '|' + p0] ? graph.corr[p1 + '|' + p0].slice().reverse() : null); // 반대 방향 회랑
        if (via) via.forEach(function (q) { locked[pts.length] = true; pts.push(q); });
      }
      pts.push(graph.nodes[seq[k2]]);
    }
    pts.push(b);
    var sm = smooth(pts, locked);                      // 꺾임을 줄인 경로 (회랑 경유점은 그대로 유지)
    return U.pathNm(sm) <= U.pathNm(pts) + 0.5 ? sm : pts; // 줄였더니 오히려 길어지면 원래 경로 사용
  };

  // 불필요한 꺾임 제거: 건너뛰어도 바다만 지나면 중간 점을 지운다.
  // locked 에 표시된 점(회랑 경유점)은 반드시 지나간다 — 좁은 해협은 여유 폭 검사가
  // 우연히 통과해도 실제로는 육지를 스치는 직선이 나올 수 있어서다.
  function smooth(pts, locked) {
    var out = [pts[0]], i = 0;
    while (i < pts.length - 1) {
      var lim = pts.length - 1;                        // 이번에 건너뛸 수 있는 한계
      if (locked) {
        for (var m = i + 1; m < pts.length - 1; m++) { if (locked[m]) { lim = m; break; } } // 다음 고정점까지만
      }
      var j = lim;                                     // 한계 안에서 가장 먼 점부터 시도
      while (j > i + 1 && !R.seaClear(pts[i], pts[j], (i === 0 || j === pts.length - 1) ? 8 : 0)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /* ---------- 항만 검색 ---------- */

  function buildPortIndex() {
    portIndex = {};
    (root.FST_PORTS || []).forEach(function (p) {
      var keys = [p.en, p.ko].concat(p.alias || [], p.locode || []);
      keys.forEach(function (k) { portIndex[U.normName(k) || k] = p; });
      (p.alias || []).forEach(function (k) { if (/[^\x00-\x7f]/.test(k)) portIndex[k] = p; }); // 한글 별칭은 원문 그대로도 등록
    });
  }

  // id 로 항만 찾기
  R.portById = function (id) {
    var list = root.FST_PORTS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  // AIS 목적지·사이트 표기 문자열에서 항만을 찾는다 (예: "Yeosu, Korea", "KR YOS", "KRYOS>CNSHA" 의 마지막 항)
  R.matchPort = function (text) {
    if (!text) return null;
    if (!portIndex) buildPortIndex();
    var raw = String(text).toUpperCase();
    var parts = raw.split(/>+|→|-->|\bTO\b/);          // "출발>도착" 형식이면 마지막 조각이 목적지
    var target = parts[parts.length - 1].trim();
    var whole = U.normName(target);                    // 전체를 붙여서 한 번 (KR YOS → KRYOS)
    if (portIndex[whole]) return portIndex[whole];
    var tokens = target.split(/[\s,./()_]+/).filter(Boolean); // 단어 단위로 다시
    for (var n = Math.min(3, tokens.length); n >= 1; n--) {   // 긴 조합부터 (GWANGYANG ANCH 등)
      for (var i = 0; i + n <= tokens.length; i++) {
        var key = U.normName(tokens.slice(i, i + n).join(''));
        if (key.length >= 3 && portIndex[key]) return portIndex[key];
      }
    }
    var ko = String(text);                             // 한글 표기 검사
    for (var k in portIndex) if (/[^\x00-\x7f]/.test(k) && ko.indexOf(k) >= 0) return portIndex[k];
    return null;
  };

  /* ---------- 항차 항로 ---------- */

  // 현재 위치 → 목적 항만 부두까지의 항로
  R.toPort = function (pos, port) {
    ensure();
    var ap = port.approach, berth = [port.lat, port.lon];
    var dShip = U.distNm(pos, berth);                  // 선박 ~ 부두 거리
    var dGate = U.distNm(ap[0], berth);                // 외해 진입점 ~ 부두 거리
    if (dShip <= dGate * 1.15) {                       // 이미 진입 구간 안쪽이면 남은 경유점만 따라간다
      var rest = ap.filter(function (q) { return U.distNm(q, berth) < dShip - 0.5; });
      return [pos].concat(rest, [berth]);
    }
    var here = R.nearPort(pos, 14);                    // 선박이 다른 항만 안(부두·정박지)에 있는지
    if (here && here.id !== port.id) {                 // 그렇다면 그 항만의 진입로를 거꾸로 타고 나간다
      var out = here.approach.filter(function (q) {    // 선박보다 바깥쪽 경유점만
        return U.distNm(q, [here.lat, here.lon]) > U.distNm(pos, [here.lat, here.lon]) + 0.5;
      }).reverse();
      var gate = out.length ? out[out.length - 1] : pos; // 외해로 나가는 마지막 점
      return [pos].concat(out, R.seaPath(gate, ap[0]).slice(1), ap.slice(1), [berth]);
    }
    var sea = R.seaPath(pos, ap[0]);                   // 외해 구간
    return sea.concat(ap.slice(1), [berth]);
  };

  // pos 에서 maxNm 해리 안에 있는 가장 가까운 항만 (없으면 null)
  R.nearPort = function (pos, maxNm) {
    var best = null, bd = maxNm;
    (root.FST_PORTS || []).forEach(function (p) {
      var d = U.distNm(pos, [p.lat, p.lon]);
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  };

  // 출발 항만 부두 → 어떤 위치까지의 항로 (지나온 길 추정용)
  R.fromPort = function (port, pos) {
    return R.toPort(pos, port).slice().reverse();
  };
})(typeof window !== 'undefined' ? window : globalThis);
