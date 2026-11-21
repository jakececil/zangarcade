import * as THREE from './arcade/vendor/three.module.js';
import { loadCartridgeAsset } from './arcade/cartridge-assets.js';
import { createCartridgeDrums } from './arcade/cartridge-drums.js';
import { configureCartridgeKey, createCartridgeReflections, enableCartridgeShadows } from './arcade/cartridge-lighting.js';

export function createShelfCartridgeView(canvas, { isPaused, reducedMotion }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0d0e');
  scene.environmentIntensity = .63;
  const stage = new THREE.Group();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10);
  camera.position.z = 2;
  const fill = new THREE.HemisphereLight('#fff4e2', '#a09baa', 2.15);
  const key = new THREE.DirectionalLight('#fff5df', 1.65);
  configureCartridgeKey(key);
  const studioKeyPosition = key.position.clone();
  const rim = new THREE.DirectionalLight('#c3dcff', .84);
  rim.position.set(.9, .15, -.75);
  scene.add(stage, fill, key, rim);

  let active = false;
  let visible = false;
  let queued = 0;
  let request = 0;
  let bounds;
  let drag;
  let yaw = 0;
  let pitch = 0;
  let phase = 0;
  let lastTime = 0;
  let reflections;
  let drums;
  const ray = new THREE.Raycaster();

  function invalidate() {
    if (active && !queued) queued = requestAnimationFrame(draw);
  }

  function draw(now) {
    queued = 0;
    if (!active) return;
    const animate = visible && !document.hidden && !reducedMotion.matches && !isPaused() && !drag;
    if (animate && lastTime) phase += Math.min(now - lastTime, 40) * .001;
    lastTime = animate ? now : 0;
    const drumDelay = drums?.update(now, animate);
    stage.rotation.set(pitch - .085, yaw + Math.sin(phase * 1.05) * .29 - .21, 0);
    stage.position.y = Math.sin(phase * 1.42) * bounds.y * .036;
    renderer.render(scene, camera);
    if (animate || drumDelay === 0) invalidate();
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!active || !width || !height) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfHeight = Math.max(bounds.y / .76, bounds.x / (.79 * aspect)) * .5;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.updateProjectionMatrix();
    invalidate();
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    invalidate();
  }).observe(canvas);
  document.addEventListener('visibilitychange', invalidate);
  reducedMotion.addEventListener('change', invalidate);
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
    drums?.resetIdle();
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (drums && !drag) {
      canvas.classList.toggle('on-drum', hitDrum(event) >= 0);
    }
    if (event.pointerId !== drag?.id) return;
    if (drums && !drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    drag.moved = true;
    yaw += (event.clientX - drag.x) * .014;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - drag.y) * .012, -.98, .98);
    drag.x = event.clientX;
    drag.y = event.clientY;
    invalidate();
  });
  function hitDrum(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    ray.setFromCamera({
      x: 2 * (event.clientX - rect.left) / rect.width - 1,
      y: 1 - 2 * (event.clientY - rect.top) / rect.height
    }, camera);
    const hit = ray.intersectObject(stage, true)[0];
    return hit ? drums.indexFor(hit.object) : -1;
  }
  canvas.addEventListener('pointerup', event => {
    if (!drums || event.pointerId !== drag?.id || drag.moved) return;
    const index = hitDrum(event);
    if (index >= 0) drums.turn(index);
  });
  for (const type of ['pointerup', 'lostpointercapture', 'pointercancel']) {
    canvas.addEventListener(type, () => { drag = undefined; invalidate(); });
  }

  function hide() {
    ++request;
    active = false;
    drums = undefined;
    drag = undefined;
    canvas.classList.remove('on-drum');
    canvas.hidden = true;
    stage.clear();
    scene.environment = null;
  }

  async function show(path) {
    hide();
    const version = request;
    const asset = await loadCartridgeAsset(path);
    if (version !== request) return false;
    const model = asset.clone(true);
    drums = createCartridgeDrums(model, reducedMotion);
    const shadows = enableCartridgeShadows(model);
    let usesMetalMap = false;
    let usesOpticalDisplay = false;
    model.traverse(object => {
      if (object.material?.metalnessMap && object.material.metalness > 0) usesMetalMap = true;
      if (object.userData.opticalDisplay) usesOpticalDisplay = true;
    });
    if (usesMetalMap || usesOpticalDisplay || drums) scene.environment = reflections ??= createCartridgeReflections();
    scene.environmentIntensity = shadows ? .76 : usesOpticalDisplay ? .94 : .63;
    fill.intensity = shadows ? .88 : 2.15;
    key.intensity = shadows ? 3.15 : 1.65;
    rim.intensity = shadows ? 1.23 : .84;
    if (shadows) key.position.copy(studioKeyPosition);
    else key.position.set(-1.4, 1.6, .7);
    key.castShadow = renderer.shadowMap.enabled = shadows;
    const box = new THREE.Box3().setFromObject(model);
    bounds = box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    stage.add(model);
    yaw = pitch = phase = lastTime = 0;
    canvas.hidden = false;
    active = true;
    resize();
    return true;
  }

  return {
    show, hide, invalidate,
    get hasDrums() { return Boolean(drums); },
    turn() { drums?.resetIdle(); yaw += Math.PI; invalidate(); },
    turnBand(index) { drums?.turn(index); invalidate(); },
    setDrumAuto(value) { drums?.setAuto(value); invalidate(); }
  };
}
