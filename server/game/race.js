import { RACE, EVT } from '../../shared/constants.js';
import { state } from './state.js';
import { emitAll } from './broadcast.js';

let timer = null;

const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * 한 틱 물리: 터치 → 속도 임펄스 → 최고속도 제한 → 지수 감쇠 → 이동.
 * 튜닝 스크립트도 같은 함수를 쓴다.
 */
export function stepPlayer(race, taps, dt) {
  race.speed = Math.min(race.speed + taps * RACE.TAP_IMPULSE, RACE.MAX_SPEED);
  race.speed *= Math.exp(-RACE.DRAG * dt);
  race.distance += race.speed * dt;
}

/** 클라이언트가 보낸 터치 수를 쌓는다. 한 번에 보낼 수 있는 양과 대기량에 상한을 둔다. */
export function addTaps(player, count) {
  if (!Number.isFinite(count) || count <= 0) return;
  const r = player.race;
  r.pendingTaps = Math.min(r.pendingTaps + Math.min(Math.floor(count), 8), 6);
}

export function startRace(onEnd) {
  stopRace();
  const dt0 = 1 / RACE.TICK_HZ;
  let elapsed = 0;
  let last = performance.now();
  let finishedCount = 0;

  for (const p of state.players.values()) {
    // 봇은 초당 5~9회 정도로 연타한다 (사람이 없는 테스트용).
    p.race.botRate = p.isBot ? 5 + Math.random() * 4 : 0;
  }

  const finishRace = () => {
    // 도착하지 못한 사람은 결승선까지 남은 거리가 짧은 순서로 순위를 매긴다.
    const rest = [...state.players.values()]
      .filter((p) => p.race.rank === null)
      .sort((a, b) => b.race.distance - a.race.distance);
    for (const p of rest) p.race.rank = ++finishedCount;

    stopRace();
    const results = [...state.players.values()]
      .sort((a, b) => a.race.rank - b.race.rank)
      .map((p) => ({
        id: p.id,
        rank: p.race.rank,
        time: p.race.finishTime,
        distance: r2(p.race.distance),
      }));
    state.race.results = results;
    emitAll(EVT.RACE_RESULT, { results });
    onEnd();
  };

  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    elapsed += dt;

    const arrived = [];
    for (const p of state.players.values()) {
      const r = p.race;
      if (r.rank !== null) continue;

      let taps;
      if (p.isBot) {
        taps = r.botRate * dt * (0.7 + Math.random() * 0.6);
      } else {
        r.tapTokens = Math.min(r.tapTokens + RACE.MAX_TAPS_PER_SECOND * dt, RACE.MAX_TAPS_PER_SECOND * 0.3);
        taps = Math.min(r.pendingTaps, r.tapTokens);
        r.tapTokens -= taps;
        r.pendingTaps -= taps;
      }

      const prev = r.distance;
      stepPlayer(r, taps, dt);

      if (r.distance >= RACE.TRACK_LENGTH) {
        // 틱 사이에서 결승선을 넘은 시각을 보간해 기록한다.
        const frac = (RACE.TRACK_LENGTH - prev) / (r.distance - prev);
        r.finishTime = r3(elapsed - dt + frac * dt);
        r.distance = RACE.TRACK_LENGTH;
        r.speed = 0;
        arrived.push(p);
      }
    }

    // 같은 틱에 들어온 사람은 기록 순, 완전 동점이면 처리 순서(서버 도착 순)로 정한다.
    arrived.sort((a, b) => a.race.finishTime - b.race.finishTime);
    for (const p of arrived) {
      p.race.rank = ++finishedCount;
      emitAll(EVT.RACE_FINISH, { id: p.id, rank: p.race.rank, time: p.race.finishTime });
    }

    emitAll(EVT.RACE_POSITIONS, {
      t: r3(elapsed),
      p: [...state.players.values()].map((p) => ({
        id: p.id,
        d: r2(p.race.distance),
        v: r2(p.race.speed),
        r: p.race.rank,
      })),
    });

    if (finishedCount >= state.players.size || elapsed >= RACE.FORCE_END_AFTER_SECONDS) {
      finishRace();
    }
  };

  timer = setInterval(tick, dt0 * 1000);
}

export function stopRace() {
  clearInterval(timer);
  timer = null;
}
