import * as THREE from './vendor/three.module.js';
import { loadCartridgeAsset } from './cartridge-assets.js';

const couch = { x: -.68, z: 1.30, w: 2.87, d: 1.14 };
const bench = { x: -.68, z: -2.55, w: 3.18, d: 1.04 };
export const shelf = { x: 3.67, z: -.36, w: .63, d: 4.88 };
export const apartmentBlockers = [couch, bench, shelf, { x: -3.19, z: .52, w: .58, d: .6 }];
export const seatTarget = [couch.x, .97, couch.z + .54];
export const seatEye = [couch.x, 1.14, couch.z - .32];
export const tvScreen = { x: bench.x, y: 1.55, z: bench.z + .365, width: 1.72 };

export function buildApartment({ home, box, plane, material, texture, paper, requestRender }) {
  const furniture = new THREE.Group();
  home.add(furniture);
  const enamel = texture('./art/guts-enamel.webp', 2);
  const walnut = material('#6e4736', { map: enamel, bumpMap: enamel, bumpScale: .013, roughness: .85 });
  const bronze = material('#735746', { metalness: .42, roughness: .52 });
  const ash = material('#372e35', { map: enamel, roughness: .78 });
  const green = material('#36736d', { map: enamel, roughness: .91 });
  const pink = material('#aa426c', { roughness: .48 });
  const butter = material('#e0aa5d', { roughness: .52 });
  const coal = material('#1c1b24', { roughness: .77 });
  const glass = material('#151b22', { roughness: .24, metalness: .15 });
  const glow = material('#fff2bd', { emissive: '#ffb55f', emissiveIntensity: 1.6 });
  const pilot = material('#a6dc96', { emissive: '#7be26e', emissiveIntensity: .9 });

  const rug = texture('./art/apartment-rug.webp');
  plane(5.02, 5.05, material('#ffffff', { map: rug, bumpMap: rug, bumpScale: .009, roughness: 1 }),
    furniture, -.66, -.019, -.19).rotation.x = -Math.PI / 2;

  const windowX = -2.69;
  const windowZ = -4.114;
  const windowY = 2.26;
  plane(2.19, 2.08, paper(texture('./art/apartment-window.webp')), furniture, windowX, windowY, windowZ);
  for (const offset of [-1.13, 1.13]) box(.11, 2.23, .12, bronze, furniture, windowX + offset, windowY, windowZ + .04);
  for (const offset of [-1.075, .16, 1.075]) {
    box(2.36, .083, .12, bronze, furniture, windowX, windowY + offset, windowZ + .04);
  }
  box(.047, 2.09, .075, bronze, furniture, windowX + .12, windowY, windowZ + .04);
  box(2.45, .10, .24, walnut, furniture, windowX, windowY - 1.09, windowZ + .09);

  for (const x of [-1.40, 1.40]) {
    box(.13, .60, .88, ash, furniture, bench.x + x, .30, bench.z);
    box(.21, .05, .96, coal, furniture, bench.x + x, .031, bench.z);
  }
  box(bench.w, .13, bench.d, walnut, furniture, bench.x, .645, bench.z);
  box(2.78, .08, .82, walnut, furniture, bench.x, .19, bench.z);
  for (const [i, [x, color]] of [[-.9, green], [.11, ash], [.95, bronze]].entries()) {
    const console = new THREE.Group();
    console.position.set(bench.x + x, .23, bench.z);
    furniture.add(console);
    console.rotation.y = (i - 1) * .09;
    box(.69, .22, .51, color, console, 0, .11);
    box(.34, .012, .057, coal, console, -.07, .222, -.04);
    box(.05, .025, .012, pilot, console, .24, .11, .26);
    for (let vent = 0; vent < 5; vent++) box(.026, .011, .13, coal, console, .11 + vent * .038, .225, .08);
  }
  for (const [i, color] of [pink, green, butter, ash, bronze].entries()) {
    const stack = new THREE.Group();
    stack.position.set(bench.x + (i < 3 ? -1.34 : 1.34), .72 + (i < 3 ? i : i - 3) * .049, bench.z + .25);
    stack.rotation.y = Math.sin(i * 7.2) * .36 + .16;
    furniture.add(stack);
    box(.29, .049, .19, color, stack);
    box(.20, .004, .122, butter, stack, 0, .026, -.012);
    box(.19, .012, .026, bronze, stack, 0, 0, .094);
  }

  const sideTableX = -3.19;
  const sideTableZ = .52;
  box(.58, .065, .60, walnut, furniture, sideTableX, .57, sideTableZ);
  for (const x of [-.21, .21]) box(.062, .54, .42, ash, furniture, sideTableX + x, .27, sideTableZ);
  box(.28, .054, .28, bronze, furniture, sideTableX, .63, sideTableZ);
  box(.047, .48, .047, bronze, furniture, sideTableX, .87, sideTableZ);
  box(.35, .24, .35, glow, furniture, sideTableX, 1.14, sideTableZ);
  box(.364, .03, .364, bronze, furniture, sideTableX, 1.26, sideTableZ);

  const fallbackCouch = new THREE.Group();
  const fallbackTV = new THREE.Group();
  furniture.add(fallbackCouch, fallbackTV);
  box(2.84, .37, 1.07, ash, fallbackCouch, 0, .26, 0);
  box(2.57, .77, .28, green, fallbackCouch, 0, .78, -.41);
  for (const x of [-1.28, 1.28]) box(.28, .52, 1.1, ash, fallbackCouch, x, .55, 0);
  for (const x of [-.55, .55]) box(1.08, .20, .79, green, fallbackCouch, x, .54, .09);
  fallbackCouch.position.set(couch.x, 0, couch.z);
  fallbackCouch.rotation.y = Math.PI;
  box(2.29, 1.37, .69, ash, fallbackTV, 0, .70);
  box(1.94, 1.08, .021, coal, fallbackTV, 0, .84, .347);
  fallbackTV.position.set(bench.x, .71, bench.z);

  const screen = plane(tvScreen.width, tvScreen.width * 9 / 16, glass, furniture, tvScreen.x, tvScreen.y, tvScreen.z);
  const indicator = box(.025, .014, .011, pilot, furniture, bench.x - .91, .94, tvScreen.z);
  indicator.visible = false;
  const screenLight = new THREE.PointLight('#8fbbcf', 0, 4.4, 2);
  screenLight.position.set(tvScreen.x, tvScreen.y, tvScreen.z + .16);
  const windowLight = new THREE.PointLight('#bdabff', 10.5, 7, 2);
  windowLight.position.set(windowX, windowY, windowZ + .52);
  const lampLight = new THREE.PointLight('#ffc887', 6.2, 5.5, 2);
  lampLight.position.set(sideTableX, 1.42, sideTableZ);
  furniture.add(screenLight, windowLight, lampLight);

  for (const [x, y, width, height, title] of [
    [1.61, 2.42, .82, 1.01, 'zonk'],
    [2.60, 2.19, .59, .75, 'lighthouse-keeper']
  ]) {
    box(width + .09, height + .09, .038, walnut, furniture, x, y, windowZ + .034);
    plane(width, height, paper(texture(`../art/covers/${title}.webp`)), furniture, x, y, windowZ + .054);
  }

  const shade = document.createElement('canvas');
  shade.width = shade.height = 96;
  const context = shade.getContext('2d');
  const gradient = context.createRadialGradient(48, 48, 6, 48, 48, 48);
  gradient.addColorStop(0, '#080509bf');
  gradient.addColorStop(.58, '#08050980');
  gradient.addColorStop(1, '#08050900');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  const shadow = new THREE.CanvasTexture(shade);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false, toneMapped: false });
  for (const [x, z, w, d] of [[couch.x, couch.z, 3.65, 1.77], [bench.x, bench.z, 3.85, 1.64], [sideTableX, sideTableZ, .95, .93]]) {
    plane(w, d, shadowMaterial, furniture, x, -.017, z).rotation.x = -Math.PI / 2;
  }

  let loading;
  return {
    load() {
      loading ??= Promise.allSettled([
        mount('couch', fallbackCouch),
        mount('tv', fallbackTV)
      ]);
      return loading;
    },
    setTV(on) {
      screen.material = on ? coal : glass;
      screenLight.intensity = on ? 4 : 0;
      indicator.visible = on;
      requestRender();
    },
    dispose() { shadow.dispose(); shadowMaterial.dispose(); }
  };

  async function mount(name, fallback) {
    const model = (await loadCartridgeAsset(`arcade/art/apartment-${name}.glb?v=1`)).clone(true);
    model.position.copy(fallback.position);
    model.rotation.copy(fallback.rotation);
    furniture.add(model);
    fallback.visible = false;
    requestRender();
  }
}
