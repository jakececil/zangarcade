import * as THREE from './arcade/vendor/three.module.js';
import { loadCartridgeAsset } from './arcade/cartridge-assets.js';
import { createCartridgeDrums } from './arcade/cartridge-drums.js';
import { createCartridgeSlots, pickCartridgePart } from './arcade/cartridge-slots.js?v=513bd344741e';
import { configureCartridgeKey, createCartridgeReflections, enableCartridgeShadows } from './arcade/cartridge-lighting.js';

export function createShelfCartridgeView(canvas, { isPaused, reducedMotion, onSlotsState }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
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
  let slots;
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
    const spinning = slots?.update(now);
    stage.rotation.set(pitch - .085, yaw + Math.sin(phase * 1.05) * .29 - .21, 0);
    stage.position.y = Math.sin(phase * 1.42) * bounds.y * .036;
    renderer.render(scene, camera);
    if (animate || drumDelay === 0 || spinning) invalidate();
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!active || !width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5, Math.sqrt(6000000 / (width * height))));
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const heightWithTilt = Math.hypot(bounds.y, bounds.z);
    const widthWithTurn = Math.hypot(bounds.x, bounds.z);
    const halfHeight = Math.max(heightWithTilt / .83, widthWithTurn / (.94 * aspect)) * .5;
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
    if (slots && event.pointerType === 'touch') drag.lever = slots.isLever(hitPart(event));
    drums?.resetIdle();
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if ((drums || slots) && !drag) {
      const hit = hitPart(event);
      canvas.classList.toggle('on-drum', Boolean(slots?.isLever(hit) || (hit && drums?.indexFor(hit) >= 0)));
    }
    if (event.pointerId !== drag?.id) return;
    const tapSlop = event.pointerType === 'touch' ? 12 : 5;
    if ((drums || slots) && !drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < tapSlop) return;
    drag.moved = true;
    yaw += (event.clientX - drag.x) * .014;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - drag.y) * .012, -.98, .98);
    drag.x = event.clientX;
    drag.y = event.clientY;
    invalidate();
  });
  function hitPart(event) {
    return pickCartridgePart(ray, camera, stage, canvas.getBoundingClientRect(), event, slots);
  }
  canvas.addEventListener('pointerup', event => {
    if ((!drums && !slots) || event.pointerId !== drag?.id || drag.moved) return;
    const hit = hitPart(event);
    if (slots && (drag.lever || slots.isLever(hit))) slots.pull();
    const index = drums?.indexFor(hit) ?? -1;
    if (index >= 0) drums.turn(index);
  });
  for (const type of ['pointerup', 'lostpointercapture', 'pointercancel']) {
    canvas.addEventListener(type, () => { drag = undefined; invalidate(); });
  }

  function hide() {
    ++request;
    active = false;
    drums = undefined;
    slots?.dispose();
    slots = undefined;
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
    slots = createCartridgeSlots(model, reducedMotion, onSlotsState);
    const shadows = enableCartridgeShadows(model);
    let usesMetalMap = false;
    let usesOpticalDisplay = false;
    model.traverse(object => {
      if (object.material?.metalnessMap && object.material.metalness > 0) usesMetalMap = true;
      if (object.userData.opticalDisplay) usesOpticalDisplay = true;
    });
    if (usesMetalMap || usesOpticalDisplay || drums || slots) scene.environment = reflections ??= createCartridgeReflections();
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
    get hasSlots() { return Boolean(slots); },
    pullLever() { if (slots?.pull()) invalidate(); },
    turn() { drums?.resetIdle(); yaw += Math.PI; invalidate(); },
    turnBand(index) { drums?.turn(index); invalidate(); },
    setDrumAuto(value) { drums?.setAuto(value); invalidate(); }
  };
}
