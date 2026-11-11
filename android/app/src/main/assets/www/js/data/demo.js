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
