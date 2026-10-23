// 캐릭터 빌더 검증: 모든 옵션이 생성되는지, 폴리곤 수가 모바일 예산 안인지 확인한다.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_OPTIONS } from '../shared/constants.js';
import { buildAvatar, randomConfig, poseRun, poseIdle } from '../client/src/three/avatarBuilder.js';

const TRI_BUDGET = 3500; // 캐릭터 1명당 삼각형 수 상한 (9명 동시 렌더링 기준)

function stats(avatar) {
  let tris = 0;
  let meshes = 0;
  avatar.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { tris, meshes };
}

const base = Object.fromEntries(Object.keys(AVATAR_OPTIONS).map((k) => [k, 0]));
let worst = { tris: 0 };

// 1) 항목별로 모든 옵션을 하나씩 바꿔 본다 (옵션 개수 확인 포함)
for (const [key, count] of Object.entries(AVATAR_OPTIONS)) {
  if (key !== 'gender') assert.ok(count >= 10, `${key} 옵션은 10가지 이상이어야 함`);
  for (let i = 0; i < count; i++) {
    const a = buildAvatar({ ...base, [key]: i });
    const s = stats(a);
    assert.ok(s.meshes > 10);
    worst = s.tris > worst.tris ? { ...s, key, i } : worst;
  }
}

// 2) 무작위 조합 2000개
for (let n = 0; n < 2000; n++) {
  const cfg = randomConfig(AVATAR_OPTIONS);
  const a = buildAvatar(cfg);
  const s = stats(a);
  assert.ok(s.tris <= TRI_BUDGET, `삼각형 ${s.tris} > ${TRI_BUDGET} (${JSON.stringify(cfg)})`);
  if (s.tris > worst.tris) worst = { ...s, cfg };
  // 서 있을 때 발이 땅(y=0) 아래로 크게 내려가지 않는지
  const box = new THREE.Box3().setFromObject(a);
  assert.ok(box.min.y > -0.05 && box.min.y < 0.1, `발 위치 이상: ${box.min.y}`);
  assert.ok(box.max.y > 2.3 && box.max.y < 3.2, `키 이상: ${box.max.y}`);
}

// 3) 포즈 함수가 오류 없이 동작
const a = buildAvatar(base);
for (let t = 0; t < 20; t += 0.3) {
  poseRun(a, t, 1);
  poseIdle(a, t);
}

// 4) 같은 부품은 지오메트리를 공유한다 (9명이어도 GPU 메모리가 늘지 않음)
const g1 = new Set();
const g2 = new Set();
buildAvatar(base).traverse((o) => o.isMesh && g1.add(o.geometry));
buildAvatar(base).traverse((o) => o.isMesh && g2.add(o.geometry));
assert.deepEqual([...g1].filter((g) => g2.has(g)).length, g1.size, '지오메트리 공유 안 됨');

console.log('최대 삼각형 수:', worst.tris, `(예산 ${TRI_BUDGET}, 9명 합계 최대 ${worst.tris * 9})`);
console.log('AVATAR TEST PASSED');
