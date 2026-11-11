/* =====================================================================
 * brief.js — 대화형 브리핑 (항차 상태 → 사람이 읽는 문장)
 * ---------------------------------------------------------------------
 * - briefing(vw)   : 갱신 직후 보여 주는 5단계 브리핑
 * - answer(q, vw)  : 질문 칩·직접 입력에 대한 답
 * - fleetSummary() : 선대 전체 요약
 * 원칙: 확인된 값(실측)과 계산한 값(추정)을 문장에서 반드시 구분하고,
 *       데이터에 없는 사유는 지어내지 않는다.
 * 외부 AI·API 를 쓰지 않는 규칙 기반 문장 생성이다.
 * ===================================================================== */
(function (root) {
  'use strict';
  var FST = root.FST = root.FST || {};
  var U = FST.Util, E = FST.Engine;
  var BR = FST.Brief = {};
  function R2(txt) { var p = FST.Route.matchPort(txt); return p ? p.id : ''; } // 항만 문구 → 항만 id

  // 좌표가 속한 해역 이름 (개략 구분)
  BR.seaArea = function (lat, lon) {
    if (lat >= 37 && lat < 41.2 && lon >= 117.5 && lon < 122.3) return '보하이해';
    if (lat >= 32.5 && lat < 34.0 && lon >= 125.5 && lon < 128) return '제주 근해';
    if (lat >= 34.0 && lat < 35.3 && lon >= 126.8 && lon < 129.3) return '남해';
    if (lat >= 31.5 && lat < 39.5 && lon >= 119 && lon < 126.8) return '황해(서해)';
    if (lat >= 35 && lat < 42 && lon >= 129 && lon < 133) return '동해';
    if (lat >= 22 && lat < 26 && lon >= 117 && lon < 121) return '대만해협';
    if (lat >= 25 && lat < 33.6 && lon >= 120 && lon < 130) return '동중국해';
    if (lat >= 30 && lat < 36 && lon >= 130 && lon < 142) return '일본 남안';
    if (lat < 23 && lon >= 105 && lon < 121) return '남중국해';
    return '외해';
  };

  function bold(s) { return '<b>' + U.esc(s) + '</b>'; }
  function tag(kind) {                                 // 실측/추정/미확인 꼬리표
    var t = { real: ['실측', 'tg-real'], est: ['추정', 'tg-est'], none: ['미확인', 'tg-none'], ext: ['외부 표기', 'tg-ext'] }[kind];
    return '<span class="tg ' + t[1] + '">' + t[0] + '</span>';
  }
  function msg(key, title, html) {
    return { key: key, title: title, html: html, text: html.replace(/<[^>]+>/g, '') };
  }

  /* ---------- 단계별 문장 ---------- */

  function partPosition(vw) {
    var v = vw.v;
    if (!vw.fix && vw.coarse) {
      return msg('pos', '현재 위치',
        tag('ext') + ' 확인된 정밀 위치가 없습니다. VesselFinder 무료 화면에는 ' + bold(Math.abs(vw.coarse.lat) + '°N ' + Math.abs(vw.coarse.lon) + '°E 부근') +
        ' (1도 단위, 오차 수십 해리)만 나오고, 그마저 ' + bold(U.ago(vw.coarse.ts, vw.now)) + ' 수신값입니다. 지도에는 넓은 원으로만 표시했습니다. ' +
        '정밀 위치는 Wingo 같은 사용자 소스를 등록하거나 위치를 직접 입력해 주세요.');
    }
    if (!vw.fix) {
      return msg('pos', '현재 위치', tag('none') + ' ' + bold(v.name) + ' 의 확인된 위치가 없습니다. 갱신을 눌러 직접 조회하거나, 받은 위치 통보를 직접 입력해 주세요. 임의의 좌표는 표시하지 않습니다.');
    }
    var f = vw.fix;
    var html = tag('real') + ' ' + bold(U.fmtKst(f.t)) + ' (' + U.ago(f.t, vw.now) + ') ' + bold(BR.seaArea(f.lat, f.lon)) + ' ' + bold(U.fmtPos(f.lat, f.lon)) +
      ' 에서 확인됐습니다. 출처는 ' + U.esc(E.srcName(f.src)) + (f.timeAssumed ? ' (수신 시각은 조회·이관 시각으로 간주)' : '') + ' 입니다.';
    if (vw.dr) {
      html += '<br>' + tag('est') + ' 그 뒤 같은 속력으로 항로를 따라갔다면 지금은 ' + bold(BR.seaArea(vw.dr.lat, vw.dr.lon)) + ' ' + bold(U.fmtPos(vw.dr.lat, vw.dr.lon)) +
        ' 부근입니다 (실측 이후 ' + U.num(vw.dr.advNm, 0) + '해리 전진으로 계산).';
    }
    if (vw.fresh === 'stale') html += '<br>⚠️ 실측이 하루 이상 지났습니다. 추정 위치의 오차가 클 수 있으니 갱신해 주세요.';
    return msg('pos', '현재 위치', html);
  }

  function partSpeed(vw) {
    if (vw.sog == null) return msg('spd', '속력·침로', tag('none') + ' 속력·침로 값이 없습니다.');
    var head = vw.cog != null ? ' 침로 ' + bold(Math.round(vw.cog) + '° ' + U.compassKo(vw.cog)) : '';
    var html = bold(U.num(vw.sog, 1) + '노트') + head + ' — ' + bold(E.stateText(vw.state)) + '.';
    if (vw.state === 'stopped') {
      html += ' 0.5노트 미만이라 정박 또는 대기 상태로 봅니다. 정박 사유(선석 대기·기상·도선 대기 등)는 조회한 데이터에 나오지 않습니다.';
    } else if (vw.state === 'slow') {
      html += ' 소형 케미칼선의 통상 항해 속력(10~13노트)보다 낮습니다. 사유는 데이터로 확인되지 않으며, 보통은 도착 시각 조정(선석·도선 대기), 연안·협수로 감속, 기상 영향 중 하나입니다.';
    } else if (vw.state === 'underway') {
      html += ' 통상적인 항해 속력 범위입니다.';
    }
    if (vw.v.voyage && vw.v.voyage.draught) html += ' 흘수 ' + bold(U.num(vw.v.voyage.draught, 1) + 'm') + ' (AIS 입력값).';
    return msg('spd', '속력·침로', html);
  }

  function partVoyage(vw) {
    var v = vw.v, vo = v.voyage || {};
    if (!vw.destText) return msg('voy', '항차', tag('none') + ' 목적지가 확인되지 않았습니다. 선박 정보에서 목적 항만을 지정하면 항로와 ETA 를 계산합니다.');
    var oi = vw.originInfo;
    var html = (vw.originText ? bold(vw.originText) + (vw.originTs ? ' (' + (vw.originTsEst ? '약 ' : '') + U.fmtKst(vw.originTs) + ' 출항)' : '') + ' → ' : '') + bold(vw.destText) + '.';
    if (oi && oi.kind === 'track') html += ' ' + tag('real') + ' 출항지는 Wingo 항적에서 정박해 있던 자리로 판단했습니다' + (vo.lastPortText && R2(vo.lastPortText) !== oi.port.id ? ' (VesselFinder 직전 항만 기록 “' + U.esc(vo.lastPortText) + '”은 이 기항을 놓친 이전 기록).' : '.');
    if (vw.originDoubt) html += ' ⚠️ VesselFinder 직전 항만 기록(' + U.esc(vo.lastPortText) + ')이 목적지와 같아 오래된 기록으로 보고 출항지를 비워 뒀습니다. 선박 정보에서 직접 고를 수 있습니다.';
    if (vw.remainNm != null) {
      html += ' 남은 항정 약 ' + bold(U.num(vw.remainNm, 0) + '해리') + (vw.progress != null ? ' (진행 ' + Math.round(vw.progress * 100) + '%)' : '') + '.';
    }
    var lines = [];
    if (vw.pilotNext && vw.pilotNext.kind === 'B') lines.push('도선예보 ' + bold(U.fmtKst(vw.pilotNext.ts)) + ' 승선');
    if (vw.etaCalc) lines.push('계산 ETA ' + bold(U.fmtKst(vw.etaCalc)) + ' ' + tag('est') + ' (현재 속력 유지 가정)');
    if (vw.etaAis) lines.push('AIS 입력 ETA ' + bold(U.fmtKst(vw.etaAis)) + ' ' + tag('ext') + ' (선박 입력값을 UTC 로 본 것, 현지시각으로 넣는 배도 있음)');
    if (lines.length) html += '<br>' + lines.join('<br>');
    if (vw.etaCalc && vw.etaAis && Math.abs(vw.etaCalc - vw.etaAis) > 6 * 36e5) {
      html += '<br>⚠️ 계산 ETA 와 AIS 입력 ETA 가 ' + Math.round(Math.abs(vw.etaCalc - vw.etaAis) / 36e5) + '시간 차이 납니다. 대리점 통보로 확인이 필요합니다.';
    }
    if (vw.laycan) {
      if (vw.laycan.level === 'late') html += '<br>🚨 레이캔 종료보다 약 ' + bold(Math.round(vw.laycan.hours) + '시간 늦게') + ' 도착할 전망입니다.';
      else if (vw.laycan.level === 'early') html += '<br>ℹ️ 레이캔 시작보다 약 ' + Math.round(vw.laycan.hours) + '시간 일찍 도착할 전망입니다.';
      else html += '<br>✅ 레이캔 안에 도착할 전망입니다' + (vw.laycan.hours != null ? ' (여유 약 ' + Math.round(vw.laycan.hours) + '시간)' : '') + '.';
    }
    return msg('voy', '항차·ETA', html);
  }

  function partPort(vw) {
    var port = vw.dest;
    if (!port) return msg('port', '접안·항만', tag('none') + ' 목적 항만이 정해지지 않아 항만 정보를 조회하지 않았습니다.');
    var html = '';
    var rows = vw.pilotRows || [];
    if (port.pilot === 'yspilot') {
      var st = vw.v.src && vw.v.src.yspilot;
      if (rows.length) {
        html += tag('real') + ' 여수항도선사회 도선예보에 ' + rows.length + '건이 있습니다.';
        rows.slice(0, 4).forEach(function (r) {
          html += '<br>· ' + bold(U.fmtKst(r.ts)) + ' ' + U.esc(r.from) + ' → ' + bold(r.to) + ' (' + (r.kind === 'B' ? '접안' : r.kind === 'L' ? '이안' : U.esc(r.kind || '-')) +
            ', ' + U.esc(r.spec) + (r.draft ? ', 흘수 ' + U.esc(r.draft) + 'm' : '') + (r.agent ? ', 대리점 ' + U.esc(r.agent) : '') + ')';
        });
      } else if (st && st.ok) {
        html += '여수항도선사회 도선예보(오늘~모레)에 아직 이 선박이 없습니다. 도착 하루 전쯤부터 올라오는 경우가 많습니다.';
      } else if (st && !st.ok) {
        html += tag('none') + ' 도선예보 조회 실패: ' + U.esc(FST.Bridge.errorText(st.error));
      } else {
        html += '도선예보는 갱신하면 직접 조회합니다.';
      }
    } else {
      html += bold(port.ko) + ' 항만은 아직 도선예보 직접 조회를 지원하지 않습니다.';
    }
    if (port.rule) html += '<br>📌 ' + U.esc(port.rule);
    return msg('port', '접안·항만', html);
  }

  function partTrust(vw) {
    var v = vw.v, parts = [];
    Object.keys(v.src || {}).forEach(function (k) {
      var s = v.src[k];
      parts.push((s.ok ? '✅ ' : '⚠️ ') + U.esc(s.label) + ' ' + U.fmtHm(s.at) + (s.ok ? (s.info ? ' · ' + U.esc(s.info) : '') : ' · ' + U.esc(FST.Bridge.errorText(s.error))));
    });
    var html = parts.length ? parts.join('<br>') : '아직 직접 조회한 기록이 없습니다. 갱신을 누르면 소스별 결과가 여기에 남습니다.';
    var wOk = v.src && v.src.wingo && v.src.wingo.ok;
    if (!wOk && v.voyage && v.voyage.satNote) html += '<br>ℹ️ 정밀 좌표는 Wingo 에서 읽습니다. VesselFinder 무료 화면의 위치는 1도 단위 개략값입니다.';
    return msg('trust', '조회 결과', html);
  }

  // 갱신 직후의 5단계 브리핑
  BR.briefing = function (vw) {
    return [partPosition(vw), partSpeed(vw), partVoyage(vw), partPort(vw), partTrust(vw)];
  };

  // 선박 상태에 맞는 질문 칩
  BR.chips = function (vw) {
    var c = ['지금 어디야?', '언제 도착해?'];
    if (vw.state === 'slow' || vw.state === 'stopped') c.push('왜 느려?');
    c.push('접안 일정은?', '데이터 믿을 만해?', '전체 선대 요약');
    return c;
  };

  // 질문에 답하기 (키워드로 의도를 구분)
  BR.answer = function (q, vw, allViews) {
    var s = String(q || '').replace(/\s+/g, '');
    if (/선대|전체|요약|모든/.test(s) && allViews) return BR.fleetSummary(allViews);
    if (/어디|위치|좌표|현재/.test(s)) return partPosition(vw);
    if (/언제|도착|ETA|eta|입항|며칠|시간/.test(s)) return partVoyage(vw);
    if (/느려|느리|속력|속도|감속|빨라|노트|침로|방향/.test(s)) return partSpeed(vw);
    if (/접안|선석|도선|부두|항만|정박|대기/.test(s)) return partPort(vw);
    if (/믿|신뢰|정확|출처|소스|데이터|실측/.test(s)) return partTrust(vw);
    if (/레이캔|laycan|지연|늦/i.test(s)) return partVoyage(vw);
    return msg('help', '안내', '이렇게 물어볼 수 있습니다: 위치(“지금 어디야?”), ETA(“언제 도착해?”), 속력(“왜 느려?”), 접안 일정, 데이터 출처, 전체 선대 요약.');
  };

  // 선대 전체 요약 (ETA 빠른 순)
  BR.fleetSummary = function (views) {
    var list = views.slice().sort(function (a, b) { return ((a.eta && a.eta.ts) || 9e15) - ((b.eta && b.eta.ts) || 9e15); });
    var html = list.map(function (vw) {
      var eta = vw.eta ? U.fmtKst(vw.eta.ts) + ' (' + vw.eta.label + ')' : 'ETA 미확인';
      var warn = vw.laycan && vw.laycan.level === 'late' ? ' 🚨레이캔 초과' : '';
      var age = vw.fix ? '실측 ' + U.ago(vw.fix.t, vw.now) : '실측 없음';
      return '· ' + bold(vw.v.name) + (vw.v.cargo ? ' [' + U.esc(vw.v.cargo) + ']' : '') + ' → ' + U.esc(vw.destText || '목적지 미확인') + ' · ' + eta + warn + ' · ' + age;
    }).join('<br>');
    return msg('fleet', '선대 요약 (ETA 빠른 순)', html || '추적 중인 선박이 없습니다.');
  };
})(typeof window !== 'undefined' ? window : globalThis);
