import { EVT, PHASE, GIFT_COUNT, ACTION_COOLDOWN_MS } from '../../shared/constants.js';
import {
  state,
  joinPlayer,
  findBySocket,
  validateAvatar,
  addBots,
} from '../game/state.js';
import { syncAll, syncOne, emitTo } from '../game/broadcast.js';
import * as phases from '../game/phases.js';
import { hintOf } from '../data/hints.js';
import { addTaps } from '../game/race.js';
import { setTarget, isMovablePhase } from '../game/lobby.js';

const IS_DEV = process.env.NODE_ENV !== 'production';

function reply(ack, payload) {
  if (typeof ack === 'function') ack(payload);
}

export function registerHandlers(io) {
  io.on('connection', (socket) => {
    const isAdmin = () => state.adminSocketId === socket.id;

    // ---------- 플레이어 ----------
    socket.on(EVT.PLAYER_JOIN, (payload, ack) => {
      const result = joinPlayer(payload ?? {}, socket.id);
      if (!result.ok) return reply(ack, result);
      reply(ack, { ok: true, token: result.player.token, reconnected: result.reconnected });
      syncAll();
    });

    socket.on(EVT.PLAYER_AVATAR, (avatar, ack) => {
      const p = findBySocket(socket.id);
      if (!p) return reply(ack, { ok: false, reason: 'NO_PLAYER' });
      if (state.phase !== PHASE.LOBBY) return reply(ack, { ok: false, reason: 'WRONG_PHASE' });
      if (!validateAvatar(avatar)) return reply(ack, { ok: false, reason: 'INVALID_AVATAR' });
      p.avatar = avatar;
      p.ready = true;
      reply(ack, { ok: true });
      syncAll();
    });

    socket.on(EVT.LOBBY_MOVE_TO, (target) => {
      const p = findBySocket(socket.id);
      if (!p || !p.ready || !isMovablePhase()) return;
      if (!Number.isFinite(target?.x) || !Number.isFinite(target?.z)) return;
      setTarget(p, target.x, target.z);
    });

    // 점프·공격: 연출 전용. 서버는 쿨다운만 검사하고 나머지 화면(다른 폰, 관리자)에 알린다.
    socket.on(EVT.PLAYER_ACTION, (payload, ack) => {
      const p = findBySocket(socket.id);
      if (!p || !p.ready || !isMovablePhase()) return reply(ack, { ok: false, reason: 'NOT_ALLOWED' });
      const type = payload?.type;
      const cooldown = ACTION_COOLDOWN_MS[type];
      if (!cooldown) return reply(ack, { ok: false, reason: 'INVALID_ACTION' });
      const now = Date.now();
      // 네트워크 지터를 감안해 쿨다운의 80%만 강제한다.
      if (now - p.lastAction[type] < cooldown * 0.8) return reply(ack, { ok: false, reason: 'COOLDOWN' });
      p.lastAction[type] = now;
      socket.broadcast.emit(EVT.LOBBY_ACTION, { id: p.id, type });
      reply(ack, { ok: true });
    });

    // 출발 전(카운트다운)에 온 터치는 무시한다.
    socket.on(EVT.RACE_TAP, (payload) => {
      if (state.phase !== PHASE.RACING) return;
      const p = findBySocket(socket.id);
      if (p) addTaps(p, payload?.count);
    });

    socket.on(EVT.GIFT_OPEN, (no, ack) => {
      const p = findBySocket(socket.id);
      if (!p) return reply(ack, { ok: false, reason: 'NO_PLAYER' });
      if (state.phase !== PHASE.GIFT_TIME) return reply(ack, { ok: false, reason: 'WRONG_PHASE' });
      if (!Number.isInteger(no) || no < 1 || no > GIFT_COUNT) {
        return reply(ack, { ok: false, reason: 'INVALID_CARD' });
      }
      if (state.gift.cards[no - 1] !== 'hidden') {
        return reply(ack, { ok: false, reason: 'CARD_REMOVED' });
      }

      const alreadyOpened = p.openedCards.has(no);
      if (!alreadyOpened) {
        if (p.hintItems <= 0) return reply(ack, { ok: false, reason: 'NO_HINT_ITEMS' });
        p.hintItems -= 1;
        p.openedCards.add(no);
      }
      // 힌트는 요청한 본인에게만 전송한다.
      emitTo(socket.id, EVT.GIFT_HINT, { card: no, text: hintOf(no), hintItems: p.hintItems });
      reply(ack, { ok: true, charged: !alreadyOpened });
      syncAll();
    });

    // ---------- 관리자 ----------
    socket.on(EVT.ADMIN_JOIN, (_payload, ack) => {
      const previous = state.adminSocketId;
      if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.disconnect(true);
      state.adminSocketId = socket.id;
      reply(ack, { ok: true });
      syncOne(socket.id, 'admin');
    });

    const adminAction = (event, fn) => {
      socket.on(event, (payload, ack) => {
        if (!isAdmin()) return reply(ack, { ok: false, reason: 'NOT_ADMIN' });
        reply(ack, fn(payload));
      });
    };

    adminAction(EVT.ADMIN_ADD_BOTS, () => {
      if (state.phase !== PHASE.LOBBY) return { ok: false, reason: 'WRONG_PHASE' };
      addBots();
      syncAll();
      return { ok: true };
    });
    adminAction(EVT.ADMIN_START, () => phases.startGame());
    adminAction(EVT.ADMIN_REMATCH, () => phases.rematch());
    adminAction(EVT.ADMIN_TO_VILLAGE, () => phases.toVillage());
    adminAction(EVT.ADMIN_GIFT_TIME, () => phases.giftTime());
    adminAction(EVT.ADMIN_CHOICE_TIME, () => phases.choiceTime());
    adminAction(EVT.ADMIN_REVEAL, (no) => phases.revealCard(no));
    adminAction(EVT.ADMIN_CONFIRM_GIFT, (no) => phases.confirmGift(no));
    if (IS_DEV) adminAction(EVT.ADMIN_DEV_SKIP_RACE, () => phases.devSkipRace());

    // ---------- 연결 종료 ----------
    socket.on('disconnect', () => {
      if (state.adminSocketId === socket.id) {
        state.adminSocketId = null;
        return;
      }
      const p = findBySocket(socket.id);
      if (p) {
        p.socketId = null;
        p.connected = false;
        syncAll();
      }
    });
  });
}
