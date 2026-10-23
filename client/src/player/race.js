import { EVT, PHASE, RACE, MAX_PLAYERS } from '../../../shared/constants.js';
import { socket } from '../net/socket.js';
import { createRaceScene } from '../three/raceScene.js';

const DOT_COLORS = ['#ff6b81', '#ff9f43', '#ffd93d', '#6bcb77', '#40c4c4', '#4d96ff', '#9b72ff', '#ff8fd0', '#8a7a6a'];
const TAP_FLUSH_MS = 50;

import { playForBigText } from '../audio.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 플레이어 레이스 화면: 내 캐릭터 뒤를 따라가는 3인칭 3D + 화면 어디든 연타.
 * main.js가 소켓 이벤트를 받아 positions / finish / countdown / update로 넘겨 준다.
 */
export function createRaceView(container, initial) {
  let latest = initial;
  let racing = false;
  let finishedSelf = false;
  let tapCount = 0;
  let hasTapped = false;
  let lastPhase = null;
  let countdownTimer = 0;
  let goTimer = 0;

  const wrap = el('div', 'race-screen');
  const canvas = el('canvas', 'race-canvas');

  const top = el('div', 'race-top');
  const rankPill = el('div', 'rank-pill');
  const rankNum = el('span', 'rank-num', '-');
  rankPill.append(rankNum, el('span', 'rank-of', `/${MAX_PLAYERS}위`));
  const progress = el('div', 'progress');
  const dots = new Map();
  top.append(rankPill, progress);

  const big = el('div', 'count-big');
  const hint = el('div', 'tap-hint', '👆 화면을 빠르게 연타!');
  hint.hidden = true;
  const banner = el('div', 'finish-banner');
  banner.hidden = true;

  wrap.append(canvas, top, big, hint, banner);
  container.append(wrap);

  const scene = createRaceScene({ canvas, mode: 'player', selfId: initial.me.id });

  function buildDots() {
    progress.replaceChildren();
    dots.clear();
    latest.players.forEach((p, i) => {
      const dot = el('span', `dot${p.id === latest.me.id ? ' me' : ''}`);
      dot.style.background = p.id === latest.me.id ? '#ffd93d' : DOT_COLORS[i % DOT_COLORS.length];
      progress.append(dot);
      dots.set(p.id, dot);
    });
    progress.append(el('span', 'flag', '🏁'));
  }

  function setDot(id, d) {
    const dot = dots.get(id);
    if (dot) dot.style.left = `${Math.min(1, d / RACE.TRACK_LENGTH) * 100}%`;
  }

  // ---------- 터치 연타 ----------
  function pop(e) {
    const p = el('span', 'pop', '★');
    p.style.left = `${e.clientX}px`;
    p.style.top = `${e.clientY}px`;
    wrap.append(p);
    setTimeout(() => p.remove(), 450);
  }

  wrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!racing || finishedSelf) return;
    tapCount++;
    if (!hasTapped) {
      hasTapped = true;
      hint.hidden = true;
    }
    pop(e);
  });

  // 50ms마다 모아서 보낸다 (서버가 초당 상한을 검사하고 위치는 서버가 계산한다)
  const flushTimer = setInterval(() => {
    if (tapCount > 0) {
      socket.emit(EVT.RACE_TAP, { count: tapCount });
      tapCount = 0;
    }
  }, TAP_FLUSH_MS);

  // ---------- 상태 반영 ----------
  function showBig(text, ms = 0) {
    clearTimeout(goTimer);
    big.textContent = text;
    playForBigText(text);
    big.classList.remove('pulse');
    void big.offsetWidth; // 애니메이션 다시 재생
    big.classList.add('pulse');
    big.hidden = false;
    if (ms) goTimer = setTimeout(() => (big.hidden = true), ms);
  }

  function showFinish(rank, time) {
    finishedSelf = true;
    hint.hidden = true;
    banner.hidden = false;
    banner.replaceChildren(
      el('div', 'fb-rank', `🏁 ${rank}위!`),
      el('div', 'fb-time', time != null ? `${time.toFixed(2)}초` : '결승선 도착 실패'),
      el('div', 'fb-wait', '친구들을 기다리는 중…'),
    );
  }

  function update(next) {
    latest = next;
    scene.setPlayers(latest.players);
    if (dots.size !== latest.players.length) buildDots();
    for (const p of latest.players) setDot(p.id, p.distance ?? 0);

    const me = latest.players.find((p) => p.id === latest.me.id);
    if (me && me.rank !== null && !finishedSelf && latest.phase === PHASE.RACING) showFinish(me.rank, me.finishTime);

    if (latest.phase !== lastPhase) {
      if (latest.phase === PHASE.RACE_COUNTDOWN) {
        racing = false;
        if (!countdownTimer) showBig('준비!');
      }
      if (latest.phase === PHASE.RACING) {
        racing = true;
        clearInterval(countdownTimer);
        countdownTimer = 0;
        showBig('GO!', 900);
        if (!finishedSelf) hint.hidden = false;
      }
      lastPhase = latest.phase;
    }
  }

  function countdown({ seconds }) {
    const end = performance.now() + seconds * 1000;
    clearInterval(countdownTimer);
    const tick = () => {
      const remain = Math.ceil((end - performance.now()) / 1000);
      if (remain > 0) {
        if (big.textContent !== String(remain) || big.hidden) showBig(String(remain));
      } else {
        clearInterval(countdownTimer);
        countdownTimer = 0;
      }
    };
    countdownTimer = setInterval(tick, 100);
    tick();
  }

  function positions(data) {
    scene.applyPositions(data);
    // 순위: 도착한 사람은 도착 순, 나머지는 달린 거리 순
    const sorted = [...data.p].sort((a, b) => {
      if (a.r !== null && b.r !== null) return a.r - b.r;
      if (a.r !== null) return -1;
      if (b.r !== null) return 1;
      return b.d - a.d;
    });
    const place = sorted.findIndex((it) => it.id === latest.me.id) + 1;
    if (place > 0) rankNum.textContent = String(place);
    for (const it of data.p) setDot(it.id, it.d);
  }

  function finish({ id, rank, time }) {
    scene.finish(id, rank);
    if (id === latest.me.id) showFinish(rank, time);
  }

  buildDots();
  update(initial);

  function dispose() {
    clearInterval(flushTimer);
    clearInterval(countdownTimer);
    clearTimeout(goTimer);
    scene.dispose();
    wrap.remove();
  }

  return { update, positions, finish, countdown, dispose };
}
