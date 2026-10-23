import crypto from 'node:crypto';
import {
  PHASE,
  MAX_PLAYERS,
  GIFT_COUNT,
  NICKNAME_MAX,
  AVATAR_OPTIONS,
} from '../../shared/constants.js';
import { hintOf } from '../data/hints.js';

// 모든 게임 상태는 서버 메모리에만 둔다.
export const state = {
  phase: PHASE.LOBBY,
  adminSocketId: null,
  players: new Map(), // id -> player
  gift: {
    cards: Array.from({ length: GIFT_COUNT }, () => 'hidden'), // 'hidden' | 'removed'
    revealed: null, // 관리자가 공개 중인 카드 번호
    lastGiven: null, // 방금 증정 완료한 선물 {no, name}
  },
  race: { round: 0, startedAt: null, results: [] },
};

export function resetAll() {
  state.phase = PHASE.LOBBY;
  state.players.clear();
  state.gift.cards = Array.from({ length: GIFT_COUNT }, () => 'hidden');
  state.gift.revealed = null;
  state.gift.lastGiven = null;
  state.race = { round: 0, startedAt: null, results: [] };
}

// ---------- 아바타 ----------
export function randomAvatar() {
  const avatar = {};
  for (const [key, count] of Object.entries(AVATAR_OPTIONS)) {
    avatar[key] = Math.floor(Math.random() * count);
  }
  return avatar;
}

export function validateAvatar(avatar) {
  if (!avatar || typeof avatar !== 'object') return false;
  return Object.entries(AVATAR_OPTIONS).every(([key, count]) => {
    const v = avatar[key];
    return Number.isInteger(v) && v >= 0 && v < count;
  });
}

// ---------- 플레이어 ----------
export function freshRaceState() {
  return {
    distance: 0,
    speed: 0,
    finishTime: null,
    rank: null,
    pendingTaps: 0, // 아직 처리하지 않은 터치 수
    tapTokens: 0, // 초당 터치 상한을 지키기 위한 토큰
    botRate: 0, // 봇의 초당 터치 수 (사람은 0)
  };
}

function spawnPoint() {
  const angle = Math.random() * Math.PI * 2;
  const r = 3 + Math.random() * 4;
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

function newPlayer({ nickname, socketId = null, isBot = false }) {
  const spawn = spawnPoint();
  return {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    nickname,
    avatar: null,
    ready: false, // 커스터마이징 완료 여부
    isBot,
    socketId,
    connected: !!socketId || isBot,
    hintItems: 0,
    openedCards: new Set(),
    lobby: { x: spawn.x, z: spawn.z, targetX: spawn.x, targetZ: spawn.z },
    lastAction: { jump: 0, attack: 0 }, // 쿨다운 판정용 마지막 사용 시각
    race: freshRaceState(),
  };
}

export function findByToken(token) {
  if (!token) return null;
  for (const p of state.players.values()) if (p.token === token) return p;
  return null;
}

export function findBySocket(socketId) {
  for (const p of state.players.values()) if (p.socketId === socketId) return p;
  return null;
}

/** 입장 또는 재접속. 성공 시 { ok: true, player, reconnected } */
export function joinPlayer({ nickname, token }, socketId) {
  const existing = findByToken(token);
  if (existing && !existing.isBot) {
    existing.socketId = socketId;
    existing.connected = true;
    return { ok: true, player: existing, reconnected: true };
  }

  if (state.phase !== PHASE.LOBBY) return { ok: false, reason: 'GAME_ALREADY_STARTED' };
  if (state.players.size >= MAX_PLAYERS) return { ok: false, reason: 'ROOM_FULL' };

  const name = typeof nickname === 'string' ? nickname.trim() : '';
  if (!name || name.length > NICKNAME_MAX) return { ok: false, reason: 'INVALID_NICKNAME' };
  for (const p of state.players.values()) {
    if (p.nickname === name) return { ok: false, reason: 'NICKNAME_TAKEN' };
  }

  const player = newPlayer({ nickname: name, socketId });
  state.players.set(player.id, player);
  return { ok: true, player, reconnected: false };
}

export function addBots() {
  let n = 1;
  while (state.players.size < MAX_PLAYERS) {
    let name = `봇${n++}`;
    while ([...state.players.values()].some((p) => p.nickname === name)) name = `봇${n++}`;
    const bot = newPlayer({ nickname: name, isBot: true });
    bot.avatar = randomAvatar();
    bot.ready = true;
    state.players.set(bot.id, bot);
  }
}

export function canStart() {
  if (state.phase !== PHASE.LOBBY) return false;
  if (state.players.size !== MAX_PLAYERS) return false;
  return [...state.players.values()].every((p) => p.ready && p.connected);
}

// ---------- 뷰 (클라이언트로 내보내는 형태) ----------
export function publicPlayers() {
  return [...state.players.values()].map((p) => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    ready: p.ready,
    connected: p.connected,
    isBot: p.isBot,
    x: Math.round(p.lobby.x * 100) / 100,
    z: Math.round(p.lobby.z * 100) / 100,
    rank: p.race.rank,
    finishTime: p.race.finishTime,
    distance: Math.round(p.race.distance * 100) / 100, // 재접속·새로고침 때 위치를 복구하는 용도
  }));
}

export function cardStatuses() {
  return [...state.gift.cards];
}

/** 플레이어 본인에게만 보내는 정보. 열어본 카드의 힌트 문구도 여기에 포함된다. */
export function selfView(p) {
  const openedHints = {};
  for (const no of p.openedCards) openedHints[no] = hintOf(no);
  return {
    id: p.id,
    token: p.token,
    nickname: p.nickname,
    avatar: p.avatar,
    ready: p.ready,
    hintItems: p.hintItems,
    openedCards: [...p.openedCards],
    openedHints,
  };
}

/** 관리자에게만 보내는 정보. 공개 중인 카드의 힌트는 대형 화면에만 나온다. */
export function adminView() {
  const players = [...state.players.values()];
  const rev = state.gift.revealed;
  return {
    canStart: canStart(),
    playerCount: players.length,
    readyCount: players.filter((p) => p.ready).length,
    revealed: rev ? { no: rev, hint: hintOf(rev) } : null,
    lastGiven: state.gift.lastGiven ?? null,
  };
}
