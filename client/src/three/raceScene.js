import * as THREE from 'three';
import { RACE } from '../../../shared/constants.js';
import { buildAvatar, poseRun, poseIdle, toonMat } from './avatarBuilder.js';
import { makeNameTag } from './nameTag.js';

const L = RACE.TRACK_LENGTH;
const LANES = 9;
const LANE_W = 1.7;
export const TRACK_W = LANES * LANE_W;
const SKY = '#9fdcff';
const AVATAR_SCALE = 1.3;
const FINISH_RUNOFF = 5; // 결승선을 지나 더 달려 멈추는 거리

export const laneX = (lane) => (lane - (LANES - 1) / 2) * LANE_W;

const rng = (seed) => {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
};

// ---------- 트랙 ----------
function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 32; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#ffffff' : '#2b2230';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

function bannerTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff7aa8';
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 120, 40);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 76px system-ui, "Apple SD Gothic Neo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  return new THREE.CanvasTexture(c);
}

/** 같은 모양이 반복되는 장식은 InstancedMesh 하나로 그려 드로우콜을 아낀다 */
function instanced(scene, geometry, items) {
  const mesh = new THREE.InstancedMesh(geometry, toonMat('#ffffff'), items.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    dummy.rotation.set(0, it.ry ?? 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

function buildTrack(scene) {
  const rand = rng(11);
  const half = TRACK_W / 2;
  const zStart = -14;
  const zEnd = L + 30;
  const len = zEnd - zStart;
  const cz = (zStart + zEnd) / 2;

  const add = (geometry, color, x, y, z, parent = scene) => {
    const m = new THREE.Mesh(geometry, toonMat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // 잔디 바닥 + 레인(번갈아 약간 다른 색)
  const grass = add(new THREE.PlaneGeometry(500, 500), '#7bd66b', 0, -0.03, cz);
  grass.rotation.x = -Math.PI / 2;
  for (let i = 0; i < LANES; i++) {
    add(new THREE.BoxGeometry(LANE_W, 0.1, len), i % 2 ? '#2f9e9a' : '#34a8a3', laneX(i), 0, cz);
  }
  // 레인 선, 출발선
  for (let j = 0; j <= LANES; j++) {
    add(new THREE.BoxGeometry(0.08, 0.02, len), '#ffffff', (j - LANES / 2) * LANE_W, 0.06, cz);
  }
  add(new THREE.BoxGeometry(TRACK_W, 0.02, 0.35), '#ffffff', 0, 0.07, 0.4);

  // 결승선(체크무늬)
  const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_W, 1.2),
    new THREE.MeshBasicMaterial({ map: checkerTexture() }),
  );
  finish.rotation.x = -Math.PI / 2;
  finish.position.set(0, 0.08, L);
  scene.add(finish);

  // 결승 아치: 돌탑 두 개 + 노란 들보 + 별 + 날개 + 배너
  for (const side of [-1, 1]) {
    const x = side * (half + 1.6);
    add(new THREE.BoxGeometry(1.8, 7, 1.8), '#dcd6cc', x, 3.5, L + 0.6);
    add(new THREE.ConeGeometry(1.5, 2.2, 6), '#9b72ff', x, 8.1, L + 0.6);
    add(new THREE.BoxGeometry(2.0, 0.4, 2.0), '#b8b0a3', x, 0.2, L + 0.6);
  }
  add(new THREE.BoxGeometry(TRACK_W + 5.2, 1.3, 1.1), '#ffd93d', 0, 7.2, L + 0.6);
  const star = add(new THREE.IcosahedronGeometry(1.5, 0), '#ff6b81', 0, 9.2, L + 0.6);
  for (const side of [-1, 1]) {
    const wing = add(new THREE.SphereGeometry(1, 8, 6), '#ffc2e0', side * 2.6, 9.3, L + 0.6);
    wing.scale.set(1.7, 0.7, 0.3);
    wing.rotation.z = side * 0.25;
  }
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 1.9),
    new THREE.MeshBasicMaterial({ map: bannerTexture('FINISH'), transparent: true }),
  );
  banner.position.set(0, 7.2, L + 1.2);
  scene.add(banner);
  const banner2 = banner.clone();
  banner2.rotation.y = Math.PI;
  banner2.position.z = L - 0.0;
  scene.add(banner2);

  // 양쪽 광고판 울타리
  const boardColors = ['#ff9f43', '#ffd93d', '#ffffff', '#ff7aa8'];
  const boards = [];
  for (let z = zStart + 2; z < zEnd; z += 4) {
    for (const side of [-1, 1]) {
      boards.push({ x: side * (half + 0.5), y: 0.5, z, sz: 3.6, color: boardColors[Math.floor(z / 4 + (side > 0 ? 1 : 0)) % 4 & 3] });
    }
  }
  instanced(scene, new THREE.BoxGeometry(0.25, 1, 1), boards);

  // 덤불과 나무
  const bushes = [];
  const trunks = [];
  const crowns = [];
  const leaf = ['#58c25a', '#6fd36c', '#4fb86a'];
  for (let z = zStart; z < zEnd; z += 5) {
    for (const side of [-1, 1]) {
      const bx = side * (half + 2.2 + rand() * 2.5);
      bushes.push({ x: bx, y: 0.5, z: z + rand() * 3, sx: 1.1, sy: 0.8, sz: 1.1, color: leaf[Math.floor(rand() * 3)] });
      if (rand() < 0.6) {
        const tx = side * (half + 6 + rand() * 6);
        const tz = z + rand() * 4;
        const s = 0.9 + rand() * 0.6;
        trunks.push({ x: tx, y: 1.0 * s, z: tz, sx: s, sy: s, sz: s, color: '#9b6b43' });
        crowns.push({ x: tx, y: 3.0 * s, z: tz, sx: s, sy: s, sz: s, color: leaf[Math.floor(rand() * 3)] });
      }
    }
  }
  instanced(scene, new THREE.SphereGeometry(1, 8, 6), bushes);
  instanced(scene, new THREE.CylinderGeometry(0.25, 0.32, 2, 6), trunks);
  instanced(scene, new THREE.ConeGeometry(1.6, 3.6, 7), crowns);

  // 구름
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    const c = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      add(new THREE.SphereGeometry(2.6 - j * 0.5, 8, 6), '#ffffff', (j - 1) * 2.8, 0, 0, c);
    }
    c.position.set(side * (22 + rand() * 25), 16 + rand() * 8, (i / 9) * (L + 60) - 20);
    scene.add(c);
    clouds.push(c);
  }

  return { star, clouds };
}

// ---------- 장면 ----------
/**
 * 레이스 장면. mode 'player'는 내 캐릭터 뒤를 따라가는 3인칭 카메라(세로 폰 화면용),
 * 'admin'은 전체 레인을 비스듬히 보여 주며 선두를 따라가는 조망 카메라.
 */
export function createRaceScene({ canvas, mode = 'player', selfId = null }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mode === 'admin' ? 1.5 : 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 70, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe9ff, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-12, 24, -8);
  scene.add(sun);

  const world = buildTrack(scene);
  const camera = new THREE.PerspectiveCamera(mode === 'player' ? 64 : 48, 1, 0.5, 400);
  const lookAtPoint = new THREE.Vector3();
  const camGoal = new THREE.Vector3();
  const lookGoal = new THREE.Vector3();
  let cameraReady = false;

  // ---------- 러너 ----------
  const runners = new Map();
  const confetti = [];
  const confettiGeo = new THREE.BoxGeometry(0.16, 0.16, 0.02);
  const confettiMats = ['#ff6b81', '#ffd93d', '#6bcb77', '#4d96ff', '#9b72ff'].map(
    (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }),
  );

  function createRunner(p, lane) {
    const group = new THREE.Group();
    const avatar = buildAvatar(p.avatar);
    avatar.scale.setScalar(AVATAR_SCALE);
    group.add(avatar);
    const tag = makeNameTag(p.nickname, { highlight: p.id === selfId, width: mode === 'admin' ? 3.6 : 3.0 });
    tag.position.y = 4.4;
    group.add(tag);
    const x = laneX(lane);
    group.position.set(x, 0, 0);
    scene.add(group);
    return {
      id: p.id, lane, x, group, avatar, tag,
      key: JSON.stringify(p.avatar) + p.nickname,
      z: 0, tz: 0, v: 0,
      finished: false, rank: null, phase: Math.random() * 6, cheer: 0,
    };
  }

  function removeRunner(r) {
    scene.remove(r.group);
    r.tag.material.map.dispose();
    r.tag.material.dispose();
    runners.delete(r.id);
  }

  function markFinished(r, rank, instant = false) {
    if (r.finished) return;
    r.finished = true;
    r.rank = rank;
    r.tz = L + FINISH_RUNOFF;
    r.v = 0;
    if (instant) r.z = r.tz;
    else spawnConfetti(r.x, L + 0.6);
  }

  function spawnConfetti(x, z) {
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(confettiGeo, confettiMats[i % confettiMats.length]);
      m.position.set(x, 3, z);
      m.userData = {
        vx: (Math.random() - 0.5) * 5,
        vy: 4 + Math.random() * 4,
        vz: 1 + Math.random() * 3,
        spin: (Math.random() - 0.5) * 12,
        life: 0,
      };
      scene.add(m);
      confetti.push(m);
    }
  }

  /** 서버의 players(레인 = 목록 순서)로 러너를 만들고 지운다. 재접속하면 distance·rank로 위치를 복구한다. */
  function setPlayers(players) {
    const alive = new Set();
    players.forEach((p, lane) => {
      if (!p.avatar) return;
      alive.add(p.id);
      let r = runners.get(p.id);
      const key = JSON.stringify(p.avatar) + p.nickname;
      if (r && r.key !== key) {
        removeRunner(r);
        r = null;
      }
      const fresh = !r;
      if (!r) {
        r = createRunner(p, lane);
        runners.set(p.id, r);
      }
      const d = Math.min(p.distance ?? 0, L);
      if (!r.finished) {
        if (p.rank !== null && p.finishTime !== null && d >= L - 0.01) markFinished(r, p.rank, true);
        else {
          r.tz = d;
          if (fresh) r.z = d;
        }
      }
    });
    for (const r of [...runners.values()]) if (!alive.has(r.id)) removeRunner(r);
  }

  /** 20Hz 위치 방송: { t, p: [{ id, d, v, r }] } */
  function applyPositions(data) {
    for (const it of data.p) {
      const r = runners.get(it.id);
      if (!r || r.finished) continue;
      r.tz = it.d;
      r.v = it.v;
      if (it.r !== null) markFinished(r, it.r);
    }
  }

  function finish(id, rank) {
    const r = runners.get(id);
    if (r) markFinished(r, rank);
  }

  // ---------- 프레임 ----------
  const clock = new THREE.Clock();
  let time = 0;
  let raf = 0;

  function updateRunner(r, dt) {
    const k = 1 - Math.exp(-12 * dt);
    const prevZ = r.z;
    r.z += (r.tz - r.z) * k;
    const moveSpeed = (r.z - prevZ) / Math.max(dt, 1e-4);
    const speed = r.finished ? moveSpeed : Math.max(r.v, moveSpeed);

    r.phase += dt * (5 + speed * 1.5);
    let hop = 0;
    if (speed > 0.5) {
      poseRun(r.avatar, r.phase, Math.min(1, speed / 4));
    } else if (r.finished && r.rank !== null) {
      // 결승선을 넘고 멈추면 만세
      r.cheer += dt;
      poseIdle(r.avatar, time);
      const { armL, armR } = r.avatar.userData;
      armL.rotation.x = armR.rotation.x = -2.8 + Math.sin(r.cheer * 10) * 0.3;
      hop = Math.abs(Math.sin(r.cheer * 6)) * 0.25;
    } else {
      poseIdle(r.avatar, time + r.phase);
    }
    r.group.position.set(r.x, hop, r.z);
  }

  function updateCamera(dt) {
    if (mode === 'player') {
      const me = runners.get(selfId) ?? [...runners.values()][0];
      if (!me) return;
      const cx = me.x;
      camGoal.set(cx, 5.2, me.z - 10);
      lookGoal.set(cx, 1.7, me.z + 10);
      camera.fov += ((64 + Math.min(me.v, 9) * 0.9) - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    } else {
      // 선두를 따라가는 조망: 왼쪽 뒤 위에서 전체 레인을 내려다본다
      let lead = 0;
      for (const r of runners.values()) lead = Math.max(lead, r.z);
      const f = Math.min(lead, L + 2) - 1;
      camGoal.set(-14, 12.5, f - 15);
      lookGoal.set(0.5, 0.5, f + 6);
    }
    const kk = cameraReady ? Math.min(1, dt * (mode === 'player' ? 9 : 3)) : 1;
    camera.position.lerp(camGoal, kk);
    lookAtPoint.lerp(lookGoal, kk);
    camera.lookAt(lookAtPoint);
    cameraReady = true;
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    time += dt;
    resize();

    for (const r of runners.values()) updateRunner(r, dt);
    world.star.rotation.y += dt * 1.4;
    for (const c of world.clouds) c.position.x += Math.sin(time * 0.1 + c.position.z) * dt * 0.4;

    for (let i = confetti.length - 1; i >= 0; i--) {
      const m = confetti[i];
      const d = m.userData;
      d.life += dt;
      d.vy -= 9 * dt;
      m.position.x += d.vx * dt;
      m.position.y += d.vy * dt;
      m.position.z += d.vz * dt;
      m.rotation.x += d.spin * dt;
      m.rotation.z += d.spin * dt;
      if (d.life > 1.6 || m.position.y < 0) {
        scene.remove(m);
        confetti.splice(i, 1);
      }
    }

    updateCamera(dt);
    renderer.render(scene, camera);
  }
  loop();

  function dispose() {
    cancelAnimationFrame(raf);
    for (const r of [...runners.values()]) removeRunner(r);
    for (const m of confetti) scene.remove(m);
    confettiGeo.dispose();
    confettiMats.forEach((m) => m.dispose());
    renderer.dispose();
  }

  return { setPlayers, applyPositions, finish, dispose };
}
