/* =====================================================================
 * build-geo.cjs — 육지 마스크와 해상 항로 그래프를 만들어 앱 자산으로 저장하는 도구
 * ---------------------------------------------------------------------
 * 실행:  npm i world-atlas topojson-client  &&  node tools/build-geo.cjs
 * 결과:  android/app/src/main/assets/www/js/data/land.js      (육지 다각형)
 *        android/app/src/main/assets/www/js/data/seagraph.js  (해상 노드 + 연결선)
 * 하는 일
 *   1) Natural Earth 1:50m 육지 다각형을 동북아~동남아 범위로 잘라 낸다
 *   2) 손으로 찍은 해상 경유 노드가 실제 바다 위인지 검사한다
 *   3) 두 노드를 이은 직선이 육지를 지나지 않을 때만 연결선(간선)으로 등록한다
 *   4) 모든 항만의 외해 진입점이 그래프에 연결되는지 검사한다
 * ===================================================================== */
'use strict';
const fs = require('fs');                              // 파일 입출력
const path = require('path');                          // 경로 계산
const topojson = require('topojson-client');           // TopoJSON → GeoJSON 변환

const ROOT = path.join(__dirname, '..');                                   // 저장소 루트
const OUT_DIR = path.join(ROOT, 'android/app/src/main/assets/www/js/data'); // 자산 출력 폴더
const BBOX = { w: 95, e: 150, s: -12, n: 46 };                             // 잘라 낼 범위(경도·위도)

/* 1:50m 육지 자료에는 작은 섬이 빠져 있어, 항로가 섬 무리를 가로지르지 않도록
 * 주요 다도해 구역을 사각형으로 보충한다. [남쪽 위도, 서쪽 경도, 북쪽 위도, 동쪽 경도] */
const EXTRA_LAND = [
  [34.30, 125.85, 35.20, 126.40],   // 신안·진도 서측 다도해 (비금·도초·하의 등)
  [35.25, 126.00, 36.20, 126.60],   // 서해 중부 연안 섬 (안마·위도·고군산·어청도 동측)
  [34.08, 126.40, 34.40, 127.20],   // 완도·청산도·소안·보길 일대
  [34.40, 127.20, 34.75, 127.78],   // 고흥·나로도·금오열도
  [34.56, 128.00, 34.90, 128.72],   // 남해도 동측·욕지·매물도·거제 서남측
  [33.90, 126.22, 34.02, 126.42],   // 추자군도
  [29.60, 121.90, 30.45, 122.50],   // 저우산·다이산 군도
  [30.65, 122.30, 30.90, 122.85],   // 성쓰 열도
  [23.15, 119.30, 23.80, 119.72]    // 펑후 제도
];

/* ---------- 1) 육지 다각형 자르기 ---------- */

// 다각형 한 변(경계)에 대해 점들을 잘라 내는 Sutherland–Hodgman 한 단계
function clipEdge(pts, inside, intersect) {
  const out = [];                                       // 잘라 낸 결과 점 목록
  for (let i = 0; i < pts.length; i++) {                // 모든 변을 순회
    const a = pts[i], b = pts[(i + 1) % pts.length];    // 변의 시작점·끝점
    const ain = inside(a), bin = inside(b);             // 각 점이 범위 안인지
    if (ain && bin) out.push(b);                        // 둘 다 안: 끝점만 추가
    else if (ain && !bin) out.push(intersect(a, b));    // 나가는 변: 교차점 추가
    else if (!ain && bin) { out.push(intersect(a, b)); out.push(b); } // 들어오는 변: 교차점+끝점
  }
  return out;                                           // 잘린 다각형
}

// 고리(ring)를 사각형 범위로 자른다
function clipRing(ring) {
  let p = ring.slice(0, -1);                            // 마지막 중복 점 제거
  const ix = (x) => (a, b) => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])]; // 세로 경계 교차점
  const iy = (y) => (a, b) => [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y]; // 가로 경계 교차점
  p = clipEdge(p, (q) => q[0] >= BBOX.w, ix(BBOX.w));   // 서쪽 경계
  if (p.length) p = clipEdge(p, (q) => q[0] <= BBOX.e, ix(BBOX.e)); // 동쪽 경계
  if (p.length) p = clipEdge(p, (q) => q[1] >= BBOX.s, iy(BBOX.s)); // 남쪽 경계
  if (p.length) p = clipEdge(p, (q) => q[1] <= BBOX.n, iy(BBOX.n)); // 북쪽 경계
  return p;                                             // 범위 안 다각형 (닫지 않은 상태)
}

// 좌표를 소수 둘째 자리로 줄이고 연속 중복 점을 없앤다
function simplify(ring) {
  const out = [];                                       // 결과
  for (const q of ring) {                               // 모든 점에 대해
    const r = [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]; // 약 1km 정밀도
    const last = out[out.length - 1];                   // 직전 점
    if (!last || last[0] !== r[0] || last[1] !== r[1]) out.push(r);         // 달라졌을 때만 추가
  }
  return out;                                           // 줄인 고리
}

function buildLand() {
  const topo = require('world-atlas/land-50m.json');    // 1:50m 육지 자료
  const geo = topojson.feature(topo, topo.objects.land); // GeoJSON 으로 변환
  const rings = [];                                     // 잘라 낸 육지 고리 목록
  const feats = geo.features || [geo];                  // 피처 배열
  for (const f of feats) {                              // 각 피처
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; // 다각형 배열
    for (const poly of polys) {                         // 각 다각형
      const clipped = simplify(clipRing(poly[0]));      // 바깥 고리만 사용(호수 등 구멍은 무시)
      if (clipped.length >= 3) rings.push(clipped);     // 유효한 것만 보관
    }
  }
  for (const b of EXTRA_LAND) {                         // 1:50m 자료에 빠진 섬 무리를 상자로 보충
    rings.push([[b[1], b[0]], [b[3], b[0]], [b[3], b[2]], [b[1], b[2]]]); // [경도, 위도] 순서의 사각형
  }
  return rings;                                         // [[ [lon,lat], ... ], ...]
}

/* ---------- 2) 기하 유틸 (앱의 route.js 와 같은 규칙) ---------- */

// 고리마다 외접 사각형을 미리 계산해 검사 속도를 높인다
function withBounds(rings) {
  return rings.map((r) => {
    let w = 999, e = -999, s = 999, n = -999;           // 초기값
    for (const q of r) { if (q[0] < w) w = q[0]; if (q[0] > e) e = q[0]; if (q[1] < s) s = q[1]; if (q[1] > n) n = q[1]; }
    return { r, w, e, s, n };                           // 고리 + 범위
  });
}

// 점이 육지 안인지 (ray casting)
function isLand(land, lat, lon) {
  for (const g of land) {                               // 모든 육지 고리
    if (lon < g.w || lon > g.e || lat < g.s || lat > g.n) continue; // 범위 밖이면 건너뜀
    let inside = false;                                 // 내부 여부
    const r = g.r;                                      // 고리 점들
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {      // 모든 변
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; // 변의 양 끝
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside; // 교차 횟수 홀짝
    }
    if (inside) return true;                            // 한 고리라도 안이면 육지
  }
  return false;                                         // 바다
}

// 두 점 사이 거리(해리)
function distNm(a, b) {
  const R = 3440.065, rad = Math.PI / 180;              // 지구 반지름(해리), 라디안 변환
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad; // 위도·경도 차
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2; // haversine
  return 2 * R * Math.asin(Math.sqrt(h));               // 대권 거리
}

// 두 점을 이은 직선이 바다만 지나는지 (약 2해리 간격으로 표본 검사)
function seaClear(land, a, b, skipEndsNm) {
  const d = distNm(a, b);                               // 구간 길이
  const n = Math.max(2, Math.ceil(d / 2));              // 표본 개수
  const skip = d > 0 ? Math.min(0.45, (skipEndsNm || 0) / d) : 0; // 양 끝에서 검사를 건너뛸 비율
  for (let i = 0; i <= n; i++) {                        // 양 끝 포함 검사
    const t = i / n;                                    // 진행 비율
    if (t < skip || t > 1 - skip) continue;             // 끝단 보정 구간
    const la = a[0] + (b[0] - a[0]) * t, lo = a[1] + (b[1] - a[1]) * t; // 표본 지점
    if (isLand(land, la, lo)) return false;             // 육지에 닿으면 실패
    if (isLand(land, la + MARGIN, lo) || isLand(land, la - MARGIN, lo) ||
        isLand(land, la, lo + MARGIN) || isLand(land, la, lo - MARGIN)) return false; // 해안에서 약 4해리 여유
  }
  return true;                                          // 전 구간 바다
}

/* ---------- 3) 해상 경유 노드 (손으로 찍은 외해 지점) ---------- */
const NODES = [
  // 한국 남해안·동해안
  ['YS', 34.40, 128.00], ['NAMHAE_S', 34.42, 128.25], ['GEOJE_S', 34.40, 128.85], ['BUSAN_S', 34.90, 129.25],
  ['ULSAN_E', 35.40, 129.65], ['POHANG_E', 36.20, 129.85], ['DONGHAE_E', 37.60, 129.70],
  // 제주 주변
  ['JEJU_STRAIT_E', 33.95, 127.35], ['JEJU_STRAIT_W', 33.72, 126.00], ['JEJU_E', 33.35, 127.30],
  ['JEJU_S', 32.80, 126.60], ['JEJU_W', 33.30, 125.70],
  // 한국 서남·서해안
  ['JINDO_W', 34.25, 125.60], ['SINAN_W', 35.10, 125.40], ['EOCHEONG_W', 36.10, 125.50],
  ['GYEOKBI_W', 36.65, 125.45], ['DAESAN_OUT', 37.05, 125.90],
  // 황해·보하이
  ['YELLOW_S', 34.00, 123.50], ['YELLOW_C', 35.60, 123.30], ['SHANDONG_E', 37.30, 123.10], ['SHANDONG_N', 37.95, 122.30],
  ['BOHAI_STRAIT', 38.45, 121.20], ['BOHAI_C', 38.80, 119.90], ['LIAODONG_S', 39.60, 121.00], ['LIAODONG_N', 40.20, 121.50],
  ['DALIAN_S', 38.60, 122.20], ['QINGDAO_OUT', 35.75, 121.10], ['LYG_OUT', 34.90, 120.60], ['JIANGSU_OUT', 33.20, 122.60],
  // 동중국해
  ['YANGTZE_OUT', 31.10, 123.00], ['ZHOUSHAN_E', 30.30, 123.20], ['ECS_N', 32.30, 125.20], ['ECS_C', 30.50, 125.50],
  ['ZHEJIANG_OUT', 28.80, 122.70], ['FUJIAN_N', 27.00, 121.50], ['TW_STRAIT_N', 25.70, 120.70],
  ['TW_STRAIT_C', 24.40, 119.80], ['TW_STRAIT_S', 23.10, 119.10], ['TW_SW', 22.40, 119.90], ['TW_S', 21.50, 120.70],
  ['TW_NE', 25.60, 122.40], ['TW_E', 23.60, 122.10],
  // 일본
  ['KYUSHU_W', 32.30, 129.00], ['TSUSHIMA_E', 34.10, 130.10], ['KANMON_W', 34.02, 130.78], ['SUO_NADA', 33.70, 131.40], ['TOKARA', 29.80, 130.50], ['TANEGA_E', 30.20, 131.70], ['KYUSHU_SE', 31.20, 132.00],
  ['BUNGO_S', 32.50, 132.40], ['SHIKOKU_S', 32.60, 133.80], ['KII_S', 33.20, 135.80], ['ENSHU', 34.20, 137.60],
  ['IZU_S', 34.40, 139.00], ['TOKYO_OUT', 34.75, 139.80], ['BOSO_E', 35.30, 141.20],
  // 남중국해·동남아
  ['SCS_NE', 21.80, 118.00], ['HK_OUT', 21.80, 114.60], ['SCS_N', 19.50, 113.50], ['SCS_C', 15.00, 112.50],
  ['VN_S', 9.50, 109.80], ['SCS_S', 5.00, 106.50], ['SG_E', 1.60, 104.90], ['LUZON_W', 18.50, 119.50]
];

/* 통항 회랑: 좁은 해협·수도라서 해안 여유 폭 검사로는 절대 못 지나가지만
 * 실제로는 주요 통항로인 구간. 손으로 찍은 경유점을 그대로 간선으로 등록한다 (여유 폭 검사 면제).
 * [노드A 이름, 노드B 이름, A→B 방향의 경유점 [위도, 경도] 목록] */
const CORRIDORS = [
  // 간몬해협 (시모노세키·모지): 히비키나다 → 스오나다
  ['KANMON_W', 'SUO_NADA', [
    [33.995, 130.855],  // 무쓰레지마 북측 서쪽 입구
    [33.965, 130.905],  // 해협 서부
    [33.955, 130.945],  // 간몬교 최협부
    [33.935, 130.963],  // 모지 앞 굴곡
    [33.905, 131.005],  // 동쪽 출구
    [33.830, 131.150]   // 스오나다 서부
  ]],
  // 스오나다 → 이요나다 → 호요해협(분고수도) → 태평양
  ['SUO_NADA', 'BUNGO_S', [
    [33.600, 131.700],  // 히메시마 북측
    [33.350, 131.900],  // 이요나다 서부
    [33.100, 131.980],  // 호요해협
    [32.850, 132.080]   // 분고수도
  ]]
];

const MARGIN = 0.07;                                    // 해안 여유 폭(도) ≈ 4해리
const MAX_EDGE_NM = 420;                                // 이보다 긴 직선 연결은 만들지 않는다

function main() {
  const rings = buildLand();                            // 육지 고리
  const land = withBounds(rings);                       // 범위 포함 육지
  let fail = 0;                                         // 검증 실패 수

  // 노드가 바다 위인지 검사
  for (const [id, lat, lon] of NODES) {
    if (isLand(land, lat, lon)) { console.error('✗ 노드가 육지 위에 있음:', id, lat, lon); fail++; }
  }

  // 간선 만들기 (육지를 지나지 않는 쌍만)
  const edges = [];                                     // [i, j, 거리]
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      const a = [NODES[i][1], NODES[i][2]], b = [NODES[j][1], NODES[j][2]]; // 두 노드 좌표
      const d = distNm(a, b);                           // 거리
      if (d <= MAX_EDGE_NM && seaClear(land, a, b)) edges.push([i, j, Math.round(d * 10) / 10]); // 조건 만족 시 등록
    }
  }

  // 회랑을 간선으로 등록 (여유 폭 검사 면제, 경유점이 육지에 걸치면 경고만)
  const nameIdx = {};                                   // 노드 이름 → 번호
  NODES.forEach((n, i) => { nameIdx[n[0]] = i; });
  const corridors = [];                                 // [a, b, 거리, 경유점들]
  for (const [an, bn, via] of CORRIDORS) {
    const a = nameIdx[an], b = nameIdx[bn];
    if (a == null || b == null) { console.error('✗ 회랑의 노드 이름이 없음:', an, bn); fail++; continue; }
    const pts = [[NODES[a][1], NODES[a][2]]].concat(via, [[NODES[b][1], NODES[b][2]]]); // 전체 폴리라인
    let nm = 0;                                         // 회랑 길이
    for (let i = 1; i < pts.length; i++) nm += distNm(pts[i - 1], pts[i]);
    via.forEach((q) => { if (isLand(land, q[0], q[1])) console.warn('! 회랑 경유점이 50m 육지 마스크에 걸림(허용):', an + '-' + bn, q); });
    corridors.push([a, b, Math.round(nm * 10) / 10, via]);
  }

  // 고립 노드 검사 (회랑 연결 포함)
  const deg = NODES.map(() => 0);                       // 노드별 연결 수
  for (const e of edges) { deg[e[0]]++; deg[e[1]]++; }
  for (const c of corridors) { deg[c[0]]++; deg[c[1]]++; }
  NODES.forEach((n, i) => { if (!deg[i]) { console.error('✗ 연결이 없는 노드:', n[0]); fail++; } });

  // 항만 외해 진입점 검사 (바다 위인지 + 그래프 노드와 한 곳 이상 직선 연결되는지)
  require(path.join(OUT_DIR, 'ports.js'));              // globalThis.FST_PORTS 로 올라온다
  for (const p of globalThis.FST_PORTS) {
    const g = p.approach[0];                            // 가장 바깥 진입점
    if (isLand(land, g[0], g[1])) { console.error('✗ 항만 진입점이 육지 위:', p.id, g); fail++; continue; }
    const linked = NODES.some((n) => distNm(g, [n[1], n[2]]) <= MAX_EDGE_NM && seaClear(land, g, [n[1], n[2]], 8));
    if (!linked) { console.error('✗ 항만 진입점이 그래프에 연결 안 됨:', p.id); fail++; }
  }

  // 파일 쓰기
  const head = '/* 자동 생성 파일 — tools/build-geo.cjs 로 다시 만든다. 직접 고치지 말 것. */\n';
  const tail = "})(typeof window !== 'undefined' ? window : globalThis);\n";
  fs.writeFileSync(path.join(OUT_DIR, 'land.js'),
    head + '/* 육지 다각형: Natural Earth 1:50m (퍼블릭 도메인) 을 동북아~동남아 범위로 자른 것. [경도, 위도] 순서. */\n' +
    '(function (root) { root.FST_LAND = ' + JSON.stringify(rings) + ';\n' + tail);
  fs.writeFileSync(path.join(OUT_DIR, 'seagraph.js'),
    head + '/* 해상 항로 그래프: nodes = [이름, 위도, 경도], edges = [노드번호, 노드번호, 거리(해리)] */\n' +
    '(function (root) { root.FST_SEAGRAPH = ' + JSON.stringify({ maxEdgeNm: MAX_EDGE_NM, margin: MARGIN, nodes: NODES, edges, corridors }) + ';\n' + tail);

  const pts = rings.reduce((s, r) => s + r.length, 0);  // 육지 점 개수
  console.log(`육지 고리 ${rings.length}개 / 점 ${pts}개, 노드 ${NODES.length}개, 간선 ${edges.length}개, 회랑 ${corridors.length}개, 검증 실패 ${fail}건`);
  if (fail) process.exit(1);                            // 실패가 있으면 종료 코드 1
}

main();
