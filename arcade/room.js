import * as THREE from './vendor/three.module.js';

const SCREEN_WIDTH = 1.44;
const SCREEN_HEIGHT = .96;
const SCREEN_CENTER = new THREE.Vector3(0, .08, .131);
const HANDHELD_HOME = new THREE.Vector3(.15, 1.48, -1.48);
const HANDHELD_REST_SCALE = .65;
const CART_HOME = new THREE.Vector3(-1.53, 1.12, -.2);
const GRATE_HOME = new THREE.Vector3(1.92, .015, -2.18);

export async function createRoom({ canvas, onInteract = () => {}, onTarget = () => {}, onScreenRect = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#131b1a');
  scene.fog = new THREE.Fog('#172322', 5, 13);
  const camera = new THREE.PerspectiveCamera(58, 1, .025, 24);
  camera.position.set(0, 1.62, 3.1);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  let yaw = 0;
  let pitch = -.17;
  let cartState = 'on-desk';
  let docked = false;
  let transitioning = false;
  let inputEnabled = true;
  let disposed = false;
  let grateOpen = false;
  let target = null;
  let frameRequest = 0;
  let previousTime = 0;
  let savedPose;
  let dockPromise;
  let renderedFrames = 0;
  let lastScreenRect = null;
  let externalMove = { x: 0, z: 0 };
  const keys = new Set();
  const tweens = new Set();
  const materials = new Set();
  const textures = new Set();
  const geometries = new Set();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const loader = new THREE.TextureLoader();
  const forward = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const screenCorners = [
    new THREE.Vector3(-SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, 0),
    new THREE.Vector3(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, 0),
    new THREE.Vector3(-SCREEN_WIDTH / 2, -SCREEN_HEIGHT / 2, 0),
    new THREE.Vector3(SCREEN_WIDTH / 2, -SCREEN_HEIGHT / 2, 0)
  ];

  function material(color, options = {}) {
    const result = new THREE.MeshStandardMaterial({ color, roughness: .78, metalness: .12, ...options });
    materials.add(result);
    return result;
  }

  function box(width, height, depth, surface, parent = scene, x = 0, y = 0, z = 0) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function plane(width, height, surface, parent = scene, x = 0, y = 0, z = 0) {
    const geometry = new THREE.PlaneGeometry(width, height);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function cylinder(radius, length, surface, parent, x, y, z) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function texture(path, repeat = 1) {
    const result = loader.load(new URL(path, import.meta.url).href, () => requestRender(), undefined, () => requestRender());
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.repeat.set(repeat, repeat);
    result.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    textures.add(result);
    return result;
  }

  const grain = texture('../art/materials/abs-grain.webp', 3);
  const wear = texture('../art/materials/shell-wear.webp', 2);
  const wall = material('#304542', { bumpMap: grain, bumpScale: .009, roughness: .92 });
  const plaster = material('#748174', { bumpMap: wear, bumpScale: .012, roughness: .94 });
  const floor = material('#23352e', { bumpMap: wear, bumpScale: .007, roughness: .87 });
  const metal = material('#6c7974', { metalness: .77, roughness: .38, bumpMap: wear, bumpScale: .005 });
  const darkMetal = material('#202a2b', { metalness: .65, roughness: .46 });
  const brass = material('#b7a66e', { metalness: .72, roughness: .37 });
  const wood = material('#66513b', { bumpMap: wear, bumpScale: .01, roughness: .83 });
  const black = material('#090f10', { roughness: .48 });
  const teal = material('#3e9d9d', { bumpMap: grain, bumpScale: .006, metalness: .19, roughness: .49 });
  const screenBlack = material('#02070a', { metalness: .12, roughness: .19, emissive: '#082b2c', emissiveIntensity: .26 });
  const amber = material('#ffd390', { emissive: '#ffbf60', emissiveIntensity: 1.2 });
  const lime = material('#d9f57b', { emissive: '#799f26', emissiveIntensity: .3 });
  const rainbow = ['#e7618c', '#e0aa58', '#d9e776', '#74bea0', '#70b9d6', '#927cbb'].map(color => material(color));

  scene.add(new THREE.HemisphereLight('#dae8d5', '#2d3027', 2.05));
  const keyLight = new THREE.DirectionalLight('#ffe7bf', 2.15);
  keyLight.position.set(-2.3, 3.05, 1.3);
  scene.add(keyLight);
  const roomLight = new THREE.PointLight('#76c2c3', 6.5, 8, 2);
  roomLight.position.set(.3, 2.4, -1.5);
  scene.add(roomLight);
  const grateLight = new THREE.PointLight('#e8ab65', 0, 4, 2);
  grateLight.position.set(2.05, .12, -2.25);
  scene.add(grateLight);

  box(6.5, .16, 7.7, floor, scene, 0, -.11, 0);
  box(6.5, 3.2, .14, wall, scene, 0, 1.6, -3.87);
  box(.14, 3.2, 7.7, wall, scene, -3.27, 1.6, 0);
  box(.14, 3.2, 7.7, wall, scene, 3.27, 1.6, 0);
  box(6.5, 3.2, .14, wall, scene, 0, 1.6, 3.87);
  box(6.5, .12, 7.7, plaster, scene, 0, 3.26, 0);
  for (const z of [-3.4, -1, 1.4, 3.5]) {
    box(6.4, .16, .19, darkMetal, scene, 0, 3.1, z);
  }
  for (const x of [-3.14, 3.14]) {
    box(.1, .24, 7.6, darkMetal, scene, x, .12, 0);
    box(.07, .1, 7.6, brass, scene, x, 1.23, 0);
  }
  for (const x of [-2.5, -1.25, 0, 1.25, 2.5]) {
    box(.012, .008, 7.55, darkMetal, scene, x, -.023, 0);
  }
  for (let z = -3.2; z < 3.8; z += 1.25) {
    box(6.4, .008, .014, darkMetal, scene, 0, -.022, z);
  }

  // Heavy shelving and an inset workstation establish the short walking route.
  const desk = new THREE.Group();
  desk.position.set(-1.55, 0, -.2);
  scene.add(desk);
  box(1.72, .13, 1.02, wood, desk, 0, .94, 0);
  box(1.78, .045, 1.06, brass, desk, 0, 1.025, 0);
  for (const x of [-.73, .73]) for (const z of [-.39, .39]) box(.09, .91, .09, darkMetal, desk, x, .46, z);
  box(1.6, .055, .75, darkMetal, desk, 0, .27, -.01);
  for (let i = 0; i < 4; i++) {
    const books = box(.14, .23 + i * .013, .31, rainbow[i], desk, -.58 + i * .15, 1.16, -.24);
    books.rotation.z = -.07;
  }
  box(.54, .025, .38, darkMetal, desk, .26, 1.067, .12);

  const pedestal = new THREE.Group();
  pedestal.position.set(.15, 0, -1.49);
  scene.add(pedestal);
  box(1.5, .12, .83, darkMetal, pedestal, 0, .89, 0);
  box(1.25, .08, .65, metal, pedestal, 0, .97, 0);
  box(.75, .81, .59, wall, pedestal, 0, .43, -.08);
  box(.77, .09, .62, brass, pedestal, 0, .1, -.08);
  for (let i = 0; i < 6; i++) box(.07, .06, .02, rainbow[i], pedestal, -.28 + i * .11, .47, .223);

  // Handheld geometry leaves an actual rectangular opening between the bezel rails.
  const handheld = new THREE.Group();
  scene.add(handheld);
  handheld.position.copy(HANDHELD_HOME);
  handheld.scale.setScalar(HANDHELD_REST_SCALE);
  handheld.rotation.x = -.17;
  box(2.18, 1.43, .17, black, handheld, 0, 0, -.045);
  box(.29, 1.37, .2, teal, handheld, -.925, 0, .005);
  box(.29, 1.37, .2, teal, handheld, .925, 0, .005);
  box(1.62, .13, .2, teal, handheld, 0, .65, .005);
  box(1.62, .25, .2, teal, handheld, 0, -.59, .005);
  box(1.51, .05, .04, darkMetal, handheld, 0, .59, .119);
  box(1.51, .05, .04, darkMetal, handheld, 0, -.43, .119);
  box(.05, .99, .04, darkMetal, handheld, -.755, .08, .119);
  box(.05, .99, .04, darkMetal, handheld, .755, .08, .119);
  plane(SCREEN_WIDTH, SCREEN_HEIGHT, screenBlack, handheld, SCREEN_CENTER.x, SCREEN_CENTER.y, SCREEN_CENTER.z);

  // A split top rail and a dark recessed throat form the cartridge slot.
  box(.38, .023, .09, black, handheld, 0, .728, -.008);
  box(.79, .055, .13, metal, handheld, -.61, .728, -.008);
  box(.79, .055, .13, metal, handheld, .61, .728, -.008);
  box(.37, .018, .015, brass, handheld, 0, .743, .042);
  box(.37, .018, .015, brass, handheld, 0, .743, -.058);
  box(.19, .055, .02, black, handheld, -.925, .1, .13);
  box(.055, .19, .02, black, handheld, -.925, .1, .133);
  for (const [x, y] of [[.9, .15], [.99, .25]]) {
    const button = cylinder(.055, .035, rainbow[x > .95 ? 0 : 4], handheld, x, y, .125);
    button.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 5; i++) box(.016, .12, .017, black, handheld, -.1 + i * .05, -.59, .121);
  for (const x of [-1.005, 1.005]) for (const y of [-.61, .61]) {
    const screw = cylinder(.022, .011, brass, handheld, x, y, .112);
    screw.rotation.x = Math.PI / 2;
  }
  const powerLed = box(.035, .035, .012, lime, handheld, .68, -.59, .119);
  const logoSurface = new THREE.MeshBasicMaterial({ map: texture('../art/brand/zang-mark.webp'), transparent: true, depthWrite: false });
  materials.add(logoSurface);
  plane(.105, .105, logoSurface, handheld, -.67, -.59, .125);

  const cartridge = new THREE.Group();
  scene.add(cartridge);
  cartridge.position.copy(CART_HOME);
  cartridge.rotation.set(-.23, .3, -.08);
  const cartridgePlastic = material('#55909b', { bumpMap: grain, bumpScale: .005, roughness: .57 });
  box(.31, .25, .045, cartridgePlastic, cartridge);
  box(.26, .025, .048, metal, cartridge, 0, .105, 0);
  const labelSurface = material('#ffffff', { map: texture('../art/labels/kingfisher.webp'), roughness: .65, metalness: 0 });
  plane(.245, .145, labelSurface, cartridge, 0, .009, .024);
  box(.19, .025, .02, brass, cartridge, 0, -.109, .023);
  for (let i = 0; i < 7; i++) box(.006, .025, .006, black, cartridge, -.075 + i * .025, -.109, .035);

  // The grate is visibly horizontal and hinged at its far edge.
  const grate = new THREE.Group();
  grate.position.copy(GRATE_HOME);
  scene.add(grate);
  box(1.49, .16, 1.84, black, scene, GRATE_HOME.x, -.08, GRATE_HOME.z);
  box(1.6, .065, .1, metal, grate, 0, 0, -.94);
  box(1.6, .065, .1, metal, grate, 0, 0, .94);
  box(.1, .065, 1.82, metal, grate, -.75, 0, 0);
  box(.1, .065, 1.82, metal, grate, .75, 0, 0);
  const grateLid = new THREE.Group();
  grateLid.position.z = -.87;
  grate.add(grateLid);
  for (let x = -.61; x <= .62; x += .15) box(.045, .055, 1.72, darkMetal, grateLid, x, .01, .87);
  for (const z of [.08, .5, .92, 1.34, 1.68]) box(1.38, .025, .04, metal, grateLid, 0, .043, z);
  const lock = box(.13, .115, .12, brass, grateLid, 0, .075, 1.65);
  for (const x of [-.7, .7]) for (const z of [-.88, .88]) cylinder(.034, .02, brass, grate, x, .049, z);
  const hatchGlow = plane(1.2, 1.48, material('#e8a64e', { emissive: '#ffd088', emissiveIntensity: .85 }), scene, GRATE_HOME.x, .002, GRATE_HOME.z);
  hatchGlow.rotation.x = -Math.PI / 2;
  hatchGlow.visible = false;

  // Existing cover textures give the room a sense of collection and scale.
  const posterIds = ['jumbo-mini-golf', 'undergrowth-advance', 'the-weather-engine'];
  for (const [index, id] of posterIds.entries()) {
    const x = -1.95 + index * 1.25;
    box(.91, 1.17, .07, darkMetal, scene, x, 2.15, -3.71);
    plane(.81, 1.07, material('#ffffff', { map: texture('../art/covers/' + id + '.webp'), roughness: .86 }), scene, x, 2.15, -3.665);
  }
  box(.95, .09, .3, darkMetal, scene, -2.4, 2.83, -.7);
  box(.64, .025, .18, amber, scene, -2.4, 2.77, -.69);
  box(.95, .09, .3, darkMetal, scene, 2.35, 2.83, -2.45);
  box(.64, .025, .18, amber, scene, 2.35, 2.77, -2.44);
  scene.traverse(object => { if (object.isLight) object.layers.enable(1); });

  const obstacles = [
    { minX: -2.48, maxX: -.62, minZ: -.79, maxZ: .42 },
    { minX: -.68, maxX: .99, minZ: -1.98, maxZ: -.98 }
  ];

  function updateCamera() {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
  }

  function emitTarget(next) {
    if (target?.id === next?.id && target?.label === next?.label) return;
    target = next;
    onTarget(next);
  }

  function updateTarget() {
    if (!inputEnabled || docked || transitioning) return emitTarget(null);
    camera.getWorldDirection(forward);
    const candidates = [
      { id: 'handheld', point: HANDHELD_HOME, label: cartState === 'held' ? 'Insert cartridge' : cartState === 'inserted' ? 'Play Kingfisher' : 'Inspect handheld' },
      { id: 'grate', point: GRATE_HOME, label: grateOpen ? 'Inspect open grate' : 'Inspect locked grate' }
    ];
    if (cartState === 'on-desk') candidates.push({ id: 'cart', point: CART_HOME, label: 'Pick up Kingfisher' });
    let selected = null;
    let score = -Infinity;
    for (const item of candidates) {
      scratch.copy(item.point).sub(camera.position);
      const distance = scratch.length();
      const alignment = forward.dot(scratch.normalize());
      if (distance > 2.05 || alignment < .35) continue;
      const value = alignment - distance * .09;
      if (value > score) {
        selected = { id: item.id, label: item.label };
        score = value;
      }
    }
    emitTarget(selected);
  }

  function canStand(x, z) {
    if (x < -2.95 || x > 2.95 || z < -3.48 || z > 3.5) return false;
    return !obstacles.some(item => x > item.minX - .22 && x < item.maxX + .22 && z > item.minZ - .22 && z < item.maxZ + .22);
  }

  function updateMovement(delta) {
    if (!inputEnabled || docked || transitioning) return;
    let x = externalMove.x + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    let z = externalMove.z + Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const length = Math.hypot(x, z);
    if (!length) return;
    x /= Math.max(1, length);
    z /= Math.max(1, length);
    const distance = delta * 2.15;
    const nextX = camera.position.x + (Math.cos(yaw) * x - Math.sin(yaw) * z) * distance;
    const nextZ = camera.position.z + (-Math.sin(yaw) * x - Math.cos(yaw) * z) * distance;
    if (canStand(nextX, camera.position.z)) camera.position.x = nextX;
    if (canStand(camera.position.x, nextZ)) camera.position.z = nextZ;
  }

  function emitScreenRect() {
    if (!docked) return;
    camera.updateMatrixWorld();
    handheld.updateMatrixWorld(true);
    const viewport = canvas.getBoundingClientRect();
    const points = screenCorners.map(corner => {
      const point = corner.clone().add(SCREEN_CENTER);
      handheld.localToWorld(point).project(camera);
      return { x: viewport.left + (point.x + 1) * viewport.width / 2, y: viewport.top + (1 - point.y) * viewport.height / 2 };
    });
    const left = Math.min(...points.map(point => point.x));
    const top = Math.min(...points.map(point => point.y));
    lastScreenRect = { left, top, width: Math.max(...points.map(point => point.x)) - left, height: Math.max(...points.map(point => point.y)) - top };
    onScreenRect(lastScreenRect);
  }

  function dockPose() {
    const viewport = canvas.getBoundingClientRect();
    const widthLimit = viewport.width < 620 ? Math.max(240, viewport.width * .66) : Math.min(760, viewport.width - 90);
    const desiredWidth = Math.min(widthLimit, viewport.width - 24, viewport.height * .98);
    const distance = SCREEN_WIDTH * viewport.height / (2 * desiredWidth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    return new THREE.Vector3(0, -SCREEN_CENTER.y, -distance - SCREEN_CENTER.z);
  }

  function requestRender() {
    if (!disposed && !document.hidden && !frameRequest) frameRequest = requestAnimationFrame(renderFrame);
  }

  function renderFrame(time) {
    frameRequest = 0;
    if (disposed) return;
    const delta = previousTime ? Math.min((time - previousTime) / 1000, .05) : 0;
    previousTime = time;
    updateMovement(delta);
    updateCamera();
    for (const tween of tweens) tween.update(time);
    updateTarget();
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    const background = scene.background;
    scene.background = null;
    camera.layers.set(1);
    renderer.render(scene, camera);
    camera.layers.set(0);
    scene.background = background;
    renderedFrames++;
    if (docked) emitScreenRect();
    if (!docked || tweens.size) requestRender();
  }

  function tween(duration, update) {
    return new Promise(resolve => {
      const start = performance.now();
      const actualDuration = reduceMotion.matches ? 1 : duration;
      const item = {
        update(time) {
          const amount = THREE.MathUtils.clamp((time - start) / actualDuration, 0, 1);
          update(amount * amount * (3 - 2 * amount));
          if (amount === 1) {
            tweens.delete(item);
            resolve();
          }
        },
        resolve
      };
      tweens.add(item);
      requestRender();
    });
  }

  function setCartState(state) {
    const normalized = ({ desk: 'on-desk', carried: 'held' })[state] || state;
    if (!['on-desk', 'held', 'inserted'].includes(normalized)) return;
    cartState = normalized;
    if (normalized === 'held') {
      camera.add(cartridge);
      cartridge.position.set(.33, -.32, -.67);
      cartridge.rotation.set(-.12, -.32, -.18);
      cartridge.traverse(object => object.layers.set(1));
    } else if (normalized === 'inserted') {
      handheld.add(cartridge);
      cartridge.position.set(0, .681, -.008);
      cartridge.rotation.set(0, 0, 0);
      cartridge.traverse(object => object.layers.set(docked ? 1 : 0));
    } else {
      scene.add(cartridge);
      cartridge.position.copy(CART_HOME);
      cartridge.rotation.set(-.23, .3, -.08);
      cartridge.traverse(object => object.layers.set(0));
    }
    updateTarget();
    requestRender();
  }

  function clearInput() {
    keys.clear();
    externalMove = { x: 0, z: 0 };
  }

  async function performDock() {
    transitioning = true;
    clearInput();
    emitTarget(null);
    savedPose = { position: camera.position.clone(), yaw, pitch };
    if (cartState !== 'inserted') {
      scene.attach(cartridge);
      cartridge.traverse(object => object.layers.set(0));
      const initialPosition = cartridge.position.clone();
      const initialRotation = cartridge.quaternion.clone();
      handheld.updateMatrixWorld(true);
      const destination = handheld.localToWorld(new THREE.Vector3(0, .681, -.008));
      const destinationRotation = handheld.getWorldQuaternion(new THREE.Quaternion());
      await tween(700, amount => {
        cartridge.position.lerpVectors(initialPosition, destination, amount);
        cartridge.position.y += Math.sin(amount * Math.PI) * .31;
        cartridge.quaternion.slerpQuaternions(initialRotation, destinationRotation, amount);
      });
      if (disposed) return;
      setCartState('inserted');
    }
    camera.attach(handheld);
    handheld.traverse(object => object.layers.set(1));
    const startPosition = handheld.position.clone();
    const startRotation = handheld.quaternion.clone();
    const startScale = handheld.scale.x;
    const destination = dockPose();
    const identity = new THREE.Quaternion();
    await tween(650, amount => {
      handheld.position.lerpVectors(startPosition, destination, amount);
      handheld.quaternion.slerpQuaternions(startRotation, identity, amount);
      handheld.scale.setScalar(THREE.MathUtils.lerp(startScale, 1, amount));
    });
    if (disposed) return;
    docked = true;
    transitioning = false;
    powerLed.material = amber;
    requestRender();
    emitScreenRect();
  }

  function dock() {
    if (docked) return Promise.resolve();
    if (!dockPromise) dockPromise = performDock().finally(() => { dockPromise = undefined; });
    return dockPromise;
  }

  async function undock() {
    if (dockPromise) await dockPromise;
    if (!docked || disposed) return;
    transitioning = true;
    docked = false;
    const startPosition = handheld.position.clone();
    const startRotation = handheld.quaternion.clone();
    const startScale = handheld.scale.x;
    scene.updateMatrixWorld(true);
    const destination = camera.worldToLocal(HANDHELD_HOME.clone());
    const destinationRotation = camera.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.17, 0, 0)));
    await tween(500, amount => {
      handheld.position.lerpVectors(startPosition, destination, amount);
      handheld.quaternion.slerpQuaternions(startRotation, destinationRotation, amount);
      handheld.scale.setScalar(THREE.MathUtils.lerp(startScale, HANDHELD_REST_SCALE, amount));
    });
    if (disposed) return;
    scene.add(handheld);
    handheld.traverse(object => object.layers.set(0));
    handheld.position.copy(HANDHELD_HOME);
    handheld.rotation.set(-.17, 0, 0);
    handheld.scale.setScalar(HANDHELD_REST_SCALE);
    if (savedPose) {
      camera.position.copy(savedPose.position);
      yaw = savedPose.yaw;
      pitch = savedPose.pitch;
    }
    transitioning = false;
    requestRender();
  }

  async function openGrate(animate = true) {
    if (grateOpen) return;
    grateOpen = true;
    lock.visible = false;
    hatchGlow.visible = true;
    const duration = animate ? 950 : 1;
    await tween(duration, amount => {
      grateLid.rotation.x = -amount * Math.PI * .47;
      grateLight.intensity = amount * 3.7;
      hatchGlow.material.emissiveIntensity = amount * .85;
    });
    updateTarget();
    requestRender();
  }

  function interact() {
    if (inputEnabled && !transitioning && !docked && target) onInteract(target.id);
  }

  function look(x, y) {
    if (!inputEnabled || docked || transitioning) return;
    yaw -= x * .003;
    pitch = THREE.MathUtils.clamp(pitch - y * .003, -1.05, .8);
    updateCamera();
    requestRender();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    if (docked) handheld.position.copy(dockPose());
    requestRender();
  }

  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
  function keydown(event) {
    if (!inputEnabled || docked || transitioning || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)) return;
    if (movementKeys.has(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
    if (!event.repeat && (event.code === 'KeyE' || event.code === 'Enter')) {
      event.preventDefault();
      interact();
    }
  }
  function keyup(event) { keys.delete(event.code); }
  let drag;
  function pointerdown(event) {
    if (!inputEnabled || docked || transitioning || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  }
  function pointermove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    look(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  }
  function pointerup(event) {
    if (event.pointerId !== drag?.id) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = undefined;
  }
  function visibilitychange() {
    clearInput();
    if (document.hidden) {
      cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    } else {
      previousTime = 0;
      requestRender();
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', visibilitychange);
  canvas.addEventListener('pointerdown', pointerdown);
  canvas.addEventListener('pointermove', pointermove);
  canvas.addEventListener('pointerup', pointerup);
  canvas.addEventListener('pointercancel', pointerup);
  canvas.style.touchAction = 'none';
  updateCamera();
  resize();
  requestRender();

  return {
    setCartState,
    dock,
    undock,
    openGrate,
    interact,
    resize,
    setInputEnabled(enabled) {
      inputEnabled = Boolean(enabled);
      clearInput();
      updateTarget();
      requestRender();
    },
    move(x, z) {
      externalMove = { x: THREE.MathUtils.clamp(Number(x) || 0, -1, 1), z: THREE.MathUtils.clamp(Number(z) || 0, -1, 1) };
      requestRender();
    },
    look,
    getState() {
      return { cartState, docked, inputEnabled, grateOpen, transitioning, target, renderedFrames, screenRect: lastScreenRect, camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw, pitch } };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameRequest);
      observer.disconnect();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', visibilitychange);
      canvas.removeEventListener('pointerdown', pointerdown);
      canvas.removeEventListener('pointermove', pointermove);
      canvas.removeEventListener('pointerup', pointerup);
      canvas.removeEventListener('pointercancel', pointerup);
      for (const item of tweens) item.resolve();
      tweens.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
      for (const loaded of textures) loaded.dispose();
      renderer.dispose();
    }
  };
}
