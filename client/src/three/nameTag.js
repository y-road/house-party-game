import * as THREE from 'three';

/** 캐릭터 머리 위에 띄우는 닉네임 이름표(스프라이트). highlight면 노란색으로 내 캐릭터를 강조한다. */
export function makeNameTag(text, { highlight = false, width = 3.8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = highlight ? 'rgba(255,226,122,0.95)' : 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.roundRect(4, 6, 248, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#3b3358';
  ctx.font = '700 30px system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(width, width / 4, 1);
  sprite.renderOrder = 10;
  return sprite;
}
