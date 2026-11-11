/* =====================================================================
 * core.test.cjs — 해석 규칙·항로·항차 계산 회귀 테스트
 * 실행: node --test tests/     (Node.js 18 이상, 추가 패키지 설치 불필요)
 * 앱이 실제로 쓰는 js 파일을 그대로 불러와 검사한다.
 * ===================================================================== */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const W = path.join(__dirname, '../android/app/src/main/assets/www/js/');
// 앱과 같은 순서로 모듈을 올린다 (브라우저의 <script> 순서와 동일)
['util.js', 'data/ports.js', 'data/land.js', 'data/seagraph.js', 'data/demo.js', 'route.js', 'parsers.js', 'bridge.js', 'store.js', 'engine.js', 'brief.js']
  .forEach((f) => require(W + f));
const { Util: U, Route: R, Parsers: P, Store: S, Engine: E, Brief: BR } = globalThis.FST;
const demo = (m) => globalThis.FST_DEMO.find((d) => d.match.includes(m)).data;
const NOW = Date.UTC(2026, 10, 11, 9, 30);              // 2026-11-11 18:30 KST 로 고정
const NOW_W = Date.UTC(2026, 10, 11, 11, 14);           // Wingo 캡처 시점 (11:00 UTC 수신 + 14분)

test('Wingo 선박 페이지: 정밀 좌표·항적·수신 시각·목적지를 읽는다', () => {
  const d = P.parseWingo(demo('wingo-marine.com/ship/v-440213000'), NOW_W);
  assert.equal(d.ok, true);
  assert.equal(d.name, 'SUNRISE SAMBU');
  assert.equal(d.imo, '9288007');
  assert.equal(d.mmsi, '440213000');
  assert.equal(d.callsign, 'DSNR6');
  assert.ok(Math.abs(d.lat - 33.2762) < 1e-4 && Math.abs(d.lon - 127.0482) < 1e-4); // 정밀 좌표
  assert.equal(d.sog, 10.6);
  assert.equal(d.cog, 32);
  assert.equal(d.heading, 35);
  assert.equal(d.draught, 4.8);
  assert.equal(d.dwt, 3613);
  assert.equal(d.destText, 'Yeosu, South Korea');
  assert.equal(d.posTs, Date.UTC(2026, 10, 11, 11, 0)); // "11 Nov 2026, 11:00 UTC"
  assert.equal(d.etaTs, undefined);                      // "Not broadcast: ETA."
  assert.equal(d.live, true);
  assert.equal(d.track.length, 6);
  assert.ok(R.matchPort(d.destText).id === 'yeosu');
});

test('Wingo 검색: MMSI·IMO·선명으로 일치 선박을 고른다', () => {
  const r = P.parseWingoSearch(globalThis.FST_DEMO.filter((d) => d.match.includes('seo/search'))[1].data); // 두 번째 항목이 일반 검색(SAMBU)
  assert.equal(r.ok, true);
  assert.equal(r.list.length, 3);
  assert.equal(P.pickWingoMatch(r.list, { mmsi: '441312000', name: 'X' }).name, 'PACIFIC SAMBU');
  assert.equal(P.pickWingoMatch(r.list, { imo: '9288007', name: 'X' }).mmsi, '440213000');
  assert.equal(P.pickWingoMatch(r.list, { name: 'pacific sambu' }).imo, '9268306');
  assert.equal(P.pickWingoMatch(r.list, { name: 'NOPE' }), null);
});

test('Wingo: 정지 선박(MI LAN)과 보안 확인 화면 처리', () => {
  const d = P.parseWingo(demo('wingo-marine.com/ship/v-413378950'), NOW_W);
  assert.equal(d.ok, true);
  assert.equal(d.sog, 0.6);
  assert.equal(d.destText, 'PANJIN');
  assert.equal(d.live, false);                           // "Last seen" = 수신 끊김
  assert.ok(R.matchPort(d.destText).id === 'panjin');
  assert.equal(P.parseWingo({ title: 'Just a moment...', text: '', map: null }, NOW).error, 'challenge');
  assert.equal(P.parseWingo({ title: 'x', text: 'no coords here', map: null }, NOW).error, 'nopos');
});

test('VesselFinder 상세: 제원·항차 값을 읽고, 1도 단위 좌표는 개략값으로 표시한다', () => {
  const d = P.parseVesselFinder(demo('9288007'), NOW);
  assert.equal(d.ok, true);
  assert.equal(d.name, 'SUNRISE SAMBU');
  assert.equal(d.imo, '9288007');
  assert.equal(d.mmsi, '440213000');
  assert.equal(d.callsign, 'DSNR6');
  assert.equal(d.cog, 24.8);
  assert.equal(d.sog, 6.2);
  assert.equal(d.draught, 6.4);
  assert.equal(d.destText, 'Yeosu, Korea');
  assert.equal(d.etaTs, Date.UTC(2026, 10, 11, 22, 0));
  assert.equal(d.lastPortText, 'An Ping, Taiwan');
  assert.equal(d.atdTs, Date.UTC(2026, 10, 7, 1, 26));
  assert.equal(d.dwt, 3613);
  assert.equal(d.coarse, true);                          // 25 / 120 → 정밀 좌표 아님
  assert.equal(d.posTs, NOW - 4 * 864e5);
  assert.match(d.satNote, /12 min ago/);
});

test('VesselFinder: 보안 확인 화면과 낯선 화면은 실패로 돌려준다', () => {
  assert.equal(P.parseVesselFinder({ title: 'Just a moment...', text: '' }, NOW).error, 'challenge');
  assert.equal(P.parseVesselFinder({ title: 'x', text: 'hello' }, NOW).error, 'layout');
});

test('VesselFinder 검색: 주소의 숫자 길이로 IMO·MMSI 를 구분한다', () => {
  const r = P.parseVfSearch(demo('vessels?name='));
  assert.equal(r.list.length, 3);
  assert.equal(r.list[0].imo, '9288007');
  assert.equal(r.list[2].mmsi, '211263840');
  assert.equal(r.list[2].imo, '');
});

test('여수 도선예보: 선명 또는 호출부호로 행을 찾고 POB 를 한국 시간으로 해석한다', () => {
  const r = P.parseYsPilot(demo('yspilot'), { name: 'yc cosmos', callsign: '' });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].from, 'WA-W');
  assert.equal(r.rows[0].to, 'GSP-7');
  assert.equal(r.rows[0].kind, 'B');
  assert.equal(r.rows[0].agent, '조영');
  assert.equal(r.rows[0].ts, Date.UTC(2026, 10, 12, 10, 30)); // 11/12 19:30 KST
  const byCs = P.parseYsPilot(demo('yspilot'), { name: 'OTHER', callsign: 'DSRJ2' });
  assert.equal(byCs.rows.length, 1);
  assert.equal(P.parseYsPilot(demo('yspilot'), { name: 'NO SUCH SHIP' }).rows.length, 0);
});

test('범용 해석: 여러 좌표 표기를 읽는다', () => {
  const a = P.parseGeneric('Position 33.0287° N / 126.6602° E\nSpeed 11.1 kn\nCourse 73°\nETA: 2026-11-12 06:00\nDestination: KR YOS');
  assert.ok(Math.abs(a.lat - 33.0287) < 1e-6 && Math.abs(a.lon - 126.6602) < 1e-6);
  assert.equal(a.sog, 11.1); assert.equal(a.cog, 73); assert.equal(a.destText, 'KR YOS');
  const b = P.parseGeneric("33°01'43\"N 126°39'36\"E");
  assert.ok(Math.abs(b.lat - 33.0286) < 1e-3 && Math.abs(b.lon - 126.66) < 1e-3);
  const c = P.parseGeneric('위도 33.0287\n경도 126.6602\n속력 9.5 노트');
  assert.equal(c.ok, true); assert.equal(c.sog, 9.5);
  const d = P.parseGeneric('33-01.72N 126-39.61E');
  assert.ok(Math.abs(d.lat - 33.0287) < 1e-3);
  assert.equal(P.parseGeneric('no numbers here').ok, false);
  assert.equal(P.parseGeneric('Lat 91.5 Lon 200.25').ok, false); // 범위 밖 값은 버린다
});

test('항만 찾기: AIS 목적지 표기 변형', () => {
  assert.equal(R.matchPort('Yeosu, Korea').id, 'yeosu');
  assert.equal(R.matchPort('KR YOS').id, 'yeosu');
  assert.equal(R.matchPort('CN SHA>KR USN').id, 'ulsan');
  assert.equal(R.matchPort('Gwangyang Anch., Korea').id, 'yeosu');
  assert.equal(R.matchPort('An Ping, Taiwan').id, 'anping');
  assert.equal(R.matchPort('FOR ORDER'), null);
});

test('항로: 외해 구간이 육지를 지나지 않는다', () => {
  const cases = [[[22.99, 120.15], 'yeosu'], [[37.008, 126.415], 'yeosu'], [[35.5, 129.385], 'yeosu'],
    [[30.7, 121.35], 'panjin'], [[1.26, 103.75], 'ulsan'], [[34.8428, 127.675], 'chiba'], [[22.61, 120.27], 'tianjin']];
  for (const [pos, pid] of cases) {
    const from = R.nearPort(pos, 14), to = R.portById(pid);
    const pts = R.toPort(pos, to);
    assert.ok(pts.length >= 3, pid);
    // 출발·도착 항만의 진입 구간(항내)은 빼고 외해 구간만 검사한다
    const g0 = from ? from.approach[0] : pos, g1 = to.approach[0];
    const i0 = pts.findIndex((q) => q[0] === g0[0] && q[1] === g0[1]);
    const i1 = pts.findIndex((q) => q[0] === g1[0] && q[1] === g1[1]);
    assert.ok(i1 > 0, '도착 진입점이 경로에 있어야 함: ' + pid);
    for (let i = Math.max(1, i0 + 1); i <= i1; i++) {
      assert.ok(R.seaClear(pts[i - 1], pts[i], 8), `육지 관통: ${pid} 구간 ${i} ${pts[i - 1]} → ${pts[i]}`);
    }
  }
});

test('간몬해협 회랑: 스오나다·세토 서부 항로가 규슈를 돌지 않는다', () => {
  // GOLDEN HANA 사례: 스오나다(도쿠야마 남쪽)에서 울산으로 — 간몬해협(시모노세키) 통과가 정상
  const cases = [
    [[33.746, 131.731], 'ulsan', 120, 220],   // 스오나다 → 울산
    [[35.5, 129.385], 'tokuyama', 130, 230],  // 울산 → 도쿠야마 (실제 약 170해리)
    [[34.8428, 127.675], 'tokuyama', 200, 330] // 여수 → 도쿠야마
  ];
  for (const [pos, pid, lo, hi] of cases) {
    const pts = R.toPort(pos, R.portById(pid));
    const nm = U.pathNm(pts);
    assert.ok(nm > lo && nm < hi, pid + ' 거리 ' + nm);                       // 규슈 남쪽 우회(400해리+)가 아님
    assert.ok(pts.some((q) => Math.abs(q[0] - 33.955) < 0.02 && Math.abs(q[1] - 130.945) < 0.02),
      pid + ' 경로가 간몬교 최협부를 지나야 함');
    assert.ok(Math.min.apply(null, pts.map((q) => q[0])) > 33.0, pid + ' 가 규슈 남쪽으로 내려감'); // 분고수도 우회 아님
  }
});

test('항로: 거리 수준이 상식적이다', () => {
  const nm = (pos, pid) => U.pathNm(R.toPort(pos, R.portById(pid)));
  const a = nm([22.99, 120.15], 'yeosu'); assert.ok(a > 780 && a < 950, '안핑→여수 ' + a);
  const b = nm([37.008, 126.415], 'yeosu'); assert.ok(b > 300 && b < 400, '대산→여수 ' + b);
  const c = nm([35.5, 129.385], 'yeosu'); assert.ok(c > 120 && c < 175, '울산→여수 ' + c);
});

test('항차 계산: 실측과 추정을 구분하고 ETA 우선순위를 지킨다', () => {
  S.load();
  const v = S.newVessel({ name: 'TEST SHIP', imo: '1234567' });
  v.destPortId = 'yeosu'; v.originPortId = 'anping';
  v.fixes.push({ t: NOW - 2 * 36e5, lat: 33.0287, lon: 126.6602, sog: 10, cog: 73, src: 'manual' });
  const vw = E.view(v, NOW);
  assert.equal(vw.fresh, 'ok');
  assert.ok(vw.dr && vw.cur.est === true);               // 2시간 지난 실측 → 현재 위치는 추정
  assert.ok(Math.abs(vw.dr.advNm - 20) < 0.01);          // 10노트 × 2시간
  assert.ok(vw.remainNm > 100 && vw.remainNm < 135);
  assert.equal(vw.eta.kind, 'calc');
  assert.ok(Math.abs(vw.eta.ts - (NOW + vw.remainNm / 10 * 36e5)) < 1000);
  assert.ok(vw.progress > 0.8 && vw.progress < 0.95);
  // 도선예보가 생기면 그것이 대표 ETA
  v.pilotRows = [{ ts: NOW + 20 * 36e5, kind: 'B', spec: '예보', from: 'WA-W', to: 'GSP-7', pob: '14:30', date: '20261112' }];
  assert.equal(E.view(v, NOW).eta.kind, 'pilot');
  // 레이캔 초과 경고
  v.laycanEnd = '2026-11-11';
  assert.equal(E.view(v, NOW).laycan.level, 'late');
});

test('항차 계산: 실측이 없으면 위치를 지어내지 않는다', () => {
  const v = S.newVessel({ name: 'NO DATA' });
  const vw = E.view(v, NOW);
  assert.equal(vw.cur, null);
  assert.equal(vw.state, 'unknown');
  assert.equal(vw.eta, null);
  assert.equal(vw.future.length, 0);
  const txt = BR.briefing(vw).map((m) => m.text).join(' ');
  assert.match(txt, /확인된 위치가 없/);
});

test('브리핑: 질문 의도를 구분해 답한다', () => {
  const v = S.newVessel({ name: 'TEST SHIP', imo: '1234567' });
  v.destPortId = 'yeosu';
  v.fixes.push({ t: NOW - 30 * 6e4, lat: 33.0287, lon: 126.6602, sog: 4.2, cog: 73, src: 'manual' });
  const vw = E.view(v, NOW);
  assert.match(BR.answer('언제 도착해?', vw).text, /ETA|도착/);
  assert.match(BR.answer('왜 이렇게 느려', vw).text, /노트/);
  assert.match(BR.answer('지금 어디야', vw).text, /°N/);
  assert.match(BR.answer('ㅁㄴㅇㄹ', vw).text, /위치|ETA|속력/);  // 모르는 질문에는 물어볼 수 있는 것을 안내
});

test('시각 유틸: 한국 시간 변환', () => {
  assert.equal(U.fmtKst(Date.UTC(2026, 10, 11, 21, 0)), '11/12(목) 06:00');
  assert.equal(U.kstYmd(Date.UTC(2026, 10, 11, 16, 0), 0), '20261112');
  assert.equal(U.kstToTs(2026, 11, 12, 19, 30), Date.UTC(2026, 10, 12, 10, 30));
});
