// 서버를 띄운 상태에서 단계 흐름을 끝까지 검증하는 스모크 테스트
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { EVT, PHASE, AVATAR_OPTIONS } from '../shared/constants.js';

const PORT = 3999;
const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT } });
await new Promise((r) => server.stdout.once('data', r));

const connect = () =>
  new Promise((resolve) => {
    const s = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
    s.latest = null;
    s.on(EVT.STATE_SYNC, (d) => (s.latest = d));
    s.on('connect', () => resolve(s));
  });
const call = (s, ev, payload) => new Promise((r) => s.emit(ev, payload, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const avatar = Object.fromEntries(Object.keys(AVATAR_OPTIONS).map((k) => [k, 0]));

try {
  const admin = await connect();
  await call(admin, EVT.ADMIN_JOIN);
  const p1 = await connect();
  const join = await call(p1, EVT.PLAYER_JOIN, { nickname: '영유' });
  assert.ok(join.ok && join.token);

  // 닉네임만 입력한 상태에서는 시작 불가
  await call(admin, EVT.ADMIN_ADD_BOTS);
  await wait(50);
  assert.equal(admin.latest.admin.canStart, false, '커스터마이징 전에는 시작 불가');
  assert.equal((await call(admin, EVT.ADMIN_START)).ok, false);

  // 아바타 완료 후 시작 가능
  assert.ok((await call(p1, EVT.PLAYER_AVATAR, avatar)).ok);
  await wait(50);
  assert.equal(admin.latest.admin.canStart, true);

  // 10번째 접속 차단
  const p10 = await connect();
  assert.equal((await call(p10, EVT.PLAYER_JOIN, { nickname: '열번째' })).reason, 'ROOM_FULL');

  // 시작 -> 카운트다운 -> 레이스 -> (개발용) 스킵 -> 시상대
  assert.ok((await call(admin, EVT.ADMIN_START)).ok);
  assert.equal(admin.latest.phase, PHASE.RACE_COUNTDOWN);
  await wait(3200);
  assert.equal(admin.latest.phase, PHASE.RACING);
  assert.ok((await call(admin, EVT.ADMIN_DEV_SKIP_RACE)).ok);
  assert.equal(admin.latest.phase, PHASE.PODIUM);

  // 재경기
  assert.ok((await call(admin, EVT.ADMIN_REMATCH)).ok);
  assert.equal(admin.latest.round, 2);
  await wait(3200);
  await call(admin, EVT.ADMIN_DEV_SKIP_RACE);

  // 마을 -> 힌트 지급
  assert.ok((await call(admin, EVT.ADMIN_TO_VILLAGE)).ok);
  await wait(50);
  const items = p1.latest.me.hintItems;
  assert.ok(items >= 1 && items <= 5);

  // 선물타임: 열기 차감, 재열기 무료, 0개면 새 카드 불가
  await call(admin, EVT.ADMIN_GIFT_TIME);
  const first = await call(p1, EVT.GIFT_OPEN, 3);
  assert.deepEqual([first.ok, first.charged], [true, true]);
  const again = await call(p1, EVT.GIFT_OPEN, 3);
  assert.deepEqual([again.ok, again.charged], [true, false]);
  await wait(50);
  assert.equal(p1.latest.me.hintItems, items - 1);
  for (let no = 1; no <= 9 && p1.latest.me.hintItems > 0; no++) {
    if (no !== 3) await call(p1, EVT.GIFT_OPEN, no);
  }
  const blocked = await call(p1, EVT.GIFT_OPEN, 9);
  if (!p1.latest.me.openedCards.includes(9)) assert.equal(blocked.reason, 'NO_HINT_ITEMS');

  // 힌트 보안: 플레이어 sync에는 열지 않은 카드의 문구가 없다
  const opened = p1.latest.me.openedCards.length;
  assert.equal(Object.keys(p1.latest.me.openedHints).length, opened);

  // 재접속 복구
  p1.disconnect();
  await wait(50);
  const p1b = await connect();
  const rejoin = await call(p1b, EVT.PLAYER_JOIN, { token: join.token });
  assert.ok(rejoin.reconnected);
  await wait(50);
  assert.equal(p1b.latest.me.openedCards.length, opened);

  // 선택의 시간: 플레이어는 관리자 명령 불가, 공개 힌트는 관리자에게만
  await call(admin, EVT.ADMIN_CHOICE_TIME);
  assert.equal((await call(p1b, EVT.ADMIN_REVEAL, 1)).reason, 'NOT_ADMIN');
  for (let no = 1; no <= 9; no++) {
    assert.ok((await call(admin, EVT.ADMIN_REVEAL, no)).ok);
    await wait(20);
    assert.ok(admin.latest.admin.revealed.hint.length > 0);
    assert.equal(p1b.latest.admin, undefined);
    assert.ok((await call(admin, EVT.ADMIN_CONFIRM_GIFT, no)).ok);
  }
  await wait(50);
  assert.equal(admin.latest.phase, PHASE.FINISHED);
  assert.equal(admin.latest.admin.lastGiven.no, 9);
  assert.ok(admin.latest.admin.lastGiven.name.length > 0);
  console.log('SMOKE TEST PASSED');
} catch (e) {
  console.error('SMOKE TEST FAILED:', e.message);
  process.exitCode = 1;
} finally {
  server.kill();
  process.exit();
}
