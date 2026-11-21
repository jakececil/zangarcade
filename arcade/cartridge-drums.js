const idleDelay = 5000;
const turnDuration = 460;
const detent = Math.PI / 3;

export function createCartridgeDrums(model, reducedMotion) {
  const bands = [];
  const indices = new Map();
  model.traverse(object => {
    const index = object.userData.cartridgeDrumBand;
    if (!Number.isInteger(index) || index < 0 || index > 2) return;
    bands[index] = { object, rest: object.rotation.y, face: 0, move: null };
    indices.set(object, index);
  });
  if (indices.size !== 3 || bands.filter(Boolean).length !== 3) return null;
  let idleUntil = null;
  let auto = true;

  function turn(index, now = performance.now(), direction = 1) {
    const band = bands[index];
    band.face = (band.face + direction + 6) % 6;
    const from = band.object.rotation.y;
    const target = band.rest + band.face * detent;
    const delta = Math.atan2(Math.sin(target - from), Math.cos(target - from));
    band.move = { from, delta, now };
    idleUntil = now + idleDelay;
  }

  function update(now, canShuffle) {
    const shuffle = canShuffle && auto && !reducedMotion.matches;
    if (shuffle) {
      idleUntil ??= now + idleDelay;
      if (now >= idleUntil) {
        const pool = [0, 1, 2];
        const count = 1 + Math.floor(Math.random() * pool.length);
        for (let i = 0; i < count; i++) {
          const [index] = pool.splice(Math.floor(Math.random() * pool.length), 1);
          turn(index, now, Math.random() < .5 ? -1 : 1);
        }
      }
    } else {
      idleUntil = null;
    }
    let moving = false;
    for (const band of bands) {
      if (!band.move) continue;
      const { from, delta, now: start } = band.move;
      const t = reducedMotion.matches ? 1 : Math.max(0, Math.min(1, (now - start) / turnDuration));
      band.object.rotation.y = from + delta * (t * t * (3 - 2 * t));
      if (t === 1) {
        band.object.rotation.y = band.rest + band.face * detent;
        band.move = null;
      } else moving = true;
    }
    return moving ? 0 : idleUntil === null ? Infinity : idleUntil - now;
  }

  return {
    turn,
    update,
    get auto() { return auto; },
    setAuto(value) { auto = value; idleUntil = null; },
    resetIdle() { idleUntil = null; },
    indexFor(object) {
      for (let node = object; node; node = node.parent) {
        if (indices.has(node)) return indices.get(node);
        if (node === model) break;
      }
      return -1;
    }
  };
}
