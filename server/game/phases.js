import { PHASE, RACE, EVT, GIFT_COUNT, hintItemsForRank } from '../../shared/constants.js';
import { state, canStart, freshRaceState, resetLobbyPosition } from './state.js';
import { syncAll, emitAll } from './broadcast.js';
import { startRace, stopRace } from './race.js';
import { nameOf } from '../data/hints.js';

let countdownTimer = null;

function setPhase(next) {
  state.phase = next;
  syncAll();
}

function fail(reason) {
  return { ok: false, reason };
}

function resetRace() {
  state.race.round += 1;
  state.race.startedAt = null;
  state.race.results = [];
  for (const p of state.players.values()) {
    p.race = freshRaceState();
  }
}

function beginCountdown() {
  clearTimeout(countdownTimer);
  resetRace();
  setPhase(PHASE.RACE_COUNTDOWN);
  emitAll(EVT.RACE_COUNTDOWN, { seconds: RACE.COUNTDOWN_SECONDS });
  countdownTimer = setTimeout(() => {
    if (state.phase !== PHASE.RACE_COUNTDOWN) return;
    state.race.startedAt = Date.now();
    setPhase(PHASE.RACING);
    startRace(() => setPhase(PHASE.PODIUM));
  }, RACE.COUNTDOWN_SECONDS * 1000);
}

export function startGame() {
  if (!canStart()) return fail('NOT_READY');
  beginCountdown();
  return { ok: true };
}

/** 시상대에서 재경기. 이전 레이스 결과는 버리고 마지막 레이스만 순위에 반영된다. */
export function rematch() {
  if (state.phase !== PHASE.PODIUM) return fail('WRONG_PHASE');
  beginCountdown();
  return { ok: true };
}

export function toVillage() {
  if (state.phase !== PHASE.PODIUM) return fail('WRONG_PHASE');
  // 마지막 레이스 순위 기준으로 힌트 아이템을 지급한다.
  for (const p of state.players.values()) {
    p.hintItems = hintItemsForRank(p.race.rank ?? state.players.size);
  }
  setPhase(PHASE.VILLAGE);
  return { ok: true };
}

export function giftTime() {
  if (state.phase !== PHASE.VILLAGE) return fail('WRONG_PHASE');
  setPhase(PHASE.GIFT_TIME);
  return { ok: true };
}

export function choiceTime() {
  if (state.phase !== PHASE.GIFT_TIME) return fail('WRONG_PHASE');
  state.gift.revealed = null;
  state.gift.lastGiven = null;
  setPhase(PHASE.CHOICE_TIME);
  return { ok: true };
}

/** 선택의 시간에서 선물타임으로 돌아간다. 이미 증정된 카드와 플레이어의 힌트 기록은 그대로 유지된다. */
export function backToGift() {
  if (state.phase !== PHASE.CHOICE_TIME) return fail('WRONG_PHASE');
  state.gift.revealed = null;
  state.gift.lastGiven = null;
  setPhase(PHASE.GIFT_TIME);
  return { ok: true };
}

/** 증정이 모두 끝난 뒤 처음부터 다시: 접속자와 캐릭터는 유지하고 순위·힌트·카드는 초기화한다. */
export function restartGame() {
  if (state.phase !== PHASE.FINISHED) return fail('WRONG_PHASE');
  clearTimeout(countdownTimer);
  stopRace();
  state.gift.cards = Array.from({ length: GIFT_COUNT }, () => 'hidden');
  state.gift.revealed = null;
  state.gift.lastGiven = null;
  state.race = { round: 0, startedAt: null, results: [] };
  for (const p of state.players.values()) {
    p.hintItems = 0;
    p.openedCards.clear();
    p.race = freshRaceState();
    resetLobbyPosition(p);
  }
  setPhase(PHASE.LOBBY);
  return { ok: true };
}

export function revealCard(no) {
  if (state.phase !== PHASE.CHOICE_TIME) return fail('WRONG_PHASE');
  if (!Number.isInteger(no) || no < 1 || no > GIFT_COUNT) return fail('INVALID_CARD');
  if (state.gift.cards[no - 1] !== 'hidden') return fail('CARD_REMOVED');
  state.gift.revealed = no;
  state.gift.lastGiven = null;
  syncAll();
  return { ok: true };
}

export function confirmGift(no) {
  if (state.phase !== PHASE.CHOICE_TIME) return fail('WRONG_PHASE');
  if (state.gift.revealed !== no) return fail('NOT_REVEALED');
  state.gift.cards[no - 1] = 'removed';
  state.gift.revealed = null;
  state.gift.lastGiven = { no, name: nameOf(no) };
  if (state.gift.cards.every((c) => c === 'removed')) {
    setPhase(PHASE.FINISHED);
  } else {
    syncAll();
  }
  return { ok: true };
}

/** 개발 전용: 레이스 없이 무작위 순위로 시상대까지 넘긴다. */
export function devSkipRace() {
  if (![PHASE.RACE_COUNTDOWN, PHASE.RACING].includes(state.phase)) return fail('WRONG_PHASE');
  clearTimeout(countdownTimer);
  stopRace();
  const ids = [...state.players.keys()].sort(() => Math.random() - 0.5);
  ids.forEach((id, i) => {
    const p = state.players.get(id);
    p.race = {
      ...freshRaceState(),
      distance: RACE.TRACK_LENGTH,
      finishTime: 14 + i * 0.4,
      rank: i + 1,
    };
  });
  setPhase(PHASE.PODIUM);
  return { ok: true };
}
