// 점프·공격: 쿨다운, 다른 사람에게만 전달, 섬 밖 단계에서는 거부
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { EVT, PHASE, ACTION, AVATAR_OPTIONS } from '../shared/constants.js';

const PORT = 3996;
const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT } });
await new Promise((r) => server.stdout.once('data', r));

const connect = () =>
  new Promise((resolve) => {
    const s = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
    s.latest = null;
    s.actions = [];
    s.on(EVT.STATE_SYNC, (d) => (s.latest = d));
    s.on(EVT.LOBBY_ACTION, (d) => s.actions.push(d));
    s.on('connect', () => resolve(s));
  });
const call = (s, ev, payload) => new Promise((r) => s.emit(ev, payload, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const avatar = Object.fromEntries(Object.keys(AVATAR_OPTIONS).map((k) => [k, 0]));

try {
  const admin = await connect();
  await call(admin, EVT.ADMIN_JOIN);
  const p1 = await connect();
  const p2 = await connect();
  await call(p1, EVT.PLAYER_JOIN, { nickname: '하나' });
  await call(p2, EVT.PLAYER_JOIN, { nickname: '둘' });

  // 커스터마이징 전에는 동작 불가
  assert.equal((await call(p1, EVT.PLAYER_ACTION, { type: ACTION.JUMP })).reason, 'NOT_ALLOWED');

  await call(p1, EVT.PLAYER_AVATAR, avatar);
  await call(p2, EVT.PLAYER_AVATAR, avatar);
  await wait(50);
  const id1 = admin.latest.players.find((p) => p.nickname === '하나').id;

  // 점프: 다른 플레이어와 관리자에게는 전달, 본인에게는 에코 없음
  assert.ok((await call(p1, EVT.PLAYER_ACTION, { type: ACTION.JUMP })).ok);
  await wait(100);
  for (const s of [p2, admin]) {
    assert.ok(s.actions.some((a) => a.id === id1 && a.type === ACTION.JUMP), '다른 화면에 전달되어야 함');
  }
  assert.equal(p1.actions.filter((a) => a.id === id1).length, 0, '본인에게는 에코하지 않음');

  // 쿨다운
  assert.equal((await call(p1, EVT.PLAYER_ACTION, { type: ACTION.JUMP })).reason, 'COOLDOWN');
  // 점프 쿨다운 중에도 공격은 별개로 사용 가능
  assert.ok((await call(p1, EVT.PLAYER_ACTION, { type: ACTION.ATTACK })).ok);
  await wait(800);
  assert.ok((await call(p1, EVT.PLAYER_ACTION, { type: ACTION.JUMP })).ok, '쿨다운 후 다시 가능');

  // 잘못된 종류
  assert.equal((await call(p1, EVT.PLAYER_ACTION, { type: 'fly' })).reason, 'INVALID_ACTION');
  assert.equal((await call(p1, EVT.PLAYER_ACTION)).reason, 'INVALID_ACTION');

  // 레이스 단계에서는 거부
  await call(admin, EVT.ADMIN_ADD_BOTS);
  await wait(50);
  assert.ok((await call(admin, EVT.ADMIN_START)).ok);
  await wait(100);
  assert.equal(admin.latest.phase, PHASE.RACE_COUNTDOWN);
  assert.equal((await call(p2, EVT.PLAYER_ACTION, { type: ACTION.ATTACK })).reason, 'NOT_ALLOWED');

  console.log('ACTION TEST PASSED');
} catch (e) {
  console.error('ACTION TEST FAILED:', e.message);
  process.exitCode = 1;
} finally {
  server.kill();
  process.exit();
}
