import * as THREE from 'three';
import { buildAvatar, poseIdle } from './avatarBuilder.js';

/** 커스터마이징·대기 화면용 캐릭터 미리보기. 드래그로 돌려볼 수 있다. */
export function createAvatarPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.55, 7.4);
  camera.lookAt(0, 1.25, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfd9ff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(3, 6, 5);
  scene.add(sun);

  // 발밑 받침대
  const stage = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.2, 0.12, 24),
    new THREE.MeshToonMaterial({ color: '#ffffff' }),
  );
  stage.position.y = -0.06;
  scene.add(stage);

  let avatar = null;
  let yaw = -0.35;
  let dragging = false;
  let lastX = 0;
  let raf = 0;
  const clock = new THREE.Clock();

  function setAvatar(config) {
    if (avatar) scene.remove(avatar); // 지오메트리·재질은 공유 캐시라 해제하지 않는다
    avatar = buildAvatar(config);
    scene.add(avatar);
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // 화면이 좁고 길수록 캐릭터가 잘리지 않도록 뒤로 물러난다
      camera.position.z = camera.aspect < 0.8 ? 7.4 / Math.max(camera.aspect / 0.8, 0.6) : 7.4;
      camera.updateProjectionMatrix();
    }
  }

  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  };
  const onUp = () => (dragging = false);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  function loop() {
    raf = requestAnimationFrame(loop);
    resize();
    const t = clock.getElapsedTime();
    if (avatar) {
      if (!dragging) yaw += 0.004;
      avatar.rotation.y = yaw;
      poseIdle(avatar, t);
    }
    renderer.render(scene, camera);
  }
  loop();

  function dispose() {
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    stage.geometry.dispose();
    stage.material.dispose();
    renderer.dispose();
  }

  return { setAvatar, dispose };
}
