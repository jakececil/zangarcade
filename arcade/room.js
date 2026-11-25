import * as THREE from './vendor/three.module.js';
import { ENTRY_Z, museumGeometry } from './museum-geometry.js';
import { HOME, buildGuts, mazeWalls, roomProfile } from './guts.js';
import { loadCartridgeAsset } from './cartridge-assets.js';
import { createCartridgeDrums } from './cartridge-drums.js';
import { createCartridgeSlots } from './cartridge-slots.js';
import { configureCartridgeKey, createCartridgeReflections, enableCartridgeShadows } from './cartridge-lighting.js';

const SCREEN_WIDTH = 1.44;
const SCREEN_HEIGHT = .96;
const SCREEN_CENTER = new THREE.Vector3(0, .08, .131);
const CART_HOME = new THREE.Vector3(-1.53, 1.12, -.2);
const POCKET = new THREE.Vector3(0, -1.42, -.92);
const SLOT = new THREE.Vector3(0, .682, -.008);
// The molded shell sits proud of the slot, with its contact tongue recessed.
const MODEL_CART_SEAT = new THREE.Vector3(0, .804, -.008);
const HOME_DOOR = new THREE.Vector3(0, 1.4, ENTRY_Z + 1.68);
const GRATE_HOME = new THREE.Vector3(1.92, .015, -2.18);
const UNDERSHELL = 'undergrowth-advance';
const INSPECTION_BACKGROUND = new THREE.Color('#252922');

export async function createRoom({ canvas, games, onInteract = () => {}, onTarget = () => {}, onScreenRect = () => {}, onMouseLook = () => {},
  onInspectionDrums = () => {}, onInspectionSlotsState = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const exhibit = new THREE.Group();
  const architecture = new THREE.Group();
  exhibit.add(architecture);
  scene.add(exhibit);
  scene.background = new THREE.Color('#131b1a');
  scene.fog = new THREE.Fog('#172322', 5, 13);
  const camera = new THREE.PerspectiveCamera(58, 1, .025, 24);
  camera.position.set(0, 1.62, 3.1);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  let yaw = 0;
  let pitch = -.17;
  let cartState = 'on-desk';
  let currentGame;
  let profile = roomProfile('home');
  let found = new Set();
  let boxed = new Set();
  let canStore = false;
  let run = false;
  let carriedGame;
  let exitDoor;
  let docked = false;
  let inspecting = false;
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
  let inspectionReflections;
  let externalMove = { x: 0, z: 0 };
  const keys = new Set();
  const tweens = new Set();
  const materials = new Set();
  const textures = new Map();
  const geometries = new Set();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const inspectionRay = new THREE.Raycaster();
  let inspectionDrums;
  let inspectionSlots;
  let inspectionShuffleTimer;
  let inspectionAuto = true;
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

  function paper(map = null) {
    const surface = new THREE.MeshBasicMaterial({ map, toneMapped: false, fog: false });
    materials.add(surface);
    return surface;
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
    const url = new URL(path, import.meta.url).href;
    const key = `${url}:${repeat}`;
    if (textures.has(key)) return textures.get(key);
    const result = loader.load(url, () => requestRender(), undefined, () => requestRender());
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.repeat.set(repeat, repeat);
    result.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    textures.set(key, result);
    return result;
  }

  const grain = texture('../art/materials/abs-grain.webp', 3);
  const wear = texture('../art/materials/shell-wear.webp', 2);
  const guts = buildGuts({ games, box, plane, material, texture, paper });
  exhibit.add(guts.home, guts.maze);
  const wall = material('#617771', { map: guts.materialTile, bumpMap: guts.materialTile, bumpScale: .043, roughness: .79 });
  const plaster = material('#748174', { bumpMap: wear, bumpScale: .012, roughness: .94 });
  const floor = material('#4d5555', { map: guts.materialTile, bumpMap: wear, bumpScale: .018, roughness: .83 });
  const metal = material('#6c7974', { metalness: .77, roughness: .38, bumpMap: wear, bumpScale: .005 });
  const darkMetal = material('#202a2b', { metalness: .65, roughness: .46 });
  const brass = material('#b7a66e', { metalness: .72, roughness: .37 });
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

  box(6.5, .16, 7.7, floor, architecture, 0, -.11, 0);
  box(6.5, 3.2, .14, wall, architecture, 0, 1.6, -3.87);
  box(.14, 3.2, 7.7, wall, architecture, -3.27, 1.6, 0);
  box(.14, 3.2, 7.7, wall, architecture, 3.27, 1.6, 0);
  box(6.5, 3.2, .14, wall, architecture, 0, 1.6, 3.87);
  box(6.5, .12, 7.7, plaster, architecture, 0, 3.26, 0);
  for (const z of [-3.4, -1, 1.4, 3.5]) {
    box(6.4, .16, .19, darkMetal, architecture, 0, 3.1, z);
  }
  for (const x of [-3.14, 3.14]) {
    box(.1, .24, 7.6, darkMetal, architecture, x, .12, 0);
    box(.07, .1, 7.6, brass, architecture, x, 1.23, 0);
  }
  for (const x of [-2.5, -1.25, 0, 1.25, 2.5]) {
    box(.012, .008, 7.55, darkMetal, architecture, x, -.023, 0);
  }
  for (let z = -3.2; z < 3.8; z += 1.25) {
    box(6.4, .008, .014, darkMetal, architecture, 0, -.022, z);
  }

  const pedestal = new THREE.Group();
  pedestal.visible = false;
  exhibit.add(pedestal);
  box(.78, .13, .65, darkMetal, pedestal, 0, .91, 0);
  box(.63, .045, .54, brass, pedestal, 0, .985, 0);
  const stem = box(.44, .88, .43, wall, pedestal, 0, .46, -.04);
  stem.rotation.y = .19;
  box(.66, .08, .54, metal, pedestal, 0, .067, -.04);
  box(.29, .033, .02, lime, pedestal, .04, .81, .245);
  const pedestalLight = new THREE.PointLight('#ffe0b2', 2.7, 3.4, 2);
  pedestalLight.position.set(.20, 1.96, .40);
  pedestal.add(pedestalLight);

  // Handheld geometry leaves an actual rectangular opening between the bezel rails.
  const handheld = new THREE.Group();
  camera.add(handheld);
  handheld.position.copy(POCKET);
  handheld.visible = false;
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

  function cartridgeModel(parent, displayWidth) {
    const model = new THREE.Group();
    parent.add(model);
    const fallback = new THREE.Group();
    model.add(fallback);
    const shell = material('#55909b', { map: wear, bumpMap: grain, bumpScale: .007, roughness: .42 });
    const board = new THREE.Group();
    fallback.add(board);
    box(.258, .217, .015, material('#27574c', { roughness: .74 }), board);
    box(.072, .083, .027, black, board, -.056, .033, .014);
    for (let pin = 0; pin < 9; pin++) box(.008, .051, .008, brass, board, -.081 + pin * .020, -.075, .015);
    box(.318, .249, .05, shell, fallback);
    box(.296, .02, .053, shell, fallback, 0, .109, 0);
    box(.025, .13, .017, shell, fallback, -.151, .019, .025);
    const label = paper();
    plane(.215, .132, label, fallback, .012, -.015, .027);
    for (const x of [-.123, .123]) box(.015, .015, .008, brass, fallback, x, .082, .027);
    return { model, fallback, shell, board, label, displayWidth, asset: null, gameId: null, shadows: false };
  }

  function useCartridgeAsset(parts, game) {
    loadCartridgeAsset(game.cartridgeModel).then(model => {
      if (disposed || parts.gameId !== game.id || parts.asset) return;
      parts.asset = model.clone(true);
      parts.shadows = parts === inspectionCart && enableCartridgeShadows(parts.asset);
      parts.asset.traverse(object => { object.layers.mask = parts.model.layers.mask; });
      parts.model.add(parts.asset);
      if (parts.shadows) parts.model.traverse(object => object.layers.set(2));
      if (parts.displayWidth) {
        const bounds = new THREE.Box3().setFromObject(model);
        const width = bounds.max.x - bounds.min.x;
        if (width * 1.6 > parts.displayWidth) {
          const scale = parts.displayWidth / width;
          parts.model.scale.setScalar(scale);
          parts.model.position.y = 1.015 - bounds.min.y * scale;
        }
      }
      parts.fallback.visible = false;
      if (inspecting && parts === inspectionCart) setupInspectionDrums();
      requestRender();
    }).catch(error => console.warn('Cartridge model could not be loaded.', error));
  }

  function skinCartridge(parts, game) {
    if (parts.gameId === game.id) return;
    parts.gameId = game.id;
    parts.shadows = false;
    const translucent = game.id === UNDERSHELL;
    if (parts.asset) {
      parts.asset.removeFromParent();
      parts.asset = null;
    }
    if (parts.displayWidth) {
      parts.model.scale.setScalar(1.6);
      parts.model.position.y = 1.20;
    }
    parts.fallback.visible = true;
    if (game.cartridgeModel) useCartridgeAsset(parts, game);
    parts.shell.color.set(translucent ? '#ffab54' : game.shellColors?.plastic || '#55909b');
    parts.shell.opacity = translucent ? .48 : 1;
    parts.shell.transparent = translucent;
    parts.shell.depthWrite = !translucent;
    parts.shell.map = translucent ? null : wear;
    parts.shell.needsUpdate = true;
    parts.board.visible = translucent;
    parts.label.map = texture('../' + (game.cartLabel || game.cover));
    parts.label.needsUpdate = true;
  }

  const displayCart = cartridgeModel(pedestal, .65);
  displayCart.model.visible = false;
  displayCart.model.position.set(0, 1.20, 0);
  displayCart.model.rotation.set(-.22, .21, -.08);
  displayCart.model.scale.setScalar(1.6);
  const carriedCart = cartridgeModel(camera);
  const cartridge = carriedCart.model;
  cartridge.visible = false;
  const inspectionCart = cartridgeModel(camera);
  const inspectedModel = inspectionCart.model;
  inspectedModel.visible = false;

  // The grate is visibly horizontal and hinged at its far edge.
  const grateObjects = new THREE.Group();
  exhibit.add(grateObjects);
  const grate = new THREE.Group();
  grate.position.copy(GRATE_HOME);
  grateObjects.add(grate);
  box(1.49, .16, 1.84, black, grateObjects, GRATE_HOME.x, -.08, GRATE_HOME.z);
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
  const hatchGlow = plane(1.2, 1.48, material('#e8a64e', { emissive: '#ffd088', emissiveIntensity: .85 }), grateObjects, GRATE_HOME.x, .002, GRATE_HOME.z);
  hatchGlow.rotation.x = -Math.PI / 2;
  hatchGlow.visible = false;

  const museum = museumGeometry({ games, box, plane, material, texture, paper, requestRender });
  scene.add(museum.hall);
  exhibit.add(museum.installation);
  const hallProps = guts.props(museum.hall);
  hallProps.vending.position.set(-2.36, 0, 2.7);
  hallProps.vending.rotation.y = .92;
  hallProps.cabinet.position.set(2.34, 0, -18.1);
  hallProps.cabinet.rotation.y = -.75;
  const homeProps = guts.props(guts.home);
  homeProps.vending.visible = false;
  homeProps.cabinet.position.set(3.1, 0, -2.47);
  homeProps.cabinet.rotation.y = -.18;
  const ductMaterial = material('#913850', { map: guts.materialTile, bumpMap: guts.materialTile, bumpScale: .05, roughness: .35, metalness: .27 });
  const ductPoints = Array.from({ length: 25 }, (_, index) => new THREE.Vector3(-1.4 + Math.sin(index * .73) * .64, 2.81 + Math.sin(index * 1.37) * .18, 4 - index * 1.88));
  const duct = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ductPoints), 68, .16, 8, false);
  geometries.add(duct);
  museum.hall.add(new THREE.Mesh(duct, ductMaterial));
  const growth = new THREE.SphereGeometry(1, 12, 8);
  geometries.add(growth);
  const hallLights = [];
  for (let index = 0; index < 8; index++) {
    const z = 2 - index * 5.2;
    const strut = box(.33 + .15 * (index % 3), 1.2 + .2 * (index % 2), .77, ductMaterial, museum.hall, index % 2 ? 2.73 : -2.75, 2.61, z);
    strut.rotation.z = Math.sin(index * 5) * .32;
    for (let lobe = 0; lobe < 3; lobe++) {
      const mass = new THREE.Mesh(growth, ductMaterial);
      mass.scale.set(.36 + .09 * lobe, .24 + .16 * lobe, .60 + .12 * Math.cos(lobe));
      mass.position.set(strut.position.x - Math.sign(strut.position.x) * (.15 + .34 * lobe), 3.18, z + .5 + .44 * lobe);
      mass.rotation.z = index * .37 + lobe;
      museum.hall.add(mass);
    }
    const glow = new THREE.PointLight(index % 2 ? '#c954b5' : '#68debc', 9, 9, 2);
    glow.position.set(index % 2 ? 1.63 : -1.73, 2.74, z);
    museum.hall.add(glow);
    hallLights.push(glow);
  }
  box(.95, .09, .3, darkMetal, exhibit, -2.4, 2.83, -.7);
  box(.64, .025, .18, amber, exhibit, -2.4, 2.77, -.69);
  box(.95, .09, .3, darkMetal, exhibit, 2.35, 2.83, -2.45);
  box(.64, .025, .18, amber, exhibit, 2.35, 2.77, -2.44);
  scene.traverse(object => { if (object.isLight) object.layers.enable(1); });
  const inspectionKey = new THREE.DirectionalLight('#fff5df', 3.15);
  configureCartridgeKey(inspectionKey);
  const inspectionKeyOffset = inspectionKey.position.clone();
  inspectionKey.castShadow = true;
  const inspectionFill = new THREE.HemisphereLight('#fff4e2', '#a09baa', .88);
  const inspectionRim = new THREE.DirectionalLight('#c3dcff', 1.23);
  for (const light of [inspectionKey, inspectionFill, inspectionRim]) light.layers.set(2);
  camera.add(inspectionKey, inspectionKey.target, inspectionFill, inspectionRim, inspectionRim.target);

  const homeObstacles = [
    { x: -2.38, z: .72, w: 2.14, d: .82 },
    { x: 2.01, z: .34, w: 1.07, d: .73 },
    { x: 0, z: -3.45, w: 4.78, d: .55 }
  ];

  function setCollection(discovered, shelved) {
    found = discovered;
    boxed = shelved;
    canStore = [...found].some(id => !boxed.has(id));
    guts.setShelf(boxed);
    displayCart.model.visible = Boolean(currentGame && currentGame !== HOME && !found.has(currentGame.id));
    updateTarget();
  }

  function setLocation(game) {
    if (docked || transitioning) return;
    if (currentGame) exitDoor = museum.doors.find(door => door.game === currentGame);
    currentGame = game || undefined;
    profile = roomProfile(game?.id, games.indexOf(game));
    scene.fog.near = game ? Math.max(6, profile.depth * .62) : 5;
    scene.fog.far = game ? Math.max(16, profile.depth * 1.54) : 15;
    museum.hall.visible = !game;
    exhibit.visible = Boolean(game);
    guts.home.visible = game === HOME;
    guts.maze.visible = game?.id === 'zonk';
    museum.installation.visible = Boolean(game && game !== HOME);
    pedestal.visible = Boolean(game && game !== HOME);
    displayCart.model.visible = pedestal.visible && !found.has(game.id);
    grateObjects.visible = game?.id === 'kingfisher';
    grateLight.visible = grateObjects.visible;
    if (game) {
      architecture.scale.set(profile.width / 6.5, profile.height / 3.2, profile.depth / 7.7);
      museum.installation.scale.set(profile.width / 6.5, 1, profile.depth / 7.7);
      if (game !== HOME) {
        museum.setExhibit(game);
        skinCartridge(displayCart, game);
        pedestal.position.set(profile.cart[0], 0, profile.cart[1]);
        CART_HOME.set(profile.cart[0], 1.20, profile.cart[1]);
      }
      wall.color.set(game.shellColors?.plastic || '#c08e74').lerp(new THREE.Color('#686567'), .52);
      roomLight.color.set(game.shellColors?.top || '#f6be92');
      roomLight.position.set(.65, Math.min(profile.height - .5, 4.3), -.8);
      camera.position.set(0, 1.62, profile.depth / 2 - .77);
      yaw = 0;
      pitch = -.17;
    } else {
      camera.position.set(exitDoor ? exitDoor.side * 2.25 : 0, 1.62, exitDoor?.z ?? ENTRY_Z);
      yaw = exitDoor ? exitDoor.side * Math.PI / 2 : 0;
      pitch = -.05;
    }
    clearInput();
    updateCamera();
    updateTarget();
  }

  function setCartridge(game) {
    carriedGame = game || undefined;
    if (carriedGame) skinCartridge(carriedCart, carriedGame);
    setCartState(carriedGame ? 'held' : 'on-desk');
  }

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
    if (!inputEnabled || docked || transitioning || inspecting) return emitTarget(null);
    camera.getWorldDirection(forward);
    const candidates = currentGame ? [
      { id: 'exit', point: new THREE.Vector3(0, 1.62, profile.depth / 2 - .12), label: 'Return to corridor' }
    ] : museum.doors.map(door => ({ id: `door:${door.game.id}`, point: door.point, label: `Enter ${door.game.title}` }));
    if (!currentGame) candidates.push({ id: 'home', point: HOME_DOOR, label: 'Go to the living room' });
    if (currentGame === HOME) {
      if (canStore) candidates.push({ id: 'store', point: new THREE.Vector3(0, 1.4, -3.01), label: 'Box new cartridges' });
      for (const [id, { point }] of guts.boxes) {
        if (boxed.has(id)) candidates.push({ id: `box:${id}`, point, label: `Pull ${games.find(game => game.id === id).title} from the shelf` });
      }
    }
    if (currentGame?.id === 'zonk') candidates.push({ id: 'guide', point: new THREE.Vector3(-3.75, .94, 3.15), label: 'Talk to the maze keeper' });
    if (currentGame?.id === 'kingfisher') candidates.push({ id: 'grate', point: GRATE_HOME, label: grateOpen ? 'Inspect open grate' : 'Inspect locked grate' });
    if (displayCart.model.visible) candidates.push({ id: 'cart', point: CART_HOME, label: `Pick up ${currentGame.title}` });
    else if (pedestal.visible && currentGame.cartridgeModel) candidates.push({ id: 'inspect-cart', point: CART_HOME, label: `Inspect ${currentGame.title}` });
    let selected = null;
    let score = -Infinity;
    for (const item of candidates) {
      scratch.copy(item.point).sub(camera.position);
      const distance = scratch.length();
      const alignment = forward.dot(scratch.normalize());
      if (distance > (currentGame ? 2.05 : 2.6) || alignment < .35) continue;
      const value = alignment - distance * .09;
      if (value > score) {
        selected = { id: item.id, label: item.label };
        score = value;
      }
    }
    emitTarget(selected);
  }

  function canStand(x, z) {
    if (!currentGame) return Math.abs(x) < 2.95 && z > ENTRY_Z + 2.3 - museum.length && z < ENTRY_Z + 1.7;
    if (Math.abs(x) >= profile.width / 2 - .29 || Math.abs(z) >= profile.depth / 2 - .33) return false;
    const blockers = currentGame === HOME ? homeObstacles : currentGame.id === 'zonk' ? mazeWalls : [];
    if (pedestal.visible && Math.abs(x - CART_HOME.x) < .55 && Math.abs(z - CART_HOME.z) < .49) return false;
    return !blockers.some(item => Math.abs(x - item.x) < item.w / 2 + .21 && Math.abs(z - item.z) < item.d / 2 + .21);
  }

  function updateMovement(delta) {
    if (!inputEnabled || docked || transitioning || inspecting) return;
    let x = externalMove.x + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    let z = externalMove.z + Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const length = Math.hypot(x, z);
    if (!length) return;
    x /= Math.max(1, length);
    z /= Math.max(1, length);
    const sprinting = run || keys.has('ShiftLeft') || keys.has('ShiftRight');
    const distance = delta * (currentGame ? 2.15 : 4.1) * (sprinting ? 1.85 : 1);
    const nextX = camera.position.x + (Math.cos(yaw) * x - Math.sin(yaw) * z) * distance;
    const nextZ = camera.position.z + (-Math.sin(yaw) * x - Math.cos(yaw) * z) * distance;
    if (!currentGame && Math.abs(nextX) > 2.84 && Math.abs(nextX) > Math.abs(camera.position.x)) {
      const door = museum.doors.find(item => item.side === Math.sign(nextX) && Math.abs(item.z - nextZ) < .76);
      if (door) { onInteract(`door:${door.game.id}`); return; }
    }
    if (!currentGame && nextZ > ENTRY_Z + 1.55 && nextZ > camera.position.z && Math.abs(nextX) < .8) {
      onInteract('home');
      return;
    }
    if (currentGame && nextZ > profile.depth / 2 - .39 && nextZ > camera.position.z && Math.abs(nextX) < .8) {
      onInteract('exit');
      return;
    }
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
    const heightLimit = carriedGame?.cartridgeModel ? .83 : .98;
    const desiredWidth = Math.min(widthLimit, viewport.width - 24, viewport.height * heightLimit);
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
    museum.updateFish(time);
    if (!currentGame) {
      const nearest = Math.max(0, Math.min(hallLights.length - 1, Math.round((2 - camera.position.z) / 5.2)));
      hallLights.forEach((light, index) => { light.visible = Math.abs(index - nearest) <= 1; });
    }
    const background = scene.background;
    window.clearTimeout(inspectionShuffleTimer);
    const drumDelay = inspecting ? inspectionDrums?.update(time, !drag) : undefined;
    const spinning = inspecting && inspectionSlots?.update(time);
    renderer.clear();
    if (inspecting) {
      scene.background = INSPECTION_BACKGROUND;
    } else {
      renderer.render(scene, camera);
      renderer.clearDepth();
      scene.background = null;
    }
    const shadowedInspection = inspecting && inspectionCart.shadows;
    const reflectedInspection = shadowedInspection || (inspecting && (inspectionDrums || inspectionSlots));
    if (reflectedInspection) {
      scene.environment = inspectionReflections ??= createCartridgeReflections();
      scene.environmentIntensity = .76;
    }
    renderer.shadowMap.enabled = shadowedInspection;
    camera.layers.set(shadowedInspection ? 2 : 1);
    renderer.render(scene, camera);
    renderer.shadowMap.enabled = false;
    if (reflectedInspection) scene.environment = null;
    camera.layers.set(0);
    scene.background = background;
    renderedFrames++;
    if (docked) emitScreenRect();
    if ((!docked && !inspecting) || tweens.size || drumDelay === 0 || spinning) requestRender();
    else if (Number.isFinite(drumDelay)) inspectionShuffleTimer = window.setTimeout(requestRender, drumDelay);
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

  function cartridgeSeat() {
    return carriedGame?.cartridgeModel ? MODEL_CART_SEAT : SLOT;
  }

  function setCartState(state) {
    const normalized = ({ desk: 'on-desk', carried: 'held' })[state] || state;
    if (!['on-desk', 'held', 'inserted'].includes(normalized)) return;
    cartState = normalized;
    cartridge.visible = Boolean(carriedGame && (transitioning || docked));
    if (normalized === 'held') {
      camera.add(cartridge);
      cartridge.position.set(.33, -.32, -.67);
      cartridge.rotation.set(-.12, -.32, -.18);
      cartridge.traverse(object => object.layers.set(1));
    } else if (normalized === 'inserted') {
      handheld.add(cartridge);
      cartridge.position.copy(cartridgeSeat());
      cartridge.rotation.set(0, 0, 0);
      cartridge.traverse(object => object.layers.set(1));
    } else {
      camera.add(cartridge);
    }
    updateTarget();
    requestRender();
  }

  function clearInput() {
    keys.clear();
    externalMove = { x: 0, z: 0 };
    run = false;
  }

  function inspectionPose() {
    const width = Math.min(.76, camera.aspect * .72);
    inspectedModel.position.set(0, 0, -.43 / (2 * width * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    inspectionKey.target.position.copy(inspectedModel.position);
    inspectionKey.position.copy(inspectedModel.position).add(inspectionKeyOffset);
    inspectionRim.target.position.copy(inspectedModel.position);
    inspectionRim.position.set(.60, .10, -.50).add(inspectedModel.position);
  }

  function inspectCartridge(game) {
    if (game && (!game.cartridgeModel || docked || transitioning)) return false;
    inspecting = Boolean(game);
    drag = undefined;
    clearInput();
    if (game) {
      releaseMouseLook();
      skinCartridge(inspectionCart, game);
      inspectedModel.traverse(object => object.layers.set(inspectionCart.shadows ? 2 : 1));
      inspectedModel.visible = true;
      inspectedModel.rotation.set(-.09, .19, 0);
      inspectionPose();
      setupInspectionDrums();
      emitTarget(null);
    } else {
      inspectedModel.visible = false;
      inspectionDrums = undefined;
      inspectionSlots?.dispose();
      inspectionSlots = undefined;
      onInspectionDrums(false);
      updateTarget();
    }
    requestRender();
    return true;
  }

  function setupInspectionDrums() {
    inspectionDrums = inspectionCart.asset && createCartridgeDrums(inspectionCart.asset, reduceMotion);
    inspectionDrums?.setAuto(inspectionAuto);
    inspectionSlots?.dispose();
    inspectionSlots = inspectionCart.asset &&
      createCartridgeSlots(inspectionCart.asset, reduceMotion, onInspectionSlotsState);
    onInspectionDrums(Boolean(inspectionDrums), Boolean(inspectionSlots));
  }

  function turnCartridge() {
    if (!inspecting) return;
    inspectionDrums?.resetIdle();
    inspectedModel.rotation.y += Math.PI;
    requestRender();
  }

  async function performDock() {
    transitioning = true;
    releaseMouseLook();
    clearInput();
    emitTarget(null);
    savedPose = { position: camera.position.clone(), yaw, pitch };
    handheld.visible = true;
    handheld.traverse(object => object.layers.set(1));
    const destination = dockPose();
    const peak = destination.clone();
    if (cartState !== 'inserted') peak.y -= .23;
    await tween(365, amount => { handheld.position.lerpVectors(POCKET, peak, amount); });
    if (cartState !== 'inserted') {
      setCartState('held');
      const initialPosition = cartridge.position.clone();
      const initialRotation = cartridge.quaternion.clone();
      handheld.updateMatrixWorld(true);
      const socket = camera.worldToLocal(handheld.localToWorld(cartridgeSeat().clone()));
      const orientation = new THREE.Quaternion();
      await tween(515, amount => {
        cartridge.position.lerpVectors(initialPosition, socket, amount);
        cartridge.position.y += Math.sin(amount * Math.PI) * .31;
        cartridge.quaternion.slerpQuaternions(initialRotation, orientation, amount);
      });
      if (disposed) return;
      setCartState('inserted');
      await tween(170, amount => { handheld.position.lerpVectors(peak, destination, amount); });
    }
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
    await tween(360, amount => { handheld.position.lerpVectors(startPosition, POCKET, amount); });
    if (disposed) return;
    handheld.visible = false;
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

  async function pullBox(id) {
    const entry = guts.boxes.get(id);
    if (!entry?.model.visible || transitioning || docked) return;
    const model = entry.model;
    const start = model.position.clone();
    const yaw = model.rotation.y;
    transitioning = true;
    clearInput();
    await tween(250, amount => {
      model.position.z = start.z + .50 * amount;
      model.rotation.y = yaw + .34 * amount;
    });
    await tween(310, amount => {
      model.position.z = start.z + .50 * (1 - amount);
      model.rotation.y = yaw + .34 * (1 - amount);
    });
    transitioning = false;
  }

  function look(x, y) {
    if (!inputEnabled || docked || transitioning) return;
    if (inspecting) {
      inspectedModel.rotation.y += x * .012;
      inspectedModel.rotation.x = THREE.MathUtils.clamp(inspectedModel.rotation.x + y * .012, -1.2, 1.2);
      requestRender();
      return;
    }
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
    if (inspecting) inspectionPose();
    requestRender();
  }

  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
  function releaseMouseLook() {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  function toggleMouseLook() {
    if (!inputEnabled || docked || transitioning || inspecting) return;
    if (document.pointerLockElement === canvas) return releaseMouseLook();
    if (!canvas.requestPointerLock) return onMouseLook(false, 'Mouse look is unavailable. Drag the room to look.');
    canvas.focus({ preventScroll: true });
    try { canvas.requestPointerLock()?.catch(() => onMouseLook(false, 'Click Mouse look to try again, or drag the room.')); }
    catch { onMouseLook(false, 'Mouse look is unavailable. Drag the room to look.'); }
  }

  function mouseLookChanged() {
    drag = undefined;
    onMouseLook(document.pointerLockElement === canvas);
  }

  function mouseLookMoved(event) {
    if (document.pointerLockElement === canvas) look(event.movementX, event.movementY);
  }

  function keydown(event) {
    if (!inputEnabled || docked || transitioning || inspecting || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)) return;
    if (movementKeys.has(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys.add(event.code);
    if (!event.repeat && (event.code === 'KeyE' || event.code === 'Enter')) {
      event.preventDefault();
      interact();
    }
    if (!event.repeat && event.code === 'KeyM') toggleMouseLook();
  }
  function keyup(event) { keys.delete(event.code); }
  let drag;
  function pointerdown(event) {
    if (!inputEnabled || docked || transitioning || event.button !== 0 || document.pointerLockElement === canvas) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    if (inspectionDrums) {
      inspectionDrums.resetIdle();
      requestRender();
    }
    canvas.setPointerCapture(event.pointerId);
  }
  function pointermove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if ((inspectionDrums || inspectionSlots) && !drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    drag.moved = true;
    look(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  }
  function pointerup(event) {
    if (event.pointerId !== drag?.id) return;
    if ((inspectionDrums || inspectionSlots) && !drag.moved && event.type === 'pointerup') {
      const rect = canvas.getBoundingClientRect();
      inspectionRay.layers.mask = inspectedModel.layers.mask;
      inspectionRay.setFromCamera({
        x: 2 * (event.clientX - rect.left) / rect.width - 1,
        y: 1 - 2 * (event.clientY - rect.top) / rect.height
      }, camera);
      const hit = inspectionRay.intersectObject(inspectionCart.asset, true)[0];
      if (inspectionSlots?.isLever(hit?.object)) inspectionSlots.pull();
      const index = hit ? inspectionDrums?.indexFor(hit.object) ?? -1 : -1;
      if (index >= 0) inspectionDrums.turn(index);
    }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = undefined;
    if (inspectionDrums || inspectionSlots) requestRender();
  }
  function visibilitychange() {
    clearInput();
    if (document.hidden) {
      inspectionDrums?.resetIdle();
      window.clearTimeout(inspectionShuffleTimer);
      cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    } else {
      previousTime = 0;
      requestRender();
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  reduceMotion.addEventListener('change', requestRender);
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', visibilitychange);
  document.addEventListener('pointerlockchange', mouseLookChanged);
  document.addEventListener('mousemove', mouseLookMoved);
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
    setCartridge,
    setLocation,
    setCollection,
    setRun(enabled) { run = Boolean(enabled); },
    pullBox,
    inspectCartridge,
    turnCartridge,
    turnInspectionBand(index) {
      inspectionDrums?.turn(index);
      requestRender();
    },
    pullInspectionLever() {
      if (inspectionSlots?.pull()) requestRender();
    },
    setInspectionAuto(value) {
      inspectionAuto = value;
      inspectionDrums?.setAuto(value);
      requestRender();
    },
    toggleMouseLook,
    setFishCount: museum.setFishCount,
    dock,
    undock,
    openGrate,
    interact,
    resize,
    setInputEnabled(enabled) {
      inputEnabled = Boolean(enabled);
      if (!inputEnabled) releaseMouseLook();
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
      return { cartState, location: currentGame?.id || 'corridor', carried: carriedGame?.id, dimensions: currentGame ? [profile.width, profile.height, profile.depth] : null, docked, inputEnabled, grateOpen, transitioning, target, renderedFrames, screenRect: lastScreenRect, camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw, pitch } };
    },
    dispose() {
      disposed = true;
      inspectionSlots?.dispose();
      releaseMouseLook();
      cancelAnimationFrame(frameRequest);
      window.clearTimeout(inspectionShuffleTimer);
      observer.disconnect();
      reduceMotion.removeEventListener('change', requestRender);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', visibilitychange);
      document.removeEventListener('pointerlockchange', mouseLookChanged);
      document.removeEventListener('mousemove', mouseLookMoved);
      canvas.removeEventListener('pointerdown', pointerdown);
      canvas.removeEventListener('pointermove', pointermove);
      canvas.removeEventListener('pointerup', pointerup);
      canvas.removeEventListener('pointercancel', pointerup);
      for (const item of tweens) item.resolve();
      tweens.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
      museum.dispose();
      guts.dispose();
      for (const loaded of textures.values()) loaded.dispose();
      inspectionKey.shadow.dispose();
      inspectionReflections?.dispose();
      renderer.dispose();
    }
  };
}
