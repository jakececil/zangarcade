import { Euler } from './vendor/three.module.js';

const buttons = [
  ['FieldB', 0, 'z', -.027],
  ['FieldSelect', 2, 'z', -.018],
  ['FieldStart', 3, 'z', -.018],
  ['FieldA', 8, 'z', -.027],
  ['FieldL', 10, 'y', -.031],
  ['FieldR', 11, 'y', -.031]
];

export function createFieldPlayerControls(asset) {
  const pad = asset.getObjectByName('FieldDPad');
  const rest = pad?.quaternion.clone();
  const euler = new Euler();
  const keys = buttons.flatMap(([name, input, axis, travel]) => {
    const mesh = asset.getObjectByName(name);
    return mesh ? [{ mesh, input, axis, travel, origin: mesh.position[axis] }] : [];
  });
  let pressed = 0;
  let x = 0;
  let y = 0;
  const down = input => Number(Boolean(pressed & (1 << input)));

  function update(delta, instant = false) {
    const amount = instant ? 1 : 1 - Math.exp(-54 * delta);
    let moving = false;
    function approach(current, target) {
      const next = current + (target - current) * amount;
      if (Math.abs(next - target) < .00035) return target;
      moving = true;
      return next;
    }
    for (const key of keys) {
      key.mesh.position[key.axis] = approach(key.mesh.position[key.axis], key.origin + key.travel * down(key.input));
    }
    if (pad) {
      const horizontal = down(7) - down(6);
      const vertical = down(4) - down(5);
      const length = Math.max(1, Math.hypot(horizontal, vertical));
      x = approach(x, -.21 * vertical / length);
      y = approach(y, .21 * horizontal / length);
      pad.quaternion.setFromEuler(euler.set(x, y, 0)).premultiply(rest);
    }
    return moving;
  }

  return {
    setPressed(mask) { pressed = mask; },
    update,
    readPose() {
      return {
        pressed, pitch: x, lean: y,
        travel: Object.fromEntries(keys.map(key => [key.input, key.mesh.position[key.axis] - key.origin]))
      };
    }
  };
}
