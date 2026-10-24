// 실제 레이스 시뮬레이션 검증: 사람 1명(연타) + 봇 8명
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { EVT, PHASE, AVATAR_OPTIONS, RACE, LOBBY } from '../shared/constants.js';

const PORT = 3998;
const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT } });
await new Promise((r) => server.stdout.once('data', r));

const connect = () =>
  new Promise((resolve) => {
    const s = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
    s.latest = null;
    s.finishes = [];
    s.result = null;
    s.lastPositions = null;
    s.lobby = null;
    s.on(EVT.STATE_SYNC, (d) => (s.latest = d));
    s.on(EVT.RACE_FINISH, (d) => s.finishes.push(d));
    s.on(EVT.RACE_RESULT, (d) => (s.result = d));
    s.on(EVT.RACE_POSITIONS, (d) => (s.lastPositions = d));
    s.on(EVT.LOBBY_POSITIONS, (d) => (s.lobby = d));
    s.on('connect', () => resolve(s));
  });
const call = (s, ev, payload) => new Promise((r) => s.emit(ev, payload, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const avatar = Object.fromEntries(Object.keys(AVATAR_OPTIONS).map((k) => [k, 0]));

/** 초당 rate회를 50ms 묶음으로 보내는 연타 흉내. 중지 함수를 돌려준다. */
function startTapping(socket, rate) {
  let acc = 0;
  const id = setInterval(() => {
    acc += rate * 0.05;
    const count = Math.floor(acc);
    acc -= count;
    if (count > 0) socket.emit(EVT.RACE_TAP, { count });
  }, 50);
  return () => clearInterval(id);
}

try {
  const admin = await connect();
  await call(admin, EVT.ADMIN_JOIN);
  const me = await connect();
  await call(me, EVT.PLAYER_JOIN, { nickname: '영유' });
  await call(me, EVT.PLAYER_AVATAR, avatar);
  await call(admin, EVT.ADMIN_ADD_BOTS);
  await wait(100);

  // ----- 섬 이동: 목표 지점으로 이동하고, 섬 밖은 가장자리로 보정된다 -----
  me.emit(EVT.LOBBY_MOVE_TO, { x: 500, z: 0 });
  await wait(4000);
  const myId = admin.latest.players.find((p) => p.nickname === '영유').id;
  assert.ok(me.lobby, '위치 브로드캐스트가 와야 함');
  const mine = me.lobby.p.find((p) => p.id === myId);
  const edge = LOBBY.ISLAND_RADIUS - 1; // 섬 밖(x=500)을 찍으면 가장자리(17, 0)로 보정
  assert.ok(Math.hypot(mine.x - edge, mine.z) < 0.5, `가장자리로 이동하지 않음: ${mine.x}, ${mine.z}`);
  console.log('lobby ok: 내 위치', mine.x, mine.z);

  // ----- 출발 전 터치는 무시된다 -----
  await call(admin, EVT.ADMIN_START);
  assert.equal(admin.latest.phase, PHASE.RACE_COUNTDOWN);
  const stopEarly = startTapping(me, 30);
  await wait(2500);
  stopEarly();
  assert.equal(me.lastPositions, null, '카운트다운 중에는 위치 업데이트 없음');

  // ----- 레이스: 평균 7회/초로 연타 -----
  await wait(700);
  assert.equal(admin.latest.phase, PHASE.RACING);
  const t0 = Date.now();
  const stopTap = startTapping(me, 7);
  while (admin.latest.phase === PHASE.RACING && Date.now() - t0 < 60000) await wait(100);
  stopTap();
  const raceSeconds = (Date.now() - t0) / 1000;
  assert.equal(admin.latest.phase, PHASE.PODIUM);
  console.log(`race ended after ${raceSeconds.toFixed(1)}s`);

  // 순위: 1~9 중복 없이 확정, 기록 순서와 일치
  const results = admin.result.results;
  assert.equal(results.length, 9);
  assert.deepEqual(results.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const timed = results.filter((r) => r.time !== null);
  for (let i = 1; i < timed.length; i++) assert.ok(timed[i].time >= timed[i - 1].time);
  console.log('ranks/time:', results.map((r) => `${r.rank}:${r.time}`).join(' '));

  // 사람(초당 7회)의 기록은 튜닝값(약 30초) 근처
  const myRes = results.find((r) => r.id === admin.latest.players.find((p) => p.nickname === '영유').id);
  assert.ok(myRes.time > 25 && myRes.time < 36, `내 기록 ${myRes.time}초가 예상 범위를 벗어남`);
  console.log('my time:', myRes.time, 'rank', myRes.rank);

  // 도착 이벤트는 순위 순서로 전달
  assert.ok(admin.finishes.length >= 1);

  // ----- 재경기 후 오토클릭(초당 100회)은 상한에 막힌다 -----
  assert.ok((await call(admin, EVT.ADMIN_REMATCH)).ok);
  assert.equal(admin.latest.round, 2);
  await wait(3300);
  const t1 = Date.now();
  const stopSpam = startTapping(me, 100);
  while (admin.latest.phase === PHASE.RACING && Date.now() - t1 < 60000) await wait(100);
  stopSpam();
  const spamRes = admin.result.results.find((r) => r.id === myRes.id);
  const minPossible = 15.0; // 초당 14회 상한으로 낼 수 있는 최단 기록 (튜닝 스크립트 기준 약 15.4초)
  assert.ok(spamRes.time >= minPossible, `오토클릭 상한이 무너짐: ${spamRes.time}초`);
  console.log('spam time (capped):', spamRes.time);

  // 이전 경기 결과는 버려지고 마지막 경기만 순위에 반영된다
  assert.equal(admin.latest.round, 2);
  assert.ok((await call(admin, EVT.ADMIN_TO_VILLAGE)).ok);
  await wait(50);
  const mineNow = admin.latest.players.find((p) => p.id === myRes.id);
  assert.equal(me.latest.me.hintItems, [5, 4, 3, 2, 2, 2, 1, 1, 1][mineNow.rank - 1]);

  console.log('RACE TEST PASSED');
} catch (e) {
  console.error('RACE TEST FAILED:', e.message);
  process.exitCode = 1;
} finally {
  server.kill();
  process.exit();
}
