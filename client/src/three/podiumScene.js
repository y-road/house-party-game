import * as THREE from 'three';
import { buildAvatar, poseIdle, toonMat } from './avatarBuilder.js';
import { makeNameTag } from './nameTag.js';

const SKY = '#ffd9ec';
const AVATAR_SCALE = 1.5;
// 가운데 1위, 왼쪽 2위, 오른쪽 3위
const SLOTS = {
  1: { x: 0, h: 2.6, color: '#ffd93d' },
  2: { x: -3.6, h: 1.8, color: '#d5dbe6' },
  3: { x: 3.6, h: 1.2, color: '#e8a56a' },
};

function numberTexture(n, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(59,51,88,0.85)';
  ctx.font = '900 96px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 70);
  return new THREE.CanvasTexture(c);
}

/** 시상대 장면: 1~3위 캐릭터가 단상 위에서 환호한다. 4위 이하는 화면의 목록으로 보여 준다. */
export function createPodiumScene({ canvas }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffe0ef, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-6, 14, 10);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 100);
  camera.position.set(0, 5, 17.5);
  camera.lookAt(0, 2.6, 0);

  // 바닥 + 단상
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.4, 40), toonMat('#fff3a8'));
  floor.position.y = -0.2;
  scene.add(floor);
  const disposables = [floor.geometry];
  const blockGeo = new THREE.BoxGeometry(2.8, 1, 2.8);
  disposables.push(blockGeo);
  const textures = [];
  for (const [rank, s] of Object.entries(SLOTS)) {
    const tex = numberTexture(rank, s.color);
    textures.push(tex);
    const side = toonMat(s.color);
    const front = new THREE.MeshBasicMaterial({ map: tex });
    const block = new THREE.Mesh(blockGeo, [side, side, side, side, front, side]);
    block.scale.y = s.h;
    block.position.set(s.x, s.h / 2, 0);
    scene.add(block);
  }

  // 반짝이 별(가벼운 장식)
  const confetti = [];
  const confettiGeo = new THREE.BoxGeometry(0.16, 0.16, 0.02);
  const confettiMats = ['#ff6b81', '#ffd93d', '#6bcb77', '#4d96ff', '#9b72ff'].map(
    (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }),
  );
  let burstTimer = 0;
  function burst() {
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(confettiGeo, confettiMats[i % confettiMats.length]);
      m.position.set((Math.random() - 0.5) * 12, 8 + Math.random() * 2, (Math.random() - 0.5) * 3);
      m.userData = { vx: (Math.random() - 0.5) * 1.5, vy: -1 - Math.random() * 2, vz: 0, spin: Math.random() * 8, life: 0 };
      scene.add(m);
      confetti.push(m);
    }
  }

  const figures = new Map(); // id → {group, avatar, tag, key, rank}
  function clearFigures() {
    for (const f of figures.values()) {
      scene.remove(f.group);
      f.tag.material.map.dispose();
      f.tag.material.dispose();
    }
    figures.clear();
  }

  /** players: 서버 sync의 players 배열(rank, avatar, nickname 포함) */
  function setPlayers(players) {
    const top = players.filter((p) => p.rank >= 1 && p.rank <= 3 && p.avatar);
    const key = top.map((p) => `${p.id}:${p.rank}:${JSON.stringify(p.avatar)}`).join('|');
    if (key === setPlayers.key) return;
    setPlayers.key = key;
    clearFigures();
    for (const p of top) {
      const slot = SLOTS[p.rank];
      const group = new THREE.Group();
      const avatar = buildAvatar(p.avatar);
      avatar.scale.setScalar(AVATAR_SCALE);
      avatar.rotation.y = 0; // 아바타 정면은 +z 방향이라 카메라(+z)를 바라본다
      group.add(avatar);
      const tag = makeNameTag(p.nickname, { width: 3.6 });
      tag.position.y = 4.7;
      group.add(tag);
      group.position.set(slot.x, slot.h, 0);
      scene.add(group);
      figures.set(p.id, { group, avatar, tag, rank: p.rank, phase: Math.random() * 6 });
    }
    burst();
  }

  const clock = new THREE.Clock();
  let time = 0;
  let raf = 0;
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

    for (const f of figures.values()) {
      poseIdle(f.avatar, time + f.phase);
      const { armL, armR } = f.avatar.userData;
      const wave = Math.sin(time * 8 + f.phase) * 0.35;
      armL.rotation.x = armR.rotation.x = -2.8 + wave; // 두 팔을 번쩍 든다
      const hop = f.rank === 1 ? Math.abs(Math.sin(time * 4 + f.phase)) * 0.35 : Math.abs(Math.sin(time * 3 + f.phase)) * 0.15;
      f.group.position.y = SLOTS[f.rank].h + hop;
    }

    burstTimer += dt;
    if (burstTimer > 2.2 && figures.size) {
      burstTimer = 0;
      burst();
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const m = confetti[i];
      const d = m.userData;
      d.life += dt;
      m.position.x += d.vx * dt;
      m.position.y += d.vy * dt;
      m.rotation.x += d.spin * dt;
      m.rotation.z += d.spin * dt;
      if (m.position.y < 0 || d.life > 5) {
        scene.remove(m);
        confetti.splice(i, 1);
      }
    }
    renderer.render(scene, camera);
  }
  loop();

  function dispose() {
    cancelAnimationFrame(raf);
    clearFigures();
    for (const m of confetti) scene.remove(m);
    disposables.forEach((d) => d.dispose());
    textures.forEach((t) => t.dispose());
    confettiGeo.dispose();
    confettiMats.forEach((m) => m.dispose());
    renderer.dispose();
  }

  return { setPlayers, dispose };
}
