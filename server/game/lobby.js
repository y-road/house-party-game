import { LOBBY, PHASE, EVT, ACTION } from '../../shared/constants.js';
import { state } from './state.js';
import { emitAll } from './broadcast.js';

const MOVABLE_PHASES = new Set([PHASE.LOBBY, PHASE.VILLAGE, PHASE.GIFT_TIME, PHASE.CHOICE_TIME]);
const EDGE_MARGIN = 1; // 섬 가장자리에서 떨어져 서 있을 거리

const r2 = (n) => Math.round(n * 100) / 100;

export function isMovablePhase() {
  return MOVABLE_PHASES.has(state.phase);
}

/** 섬 밖을 찍으면 가장자리 안쪽으로 보정한다. */
export function clampToIsland(x, z) {
  const limit = LOBBY.ISLAND_RADIUS - EDGE_MARGIN;
  const dist = Math.hypot(x, z);
  if (dist <= limit) return { x, z };
  const k = limit / dist;
  return { x: x * k, z: z * k };
}

export function setTarget(player, x, z) {
  const t = clampToIsland(x, z);
  player.lobby.targetX = t.x;
  player.lobby.targetZ = t.z;
}

function randomPoint() {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * (LOBBY.ISLAND_RADIUS - EDGE_MARGIN - 1);
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

function moveToward(l, dt) {
  const dx = l.targetX - l.x;
  const dz = l.targetZ - l.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.01) return false;
  const step = Math.min(dist, LOBBY.MOVE_SPEED * dt);
  l.x += (dx / dist) * step;
  l.z += (dz / dist) * step;
  return true;
}

/** 섬 위 이동 시뮬레이션. 움직임이 있을 때만 위치를 브로드캐스트한다. */
export function startLobbyLoop() {
  const dt = 1 / LOBBY.TICK_HZ;
  return setInterval(() => {
    if (!isMovablePhase()) return;

    let moved = false;
    for (const p of state.players.values()) {
      if (p.isBot && Math.hypot(p.lobby.targetX - p.lobby.x, p.lobby.targetZ - p.lobby.z) < 0.05) {
        if (Math.random() < 0.04) {
          const t = randomPoint();
          p.lobby.targetX = t.x;
          p.lobby.targetZ = t.z;
        }
      }
      // 혼자 테스트할 때 화면이 심심하지 않도록 봇도 가끔 점프·공격한다.
      if (p.isBot && Math.random() < 0.008) {
        emitAll(EVT.LOBBY_ACTION, { id: p.id, type: Math.random() < 0.5 ? ACTION.JUMP : ACTION.ATTACK });
      }
      if (moveToward(p.lobby, dt)) moved = true;
    }

    if (moved) {
      emitAll(EVT.LOBBY_POSITIONS, {
        p: [...state.players.values()].map((p) => ({
          id: p.id,
          x: r2(p.lobby.x),
          z: r2(p.lobby.z),
          tx: r2(p.lobby.targetX),
          tz: r2(p.lobby.targetZ),
        })),
      });
    }
  }, dt * 1000);
}
