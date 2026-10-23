// 연타 속도별 완주 시간을 계산하고, 목표 시간에 맞는 트랙 길이를 찾는다.
// 사용법: node scripts/tune-track.mjs [목표초=15] [기준연타수=7]
import { RACE } from '../shared/constants.js';
import { stepPlayer } from '../server/game/race.js';

const dt = 1 / RACE.TICK_HZ;
const targetSeconds = Number(process.argv[2] ?? 15);
const refRate = Number(process.argv[3] ?? 7);

function finishTime(rate, length) {
  const race = { distance: 0, speed: 0 };
  for (let t = 0; t < 120; t += dt) {
    stepPlayer(race, Math.min(rate, RACE.MAX_TAPS_PER_SECOND) * dt, dt);
    if (race.distance >= length) return t + dt;
  }
  return Infinity;
}

// 이분 탐색: 기준 연타수로 목표 시간에 도착하는 길이
let lo = 10;
let hi = 400;
for (let i = 0; i < 40; i++) {
  const mid = (lo + hi) / 2;
  if (finishTime(refRate, mid) < targetSeconds) lo = mid;
  else hi = mid;
}
const suggested = Math.round((lo + hi) / 2);
console.log(`기준 연타 ${refRate}/초 → ${targetSeconds}초 도착 길이: ${((lo + hi) / 2).toFixed(1)} (제안값 ${suggested})\n`);

for (const length of new Set([RACE.TRACK_LENGTH, suggested])) {
  console.log(`트랙 길이 ${length}`);
  for (const rate of [4, 5, 6, 7, 8, 9, 10, 12, 14, 20, 40]) {
    const t = finishTime(rate, length);
    const note = rate > RACE.MAX_TAPS_PER_SECOND ? ' (상한 적용)' : '';
    console.log(`  초당 ${String(rate).padStart(2)}회 → ${Number.isFinite(t) ? t.toFixed(1) + '초' : '미도착'}${note}`);
  }
}
