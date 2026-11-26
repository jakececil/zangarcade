const released = Object.freeze({ pressed: false, value: 0 });
const pressed = Object.freeze({ pressed: true, value: 1 });
const sonyDualSense = /dualsense|054c\b.*\b(?:0ce6|0df2|0e5f)\b/i;
const hatDirections = [
  [0], [0, 3], [3], [1, 3], [1], [1, 2], [2], [0, 2]
];

function normalize(pad) {
  if (pad.mapping === 'standard') return pad;
  // Raw Windows HID layout used by Chromium's DualSense standard mapper.
  if (!sonyDualSense.test(pad.id) || pad.axes.length < 10 || pad.buttons.length < 14) return pad;
  const hat = pad.axes[9];
  const dpad = hat >= -1 && hat <= 1 ? hatDirections[Math.round((hat+1)*3.5)] : [];
  const buttons = [1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(index => pad.buttons[index]);
  for (let i = 0; i < 2; i++) {
    const value = Math.max(0,Math.min(1,(pad.axes[3+i]+1)/2));
    buttons[6+i] = { pressed:value >= .55, value };
  }
  for (let i = 0; i < 4; i++) buttons.push(dpad.includes(i) ? pressed : released);
  buttons.push(pad.buttons[12], pad.buttons[13]);
  return {
    id: pad.id, index: pad.index, mapping: 'standard',
    buttons, axes: [pad.axes[0], pad.axes[1], pad.axes[2], pad.axes[5]]
  };
}

export function readGamepads() {
  try {
    const pads = navigator.getGamepads?.() ?? navigator.webkitGetGamepads?.() ?? [];
    return Array.from(pads).filter(pad => pad && pad.connected !== false).map(normalize);
  } catch {
    // The browser can deny enumeration in a frame or when the tab loses focus.
    return [];
  }
}

export function emulatorGamepads() {
  return readGamepads().map(pad => {
    if (pad.mapping !== 'standard') return pad;
    const buttons = [...pad.buttons];
    const [x, y] = pad.axes;
    const directions = [-y, y, -x, x];
    for (const [i, value] of directions.entries()) {
      if (value > .56) buttons[12+i] = pressed;
    }
    return { id: pad.id, index: pad.index, axes: pad.axes, buttons };
  });
}

export function watchGamepad(step) {
  let previous = [];
  let previousId;
  let previousTime;
  let frame;
  function poll(time) {
    const pads = document.hasFocus() ? readGamepads() : [];
    const pad = pads.find(item => item.mapping === 'standard') ?? pads[0];
    const identity = pad ? pad.id + '_' + pad.index : undefined;
    if (identity !== previousId) previous = [];
    const down = i => Boolean(pad?.buttons[i]?.pressed);
    const edge = i => down(i) && !previous[i];
    const delta = Math.min((time-(previousTime ?? time))/1000,.05);
    step(pad, down, edge, delta);
    previous = pad ? Array.from(pad.buttons, button => Boolean(button?.pressed)) : [];
    previousId = identity;
    previousTime = time;
    frame = requestAnimationFrame(poll);
  }
  frame = requestAnimationFrame(poll);
  window.addEventListener('pagehide', () => cancelAnimationFrame(frame), { once: true });
}

export function stick(x = 0, y = 0) {
  const length = Math.hypot(x,y);
  const strength = Math.max(0,Math.min(1,(length-.18)/.82));
  return length ? [x*strength/length,y*strength/length] : [0,0];
}
