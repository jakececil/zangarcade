import * as THREE from './vendor/three.module.js';

export const HOME = Object.freeze({ id: 'home', title: 'Living room' });

const profiles = {
  tall: { width: 7.1, depth: 8.3, height: 6.8, cart: [-1.65, -.9] },
  vessel: { width: 6.5, depth: 7.7, height: 4.6, cart: [-1.53, -.2] },
  long: { width: 6.8, depth: 14.2, height: 4.1, cart: [-1.63, -4.4] },
  wide: { width: 9.4, depth: 8.8, height: 3.2, cart: [-2.7, -.7] },
  maze: { width: 9.4, depth: 13.4, height: 3.65, cart: [-2.65, -4.92] },
  home: { width: 8.2, depth: 8.4, height: 3.8, cart: null }
};

export function roomProfile(id, index) {
  if (id === 'home') return profiles.home;
  if (id === 'kingfisher') return profiles.vessel;
  if (id === 'zonk') return profiles.maze;
  if (id === 'little-company') return profiles.long;
  return profiles[['tall', 'wide', 'long'][Math.max(0, index) % 3]];
}

export const mazeWalls = [
  { x: -.85, z: 2.05, w: 6.55, d: .22 },
  { x: 1.18, z: -.42, w: 6.55, d: .22 },
  { x: -.85, z: -2.9, w: 6.55, d: .22 }
];

export function buildGuts({ games, box, plane, material, texture, paper }) {
  const home = new THREE.Group();
  const maze = new THREE.Group();
  const materialTile = texture('./art/guts-enamel.webp', 3);
  const iron = material('#78655f', { map: materialTile, bumpMap: materialTile, bumpScale: .05, roughness: .67, metalness: .3 });
  const wood = material('#694848', { map: materialTile, bumpMap: materialTile, bumpScale: .035 });
  const rubber = material('#352a35', { map: materialTile, bumpMap: materialTile, bumpScale: .028 });
  const upholstery = material('#673854', { bumpMap: materialTile, bumpScale: .018, roughness: .98, metalness: 0 });
  const glass = material('#7ddac5', { transparent: true, opacity: .24, depthWrite: false, roughness: .24 });
  const warmth = material('#ffc581', { emissive: '#ff935a', emissiveIntensity: 1.5 });
  const signal = material('#c3ed7d', { emissive: '#a3d75b', emissiveIntensity: .75 });
  const magenta = material('#a64d80', { map: materialTile, bumpMap: materialTile, bumpScale: .024 });
  const black = material('#141218', { roughness: .75 });

  const floorMat = material('#8b3d53', { map: materialTile, roughness: .96 });
  box(2.05, 2.48, .12, black, home, 0, 1.24, 4.08);
  for (const x of [-1.04, 1.04]) box(.08, 2.51, .08, warmth, home, x, 1.25, 3.995);
  box(2.15, .09, .13, warmth, home, 0, 2.52, 4);
  box(5.4, .032, 4.84, floorMat, home, 0, .012, -.12);
  box(2.12, .46, .8, rubber, home, -2.38, .31, .72);
  box(2.14, .72, .198, upholstery, home, -2.38, .70, 1.05);
  for (const x of [-3.4, -1.38]) box(.22, .44, .8, upholstery, home, x, .48, .71);
  for (const x of [-2.85, -1.91]) box(.85, .18, .61, upholstery, home, x, .59, .62);
  const cushion = box(.35, .34, .16, material('#c0aa6c', { bumpMap: materialTile, bumpScale: .009 }), home, -1.85, .85, .87);
  cushion.rotation.z = -.26;
  box(1.07, .11, .73, wood, home, 2.01, .52, .34);
  for (const x of [1.55, 2.46]) box(.11, .47, .55, iron, home, x, .25, .34);
  box(.43, .04, .42, iron, home, 3.13, .03, -1.05);
  box(.06, 2.31, .06, iron, home, 3.13, 1.15, -1.05);
  box(.39, .14, .38, warmth, home, 3.13, 2.30, -1.05);
  const homeLight = new THREE.PointLight('#ffd397', 10, 10, 2);
  homeLight.position.set(2.35, 2.46, -.5);
  home.add(homeLight);
  const fill = new THREE.HemisphereLight('#e8d5bd', '#887086', .68);
  home.add(fill);
  const shelfLight = new THREE.PointLight('#ffd6a1', 13, 5.5, 2);
  shelfLight.position.set(0, 2.42, -2.31);
  home.add(shelfLight);

  const shelf = new THREE.Group();
  shelf.position.z = -3.45;
  home.add(shelf);
  box(4.66, 2.62, .16, wood, shelf, 0, 1.42, -.22);
  for (const x of [-2.36, 2.36]) box(.16, 2.7, .55, wood, shelf, x, 1.42, 0);
  for (let row = 0; row < 4; row++) {
    const y = .45 + row * .68;
    box(4.63, .089, .55, wood, shelf, 0, y, 0);
    box(4.58, .018, .05, warmth, shelf, 0, y - .048, .23);
  }
  const boxes = new Map();
  for (const [index, game] of games.entries()) {
    const x = (index % 7 - 3) * .625;
    const y = .45 + (2 - Math.floor(index / 7)) * .68;
    const caseGroup = new THREE.Group();
    caseGroup.position.set(x, y + .276, .033);
    caseGroup.rotation.y = Math.sin(index * 13) * .045;
    const shell = material(game.shellColors?.edge || '#3e213a', { roughness: .6 });
    box(.424, .515, .116, shell, caseGroup);
    plane(.388, .474, paper(texture('../' + game.cover)), caseGroup, 0, 0, .061);
    shelf.add(caseGroup);
    boxes.set(game.id, { model: caseGroup, point: new THREE.Vector3(x, y + .276, -3.28) });
  }

  // Each baffle leaves a real passage at the opposite end from the previous one.
  mazeWalls.forEach(({ x, z, w, d }, index) => {
    const baffle = box(w, 2.48, d, index % 2 ? magenta : iron, maze, x, 1.24, z);
    box(w, .045, d + .03, signal, maze, x, 2.48, z);
    for (let segment = -3; segment <= 3; segment++) {
      const rib = box(.07, 2.31, d + .1, rubber, maze, x + segment * .88, 1.18, z);
      rib.rotation.z = .1 * Math.sin(segment * 9 + index);
    }
    baffle.name = 'maze-baffle-' + index;
  });
  const guide = new THREE.Group();
  guide.position.set(-3.75, 0, 3.15);
  maze.add(guide);
  box(.52, .6, .5, rubber, guide, 0, .3, 0);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.36, 1), magenta);
  head.scale.set(1.1, .82, .86);
  head.position.y = .84;
  guide.add(head);
  box(.24, .055, .06, signal, guide, .08, .9, .29);
  const ear = box(.08, .52, .13, iron, guide, -.28, 1.13, -.02);
  ear.rotation.z = .45;

  function props(parent) {
    const vending = new THREE.Group();
    parent.add(vending);
    box(.79, 1.83, .54, iron, vending, 0, .915, 0);
    box(.58, 1.06, .06, black, vending, -.047, 1.23, .289);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      box(.109, .15, .08, (row + col) % 2 ? signal : magenta, vending, -.215 + col * .15, .9 + row * .27, .332);
    }
    box(.6, 1.08, .021, glass, vending, -.047, 1.23, .39);
    box(.13, .29, .04, warmth, vending, .302, .69, .291);
    box(.48, .15, .065, black, vending, -.032, .31, .29);

    const cabinet = new THREE.Group();
    parent.add(cabinet);
    box(.77, 1.74, .58, magenta, cabinet, 0, .87, 0);
    box(.62, .49, .074, black, cabinet, 0, 1.27, .303);
    const screen = box(.49, .35, .012, glass, cabinet, 0, 1.27, .347);
    screen.rotation.x = -.09;
    box(.67, .087, .26, iron, cabinet, 0, .87, .37);
    box(.07, .078, .06, signal, cabinet, -.19, .947, .44);
    box(.1, .022, .09, warmth, cabinet, .17, .927, .44);
    box(.62, .11, .027, warmth, cabinet, 0, 1.67, .3);
    return { vending, cabinet };
  }

  return {
    home, maze, boxes, props, materialTile,
    setShelf(ids) { for (const [id, entry] of boxes) entry.model.visible = ids.has(id); },
    dispose() { head.geometry.dispose(); }
  };
}
