export const landfillProfile = Object.freeze({ width: 24, depth: 42, height: 11, cart: [2.3, -12.75] });
export const waterLevel = -1.93;
export const coastEdge = -17.5;
export const lanes = [-3.2, 0, 3.2];
export const sortZ = 4.65;
export const sortApproach = 8.1;
export const serviceWindow = [8.55, .41, -11.37];

export function landfillLevel(z) {
  return -.18 * Math.max(0, Math.min(8, -5 - z));
}

export function canWalkLandfill(x, z) {
  if (z < coastEdge + .32 || Math.abs(x) > 10.95) return false;
  if (z > -8 && Math.abs(x) > 7.2) return false;
  if (z > .95 && z < 10.65 && Math.abs(x) > 4.98) return false;
  if (z < -10.9 && z > -14.25 && x > 4.9 && x < 10.65) return false;
  if (Math.hypot(x - 5.18, z + 15.83) < .3) return false;
  return true;
}

// Shared by the playable room and the fixed-camera depth capture for Chisel.
// Dimensions and positions are in the arcade's Y-up, metre-scale coordinates.
export function landfillLayout(add) {
  let seed = 289;
  function roll() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  let zone = 'yard';
  const slab = (w, h, d, surface, x, y, z, ry = 0, rx = 0, rz = 0) =>
    add({ shape: 'box', size: [w, h, d], surface, zone, x, y, z, rx, ry, rz });
  const round = (top, bottom, h, surface, x, y, z, rx = 0, rz = 0, segments = 16) =>
    add({ shape: 'round', size: [top, bottom, h, segments], surface, zone, x, y, z, rx, ry: 0, rz });

  slab(23.5, .7, 26, 'concrete', 0, -.36, 8);
  zone = 'coast-ground';
  slab(23.5, .73, 8.13, 'concrete', 0, -1.09, -9, 0, -Math.atan(.18));
  slab(23.5, .81, 4.5, 'concrete', 0, -1.845, -15.25);
  zone = 'coast';
  slab(23.5, .55, .4, 'iron', 0, -1.57, -17.64);
  for (let i = -4; i <= 4; i++) {
    slab(.42, 2.7, .53, 'iron', i * 2.57, -2.31, -17.54);
    slab(.11, .96, .12, 'iron', i * 2.77, -.96, -17.36);
  }
  slab(23, .085, .1, 'stripe', 0, -.54, -17.36);
  slab(23, .065, .08, 'iron', 0, -.84, -17.36);
  zone = 'yard';
  for (let z = -3; z < 20; z += 1.9) {
    for (const x of [-4.88, 4.88]) slab(.15, .018, .96, 'stripe', x, .003, z);
  }
  for (const x of [-1.58, 1.58]) {
    slab(.10, .028, 5.4, 'iron', x, .006, sortZ);
    for (let i = 0; i < 9; i++) slab(.17, .017, .19, 'stripe', x, .024, 2.4 + i * .57);
  }
  for (const x of lanes) {
    slab(2.5, .095, 2.95, 'iron', x, -.035, sortZ);
    for (let i = 0; i < 14; i++) slab(.08, .022, 2.74, 'hot', x - 1.02 + i * .156, .02, sortZ);
    for (const offset of [-1.34, 1.34]) slab(.15, .065, 3.12, 'rust', x + offset, .029, sortZ);
  }
  for (const x of [-5.35, 5.35]) {
    for (const z of [1.3, 9.8]) {
      slab(.83, .24, .84, 'concrete', x, .11, z);
      slab(.43, 9.8, .43, 'rust', x, 4.99, z);
      slab(.60, .30, .58, 'iron', x, 2.3, z);
      slab(.60, .30, .58, 'iron', x, 7.55, z);
      for (const dx of [-.29, .29]) {
        for (const dz of [-.29, .29]) round(.07, .07, .06, 'iron', x + dx, .242, z + dz);
      }
    }
    slab(.49, .6, 9.4, 'iron', x, 8.86, 5.54);
    slab(.22, 12.1, .25, 'rust', x, 4.9, 5.55, 0, .705);
    slab(.27, .33, 9.2, 'rust', x, 4.57, 5.54);
    slab(.34, 1.09, 9.97, 'iron', x, .54, 5.55);
    slab(.41, .085, 9.95, 'stripe', x, 1.12, 5.55);
    slab(3.3, 1.55, .55, 'concrete', x * 1.3, .76, 10.51);
    slab(3.3, 1.55, .55, 'concrete', x * 1.3, .76, 1.03);
    for (let i = 0; i < 5; i++) {
      const z = 2.15 + i * 1.72;
      slab(.15, 1.48, .15, 'iron', x, .78, z);
    }
    round(.22, .22, 8.35, 'iron', x * 1.06, 4.41, 8.98);
  }
  for (const z of [1.3, 4.65, 7.0, 9.8]) {
    slab(11.24, .44, .37, 'rust', 0, 8.96, z);
    slab(11.24, .22, .36, 'iron', 0, 10.03, z);
    for (let i = -4; i <= 4; i++) {
      slab(.115, 1.51, .17, 'iron', i * 1.16 + .14, 9.55, z, 0, 0, (i % 2 ? -1 : 1) * .80);
    }
  }
  for (const x of lanes) {
    slab(2.47, 1.35, 2.9, 'rust', x, 8.05, sortZ);
    slab(2.21, .18, 2.73, 'iron', x, 7.34, sortZ);
    slab(2.34, .12, .18, 'stripe', x, 7.46, 6.13);
    slab(.51, .10, .25, 'lamp', x, 7.9, 6.14);
    round(.28, .28, 1.88, 'iron', x, 9.33, sortZ);
  }
  slab(4.25, .81, .25, 'iron', 0, 3.23, 10.03);
  for (const x of [-2.04, 2.04]) round(.075, .075, .28, 'lamp', x, 3.23, 10.19, Math.PI / 2);
  for (const x of [-2, 2]) {
    round(.023, .023, 5.22, 'wire', x, 6.2, 9.96);
    slab(.14, .38, .28, 'iron', x, 3.65, 9.99);
  }
  slab(10.88, .14, .18, 'iron', 0, 2.91, 7.25);
  for (const x of [-5.35, 5.35]) {
    slab(.22, .22, 2.54, 'iron', x, 2.91, 8.55);
    slab(.057, 1.01, .06, 'iron', x, 1.60, 7.25);
    slab(.06, 1.89, .055, 'rust', x, 2.27, 7.25);
  }

  // Concrete retaining blocks and salvaged bales frame the sorting run.
  for (const sign of [-1, 1]) {
    for (let row = 0; row < 10; row++) {
      const z = -3.7 + row * 2.41;
      const x = sign * (8.4 + (roll() - .5) * 1.2);
      const count = 1 + Math.floor(roll() * 4);
      let level = 0;
      for (let layer = 0; layer < count; layer++) {
        const w = 1.25 + roll() * 1.2;
        const h = .76 + roll() * .37;
        const d = 1.15 + roll() * .84;
        const bx = x + (roll() - .5) * .48;
        const bz = z + (roll() - .5) * .56;
        const angle = (roll() - .5) * .38;
        slab(w, h, d, 'bale' + ((row + layer) % 4), bx, level + h / 2, bz, angle, .02, .033);
        for (const shift of [-.24, .24]) {
          slab(.043, h + .026, d + .028, 'wire', bx + shift * w, level + h / 2, bz, angle, .02, .033);
        }
        level += h;
      }
    }
    for (let i = 0; i < 9; i++) {
      const x = sign * (8.62 + roll() * 1.4);
      const z = -4.4 - i * 1.27;
      if (sign > 0 && z < -9) continue;
      const y = landfillLevel(z);
      zone = z < -5.5 ? 'coast' : 'yard';
      slab(1.1, .56, 1.1, 'bale' + (i % 4), x, y + .27, z, roll());
    }
    zone = 'yard';
    slab(4.8, 4, .55, 'concrete', sign * 3.52, 2.0, 20.92);
    slab(.33, 2.82, .47, 'rust', sign * 1.04, 1.41, 20.58);
  }
  slab(2.5, 1.28, .52, 'concrete', 0, 3.43, 20.84);
  slab(2.15, 2.4, .10, 'iron', 0, 1.2, 20.86);
  slab(2.25, .12, .38, 'stripe', 0, 2.37, 20.66);

  // Food truck pieced together from an old sorting van, including a real
  // recess behind the open serving hatch and an angled canopy.
  zone = 'coast';
  const tx = 7.86;
  const tz = -12.68;
  const ty = -1.44;
  slab(5.15, .32, 2.14, 'iron', tx, ty + .65, tz);
  slab(3.65, .56, 2.16, 'truck', tx + .61, ty + .89, tz);
  slab(3.65, .58, 2.16, 'truck', tx + .61, ty + 2.69, tz);
  slab(3.65, 1.27, .14, 'truck', tx + .61, ty + 1.78, tz - 1);
  for (const dx of [-1.68, 1.68]) slab(.28, 1.27, 2.17, 'truck', tx + .61 + dx, ty + 1.78, tz);
  slab(3.15, 1.24, .12, 'hatch', tx + .61, ty + 1.78, tz + .26);
  slab(3.30, .11, .43, 'counter', tx + .61, ty + 1.16, tz + 1.23);
  slab(3.36, .085, .94, 'rust', tx + .61, ty + 2.61, tz + 1.51, 0, .18);
  slab(3.42, .075, .085, 'lamp', tx + .61, ty + 2.51, tz + 1.95);
  slab(1.44, 1.36, 2.05, 'truck', tx - 1.97, ty + 1.28, tz);
  slab(1.12, .71, 1.96, 'hatch', tx - 1.6, ty + 2.18, tz, 0, 0, -.13);
  slab(1.04, .11, 2.05, 'truck', tx - 1.56, ty + 2.6, tz);
  slab(.17, .17, 2.23, 'counter', tx - 2.66, ty + .65, tz);
  for (const offset of [-1.78, 1.62]) {
    for (const side of [-1, 1]) {
      round(.48, .48, .28, 'tire', tx + offset, ty + .48, tz + side * .98, Math.PI / 2);
      round(.24, .24, .033, 'counter', tx + offset, ty + .48, tz + side * 1.14, Math.PI / 2);
    }
  }
  for (const z of [tz - .67, tz + .67]) slab(.098, .15, .27, 'lamp', tx - 2.714, ty + 1.01, z);
  slab(.88, .59, .56, 'rust', 4.03, ty + .32, -15.17, -.21);
  slab(.94, .065, .62, 'iron', 4.03, ty + .625, -15.17, -.21);
  slab(1.8, .14, .64, 'counter', -5.6, ty + .67, -14.14, -.13);
  for (const x of [-6.20, -5.03]) slab(.12, .67, .36, 'iron', x, ty + .33, -14.11);
  for (const x of [-7.85, 5.18]) {
    round(.085, .105, 3.05, 'iron', x, ty + 1.53, -15.83);
    slab(.63, .105, .13, 'iron', x, ty + 3.06, -15.83);
    slab(.39, .035, .10, 'lamp', x, ty + 2.987, -15.83);
  }

  // Broken profiles on the landward side keep the whole yard in Trashland.
  for (let i = 0; i < 98; i++) {
    const sign = i % 2 ? 1 : -1;
    const x = sign * (12.35 + roll() * 13.5);
    const z = 22.5 - roll() * 41;
    const radius = 1.06 + roll() * 3.32;
    const height = radius * (.79 + roll() * 1.26);
    zone = z < -5.5 ? 'coast' : 'yard';
    round(radius * (.11 + roll() * .18), radius, height, 'rubble' + (i % 3),
      x, height * .32 - .65, z, (roll() - .5) * .4, (roll() - .5) * .42, 5 + (i % 3));
  }
}
