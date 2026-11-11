/* =====================================================================
 * demo.js — 예시 응답 (2026-11-11 저녁에 실제 페이지에서 받아 둔 내용)
 * ---------------------------------------------------------------------
 * 용도 ① PC 브라우저에서 index.html?demo=1 로 열어 화면을 미리 볼 때
 *      ② tests/ 의 해석 규칙 회귀 테스트
 * 앱(안드로이드)에서는 쓰이지 않는다. 앱은 항상 실제 페이지를 직접 조회한다.
 * ===================================================================== */
(function (root) {
  'use strict';
  root.FST_DEMO = [
    { match: 'wingo-marine.com/api/v1/seo/search?q=SUNRISE', data: {
      title: '', url: 'https://wingo-marine.com/api/v1/seo/search?q=SUNRISE%20SAMBU&limit=10',
      text: '{"items":[{"mmsi":440213000,"name":"SUNRISE SAMBU","imo":9288007,"category":"tanker","flag":"KR","url":"/ship/sunrise-sambu-440213000","lastSeen":"2026-11-11T11:00:21.016Z"}]}'
    } },
    { match: 'wingo-marine.com/api/v1/seo/search', data: {
      title: '', url: 'https://wingo-marine.com/api/v1/seo/search?q=SAMBU&limit=10',
      text: '{"items":[{"mmsi":525008065,"name":"SAMBU","imo":9508732,"category":"tanker","flag":"ID","url":"/ship/sambu-525008065","lastSeen":"2026-11-11T02:37:58.639Z"},{"mmsi":441312000,"name":"PACIFIC SAMBU","imo":9268306,"category":"tanker","flag":"KR","url":"/ship/pacific-sambu-441312000","lastSeen":"2026-11-11T11:04:54.341Z"},{"mmsi":440213000,"name":"SUNRISE SAMBU","imo":9288007,"category":"tanker","flag":"KR","url":"/ship/sunrise-sambu-440213000","lastSeen":"2026-11-11T11:00:21.016Z"}]}'
    } },
    { match: 'wingo-marine.com/ship/v-440213000', data: {
      title: 'SUNRISE SAMBU — Position, MMSI 440213000 | Wingo Marine',
      url: 'https://wingo-marine.com/ship/sunrise-sambu-440213000',
      map: '{"kind":"vessel","position":[33.2762,127.0482],"rotation":35,"track":[[32.47,125.42],[32.72,125.9],[32.9,126.3],[33.0287,126.6602],[33.15,126.86],[33.2762,127.0482]],"port":{"lat":33.24,"lon":126.56,"name":"Seongsan-po"},"openSea":false}',
      text: 'Skip to content\nWingo Marine\nSign up\nHome\nShips\nTankers\nSUNRISE SAMBU\nTanker (hazardous cargo B)\n🇰🇷\nSouth Korea\nSUNRISE SAMBU\nIMO 9288007\nMMSI 440213000\nCall sign DSNR6\n23 km SE of Seongsan-po, South Korea\nLive ·\n14 min ago\nTrack SUNRISE SAMBU live — free\n33.2762° N, 127.0482° E\n33.2762° N, 127.0482° E\nLast 24 h track\nSPEED\n10.6kn\nCOURSE\n32°\nDESTINATION\nYeosu\nVoyage\nDestination\nYeosu, South Korea\nAIS: KR YOS\nSpeed\n10.6 kn\nCourse\n32°\nHeading\n35°\nPosition\n33.2762° N, 127.0482° E\nLast report\n11 Nov 2026, 11:00 UTC\n14 min ago\nNearest port\nSeongsan-po\n23 km SE of the port\nParticulars\nIMO\n9288007\nMMSI\n440213000\nCall sign\nDSNR6\nFlag\n🇰🇷 South Korea\nType\nTanker (hazardous cargo B)\nAIS type 82\nLength\n92 m\nBeam\n14 m\nDraught\n4.8 m\nDeadweight\n3,613 t\nNot broadcast: ETA.\nAbout SUNRISE SAMBU\nSUNRISE SAMBU (IMO 9288007, MMSI 440213000) is a tanker.\nVessels nearby\nMORNING GENTLY\n🇵🇦 Tanker\n→ KR YOS\n6.7 km away · 12.3 kn'
    } },
    { match: 'wingo-marine.com/ship/v-441878000', data: {
      title: 'YC COSMOS — Position, IMO 9409364, MMSI 441878000 | Wingo Marine',
      url: 'https://wingo-marine.com/ship/yc-cosmos-441878000',
      map: '{"kind":"vessel","position":[33.903847,128.31282],"rotation":80,"track":[[34.67793,127.91001],[34.54709,127.94904],[34.36303,127.96674],[34.17561,128.00871],[34.04701,128.02446],[33.89852,128.05217],[33.84102,128.07079],[33.90412,128.29408],[33.90385,128.31282]],"port":{"lat":34.51667,"lon":128.41667,"name":"Kukdo"},"openSea":false}',
      text: 'Wingo Marine\nYC COSMOS\nTanker\n🇰🇷\nSouth Korea\nYC COSMOS\nIMO 9409364\nMMSI 441878000\nCall sign DSRJ2\n69 km S of Kukdo, South Korea\nLive ·\n15 min ago\n33.9038° N, 128.3128° E\nLast 24 h track\nSPEED\n5.9kn\nCOURSE\n76°\nDESTINATION\nYeosu\nVoyage\nDestination\nYeosu, South Korea\nAIS: KR YOS\nSpeed\n5.9 kn\nCourse\n76°\nHeading\n80°\nPosition\n33.9038° N, 128.3128° E\nLast report\n11 Nov 2026, 11:01 UTC\n15 min ago\nNearest port\nKukdo\n69 km S of the port\nParticulars\nIMO\n9409364\nMMSI\n441878000\nCall sign\nDSRJ2\nFlag\n🇰🇷 South Korea\nType\nTanker\nAIS type 80\nLength\n105 m\nBeam\n16 m\nDraught\n7.0 m\nDeadweight\n5,631 t\nNot broadcast: ETA.\nAbout YC COSMOS\nYC COSMOS is a tanker.\nVessels nearby\nXING YUAN'
    } },
    { match: 'wingo-marine.com/ship/v-413378950', data: {
      title: 'MI LAN — Position, IMO 9342047, MMSI 413378950 | Wingo Marine',
      url: 'https://wingo-marine.com/ship/mi-lan-413378950',
      map: '{"kind":"vessel","position":[40.440483,121.8409],"rotation":190,"track":[[40.43827,121.83858],[40.43863,121.83869],[40.43935,121.84003],[40.44048,121.8409]],"port":{"lat":40.68,"lon":122.23,"name":"Yingkou Pt"},"openSea":false}',
      text: 'Wingo Marine\nMI LAN\nTanker (hazardous cargo C)\n🇨🇳\nChina\nMI LAN\nIMO 9342047\nMMSI 413378950\nCall sign BPPB8\n39 km SW of Yingkou Pt, China\nLast seen\n1 h ago\n40.4405° N, 121.8409° E\nSPEED\n0.6kn\nCOURSE\n162°\nDESTINATION\nPANJIN\nVoyage\nDestination\nPANJIN\nSpeed\n0.6 kn\nCourse\n162°\nHeading\n190°\nPosition\n40.4405° N, 121.8409° E\nLast report\n11 Nov 2026, 10:05 UTC\n1 h ago\nNearest port\nYingkou Pt\n39 km SW of the port\nParticulars\nIMO\n9342047\nMMSI\n413378950\nCall sign\nBPPB8\nFlag\n🇨🇳 China\nType\nTanker (hazardous cargo C)\nAIS type 83\nLength\n96 m\nBeam\n15 m\nDraught\n4.5 m\nDeadweight\n3,799 t\nNot broadcast: ETA.\nAbout MI LAN\nMI LAN is a tanker.\nVessels nearby\nHE TAI TONG 8'
    } },
    { match: 'vesselfinder.com/vessels/details/9288007', data: {
      title: 'SUNRISE SAMBU, Chemical/Oil Products Tanker - Details and current position - IMO 9288007 - VesselFinder',
      url: 'https://www.vesselfinder.com/vessels/details/9288007',
      djson: '{ "v":true,"lrpd":"4 days ago ","lrpc":1,"sar":false,"mmsi":440213000,"ship_lat":25,"ship_lon":120,"ship_cog":24.8,"ship_sog":6.2,"ship_type":82,"no_pc":"No port calls detected"}',
      text: 'SUNRISE SAMBU\nChemical/Oil Products Tanker, IMO 9288007\n\nThe current position of SUNRISE SAMBU is at China Coast reported 4 days ago by AIS. The vessel is en route to the port of Yeosu, Korea, sailing at a speed of 6.2 knots and expected to arrive there on Nov 11, 22:00.\n\nTrack on Map\nAdd Photo\nAdd to fleet\nDestination\nYeosu, Korea\nETA: Nov 11, 22:00 (in 12 hours)\nPredicted ETA\t\nRemaining Distance\t\nDistance Sailed\t\nCourse / Speed\t24.8° / 6.2 kn\nCurrent draught\t6.4 m\nNavigation Status\t-\nPosition Received\t\n4 days ago\n\nIMO / MMSI\t9288007 / 440213000\nCallsign\tDSNR6\nAIS Type\tTanker (HAZ-B)\nAIS Flag\tKorea\nLength / Beam\t92 / 14 m\nLast Port\nAn Ping, Taiwan\nATD: Nov 7, 01:26 UTC (4 days ago)\nSHIP POSITION & VOYAGE\nTrack for $10 / month\nSatellite position: 12 min ago\nTrack on Map\nVESSEL PARTICULARS\nIMO number\t9288007\nVessel Name\tSUNRISE SAMBU\nShip Type\tChemical/Oil Products Tanker\nFlag\tKorea\nYear of Build\t2004\nLength Overall (m)\t91.60\nBeam (m)\t14.20\nGross Tonnage\t2748\nDeadweight (t)\t3613\n'
    } },
    { match: 'vesselfinder.com/vessels/details/9409364', data: {
      title: 'YC COSMOS, Chemical/Oil Products Tanker - Details and current position - IMO 9409364 - VesselFinder',
      url: 'https://www.vesselfinder.com/vessels/details/9409364',
      djson: '{ "v":true,"lrpd":"19 hours ago ","lrpc":2,"sar":false,"mmsi":441878000,"ship_lat":34,"ship_lon":128,"ship_cog":166.6,"ship_sog":11.6,"ship_type":80,"no_pc":"No port calls detected"}',
      text: 'YC COSMOS\nChemical/Oil Products Tanker, IMO 9409364\n\nThe current position of YC COSMOS is at East Asia reported 19 hours ago by AIS.\n\nTrack on Map\nAdd Photo\nAdd to fleet\nDestination\nYeosu, Korea\nETA: Nov 11, 23:00 (in 13 hours)\nPredicted ETA\t\nRemaining Distance\t\nDistance Sailed\t\nCourse / Speed\t166.6° / 11.6 kn\nCurrent draught\t5.0 m\nNavigation Status\t-\nPosition Received\t\n19 hours ago\n\nIMO / MMSI\t9409364 / 441878000\nCallsign\tDSRJ2\nAIS Type\tTanker\nAIS Flag\tKorea\nLength / Beam\t105 / 16 m\nLast Port\nGwangyang Anch., Korea\nATD: Nov 10, 10:12 UTC (1 day ago)\nVESSEL PARTICULARS\nIMO number\t9409364\nVessel Name\tYC COSMOS\nShip Type\tChemical/Oil Products Tanker\nFlag\tKorea\nYear of Build\t2008\nGross Tonnage\t4060\nDeadweight (t)\t5631\n'
    } },
    { match: 'vesselfinder.com/vessels?name=', data: {
      title: 'Vessels Database - VesselFinder', url: 'https://www.vesselfinder.com/vessels?name=SAMBU', text: '',
      rows: [
        { href: '/vessels/details/9288007', name: 'SUNRISE SAMBU', type: 'Chemical/Oil Products Tanker', flag: 'Korea', built: '2004', gt: '2748', dwt: '3613', size: '92 / 14' },
        { href: '/vessels/details/9354129', name: 'PACIFIC SAMBU', type: 'Chemical/Oil Products Tanker', flag: 'Korea', built: '-', gt: '-', dwt: '-', size: '-' },
        { href: '/vessels/details/211263840', name: 'SAMBU', type: 'Sailing vessel', flag: 'Germany', built: '-', gt: '-', dwt: '-', size: '16 / 5' }
      ]
    } },
    { match: 'yspilot.co.kr/forecast/status', data: {
      title: '여수항도선사회', url: 'http://www.yspilot.co.kr/forecast/status', error: '',
      days: [
        { date: '20261111', rows: [
          ['NO', 'Spec', 'SW', 'Vessel', 'GRT', 'DFT', 'Seq', 'POB', 'From', 'To', 'B', 'PLTs', '수습', 'CF', 'B/T', 'Tug', 'C', 'AGT', 'Line', 'C/S'],
          ['1', '도선', '', 'CHENNAI VOYAGER', '25,637', '9.80', '', '17:30', 'PS-3', 'CTN-15', '우', 'A', '1.0', '', '', '', '', '', '구38서43', 'L', '장금', '남양', '3E3614'],
          ['2', '도선', 'HH', 'CARONI PLAIN', '26,471', '8.50', '', '18:00', 'WA-B', 'OKC-2', '좌', 'LS', '1.0', '', '', '', '', '', '성53성55', 'L', '세바', '우리', 'VREQ2']
        ] },
        { date: '20261112', rows: [
          ['NO', 'Spec', 'SW', 'Vessel', 'GRT', 'DFT', 'Seq', 'POB', 'From', 'To', 'B', 'PLTs', '수습', 'CF', 'B/T', 'Tug', 'C', 'AGT', 'Line', 'C/S'],
          ['33', '예보', '', 'YC COSMOS', '4,060', '5.00', '', '19:30', 'WA-W', 'GSP-7', '우', '', '', '', '', '', '', '', '', 'B', '조영', '스카이마린', 'DSRJ2']
        ] },
        { date: '20261113', rows: [
          ['NO', 'Spec', 'SW', 'Vessel', 'GRT', 'DFT', 'Seq', 'POB', 'From', 'To', 'B', 'PLTs', '수습', 'CF', 'B/T', 'Tug', 'C', 'AGT', 'Line', 'C/S']
        ] }
      ]
    } }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
