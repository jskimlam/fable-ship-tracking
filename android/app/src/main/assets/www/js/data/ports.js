/* =====================================================================
 * ports.js — 항만 데이터베이스 (석유화학 원료·제품선이 자주 다니는 동북아 항만)
 * ---------------------------------------------------------------------
 * - id       : 앱 내부에서 쓰는 항만 식별자
 * - ko / en  : 화면 표시용 한글명 / 영문명
 * - locode   : UN/LOCODE (AIS 목적지에 "KR YOS" 처럼 들어오는 값)
 * - alias    : AIS 목적지·추적 사이트 표기에서 이 항만을 가리키는 다른 이름들
 * - lat/lon  : 부두(선석) 대표 좌표
 * - approach : 외해 도선점 → 부두까지의 진입 경유점 (바다 쪽부터 순서대로)
 *              첫 번째 점은 반드시 "바다 위"여야 한다 (tools/build-geo.cjs 가 검증)
 * - rule     : 통항·도선 관련 참고 문구 (브리핑에 표시)
 * - pilot    : 도선예보를 직접 조회할 수 있는 소스 id (parsers.js 참고), 없으면 null
 * 좌표는 개략값이며 항법용이 아니다.
 * ===================================================================== */
(function (root) {
  'use strict';

  // 여수·광양 공통 진입 항로 (외해 도선점 → 묘도수로 → 중흥·낙포·GS 부두 방면)
  var YEOSU_APPROACH = [
    [34.55, 127.90], // 여수 해만 남측 외해
    [34.65, 127.88], // 외해 도선점 부근
    [34.74, 127.84], // 여수만 입구
    [34.80, 127.81], // 오동도 동측
    [34.86, 127.78], // 묘도수로 진입
    [34.865, 127.74], // 묘도수로
    [34.855, 127.71], // 묘도 서측
    [34.845, 127.68]  // 석유화학 부두 전면
  ];

  // 장강(양쯔강) 하구 → 강 내부 항만 공통 진입로 (강 구간은 개략 직선)
  var YANGTZE_IN = [
    [31.10, 122.60], // 장강구 등선(燈船) 부근 외해
    [31.25, 122.10], // 북조 항로 입구
    [31.40, 121.60], // 우쑹커우 부근
    [31.75, 121.10]  // 류허 수로
  ];

  // 도쿄만 공통 진입로 (우라가 수도)
  var TOKYO_BAY_IN = [
    [34.90, 139.72], // 도쿄만 입구 외해
    [35.20, 139.76], // 우라가 수도
    [35.40, 139.80]  // 나카노세 항로
  ];

  var PORTS = [
    /* ---------------- 대한민국 ---------------- */
    { id: 'yeosu', ko: '여수·광양', en: 'Yeosu / Gwangyang', locode: ['KRYOS', 'KRKAN'],
      alias: ['YEOSU', 'YOSU', 'YEOSU ANCH', 'GWANGYANG', 'KWANGYANG', 'GWANGYANG ANCH', 'KR YOS', 'KR KAN', 'YOS', 'KAN', '여수', '광양', '중흥', '낙포'],
      lat: 34.8428, lon: 127.675, approach: YEOSU_APPROACH,
      rule: '묘도수로는 단독 통항(교행 금지)·속력 제한 구간이라 도선 순번에 따라 대기가 생길 수 있습니다.',
      pilot: 'yspilot' },
    { id: 'ulsan', ko: '울산', en: 'Ulsan', locode: ['KRUSN'],
      alias: ['ULSAN', 'KR USN', 'USN', 'ULSAN ANCH', '울산'],
      lat: 35.500, lon: 129.385, approach: [[35.38, 129.52], [35.45, 129.42]],
      rule: '울산항은 E 정박지 대기 후 도선사 승선 순서대로 입항합니다.', pilot: null },
    { id: 'onsan', ko: '온산', en: 'Onsan', locode: ['KRONS'],
      alias: ['ONSAN', 'KR ONS', 'ONS', '온산'],
      lat: 35.432, lon: 129.360, approach: [[35.36, 129.50], [35.41, 129.40]],
      rule: '온산항은 울산 VTS 관제 구역이며 위험물 부두 접안 시 주간 도선이 원칙인 선석이 있습니다.', pilot: null },
    { id: 'daesan', ko: '대산', en: 'Daesan', locode: ['KRTSN', 'KRDSN'],
      alias: ['DAESAN', 'DAE SAN', 'KR TSN', 'KR DSN', 'TSN', '대산'],
      lat: 37.008, lon: 126.415, approach: [[37.05, 126.02], [37.05, 126.15], [37.03, 126.30]],
      rule: '대산항은 조수간만 차가 커서 조류·수심 조건에 따라 접안 시각이 조정될 수 있습니다.', pilot: null },
    { id: 'incheon', ko: '인천', en: 'Incheon', locode: ['KRINC'],
      alias: ['INCHEON', 'INCHON', 'KR INC', 'INC', '인천'],
      lat: 37.450, lon: 126.600, approach: [[37.08, 126.00], [37.20, 126.25], [37.35, 126.50]],
      rule: '인천항은 동수도·서수도 통항 분리 방식과 조고 제한을 따릅니다.', pilot: null },
    { id: 'pyeongtaek', ko: '평택·당진', en: 'Pyeongtaek', locode: ['KRPTK'],
      alias: ['PYEONGTAEK', 'PYONGTAEK', 'DANGJIN', 'KR PTK', 'PTK', '평택', '당진'],
      lat: 36.970, lon: 126.820, approach: [[37.05, 126.02], [37.05, 126.30], [37.02, 126.60]],
      rule: '평택·당진항은 아산만 항로를 따라 진입하며 조류가 강합니다.', pilot: null },
    { id: 'gunsan', ko: '군산', en: 'Gunsan', locode: ['KRKUV'],
      alias: ['GUNSAN', 'KUNSAN', 'KR KUV', 'KUV', '군산'],
      lat: 35.970, lon: 126.620, approach: [[35.95, 125.85], [35.96, 126.40]],
      rule: '군산항은 수심 제한으로 고조(만조) 전후 입출항이 일반적입니다.', pilot: null },
    { id: 'busan', ko: '부산', en: 'Busan', locode: ['KRPUS'],
      alias: ['BUSAN', 'PUSAN', 'KR PUS', 'PUS', '부산'],
      lat: 35.080, lon: 129.050, approach: [[34.98, 129.15], [35.04, 129.09]],
      rule: '부산항은 통항량이 많아 VTS 지시에 따른 입항 순서 대기가 있을 수 있습니다.', pilot: null },

    /* ---------------- 중국 ---------------- */
    { id: 'shanghai', ko: '상하이', en: 'Shanghai', locode: ['CNSHA', 'CNSHG'],
      alias: ['SHANGHAI', 'CN SHA', 'CN SHG', 'SHA', '상하이', '상해'],
      lat: 31.350, lon: 121.600, approach: YANGTZE_IN.slice(0, 3),
      rule: '장강구는 통항 분리·조고 대기가 있으며 안개 시 통제가 잦습니다.', pilot: null },
    { id: 'jiangyin', ko: '장인(장강)', en: 'Jiangyin', locode: ['CNJIA'],
      alias: ['JIANGYIN', 'CN JIA', 'CJG', '장인', '강음'],
      lat: 31.930, lon: 120.270, approach: YANGTZE_IN.concat([[31.95, 120.75]]),
      rule: '장강 내부 항만은 강 도선(장강 인항) 구간이 길어 하구 통과 후에도 1일 안팎이 더 걸립니다.', pilot: null },
    { id: 'zhangjiagang', ko: '장자강(장강)', en: 'Zhangjiagang', locode: ['CNZJG'],
      alias: ['ZHANGJIAGANG', 'CN ZJG', 'ZJG', '장가항', '장자강'],
      lat: 31.970, lon: 120.420, approach: YANGTZE_IN.concat([[31.95, 120.75]]),
      rule: '장강 내부 항만은 강 도선(장강 인항) 구간이 길어 하구 통과 후에도 1일 안팎이 더 걸립니다.', pilot: null },
    { id: 'nanjing', ko: '난징(장강)', en: 'Nanjing', locode: ['CNNKG', 'CNNJG'],
      alias: ['NANJING', 'CN NKG', 'CN NJG', 'NJG', '난징', '남경'],
      lat: 32.150, lon: 118.850, approach: YANGTZE_IN.concat([[31.95, 120.75], [32.20, 119.60]]),
      rule: '장강 내부 항만은 강 도선(장강 인항) 구간이 길어 하구 통과 후에도 1~2일이 더 걸립니다.', pilot: null },
    { id: 'jinshan', ko: '진산', en: 'Jinshan', locode: ['CNJSN'],
      alias: ['JINSHAN', 'CN JSN', 'JIN SHAN', '진산', '금산'],
      lat: 30.700, lon: 121.350, approach: [[30.60, 122.80], [30.62, 122.20], [30.66, 121.70]],
      rule: '항저우만은 조류가 매우 강해 조석에 맞춘 입항이 일반적입니다.', pilot: null },
    { id: 'zhapu', ko: '자푸(자싱)', en: 'Zhapu / Jiaxing', locode: ['CNZAP', 'CNJAX'],
      alias: ['ZHAPU', 'JIAXING', 'CN ZAP', 'CN JAX', '자푸', '가흥'],
      lat: 30.590, lon: 121.090, approach: [[30.60, 122.80], [30.62, 122.20], [30.60, 121.50]],
      rule: '항저우만은 조류가 매우 강해 조석에 맞춘 입항이 일반적입니다.', pilot: null },
    { id: 'ningbo', ko: '닝보', en: 'Ningbo', locode: ['CNNGB', 'CNNBO'],
      alias: ['NINGBO', 'CN NGB', 'CN NBO', 'NGB', 'ZHENHAI', 'DAXIE', '닝보', '영파'],
      lat: 29.950, lon: 121.850, approach: [[29.75, 122.75], [29.88, 122.30]],
      rule: '닝보·저우산 수역은 통항량이 많고 수도가 좁아 VTS 통제를 받습니다.', pilot: null },
    { id: 'qingdao', ko: '칭다오', en: 'Qingdao', locode: ['CNTAO', 'CNQDG'],
      alias: ['QINGDAO', 'CN TAO', 'CN QDG', 'TAO', '칭다오', '청도'],
      lat: 36.050, lon: 120.300, approach: [[35.85, 120.85], [35.98, 120.45]],
      rule: '칭다오항은 자오저우만 입구 통항 분리 구역을 지납니다.', pilot: null },
    { id: 'lianyungang', ko: '롄윈강', en: 'Lianyungang', locode: ['CNLYG'],
      alias: ['LIANYUNGANG', 'CN LYG', 'LYG', '롄윈강', '연운항'],
      lat: 34.750, lon: 119.450, approach: [[34.85, 120.30], [34.78, 119.80]],
      rule: '롄윈강은 긴 준설 항로를 따라 진입합니다.', pilot: null },
    { id: 'yantai', ko: '옌타이', en: 'Yantai', locode: ['CNYNT', 'CNYAT'],
      alias: ['YANTAI', 'CN YNT', 'CN YAT', '옌타이', '연태'],
      lat: 37.600, lon: 121.400, approach: [[37.85, 121.55], [37.70, 121.45]],
      rule: '옌타이항은 보하이 해협 통항 분리 구역과 인접합니다.', pilot: null },
    { id: 'dalian', ko: '다롄', en: 'Dalian', locode: ['CNDLC', 'CNDAL'],
      alias: ['DALIAN', 'CN DLC', 'CN DAL', 'DLC', '다롄', '대련'],
      lat: 38.930, lon: 121.700, approach: [[38.75, 122.10], [38.88, 121.85]],
      rule: '다롄항은 다싼산 수도를 통해 진입합니다.', pilot: null },
    { id: 'tianjin', ko: '톈진(신강)', en: 'Tianjin Xingang', locode: ['CNTSN', 'CNTXG'],
      alias: ['TIANJIN', 'XINGANG', 'TIANJIN XINGANG', 'CN TSN', 'CN TXG', 'TXG', '톈진', '천진', '신강'],
      lat: 38.970, lon: 117.750, approach: [[38.90, 118.40], [38.95, 118.00]],
      rule: '톈진 신강은 긴 인공 수로를 따라 진입하며 겨울철 결빙·안개 통제가 있습니다.', pilot: null },
    { id: 'panjin', ko: '판진', en: 'Panjin', locode: ['CNPAJ', 'CNPJI'],
      alias: ['PANJIN', 'CN PAJ', 'CN PJI', '판진', '반금'],
      lat: 40.710, lon: 122.050, approach: [[40.30, 121.60], [40.55, 121.90]],
      rule: '랴오둥만 북부는 겨울철 결빙이 있고 외해 정박지에서 선석 배정을 기다리는 경우가 많습니다.', pilot: null },
    { id: 'yingkou', ko: '잉커우', en: 'Yingkou', locode: ['CNYIK'],
      alias: ['YINGKOU', 'BAYUQUAN', 'CN YIK', '잉커우', '영구'],
      lat: 40.290, lon: 122.090, approach: [[40.20, 121.60], [40.27, 121.95]],
      rule: '랴오둥만 북부는 겨울철 결빙이 있습니다.', pilot: null },
    { id: 'quanzhou', ko: '취안저우', en: 'Quanzhou', locode: ['CNQZH', 'CNQZJ'],
      alias: ['QUANZHOU', 'CN QZH', 'CN QZJ', 'XIAOCUO', '취안저우', '천주'],
      lat: 24.850, lon: 118.800, approach: [[24.55, 119.25], [24.75, 118.95]],
      rule: '대만해협 서안은 어선 밀집 해역이라 감속 운항이 잦습니다.', pilot: null },
    { id: 'gulei', ko: '구레이(장저우)', en: 'Gulei / Zhangzhou', locode: ['CNZZU', 'CNGUL'],
      alias: ['GULEI', 'ZHANGZHOU', 'CN ZZU', '구레이', '장주'],
      lat: 23.750, lon: 117.600, approach: [[23.45, 118.05], [23.65, 117.75]],
      rule: '대만해협 서안은 어선 밀집 해역이라 감속 운항이 잦습니다.', pilot: null },
    { id: 'huizhou', ko: '후이저우', en: 'Huizhou', locode: ['CNHUI', 'CNHUZ'],
      alias: ['HUIZHOU', 'DAYA BAY', 'CN HUI', 'CN HUZ', '후이저우', '혜주'],
      lat: 22.700, lon: 114.600, approach: [[22.25, 114.95], [22.50, 114.72]],
      rule: '다야만은 태풍철 피항 대기가 발생할 수 있습니다.', pilot: null },

    /* ---------------- 대만 ---------------- */
    { id: 'kaohsiung', ko: '가오슝', en: 'Kaohsiung', locode: ['TWKHH'],
      alias: ['KAOHSIUNG', 'TW KHH', 'KHH', '가오슝', '고웅'],
      lat: 22.610, lon: 120.270, approach: [[22.52, 120.08], [22.59, 120.22]],
      rule: '가오슝항은 제1·제2 항구 중 지정 항구로 진입합니다.', pilot: null },
    { id: 'anping', ko: '안핑(타이난)', en: 'Anping', locode: ['TWANP'],
      alias: ['ANPING', 'AN PING', 'TAINAN', 'TW ANP', '안핑', '타이난'],
      lat: 22.990, lon: 120.150, approach: [[22.97, 119.98], [22.98, 120.10]],
      rule: '안핑항은 소형 케미칼선 위주의 항만입니다.', pilot: null },
    { id: 'mailiao', ko: '마이랴오', en: 'Mailiao', locode: ['TWMLI'],
      alias: ['MAILIAO', 'MAI LIAO', 'TW MLI', '마이랴오', '맥료'],
      lat: 23.800, lon: 120.170, approach: [[23.80, 119.95], [23.80, 120.10]],
      rule: '마이랴오는 겨울 북동 계절풍이 강해 접안 대기가 잦습니다.', pilot: null },
    { id: 'taichung', ko: '타이중', en: 'Taichung', locode: ['TWTXG'],
      alias: ['TAICHUNG', 'TW TXG', '타이중', '대중'],
      lat: 24.280, lon: 120.500, approach: [[24.30, 120.30], [24.29, 120.44]],
      rule: '타이중항은 겨울 북동 계절풍 영향을 크게 받습니다.', pilot: null },

    /* ---------------- 일본 ---------------- */
    { id: 'tokuyama', ko: '도쿠야마·구다마쓰', en: 'Tokuyama-Kudamatsu', locode: ['JPTKY'],
      alias: ['TOKUYAMA', 'KUDAMATSU', 'TOKUYAMAKUDAMATSU', 'TOKUYAMA KUDAMATSU', 'JP TKY', '도쿠야마', '덕산', '토쿠야마'],
      lat: 34.000, lon: 131.800, approach: [[33.800, 131.550], [33.920, 131.720]],
      rule: '스오나다를 거쳐 진입하며, 한국 방면은 간몬해협(시모노세키) 통항이 일반적입니다. 간몬해협은 조류가 강해 통항 시간대를 조정하기도 합니다.', pilot: null },
    { id: 'ube', ko: '우베', en: 'Ube', locode: ['JPUBJ'],
      alias: ['UBE', 'JP UBJ', '우베'],
      lat: 33.930, lon: 131.250, approach: [[33.800, 131.300], [33.880, 131.270]],
      rule: '스오나다 서부에 있어 간몬해협 동쪽 출구에서 가깝습니다.', pilot: null },
    { id: 'chiba', ko: '지바', en: 'Chiba', locode: ['JPCHB'],
      alias: ['CHIBA', 'JP CHB', 'CHB', '지바', '치바'],
      lat: 35.570, lon: 140.050, approach: TOKYO_BAY_IN.concat([[35.52, 139.95]]),
      rule: '도쿄만은 우라가 수도 항로 관제(입항 예보 필수)와 야간 대형선 제한이 있습니다.', pilot: null },
    { id: 'kawasaki', ko: '가와사키·요코하마', en: 'Kawasaki / Yokohama', locode: ['JPKWS', 'JPYOK'],
      alias: ['KAWASAKI', 'YOKOHAMA', 'JP KWS', 'JP YOK', '가와사키', '요코하마'],
      lat: 35.480, lon: 139.760, approach: TOKYO_BAY_IN,
      rule: '도쿄만은 우라가 수도 항로 관제(입항 예보 필수)와 야간 대형선 제한이 있습니다.', pilot: null },
    { id: 'kashima', ko: '가시마', en: 'Kashima', locode: ['JPKSM'],
      alias: ['KASHIMA', 'JP KSM', '가시마'],
      lat: 35.920, lon: 140.700, approach: [[35.92, 141.05], [35.91, 140.78]],
      rule: '가시마항은 태평양 너울 영향으로 접안 대기가 생길 수 있습니다.', pilot: null },
    { id: 'yokkaichi', ko: '욧카이치', en: 'Yokkaichi', locode: ['JPYKK'],
      alias: ['YOKKAICHI', 'JP YKK', '욧카이치'],
      lat: 34.950, lon: 136.650, approach: [[34.40, 137.05], [34.62, 136.95], [34.85, 136.75]],
      rule: '이세만은 이라고 수도 항로 관제를 받습니다.', pilot: null },
    { id: 'oita', ko: '오이타', en: 'Oita', locode: ['JPOIT'],
      alias: ['OITA', 'JP OIT', '오이타'],
      lat: 33.260, lon: 131.680, approach: [[32.70, 132.25], [33.10, 132.00], [33.24, 131.80]],
      rule: '분고 수도를 통해 진입합니다.', pilot: null },

    /* ---------------- 동남아 ---------------- */
    { id: 'singapore', ko: '싱가포르', en: 'Singapore', locode: ['SGSIN'],
      alias: ['SINGAPORE', 'SG SIN', 'SIN', 'JURONG', '싱가포르'],
      lat: 1.260, lon: 103.750, approach: [[1.45, 104.70], [1.25, 104.20], [1.20, 103.90]],
      rule: '싱가포르 해협은 통항 분리 방식(TSS)을 따르며 도선·정박 예약이 필요합니다.', pilot: null }
  ];

  // 브라우저(window)와 Node 테스트(globalThis) 양쪽에서 쓰도록 전역에 올린다
  root.FST_PORTS = PORTS;
})(typeof window !== 'undefined' ? window : globalThis);
