import './admin.css';
import { socket, emitAck } from '../net/socket.js';
import { EVT, PHASE, MAX_PLAYERS, RACE, hintItemsForRank } from '../../../shared/constants.js';
import { createIslandScene } from '../three/islandScene.js';
import { createRaceScene } from '../three/raceScene.js';
import { createPodiumScene } from '../three/podiumScene.js';
import { installTapSound, playForBigText } from '../audio.js';

installTapSound();
import { PHASE_LABEL, ISLAND_PHASES } from '../phaseLabels.js';

// 관리자 대형 화면이 레이스 장면을 보여 주는 단계 (시상대 전까지 같은 트랙을 유지한다)
const RACE_STAGE_PHASES = new Set([PHASE.RACE_COUNTDOWN, PHASE.RACING]);

const ADMIN_KEY = 'hpg_admin';
const app = document.getElementById('app');

const ERRORS = {
  NOT_READY: '9명이 모두 접속해서 캐릭터를 완성해야 시작할 수 있어요.',
  WRONG_PHASE: '지금 단계에서는 할 수 없는 동작이에요.',
  TIMEOUT: '서버 응답이 없어요.',
};

let latest = null;
let island = null; // 섬 장면 (로비·마을 단계)
let race = null; // 레이스 장면 (카운트다운·레이스 단계)
let podium = null; // 시상대 장면
let stageKind = null; // 'island' | 'race' | 'podium'
let stageEl = null;
let boardEl = null;
let bigEl = null;
let hintEl = null;
let cardsEl = null; // 하단 선물카드 줄
let revealEl = null; // 공개한 힌트·증정 안내(대형 화면 중앙)
let panel = null; // 패널 안의 갱신 대상 요소들
let errorMsg = '';
let lastPhase = null;
let countdownTimer = 0;
let goTimer = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- 접속 화면 ----------
function showLanding() {
  app.replaceChildren();
  const wrap = el('div', 'landing');
  const btn = el('button', 'btn', '관리자로 접속');
  btn.addEventListener('click', joinAsAdmin);
  wrap.append(el('h1', null, '🏠 집들이 레이스'), el('p', null, '관리자(방장) 화면 · 한 명만 접속할 수 있어요'), btn);
  app.append(wrap);
}

async function joinAsAdmin() {
  const res = await emitAck(EVT.ADMIN_JOIN);
  if (res.ok) localStorage.setItem(ADMIN_KEY, '1');
}

// ---------- 대시보드 ----------
function buildDashboard() {
  app.replaceChildren();
  stageEl = el('div');
  stageEl.id = 'stage';
  stageKind = null;

  const phaseBadge = el('span', 'badge');
  const count = el('p', 'count');
  const roster = el('div', 'roster');
  const controls = el('div', 'controls');
  const error = el('p', 'error');
  const note = el('p', 'note');
  const box = el('div', 'panel');
  box.append(el('h2', null, '진행 패널'), phaseBadge, count, roster, controls, error, note);

  boardEl = el('div', 'board');
  boardEl.hidden = true;
  bigEl = el('div', 'big-count');
  bigEl.hidden = true;
  hintEl = el('div', 'hintbar');

  cardsEl = el('div', 'cardstrip');
  cardsEl.hidden = true;
  revealEl = el('div', 'reveal');
  revealEl.hidden = true;

  app.append(stageEl, box, boardEl, bigEl, hintEl, cardsEl, revealEl);
  panel = { phaseBadge, count, roster, controls, error, note };
}

/** 단계에 맞는 3D 장면으로 바꾼다. 같은 장면이면 그대로 둔다. */
function setStage(kind) {
  if (stageKind === kind) return;
  island?.dispose();
  race?.dispose();
  podium?.dispose();
  island = race = podium = null;
  stageKind = kind;
  const canvas = el('canvas');
  stageEl.replaceChildren(canvas);
  if (kind === 'race') {
    race = createRaceScene({ canvas, mode: 'admin' });
    hintEl.textContent = '🎥 선두를 따라가는 자동 카메라';
  } else if (kind === 'podium') {
    podium = createPodiumScene({ canvas });
    hintEl.textContent = '🏆 시상식';
  } else {
    island = createIslandScene({ canvas, mode: 'admin' });
    hintEl.textContent = '🖱️ 드래그: 회전 · 휠: 확대/축소';
  }
  boardEl.hidden = kind !== 'race' && kind !== 'podium';
}

// ---------- 실시간 순위판 ----------
function renderBoard(items) {
  boardEl.replaceChildren(el('h3', null, '🏁 실시간 순위'));
  items.forEach((it, i) => {
    const row = el('div', `row${it.r !== null ? ' done' : ''}`);
    const bar = el('div', 'bar');
    const fill = el('i');
    fill.style.width = `${Math.min(1, it.d / RACE.TRACK_LENGTH) * 100}%`;
    bar.append(fill);
    row.append(
      el('span', 'place', String(it.r ?? i + 1)),
      el('span', 'rname', it.nickname),
      bar,
      el('span', 'rtime', it.time != null ? it.time.toFixed(2) : ''),
    );
    boardEl.append(row);
  });
}

function sortStandings(items) {
  return items.sort((a, b) => {
    if (a.r !== null && b.r !== null) return a.r - b.r;
    if (a.r !== null) return -1;
    if (b.r !== null) return 1;
    return b.d - a.d;
  });
}

/** 시상대 단계: 4~9위를 닉네임·기록·받는 힌트 아이템과 함께 목록으로 보여 준다 */
function renderPodiumList() {
  boardEl.replaceChildren(el('h3', null, '🏅 4위 ~ 9위'));
  const rest = latest.players
    .filter((p) => p.rank != null && p.rank >= 4)
    .sort((a, b) => a.rank - b.rank);
  for (const p of rest) {
    const row = el('div', 'row podium-row');
    row.append(
      el('span', 'place', String(p.rank)),
      el('span', 'rname', p.nickname),
      el('span', 'rtime', p.finishTime != null ? `${p.finishTime.toFixed(2)}초` : '미도착'),
      el('span', 'ritems', `🔑×${hintItemsForRank(p.rank)}`),
    );
    boardEl.append(row);
  }
  const note = el('p', 'note', `🔑 힌트 아이템: 1위 ${hintItemsForRank(1)} · 2위 ${hintItemsForRank(2)} · 3위 ${hintItemsForRank(3)} · 4~6위 ${hintItemsForRank(4)} · 7~9위 ${hintItemsForRank(7)}`);
  boardEl.append(note);
}

/** 서버 상태(sync)만으로 순위판을 그린다: 새로고침·시상대 단계용 */
function boardFromSync() {
  renderBoard(
    sortStandings(
      latest.players.map((p) => ({ nickname: p.nickname, d: p.distance ?? 0, r: p.rank, time: p.finishTime })),
    ),
  );
}

/** 20Hz 위치 방송으로 순위판을 갱신한다 */
function boardFromPositions(data) {
  if (!latest || stageKind !== 'race') return;
  const names = new Map(latest.players.map((p) => [p.id, p]));
  renderBoard(
    sortStandings(
      data.p.map((it) => ({
        nickname: names.get(it.id)?.nickname ?? '?',
        d: it.d,
        r: it.r,
        time: it.r !== null ? (finishTimes.get(it.id) ?? null) : null,
      })),
    ),
  );
}
const finishTimes = new Map(); // 레이스 중 도착한 사람의 기록 (race:finish로 받음)

// ---------- 선물카드(선물타임·선택의 시간·끝) ----------
function renderGifts() {
  const { phase, cards, admin } = latest;
  const show = phase === PHASE.GIFT_TIME || phase === PHASE.CHOICE_TIME;
  cardsEl.hidden = !show;
  const choosing = phase === PHASE.CHOICE_TIME;

  if (show) {
    cardsEl.replaceChildren();
    cards.forEach((state, i) => {
      const no = i + 1;
      const b = el('button', 'gc', String(no));
      const removed = state === 'removed';
      b.disabled = removed || !choosing;
      b.classList.toggle('removed', removed);
      b.classList.toggle('on', choosing && admin.revealed?.no === no);
      if (removed) b.textContent = '✔';
      b.addEventListener('click', () => run(EVT.ADMIN_REVEAL, no));
      cardsEl.append(b);
    });
  }

  revealEl.replaceChildren();
  revealEl.hidden = true;
  if (choosing && admin.revealed) {
    const { no, hint } = admin.revealed;
    const give = button('🎁 증정 완료', 'go', () => run(EVT.ADMIN_CONFIRM_GIFT, no));
    revealEl.append(el('div', 'rv-no', `${no}번 카드의 힌트`), el('p', 'rv-hint', hint), give);
    revealEl.hidden = false;
  } else if (choosing && admin.lastGiven) {
    revealEl.append(el('div', 'rv-no', '🎉 증정 완료!'), el('p', 'rv-hint', admin.lastGiven.name));
    revealEl.hidden = false;
  } else if (phase === PHASE.FINISHED) {
    revealEl.append(
      el('div', 'rv-no', '🎉 모든 선물 증정 완료!'),
      el('p', 'rv-hint', admin.lastGiven ? `마지막 선물: ${admin.lastGiven.name}` : '오늘 와줘서 고마워요'),
    );
    revealEl.hidden = false;
  }
}

// ---------- 큰 글자(카운트다운·GO!) ----------
function showBig(text, ms = 0) {
  clearTimeout(goTimer);
  bigEl.textContent = text;
  playForBigText(text);
  bigEl.classList.remove('pulse');
  void bigEl.offsetWidth;
  bigEl.classList.add('pulse');
  bigEl.hidden = false;
  if (ms) goTimer = setTimeout(() => (bigEl.hidden = true), ms);
}

function startCountdown(seconds) {
  const end = performance.now() + seconds * 1000;
  clearInterval(countdownTimer);
  const tick = () => {
    const remain = Math.ceil((end - performance.now()) / 1000);
    if (remain > 0) {
      if (bigEl.textContent !== String(remain) || bigEl.hidden) showBig(String(remain));
    } else {
      clearInterval(countdownTimer);
      countdownTimer = 0;
    }
  };
  countdownTimer = setInterval(tick, 100);
  tick();
}

async function run(event, payload) {
  errorMsg = '';
  const res = await emitAck(event, payload);
  if (!res.ok) {
    errorMsg = ERRORS[res.reason] ?? `실패: ${res.reason}`;
    panel.error.textContent = errorMsg;
  }
}

function button(label, cls, onClick, disabled = false) {
  const b = el('button', `btn ${cls}`.trim(), label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function renderControls() {
  const { phase, admin } = latest;
  const c = panel.controls;
  c.replaceChildren();
  panel.note.textContent = '';

  switch (phase) {
    case PHASE.LOBBY:
      c.append(
        button('🤖 테스트 봇 채우기', 'sub', () => run(EVT.ADMIN_ADD_BOTS)),
        button('▶ 시작', 'go', () => run(EVT.ADMIN_START), !admin.canStart),
      );
      panel.note.textContent = admin.canStart
        ? '준비 완료! 시작 버튼을 눌러 주세요.'
        : '9명이 모두 접속해서 캐릭터를 완성하면 시작할 수 있어요.';
      break;
    case PHASE.RACE_COUNTDOWN:
    case PHASE.RACING:
      if (import.meta.env.DEV) c.append(button('⏩ (개발용) 레이스 건너뛰기', 'sub', () => run(EVT.ADMIN_DEV_SKIP_RACE)));
      panel.note.textContent = '플레이어들이 폰을 연타하는 중이에요!';
      break;
    case PHASE.PODIUM:
      c.append(
        button('🔁 재경기', 'sub', () => run(EVT.ADMIN_REMATCH)),
        button('🏝️ 마을로 이동', 'go', () => run(EVT.ADMIN_TO_VILLAGE)),
      );
      panel.note.textContent = '재경기를 하면 이번 기록은 지워지고, 마지막 경기만 반영돼요.';
      break;
    case PHASE.VILLAGE:
      c.append(button('🎁 선물타임', 'go', () => run(EVT.ADMIN_GIFT_TIME)));
      break;
    case PHASE.GIFT_TIME:
      c.append(button('🤔 선택의 시간', 'go', () => run(EVT.ADMIN_CHOICE_TIME)));
      panel.note.textContent = '플레이어들이 폰에서 카드를 열어 힌트를 보고 있어요.';
      break;
    case PHASE.CHOICE_TIME:
      c.append(button('⬅ 선물타임으로 돌아가기', 'sub', () => run(EVT.ADMIN_BACK_TO_GIFT)));
      panel.note.textContent = '아래 카드를 눌러 힌트를 공개하고, 선물을 전하면 [증정 완료]를 눌러요.';
      break;
    case PHASE.FINISHED:
      c.append(
        button('🔁 게임 다시 시작', 'go', () => {
          if (confirm('처음(로비)부터 다시 시작할까요?\n순위·힌트 아이템·열린 카드가 모두 초기화돼요. (접속자와 캐릭터는 유지)')) {
            run(EVT.ADMIN_RESTART);
          }
        }),
      );
      panel.note.textContent = '모든 선물 증정이 끝났어요. 다시 하려면 위 버튼을 눌러요.';
      break;
    default:
      break;
  }
  panel.error.textContent = errorMsg;
}

function renderDashboard() {
  if (!panel) buildDashboard();
  const { phase, players, admin } = latest;
  panel.phaseBadge.textContent = PHASE_LABEL[phase] ?? phase;
  panel.count.textContent = `접속 ${players.filter((p) => p.connected).length}/${MAX_PLAYERS} · 준비 ${admin.readyCount}/${MAX_PLAYERS}`;
  panel.roster.replaceChildren();
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = players[i];
    const cell = el('div', 'p', p ? `${p.ready ? '✔ ' : ''}${p.nickname}${p.isBot ? ' 🤖' : ''}` : '빈자리');
    if (!p || !p.connected) cell.classList.add('off');
    if (p?.ready) cell.classList.add('ready');
    panel.roster.append(cell);
  }
  renderControls();

  if (RACE_STAGE_PHASES.has(phase)) {
    setStage('race');
    race.setPlayers(players);
    boardFromSync();
  } else if (phase === PHASE.PODIUM) {
    setStage('podium');
    podium.setPlayers(players);
    renderPodiumList();
  } else {
    setStage('island');
    island.setPlayers(ISLAND_PHASES.has(phase) || phase === PHASE.FINISHED ? players : []);
  }
  renderGifts();

  if (phase !== lastPhase) {
    if (phase === PHASE.RACE_COUNTDOWN) finishTimes.clear();
    if (phase === PHASE.RACING) {
      clearInterval(countdownTimer);
      countdownTimer = 0;
      showBig('GO!', 1000);
    }
    if (phase === PHASE.PODIUM) {
      clearInterval(countdownTimer);
      bigEl.hidden = true;
    }
    lastPhase = phase;
  }
}

// ---------- 소켓 ----------
socket.on(EVT.STATE_SYNC, (data) => {
  if (data.role !== 'admin') return;
  latest = data;
  renderDashboard();
});
socket.on(EVT.LOBBY_POSITIONS, (data) => island?.applyPositions(data.p));
socket.on(EVT.LOBBY_ACTION, (data) => island?.playAction(data.id, data.type));
socket.on(EVT.RACE_COUNTDOWN, (data) => {
  finishTimes.clear();
  if (bigEl) startCountdown(data.seconds);
});
socket.on(EVT.RACE_POSITIONS, (data) => {
  race?.applyPositions(data);
  boardFromPositions(data);
});
socket.on(EVT.RACE_FINISH, (data) => {
  finishTimes.set(data.id, data.time);
  race?.finish(data.id, data.rank);
});

socket.on('connect', () => {
  // 새로고침해도 관리자 자리를 바로 되찾는다
  if (localStorage.getItem(ADMIN_KEY)) joinAsAdmin();
  else showLanding();
});
