const detent = Math.PI / 3;
const stopTimes = [690, 1010, 1350];
const spinStart = 205;
const winPulse = 1320;

export function createCartridgeSlots(model, reducedMotion, onState) {
  let lever;
  const reelNodes = [];
  const lamps = [];
  model.traverse(part => {
    if (part.userData.sugarLever) lever = part;
    const index = part.userData.sugarReel;
    if (Number.isInteger(index) && index >= 0 && index < 3) reelNodes[index] = part;
    if (part.userData.sugarLamp && part.material?.emissive) lamps.push(part);
  });
  if (!lever || reelNodes.filter(Boolean).length !== 3 || !lamps.length) return null;
  const leverRest = lever.rotation.x;
  const reels = reelNodes.map((object, i) => ({ object, rest: object.rotation.x, face: i*2, next: 0 }));
  const cloned = new Map();
  const sources = lamps.map(part => {
    const source = part.material;
    if (!cloned.has(source)) {
      const lens = source.clone();
      const { r, g, b } = lens.emissive;
      const peak = Math.max(r, g, b);
      if (peak > 0) lens.emissive.multiplyScalar(1 / peak);
      cloned.set(source, lens);
    }
    part.material = cloned.get(source);
    return source;
  });
  let start = null;
  let won = null;

  function illuminate(amount) {
    for (const material of cloned.values()) material.emissiveIntensity = .035 + amount*5.3;
  }

  function snapReels() {
    for (const reel of reels) reel.object.rotation.x = reel.rest + reel.face*detent;
  }
  snapReels();
  illuminate(0);

  function pull(now = performance.now()) {
    if (start !== null) return false;
    won = null;
    illuminate(0);
    for (const reel of reels) reel.next = Math.floor(Math.random()*6);
    start = now;
    onState('spinning');
    return true;
  }

  function update(now) {
    if (start !== null) {
      const duration = now - start;
      if (!reducedMotion.matches && duration < stopTimes[2]) {
        const pullDown = Math.min(1, Math.max(0, duration/spinStart));
        const release = Math.min(1, Math.max(0, (duration-spinStart-85)/300));
        lever.rotation.x = leverRest + 1.04*Math.sin(pullDown*Math.PI/2)*(1-release*release*(3-2*release));
        for (const [i,reel] of reels.entries()) {
          const t = Math.min(1,Math.max(0,(duration-spinStart)/(stopTimes[i]-spinStart)));
          const stop = ((reel.next-reel.face+6)%6 + (2+i)*6)*detent;
          reel.object.rotation.x = reel.rest + reel.face*detent + stop*(1-(1-t)**2.5);
        }
        return true;
      }
      lever.rotation.x = leverRest;
      for (const reel of reels) reel.face = reel.next;
      snapReels();
      start = null;
      const match = reels.every(reel => reel.face === reels[0].face);
      won = match ? now : null;
      onState(match ? 'match' : 'miss');
    }
    if (won === null) return false;
    const pulse = now - won;
    if (reducedMotion.matches || pulse >= winPulse) {
      illuminate(.82);
      return false;
    }
    illuminate(.64 + .36*Math.cos(pulse/88)**2);
    return true;
  }

  function isLever(part) {
    for (let node=part; node && node !== model; node=node.parent) {
      if (node === lever) return true;
    }
    return false;
  }

  return {
    pull, update, isLever,
    dispose() {
      lever.rotation.x = leverRest;
      for (const reel of reels) reel.object.rotation.x = reel.rest;
      lamps.forEach((part,i) => { part.material = sources[i]; });
      for (const material of cloned.values()) material.dispose();
    }
  };
}
