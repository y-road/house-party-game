import { EVT } from '../../shared/constants.js';
import { state, publicPlayers, cardStatuses, selfView, adminView } from './state.js';

let io = null;

export function initBroadcast(ioInstance) {
  io = ioInstance;
}

export function emitAll(event, payload) {
  io?.emit(event, payload);
}

export function emitTo(socketId, event, payload) {
  if (socketId) io?.to(socketId).emit(event, payload);
}

/** 현재 상태를 각 접속자에게 역할에 맞게 전송한다. 재접속 복구에도 같은 함수를 쓴다. */
export function syncAll() {
  if (!io) return;
  const base = {
    phase: state.phase,
    round: state.race.round,
    players: publicPlayers(),
    cards: cardStatuses(),
  };

  for (const p of state.players.values()) {
    if (p.socketId) emitTo(p.socketId, EVT.STATE_SYNC, { ...base, role: 'player', me: selfView(p) });
  }
  if (state.adminSocketId) {
    emitTo(state.adminSocketId, EVT.STATE_SYNC, { ...base, role: 'admin', admin: adminView() });
  }
}

export function syncOne(socketId, role, player = null) {
  if (!io) return;
  const base = {
    phase: state.phase,
    round: state.race.round,
    players: publicPlayers(),
    cards: cardStatuses(),
  };
  if (role === 'player' && player) {
    emitTo(socketId, EVT.STATE_SYNC, { ...base, role, me: selfView(player) });
  } else if (role === 'admin') {
    emitTo(socketId, EVT.STATE_SYNC, { ...base, role, admin: adminView() });
  }
}
