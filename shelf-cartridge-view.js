import * as THREE from './arcade/vendor/three.module.js';
import { loadCartridgeAsset } from './arcade/cartridge-assets.js';

function displayReflections() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#666066';
  context.fillRect(0, 0, 256, 128);
  const softbox = context.createLinearGradient(0, 35, 0, 82);
  softbox.addColorStop(0, '#666066');
  softbox.addColorStop(.43, '#fff7ed');
  softbox.addColorStop(.65, '#dfecff');
  softbox.addColorStop(1, '#666066');
  context.fillStyle = softbox;
  context.fillRect(0, 35, 256, 47);
  context.fillStyle = '#fff2e4';
  context.fillRect(31, 39, 52, 23);
  context.fillStyle = '#bedbff';
  context.fillRect(171, 45, 25, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function transmissionPanel() {
  const surface = document.createElement('canvas');
  surface.width = 512;
  surface.height = 256;
  const context = surface.getContext('2d');
  const falloff = context.createRadialGradient(256, 126, 20, 256, 126, 226);
  falloff.addColorStop(0, '#163335');
  falloff.addColorStop(.64, '#0b1b1d');
  falloff.addColorStop(1, '#0d0d0e');
  context.fillStyle = falloff;
  context.fillRect(0, 0, surface.width, surface.height);
  for (const x of [117, 182, 260, 345, 407]) {
    const strip = context.createLinearGradient(0, 42, 0, 213);
    strip.addColorStop(0, 'rgba(122,232,211,0)');
    strip.addColorStop(.42, 'rgba(146,255,227,.64)');
    strip.addColorStop(.62, 'rgba(146,255,227,.60)');
    strip.addColorStop(1, 'rgba(122,232,211,0)');
    context.fillStyle = strip;
    context.fillRect(x, 42, 3, 171);
  }
  const map = new THREE.CanvasTexture(surface);
  map.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(.96, .52),
    new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  panel.position.z = -.23;
  return panel;
}

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
  scene.add(stage, new THREE.HemisphereLight('#fff4e2', '#a09baa', 2.15));
  const key = new THREE.DirectionalLight('#fff5df', 1.65);
  key.position.set(-1.4, 1.6, .7);
  const rim = new THREE.DirectionalLight('#c3dcff', .84);
  rim.position.set(.9, .15, -.75);
  scene.add(key, rim);

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
  let panel;

  function invalidate() {
    if (active && !queued) queued = requestAnimationFrame(draw);
  }

  function draw(now) {
    queued = 0;
    if (!active) return;
    const animate = visible && !document.hidden && !reducedMotion.matches && !isPaused() && !drag;
    if (animate && lastTime) phase += Math.min(now - lastTime, 40) * .001;
    lastTime = animate ? now : 0;
    stage.rotation.set(pitch - .085, yaw + Math.sin(phase * 1.05) * .29 - .21, 0);
    stage.position.y = Math.sin(phase * 1.42) * bounds.y * .036;
    renderer.render(scene, camera);
    if (animate) invalidate();
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
    drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return;
    yaw += (event.clientX - drag.x) * .014;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - drag.y) * .012, -.98, .98);
    drag.x = event.clientX;
    drag.y = event.clientY;
    invalidate();
  });
  for (const type of ['pointerup', 'lostpointercapture', 'pointercancel']) {
    canvas.addEventListener(type, () => { drag = undefined; invalidate(); });
  }

  function hide() {
    ++request;
    active = false;
    canvas.hidden = true;
    stage.clear();
    scene.environment = null;
    if (panel) panel.visible = false;
  }

  async function show(path) {
    hide();
    const version = request;
    const asset = await loadCartridgeAsset(path);
    if (version !== request) return false;
    const model = asset.clone(true);
    let usesMetalMap = false;
    let usesOpticalDisplay = false;
    model.traverse(object => {
      if (object.material?.metalnessMap && object.material.metalness > 0) usesMetalMap = true;
      if (object.userData.opticalDisplay) usesOpticalDisplay = true;
    });
    if (usesMetalMap || usesOpticalDisplay) scene.environment = reflections ??= displayReflections();
    scene.environmentIntensity = usesOpticalDisplay ? .94 : .63;
    if (usesOpticalDisplay) {
      if (!panel) {
        panel = transmissionPanel();
        scene.add(panel);
      }
      panel.visible = true;
    }
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

  return { show, hide, invalidate, turn() { yaw += Math.PI; invalidate(); } };
}
