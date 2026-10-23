import './style.css';
import { socket, emitAck } from '../net/socket.js';
import {
  EVT, PHASE, ACTION, ACTION_COOLDOWN_MS, AVATAR_OPTIONS, NICKNAME_MAX, MAX_PLAYERS, hintItemsForRank,
} from '../../../shared/constants.js';
import { CATEGORIES, chipColor, optionLabel, randomConfig } from '../three/avatarBuilder.js';
import { createAvatarPreview } from '../three/preview.js';
import { createIslandScene } from '../three/islandScene.js';
import { createRaceView } from './race.js';
import { createGiftView } from './gifts.js';
import { installTapSound } from '../audio.js';

installTapSound();
import { PHASE_LABEL, ISLAND_PHASES, RACE_PHASES, GIFT_PHASES } from '../phaseLabels.js';

const TOKEN_KEY = 'hpg_token';
const NICK_KEY = 'hpg_nick';
const app = document.getElementById('app');
const banner = document.getElementById('banner');

const ERRORS = {
  ROOM_FULL: '이미 9명이 모두 입장했어요.',
  GAME_ALREADY_STARTED: '이미 게임이 시작돼서 새로 입장할 수 없어요.',
  INVALID_NICKNAME: `닉네임은 1~${NICKNAME_MAX}자로 입력해 주세요.`,
  NICKNAME_TAKEN: '이미 누가 쓰고 있는 닉네임이에요.',
  TIMEOUT: '서버 응답이 없어요. 잠시 후 다시 시도해 주세요.',
};
const errorText = (reason) => ERRORS[reason] ?? '문제가 생겼어요. 다시 시도해 주세요.';

// ---------- 상태 ----------
let latest = null; // 서버가 보낸 최신 state:sync
let screen = null;
let teardown = () => {};
let myAvatar = null; // 커스터마이징 중인 캐릭터 (화면이 다시 그려져도 유지)
let editing = false; // 대기 화면에서 다시 꾸미기 중인지
let joinErrorEl = null;
let joinError = '';
let island = null; // 섬 3D 장면 (섬 화면일 때만 존재)
let raceView = null; // 레이스 화면 (카운트다운·레이스 단계에만 존재)
let giftView = null; // 선물카드 화면
let statusEl = null;
let redoBtn = null;
let toastTimer = 0;

// ---------- DOM 도우미 ----------
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 어두운 색 위의 숫자는 흰색으로 보여 준다 */
function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 110;
}

/** 같은 화면이면 아무것도 하지 않고 false, 새 화면이면 만들고 true */
function show(name, build) {
  if (screen === name) return false;
  teardown();
  teardown = () => {};
  screen = name;
  app.replaceChildren();
  build();
  return true;
}

// ---------- 화면: 안내 ----------
function showMessage(text) {
  show('message', () => {
    const wrap = el('div', 'screen center');
    wrap.append(el('h2', null, text));
    app.append(wrap);
  });
}

// ---------- 화면: 접속 ----------
function showJoin() {
  show('join', () => {
    const wrap = el('div', 'screen center');
    const card = el('div', 'card');
    card.style.width = '100%';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';

    const input = el('input');
    input.type = 'text';
    input.maxLength = NICKNAME_MAX;
    input.placeholder = '닉네임';
    input.autocomplete = 'off';
    input.value = localStorage.getItem(NICK_KEY) ?? '';

    joinErrorEl = el('p', 'error');
    const button = el('button', 'primary', '입장하기');
    const submit = async () => {
      const nickname = input.value.trim();
      if (!nickname) {
        joinErrorEl.textContent = '닉네임을 입력해 주세요.';
        return;
      }
      button.disabled = true;
      const res = await emitAck(EVT.PLAYER_JOIN, { nickname });
      button.disabled = false;
      if (!res.ok) {
        joinErrorEl.textContent = errorText(res.reason);
        return;
      }
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(NICK_KEY, nickname);
      joinErrorEl.textContent = '';
    };
    button.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());

    card.append(input, joinErrorEl, button);
    wrap.append(el('h1', null, '🏠 집들이 레이스'), el('p', 'sub', '닉네임을 정하고 입장하세요'), card);
    app.append(wrap);
  });
  if (joinErrorEl && joinError) {
    joinErrorEl.textContent = joinError;
    joinError = '';
  }
}

// ---------- 화면: 커스터마이징 ----------
function showCustomize() {
  show('customize', () => {
    if (!myAvatar) myAvatar = { ...(latest.me.avatar ?? randomConfig(AVATAR_OPTIONS)) };
    let tab = 'hair';

    const wrap = el('div', 'screen');
    const topbar = el('div', 'topbar');
    topbar.append(el('span', 'name', `${latest.me.nickname}의 캐릭터`));
    const randomBtn = el('button', 'ghost', '🎲 랜덤');
    topbar.append(randomBtn);

    const previewBox = el('div', 'preview');
    const canvas = el('canvas');
    previewBox.append(canvas, el('div', 'hint', '← 드래그해서 돌려보세요 →'));
    const preview = createAvatarPreview(canvas);
    preview.setAvatar(myAvatar);
    teardown = () => preview.dispose();

    const tabs = el('nav', 'tabs');
    const options = el('div', 'options');
    const errorEl = el('p', 'error');
    const confirm = el('button', 'primary', '이 모습으로 결정!');

    const renderTabs = () => {
      tabs.replaceChildren();
      for (const c of CATEGORIES) {
        const b = el('button', `tab${c.key === tab ? ' on' : ''}`, c.label);
        b.addEventListener('click', () => {
          tab = c.key;
          renderTabs();
          renderOptions();
        });
        tabs.append(b);
      }
    };

    const renderOptions = () => {
      options.replaceChildren();
      for (let i = 0; i < AVATAR_OPTIONS[tab]; i++) {
        const chip = el('button', 'chip');
        if (tab === 'gender') {
          chip.classList.add('big');
          chip.textContent = optionLabel(tab, i);
        } else {
          const dot = el('span', 'dot', String(i + 1));
          const color = chipColor(tab, i);
          dot.style.background = color;
          dot.style.color = isDark(color) ? '#ffffff' : '';
          chip.append(dot, el('span', null, optionLabel(tab, i)));
        }
        if (myAvatar[tab] === i) chip.classList.add('on');
        chip.addEventListener('click', () => {
          myAvatar[tab] = i;
          preview.setAvatar(myAvatar);
          renderOptions();
        });
        options.append(chip);
      }
    };

    randomBtn.addEventListener('click', () => {
      myAvatar = randomConfig(AVATAR_OPTIONS);
      preview.setAvatar(myAvatar);
      renderOptions();
    });

    confirm.addEventListener('click', async () => {
      confirm.disabled = true;
      errorEl.textContent = '';
      editing = false; // 응답 직후 도착하는 sync가 대기 화면으로 넘어가도록 미리 내려둔다
      const res = await emitAck(EVT.PLAYER_AVATAR, myAvatar);
      if (!res.ok) {
        editing = true;
        confirm.disabled = false;
        errorEl.textContent = errorText(res.reason);
      }
    });

    renderTabs();
    renderOptions();
    wrap.append(topbar, previewBox, tabs, options, errorEl, confirm);
    app.append(wrap);
  });
}

// ---------- 화면: 섬(로비·마을) ----------
function showIsland() {
  show('island', () => {
    const wrap = el('div', 'island-screen');
    const canvas = el('canvas', 'island-canvas');

    const top = el('div', 'island-top');
    statusEl = el('span', 'pill');
    redoBtn = el('button', 'pill action', '✏️ 다시 꾸미기');
    redoBtn.addEventListener('click', () => {
      myAvatar = { ...latest.me.avatar };
      editing = true;
      render();
    });
    top.append(statusEl, redoBtn);

    const actions = el('div', 'actions');
    const attackBtn = el('button', 'act-btn attack');
    attackBtn.append(el('span', 'emoji', '👊'), el('span', null, '공격'));
    const jumpBtn = el('button', 'act-btn jump');
    jumpBtn.append(el('span', 'emoji', '🦘'), el('span', null, '점프'));
    actions.append(attackBtn, jumpBtn);

    const toast = el('div', 'toast', '땅을 터치하면 이동해요!');
    wrap.append(canvas, top, actions, toast);
    app.append(wrap);

    island = createIslandScene({ canvas, mode: 'player', selfId: latest.me.id });
    teardown = () => {
      clearTimeout(toastTimer);
      island.dispose();
      island = null;
    };
    toastTimer = setTimeout(() => toast.classList.add('hide'), 4500);

    // 터치(또는 누른 채 드래그)한 곳으로 이동
    let down = false;
    let lastSend = 0;
    const send = (e, ripple) => {
      const now = performance.now();
      if (!ripple && now - lastSend < 90) return;
      const pt = island.pick(e.clientX, e.clientY);
      if (!pt) return;
      lastSend = now;
      socket.emit(EVT.LOBBY_MOVE_TO, pt);
      if (ripple) island.showRipple(pt.x, pt.z);
    };
    canvas.addEventListener('pointerdown', (e) => {
      down = true;
      send(e, true);
    });
    canvas.addEventListener('pointermove', (e) => down && send(e, false));
    const release = () => (down = false);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    // 점프·공격: 내 화면에서는 바로 재생하고, 서버가 다른 화면에 전달한다
    const bindAction = (btn, type) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (btn.disabled) return;
        island.playAction(latest.me.id, type);
        socket.emit(EVT.PLAYER_ACTION, { type });
        btn.disabled = true;
        btn.classList.add('cool');
        setTimeout(() => {
          btn.disabled = false;
          btn.classList.remove('cool');
        }, ACTION_COOLDOWN_MS[type]);
      });
    };
    bindAction(jumpBtn, ACTION.JUMP);
    bindAction(attackBtn, ACTION.ATTACK);
  });

  island.setPlayers(latest.players);
  const readyCount = latest.players.filter((p) => p.ready).length;
  statusEl.textContent =
    latest.phase === PHASE.LOBBY ? `🏝️ 로비 · 준비 ${readyCount}/${MAX_PLAYERS}` : `🏝️ ${PHASE_LABEL[latest.phase]}`;
  redoBtn.hidden = latest.phase !== PHASE.LOBBY;
}

// ---------- 화면: 레이스(카운트다운·연타) ----------
function showRace() {
  show('race', () => {
    raceView = createRaceView(app, latest);
    teardown = () => {
      raceView.dispose();
      raceView = null;
    };
  });
  raceView.update(latest);
}

// ---------- 화면: 선물카드(선물타임·선택의 시간) ----------
function showGifts() {
  show('gifts', () => {
    giftView = createGiftView(app, latest);
    teardown = () => {
      giftView.dispose();
      giftView = null;
    };
  });
  giftView.update(latest);
}

// ---------- 화면: 끝 ----------
function showFinished() {
  show('finished', () => {
    const wrap = el('div', 'screen center');
    wrap.append(el('h1', null, '🎉 끝!'), el('p', 'sub', '모든 선물이 주인을 찾았어요. 오늘 와줘서 고마워요!'));
    app.append(wrap);
  });
}

// ---------- 화면: 시상대(내 결과) ----------
const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
function showPodium() {
  const me = latest.players.find((p) => p.id === latest.me.id);
  const rank = me?.rank;
  const items = rank != null ? hintItemsForRank(rank) : null;
  show('podium', () => {
    const wrap = el('div', 'screen center podium-screen');
    app.append(wrap);
  });
  const wrap = app.querySelector('.podium-screen');
  wrap.replaceChildren();
  if (rank == null) {
    wrap.append(el('h1', null, '결과를 모으는 중…'));
    return;
  }
  const card = el('div', 'card podium-card');
  card.append(
    el('div', 'pd-medal', MEDAL[rank] ?? '🏁'),
    el('div', 'pd-rank', `${rank}위`),
    el('div', 'pd-time', me.finishTime != null ? `${me.finishTime.toFixed(2)}초` : '결승선 도착 전에 마감!'),
    el('div', 'pd-items', `🔑 힌트 아이템 ×${items}`),
    el('p', 'sub', '마지막 경기 결과만 반영돼요'),
  );
  wrap.append(card, el('p', 'sub', '큰 화면을 봐 주세요 · 방장이 다음으로 넘겨요'));
}

// ---------- 화면: 이후 단계 자리표시 ----------
function showPlaceholder() {
  show('placeholder', () => {
    const wrap = el('div', 'screen center');
    wrap.append(el('h2', null, '게임 화면은 다음 단계에서 만들어져요'), el('p', 'sub', ''));
    app.append(wrap);
  });
  app.querySelector('.screen .sub').textContent = `현재 단계: ${latest.phase}`;
}

// ---------- 화면 결정 ----------
function render() {
  const me = latest?.me;
  if (!me) {
    if (!socket.connected) return showMessage('서버에 연결하는 중…');
    return showJoin();
  }
  if (latest.phase === PHASE.LOBBY && (!me.ready || editing)) return showCustomize();
  if (GIFT_PHASES.has(latest.phase)) return showGifts();
  if (ISLAND_PHASES.has(latest.phase)) return showIsland();
  if (RACE_PHASES.has(latest.phase)) return showRace();
  if (latest.phase === PHASE.PODIUM) return showPodium();
  if (latest.phase === PHASE.FINISHED) return showFinished();
  return showPlaceholder();
}

// ---------- 소켓 ----------
socket.on(EVT.STATE_SYNC, (data) => {
  latest = data;
  render();
});
socket.on(EVT.LOBBY_POSITIONS, (data) => island?.applyPositions(data.p));
socket.on(EVT.LOBBY_ACTION, (data) => island?.playAction(data.id, data.type));
socket.on(EVT.GIFT_HINT, (data) => giftView?.showHint(data));
socket.on(EVT.RACE_COUNTDOWN, (data) => raceView?.countdown(data));
socket.on(EVT.RACE_POSITIONS, (data) => raceView?.positions(data));
socket.on(EVT.RACE_FINISH, (data) => raceView?.finish(data));

socket.on('connect', async () => {
  banner.hidden = true;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return render();
  // 새로고침·재접속이면 토큰으로 같은 플레이어를 복구한다
  const res = await emitAck(EVT.PLAYER_JOIN, { token });
  if (!res.ok) {
    localStorage.removeItem(TOKEN_KEY);
    latest = null;
    if (res.reason === 'GAME_ALREADY_STARTED' || res.reason === 'ROOM_FULL') joinError = errorText(res.reason);
    render();
  }
});

socket.on('disconnect', () => {
  banner.hidden = false;
});

render();
