import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LOBBY, ACTION } from '../../../shared/constants.js';
import { buildAvatar, poseRun, poseIdle, toonMat } from './avatarBuilder.js';
import { makeNameTag } from './nameTag.js';

const R = LOBBY.ISLAND_RADIUS;
const SKY = '#bfe6ff';
const AVATAR_SCALE = 1.4; // 멀리서 내려다봐도 보이도록 캐릭터를 크게 그린다
const JUMP_SECONDS = 0.6;
const JUMP_HEIGHT = 1.6;
const ATTACK_SECONDS = 0.55;

const rng = (seed) => {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
};

// ---------- 세계 ----------
function buildWorld(scene) {
  const add = (geometry, color, y, parent = scene) => {
    const m = new THREE.Mesh(geometry, toonMat(color));
    m.position.y = y;
    parent.add(m);
    return m;
  };

  // 바다 + 파도 거품
  const water = add(new THREE.CircleGeometry(400, 32), '#74c9ff', -0.9);
  water.rotation.x = -Math.PI / 2;
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(R + 1.6, R + 3.4, 40),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = -0.85;
  scene.add(foam);

  // 섬 (잔디 / 모래 / 바위 아랫면)
  add(new THREE.CylinderGeometry(R + 0.2, R + 0.5, 1, 28), '#9be36b', -0.5);
  add(new THREE.CylinderGeometry(R + 1.6, R + 2.0, 1, 28), '#f6e2a8', -0.56);
  add(new THREE.CylinderGeometry(R + 1.6, R * 0.5, 3.2, 20), '#b08a6a', -2.5);

  // 중앙 광장 + 분수
  add(new THREE.CylinderGeometry(4.2, 4.2, 0.05, 28), '#d9f6aa', 0.02);
  add(new THREE.CylinderGeometry(2.0, 2.2, 0.5, 20), '#ffffff', 0.25);
  add(new THREE.CylinderGeometry(1.7, 1.7, 0.1, 20), '#8fdcff', 0.52);
  add(new THREE.CylinderGeometry(0.18, 0.26, 1.5, 8), '#ffffff', 0.95);
  const star = add(new THREE.IcosahedronGeometry(0.45, 0), '#ffd93d', 2.0);

  // 가장자리 나무
  const rand = rng(7);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rand() * 0.3;
    const r = R - 0.4 + rand() * 0.9;
    const tree = new THREE.Group();
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    tree.scale.setScalar(0.85 + rand() * 0.4);
    add(new THREE.CylinderGeometry(0.18, 0.24, 1.1, 6), '#9b6b43', 0.55, tree);
    add(new THREE.ConeGeometry(1.0, 1.7, 7), '#58c25a', 1.9, tree);
    add(new THREE.ConeGeometry(0.75, 1.4, 7), '#6fd36c', 2.7, tree);
    scene.add(tree);
  }

  // 꽃과 바위
  const flowerColors = ['#ff7aa8', '#ffd93d', '#ffffff', '#b28dff'];
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 5 + rand() * (R - 6.5);
    const f = add(new THREE.SphereGeometry(0.14, 6, 4), flowerColors[i % 4], 0.13);
    f.position.x = Math.cos(a) * r;
    f.position.z = Math.sin(a) * r;
  }
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const rock = add(new THREE.IcosahedronGeometry(0.45 + rand() * 0.25, 0), '#c8c8d4', 0.2);
    rock.position.x = Math.cos(a) * (R - 1.2);
    rock.position.z = Math.sin(a) * (R - 1.2);
  }

  // 구름 (천천히 흐른다)
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      add(new THREE.SphereGeometry(2.4 - j * 0.4, 8, 6), '#ffffff', 0, c).position.x = (j - 1) * 2.6;
    }
    const a = (i / 6) * Math.PI * 2;
    c.position.set(Math.cos(a) * 32, 13 + (i % 3) * 3, Math.sin(a) * 32);
    c.userData.angle = a;
    c.userData.radius = 32;
    scene.add(c);
    clouds.push(c);
  }

  return { star, clouds };
}

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * 섬 장면. mode 'player'는 고정 카메라(섬 전체를 비스듬히 내려다봄),
 * 'admin'은 마우스로 돌려 볼 수 있는 오빗 카메라.
 */
export function createIslandScene({ canvas, mode = 'player', selfId = null }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mode === 'admin' ? 1.5 : 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 120, 300);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfe0ff, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(10, 22, 14);
  scene.add(sun);

  const world = buildWorld(scene);

  const VFOV = 42;
  const ELEVATION = (52 * Math.PI) / 180;
  const target = new THREE.Vector3(0, 0.5, 0.5);
  const camera = new THREE.PerspectiveCamera(VFOV, 1, 0.5, 600);

  /** 가로 폭 기준으로 섬 전체가 들어오는 거리 */
  function fitDistance(aspect) {
    const halfW = R + 1.4; // 바깥 모래·거품이 살짝 잘려도 섬 본체가 최대한 크게 보이게
    const byWidth = halfW / (Math.tan((VFOV * Math.PI) / 360) * aspect);
    const byHeight = ((R + 3.5) * Math.sin(ELEVATION) + 6) / Math.tan((VFOV * Math.PI) / 360);
    return Math.max(byWidth, byHeight);
  }
  function placeCamera(aspect) {
    const d = fitDistance(aspect);
    camera.position.set(target.x, target.y + Math.sin(ELEVATION) * d, target.z + Math.cos(ELEVATION) * d);
    camera.lookAt(target);
  }

  let controls = null;
  if (mode === 'admin') {
    controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 8;
    controls.maxDistance = 90;
    controls.enablePan = false;
  }

  // ---------- 캐릭터 ----------
  const entities = new Map();
  const tagCache = new Map();

  function createEntity(p) {
    const group = new THREE.Group();
    const avatar = buildAvatar(p.avatar);
    avatar.scale.setScalar(AVATAR_SCALE);
    group.add(avatar);

    const tag = makeNameTag(p.nickname, { highlight: p.id === selfId });
    tag.position.y = 4.7;
    group.add(tag);
    tagCache.set(p.id, tag);

    if (p.id === selfId) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.1, 24),
        new THREE.MeshBasicMaterial({ color: '#ffd93d', side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      group.add(ring);
    }

    group.position.set(p.x, 0, p.z);
    scene.add(group);
    return {
      id: p.id,
      key: JSON.stringify(p.avatar) + p.nickname,
      group, avatar, tag,
      px: p.x, pz: p.z, tx: p.x, tz: p.z,
      yaw: 0, phase: Math.random() * 6, moveAmt: 0,
      jump: -1, attack: -1,
    };
  }

  function removeEntity(e) {
    scene.remove(e.group);
    e.tag.material.map.dispose();
    e.tag.material.dispose();
    entities.delete(e.id);
    tagCache.delete(e.id);
  }

  /** 서버 상태(players)를 받아 캐릭터를 만들고, 지우고, 목표 위치를 갱신한다. 커스터마이징 전(avatar 없음)이면 보이지 않는다. */
  function setPlayers(players) {
    const alive = new Set();
    for (const p of players) {
      if (!p.avatar) continue;
      alive.add(p.id);
      let e = entities.get(p.id);
      const key = JSON.stringify(p.avatar) + p.nickname;
      if (e && e.key !== key) {
        removeEntity(e);
        e = null;
      }
      if (!e) {
        e = createEntity(p);
        entities.set(p.id, e);
      }
      e.tx = p.x;
      e.tz = p.z;
    }
    for (const e of [...entities.values()]) if (!alive.has(e.id)) removeEntity(e);
  }

  function applyPositions(list) {
    for (const it of list) {
      const e = entities.get(it.id);
      if (e) {
        e.tx = it.x;
        e.tz = it.z;
      }
    }
  }

  function playAction(id, type) {
    const e = entities.get(id);
    if (!e) return;
    if (type === ACTION.JUMP) e.jump = 0;
    else if (type === ACTION.ATTACK) e.attack = 0;
  }

  // ---------- 터치 위치 → 섬 좌표 ----------
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(ground, hit) ? { x: hit.x, z: hit.z } : null;
  }

  // 터치한 곳에 번지는 동그라미
  const ripples = [];
  function showRipple(x, z) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.75, 20),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.08, z);
    m.renderOrder = 5;
    scene.add(m);
    ripples.push({ m, t: 0 });
  }

  // ---------- 프레임 ----------
  const clock = new THREE.Clock();
  let time = 0;
  let raf = 0;

  function updateEntity(e, dt) {
    const k = 1 - Math.exp(-14 * dt);
    const nx = e.px + (e.tx - e.px) * k;
    const nz = e.pz + (e.tz - e.pz) * k;
    const dx = nx - e.px;
    const dz = nz - e.pz;
    const speed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
    e.px = nx;
    e.pz = nz;

    e.moveAmt += ((speed > 0.8 ? 1 : 0) - e.moveAmt) * Math.min(1, dt * 10);
    if (speed > 0.8) {
      const want = Math.atan2(dx, dz);
      e.yaw += angleDiff(want, e.yaw) * Math.min(1, dt * 12);
    }
    e.phase += dt * (7 + speed * 0.8);

    if (e.moveAmt > 0.1) poseRun(e.avatar, e.phase, Math.min(1, e.moveAmt));
    else poseIdle(e.avatar, time + e.phase);

    const { armL, armR, legL, legR, body } = e.avatar.userData;
    let y = 0;

    if (e.jump >= 0) {
      e.jump += dt / JUMP_SECONDS;
      if (e.jump >= 1) e.jump = -1;
      else {
        const t = e.jump;
        y = 4 * JUMP_HEIGHT * t * (1 - t);
        armL.rotation.x = armR.rotation.x = -2.6 * Math.sin(Math.PI * t);
        legL.rotation.x = legR.rotation.x = 0.6 * Math.sin(Math.PI * t);
      }
    }

    if (e.attack >= 0) {
      e.attack += dt / ATTACK_SECONDS;
      if (e.attack >= 1) {
        e.attack = -1;
        body.rotation.y = 0;
      } else {
        const t = e.attack;
        // 오른팔을 번쩍 들었다가 두 번 휘두른다
        armR.rotation.x = -2.2 + Math.sin(t * Math.PI * 4) * 0.9;
        armR.rotation.z = 0.5;
        body.rotation.y = Math.sin(t * Math.PI * 4) * 0.35;
        body.rotation.x = 0.2;
      }
    } else {
      body.rotation.y = 0;
    }

    e.group.position.set(e.px, y, e.pz);
    e.avatar.rotation.y = e.yaw;
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
      if (mode === 'player') placeCamera(camera.aspect);
      else if (!controls._placed) {
        placeCamera(camera.aspect);
        controls.update();
        controls._placed = true;
      }
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    time += dt;
    resize();

    for (const e of entities.values()) updateEntity(e, dt);
    world.star.rotation.y += dt * 1.2;
    world.star.position.y = 2.0 + Math.sin(time * 2) * 0.12;
    for (const c of world.clouds) {
      c.userData.angle += dt * 0.012;
      c.position.x = Math.cos(c.userData.angle) * c.userData.radius;
      c.position.z = Math.sin(c.userData.angle) * c.userData.radius;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.t += dt / 0.5;
      r.m.scale.setScalar(1 + r.t * 1.6);
      r.m.material.opacity = Math.max(0, 0.9 * (1 - r.t));
      if (r.t >= 1) {
        scene.remove(r.m);
        r.m.geometry.dispose();
        r.m.material.dispose();
        ripples.splice(i, 1);
      }
    }

    controls?.update();
    renderer.render(scene, camera);
  }
  loop();

  function dispose() {
    cancelAnimationFrame(raf);
    controls?.dispose();
    for (const e of [...entities.values()]) removeEntity(e);
    for (const r of ripples) {
      r.m.geometry.dispose();
      r.m.material.dispose();
    }
    renderer.dispose();
  }

  return { setPlayers, applyPositions, playAction, pick, showRipple, dispose };
}
