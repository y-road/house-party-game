import * as THREE from 'three';

// 프리미티브(구·원통·박스) 조합으로 만드는 로우폴리 SD 캐릭터.
// 지오메트리와 재질은 전부 캐시해서 9명이 같은 부품을 공유한다 (모바일 최적화).

// ---------- 팔레트 ----------
export const SKIN = [
  '#ffe8dc', '#ffdcc8', '#fbcfb1', '#f3bf9a', '#e8ab82', '#d99a70',
  '#c48660', '#a86f4c', '#8a5a3c', '#6f4630', '#f6d7e0', '#d8f0d0',
];
export const HAIR = [
  '#2b2230', '#4a3126', '#7a4a2a', '#b5773a', '#e0b04a', '#f3d98b',
  '#d94f5c', '#f08ab0', '#8b6bd6', '#4ea1e6', '#4fc3a1', '#e8e8f0',
];
const CLOTH = [
  '#ff6b81', '#ff9f43', '#ffd93d', '#6bcb77', '#4d96ff', '#9b72ff',
  '#ff8fd0', '#ffffff', '#3b3b4f', '#40c4c4', '#c9a27e', '#f4a6a6',
];
const FACE_CHIP = [
  '#ffe6a7', '#ffd9a0', '#ffe0b5', '#fff0b8', '#c9ecff', '#bfe3ff',
  '#d4f0ff', '#cfe8ff', '#e2d6ff', '#dccfff', '#ecdfff', '#e6d9ff',
];

const FACE_SHAPES = [
  [1, 1, 1], // 동글
  [1.12, 0.92, 1], // 넓적
  [0.95, 1.1, 0.95], // 갸름
  [1.06, 1, 1.06], // 통통
];

const NAMES = {
  hair: ['짧은머리', '단발', '긴머리', '양갈래', '올림머리', '뾰족머리'],
  face: ['콩눈', '반짝눈', '졸린눈'],
  top: ['반팔', '긴팔', '후드', '점퍼'],
  bottom: ['반바지', '긴바지', '치마'],
  shoes: ['운동화', '부츠', '둥근신'],
};
const FACE_SHAPE_NAMES = ['동글', '넓적', '갸름', '통통'];

export const CATEGORIES = [
  { key: 'gender', label: '성별' },
  { key: 'hair', label: '헤어' },
  { key: 'skin', label: '피부' },
  { key: 'face', label: '얼굴' },
  { key: 'top', label: '상의' },
  { key: 'bottom', label: '하의' },
  { key: 'shoes', label: '신발' },
];

export function chipColor(cat, i) {
  switch (cat) {
    case 'hair': return HAIR[i];
    case 'skin': return SKIN[i];
    case 'face': return FACE_CHIP[i];
    case 'top': return CLOTH[i];
    case 'bottom': return CLOTH[(i + 5) % 12];
    case 'shoes': return CLOTH[(i + 3) % 12];
    default: return null;
  }
}

export function optionLabel(cat, i) {
  switch (cat) {
    case 'gender': return i === 0 ? '남자' : '여자';
    case 'hair': return NAMES.hair[i % 6];
    case 'skin': return `피부 ${i + 1}`;
    case 'face': return `${FACE_SHAPE_NAMES[i % 4]}·${NAMES.face[Math.floor(i / 4)]}`;
    case 'top': return NAMES.top[i % 4];
    case 'bottom': return NAMES.bottom[i % 3];
    case 'shoes': return NAMES.shoes[i % 3];
    default: return '';
  }
}

// ---------- 캐시 ----------
let gradientMap = null;
function toonGradient() {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

const materials = new Map();
function mat(color) {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    materials.set(color, m);
  }
  return m;
}

/** 섬 장식 등 다른 장면에서도 같은 툰 재질을 쓰도록 내보낸다 */
export const toonMat = (color) => mat(color);

const geometries = new Map();
function geo(key, make) {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
}
const sphere = (r, w = 10, h = 7) => geo(`s${r}_${w}_${h}`, () => new THREE.SphereGeometry(r, w, h));
const cyl = (rt, rb, h, seg = 8) => geo(`c${rt}_${rb}_${h}_${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const box = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const cone = (r, h, seg = 6) => geo(`k${r}_${h}_${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const hairCap = () => geo('cap', () => new THREE.SphereGeometry(0.58, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42));
const smileArc = () => geo('smile', () => new THREE.TorusGeometry(0.08, 0.022, 5, 10, Math.PI));

function part(parent, geometry, color, o = {}) {
  const m = new THREE.Mesh(geometry, mat(color));
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  parent.add(m);
  return m;
}

const group = (parent, x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

const INK = '#2b2230';

// ---------- 빌더 ----------
/** 설정({gender, hair, skin, face, top, bottom, shoes})으로 캐릭터를 만든다. 정면은 +Z. */
export function buildAvatar(cfg) {
  const girl = cfg.gender === 1;
  const skin = SKIN[cfg.skin];
  const topColor = chipColor('top', cfg.top);
  const bottomColor = chipColor('bottom', cfg.bottom);
  const shoeColor = chipColor('shoes', cfg.shoes);
  const topStyle = cfg.top % 4;
  const bottomStyle = cfg.bottom % 3;
  const shoeStyle = cfg.shoes % 3;

  const root = new THREE.Group();
  const body = group(root);
  const torsoR = girl ? 0.27 : 0.31;

  // 몸통
  part(body, cyl(torsoR * 0.9, torsoR * 1.08, 0.6), topColor, { y: 1.0 });
  if (topStyle === 2) part(body, sphere(0.2, 8, 6), topColor, { y: 1.3, z: -0.22, sx: 1.4, sy: 0.8, sz: 0.8 });
  if (topStyle === 3) {
    part(body, cyl(0.2, 0.24, 0.1), '#ffffff', { y: 1.32 });
    part(body, box(0.06, 0.5, 0.02), '#ffffff', { y: 1.0, z: torsoR });
  }
  if (bottomStyle === 2) part(body, cyl(0.3, 0.47, 0.34), bottomColor, { y: 0.72 });

  // 다리 + 신발
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = group(body, side * 0.16, 0.7, 0);
    if (bottomStyle === 2) {
      part(leg, cyl(0.1, 0.095, 0.5), skin, { y: -0.25 });
    } else {
      const upper = bottomStyle === 1 ? 0.5 : 0.24;
      part(leg, cyl(0.115, 0.1, upper), bottomColor, { y: -upper / 2 });
      if (upper < 0.5) part(leg, cyl(0.1, 0.095, 0.5 - upper), skin, { y: -(upper + (0.5 - upper) / 2) });
    }
    if (shoeStyle === 0) {
      part(leg, box(0.24, 0.16, 0.36), shoeColor, { y: -0.62, z: 0.06 });
    } else if (shoeStyle === 1) {
      part(leg, cyl(0.14, 0.15, 0.3), shoeColor, { y: -0.44 });
      part(leg, box(0.26, 0.14, 0.38), shoeColor, { y: -0.63, z: 0.05 });
    } else {
      part(leg, sphere(0.2, 8, 6), shoeColor, { y: -0.57, z: 0.05, sx: 0.85, sy: 0.65, sz: 1.25 });
    }
    legs.push(leg);
  }

  // 팔
  const arms = [];
  const longSleeve = topStyle !== 0;
  for (const side of [-1, 1]) {
    const arm = group(body, side * (torsoR + 0.12), 1.22, 0);
    if (longSleeve) {
      part(arm, cyl(0.095, 0.085, 0.42), topColor, { y: -0.21 });
    } else {
      part(arm, cyl(0.1, 0.095, 0.2), topColor, { y: -0.1 });
      part(arm, cyl(0.085, 0.08, 0.22), skin, { y: -0.31 });
    }
    part(arm, sphere(0.1, 8, 6), skin, { y: -0.45 });
    arm.rotation.z = side * 0.15;
    arms.push(arm);
  }

  // 머리
  const head = group(body, 0, 1.85, 0);
  const [sx, sy, sz] = FACE_SHAPES[cfg.face % 4];
  const expr = Math.floor(cfg.face / 4);
  part(head, sphere(0.55, 14, 10), skin, { sx, sy, sz });
  const faceZ = (x, y) =>
    sz * 0.55 * Math.sqrt(Math.max(0, 1 - (x / (sx * 0.55)) ** 2 - (y / (sy * 0.55)) ** 2));

  for (const side of [-1, 1]) {
    const x = side * 0.2 * sx;
    const y = -0.02;
    const z = faceZ(x, y);
    if (expr === 0) {
      part(head, sphere(0.065, 8, 6), INK, { x, y, z });
    } else if (expr === 1) {
      part(head, sphere(0.1, 8, 6), INK, { x, y, z: z - 0.01, sz: 0.6 });
      part(head, sphere(0.035, 6, 4), '#ffffff', { x: x + 0.03, y: y + 0.04, z: z + 0.03 });
    } else {
      part(head, box(0.17, 0.035, 0.03), INK, { x, y, z, rz: side * 0.15 });
    }
  }

  const my = -0.2;
  const mz = faceZ(0, my);
  if (expr === 0) part(head, box(0.1, 0.03, 0.03), '#c46a6a', { y: my, z: mz });
  else if (expr === 1) part(head, sphere(0.045, 6, 4), '#8b2f3a', { y: my, z: mz, sy: 0.8, sz: 0.6 });
  else part(head, smileArc(), '#c46a6a', { y: my + 0.05, z: mz, rz: Math.PI });

  if (girl || expr === 1) {
    for (const side of [-1, 1]) {
      const x = side * 0.33 * sx;
      const y = -0.14;
      part(head, sphere(0.07, 6, 4), '#ff9eb5', { x, y, z: faceZ(x, y) - 0.01, sz: 0.4 });
    }
  }

  addHair(head, cfg.hair % 6, HAIR[cfg.hair], sx, sy, sz, faceZ);

  root.userData = { body, head, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1] };
  return root;
}

function addHair(head, style, color, sx, sy, sz, faceZ) {
  part(head, hairCap(), color, { sx: sx * 1.03, sy: sy * 1.03, sz: sz * 1.03 });
  part(head, box(0.62 * sx, 0.11, 0.1), color, { y: 0.19, z: faceZ(0, 0.19) - 0.02 });

  switch (style) {
    case 1: // 단발
      part(head, sphere(0.6, 10, 8), color, { y: -0.05, z: -0.08, sx: sx * 1.02, sy: 0.8, sz: 0.9 });
      break;
    case 2: // 긴머리
      part(head, sphere(0.6, 10, 8), color, { y: -0.5, z: -0.3, sx: 0.95, sy: 1.35, sz: 0.45 });
      part(head, sphere(0.6, 10, 8), color, { y: -0.05, z: -0.08, sx: sx * 1.02, sy: 0.8, sz: 0.9 });
      break;
    case 3: // 양갈래
      for (const side of [-1, 1]) {
        part(head, sphere(0.16, 8, 6), color, { x: side * 0.58 * sx, y: 0.1, z: -0.1 });
        part(head, cone(0.17, 0.7), color, { x: side * 0.62 * sx, y: -0.3, z: -0.1, rx: Math.PI });
      }
      break;
    case 4: // 올림머리
      part(head, sphere(0.22, 8, 6), color, { y: 0.62 * sy + 0.05, z: -0.05 });
      break;
    case 5: // 뾰족머리
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        part(head, cone(0.12, 0.3, 5), color, {
          x: Math.cos(a) * 0.32 * sx,
          y: 0.5 * sy,
          z: Math.sin(a) * 0.32 * sz,
          rz: -Math.cos(a) * 0.6,
          rx: Math.sin(a) * 0.6,
        });
      }
      part(head, cone(0.13, 0.32, 5), color, { y: 0.58 * sy });
      break;
    default: // 짧은머리: 모자 모양 + 앞머리만
      break;
  }
}

// ---------- 포즈 (레이스·섬 이동에서 재사용) ----------
/** 달리기: phase는 시간에 따라 증가하는 값, intensity는 0~1 */
export function poseRun(avatar, phase, intensity = 1) {
  const { body, armL, armR, legL, legR, head } = avatar.userData;
  const s = Math.sin(phase);
  legL.rotation.x = s * 0.9 * intensity;
  legR.rotation.x = -s * 0.9 * intensity;
  armL.rotation.x = -s * 1.0 * intensity;
  armR.rotation.x = s * 1.0 * intensity;
  body.rotation.x = 0.14 * intensity;
  body.position.y = Math.abs(Math.cos(phase)) * 0.07 * intensity;
  head.rotation.x = -0.1 * intensity;
}

/** 서 있기: 살짝 숨쉬는 동작 */
export function poseIdle(avatar, t) {
  const { body, armL, armR, legL, legR, head } = avatar.userData;
  legL.rotation.x = legR.rotation.x = 0;
  armL.rotation.x = armR.rotation.x = 0;
  body.rotation.x = 0;
  body.position.y = Math.sin(t * 2.2) * 0.015;
  head.rotation.x = 0;
  head.rotation.z = Math.sin(t * 1.3) * 0.03;
}

export function randomConfig(options) {
  const cfg = {};
  for (const [key, count] of Object.entries(options)) cfg[key] = Math.floor(Math.random() * count);
  return cfg;
}
