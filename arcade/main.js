import { createRoom } from './room.js';

const canvas = document.getElementById('room');
const entrance = document.getElementById('entrance');
const enterButton = document.getElementById('enter-room');
const roomHud = document.getElementById('room-hud');
const playHud = document.getElementById('play-hud');
const interactButton = document.getElementById('interact');
const lowerButton = document.getElementById('lower-handheld');
const iframe = document.getElementById('handheld-screen');
const progressLabel = document.getElementById('progress-label');
const playerState = document.getElementById('player-state');
const saveWarning = document.getElementById('save-warning');
const announcement = document.getElementById('announcement');
const movePad = document.getElementById('move-pad');
const padThumb = document.getElementById('pad-thumb');
const base = new URL('../', location.href);
const progressKey = `zang-arcade:${base.pathname}:room:kingfisher-v1`;
let room;
let mode = 'loading';
let cartState = 'on-desk';
let target;
let gameRunning = false;
let lowerTimer;
let audio;
const held = new Map();
let progress = readProgress();

function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(progressKey));
    if (value?.version === 1 && typeof value.open === 'boolean' && Number.isInteger(value.catches) && value.catches >= 0) return value;
  } catch {}
  return { version: 1, open: false, catches: 0 };
}

function warn(message) {
  saveWarning.textContent = message;
  saveWarning.hidden = !message;
}

function setMode(next) {
  mode = next;
  document.body.dataset.mode = next;
  roomHud.hidden = next !== 'room';
  playHud.hidden = !['docking', 'play', 'saving'].includes(next);
  updateInteraction();
}

function updateProgress() {
  progressLabel.textContent = progress.open ? 'A little light below. The grate is open.'
    : cartState === 'on-desk' ? 'Find the Kingfisher cartridge.'
    : cartState === 'held' ? 'Kingfisher in hand. Find its slot.'
    : `${progress.catches} / 10 fish saved. The handheld is ready.`;
}

function updatePlayerLabel() {
  playerState.textContent = progress.open ? 'Ten fish. Something opened in the room.'
    : gameRunning ? `${progress.catches} / 10 fish saved` : 'Choose Start Game on the screen.';
}

function acceptSave(save) {
  if (!save?.valid || !Number.isInteger(save.catches) || !Number.isInteger(save.parkedCatches)) return;
  const count = Math.max(save.catches, save.parkedCatches);
  const opens = !progress.open && count >= 10;
  if (count <= progress.catches && !opens) return;
  progress = { version: 1, catches: Math.max(progress.catches, count), open: progress.open || count >= 10 };
  try { localStorage.setItem(progressKey, JSON.stringify(progress)); }
  catch { warn('Room progress could not be saved. Keep this tab open to preserve the open grate.'); }
  if (opens) {
    room.openGrate(true);
    document.body.dataset.grate = 'open';
    announcement.textContent = 'Ten fish saved. The floor grate opens and reveals a light below.';
  }
  updateProgress();
  if (mode === 'play') updatePlayerLabel();
}

function send(action, data = {}) {
  iframe.contentWindow?.postMessage({ type: 'zang-room-command', room: 'kingfisher-v1', action, ...data }, location.origin);
}

function updateInteraction() {
  interactButton.disabled = mode !== 'room' || !target;
  const labels = {
    cart: 'Pick up Kingfisher',
    handheld: cartState === 'held' ? 'Insert Kingfisher' : cartState === 'inserted' ? 'Raise handheld' : 'Inspect handheld',
    grate: progress.open ? 'Look below the grate' : 'Inspect floor grate'
  };
  interactButton.textContent = labels[target?.id] || (cartState === 'held' ? 'Walk to the handheld' : 'Walk to the cartridge');
}

function unlockAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!audio && AudioContext) audio = new AudioContext();
    audio?.resume().catch(() => {});
  } catch {}
}

function click() {
  if (audio?.state !== 'running') return;
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.045), audio.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = (Math.random() * 2 - 1) * Math.exp(-index / (samples.length * 0.15));
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = buffer;
  gain.gain.value = 0.17;
  source.connect(gain).connect(audio.destination);
  source.start();
}

function fitScreen(rect) {
  if (!rect) return;
  Object.assign(iframe.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
}

async function raiseHandheld() {
  if (mode !== 'room' || cartState === 'on-desk') return;
  unlockAudio();
  const inserting = cartState === 'held';
  cartState = 'inserted';
  setMode('docking');
  lowerButton.disabled = true;
  playerState.textContent = inserting ? 'Seating Kingfisher…' : 'Raising handheld…';
  if (!iframe.getAttribute('src')) iframe.src = new URL('../play.html?game=kingfisher&room=kingfisher-v1', location.href).href;
  await room.dock();
  if (inserting) click();
  iframe.hidden = false;
  setMode('play');
  lowerButton.disabled = false;
  lowerButton.innerHTML = 'Lower handheld <kbd>Esc</kbd>';
  updatePlayerLabel();
  send('resume');
  iframe.focus();
}

async function interact(id) {
  if (mode !== 'room') return;
  if (id === 'cart' && cartState === 'on-desk') {
    unlockAudio();
    cartState = 'held';
    room.setCartState('held');
    announcement.textContent = 'Kingfisher picked up. Find the handheld slot.';
    updateProgress();
    updateInteraction();
  } else if (id === 'handheld') {
    if (cartState === 'on-desk') announcement.textContent = 'An empty slot. Kingfisher is on the nearby desk.';
    else await raiseHandheld();
  } else if (id === 'grate') {
    progressLabel.textContent = progress.open ? 'A warm light under the open grate.' : 'Locked. A small indicator reads 10.';
    announcement.textContent = progressLabel.textContent;
  }
}

function releaseInputs() {
  for (const button of held.values()) {
    send('input', { input: Number(button.dataset.input), value: 0 });
    button.classList.remove('is-down');
  }
  held.clear();
}

async function returnToRoom(error = '') {
  clearTimeout(lowerTimer);
  iframe.hidden = true;
  releaseInputs();
  setMode('returning');
  await room.undock();
  setMode('room');
  if (error) warn(error);
  updateProgress();
  canvas.focus({ preventScroll: true });
}

function lowerHandheld() {
  if (mode !== 'play') return;
  setMode('saving');
  releaseInputs();
  lowerButton.disabled = true;
  lowerButton.textContent = 'Saving cartridge…';
  playerState.textContent = 'Finishing the cartridge save…';
  send('lower');
  lowerTimer = setTimeout(() => returnToRoom('The player did not confirm its save. Raise the handheld to continue this session.'), 19000);
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== iframe.contentWindow) return;
  const message = event.data;
  if (message?.type !== 'zang-room-player' || message.room !== 'kingfisher-v1') return;
  if (message.save) acceptSave(message.save);
  if (message.event === 'ready') updatePlayerLabel();
  if (message.event === 'running') { gameRunning = true; updatePlayerLabel(); }
  if (message.event === 'request-lower') lowerHandheld();
  if (message.event === 'lowered' && mode === 'saving') returnToRoom(message.error || '');
  if (message.event === 'error') playerState.textContent = message.error || 'The cartridge could not start. Lower the handheld to return.';
});

enterButton.addEventListener('click', () => {
  unlockAudio();
  entrance.hidden = true;
  setMode('room');
  room.setInputEnabled(true);
  canvas.focus({ preventScroll: true });
  updateProgress();
});
interactButton.addEventListener('click', () => {
  room.interact();
  if (mode === 'room') canvas.focus({ preventScroll: true });
});
lowerButton.addEventListener('click', lowerHandheld);
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mode === 'play') { event.preventDefault(); lowerHandheld(); }
});

function moveFromPointer(event) {
  const bounds = movePad.getBoundingClientRect();
  const x = (event.clientX - bounds.left - bounds.width / 2) / 36;
  const y = (event.clientY - bounds.top - bounds.height / 2) / 36;
  const length = Math.max(1, Math.hypot(x, y));
  padThumb.style.transform = `translate(${x / length * 29}px, ${y / length * 29}px)`;
  room.move(x / length, -y / length);
}
function stopWalking() { room?.move(0, 0); padThumb.style.transform = ''; }
movePad.addEventListener('pointerdown', event => {
  if (mode !== 'room') return;
  event.preventDefault();
  movePad.setPointerCapture(event.pointerId);
  moveFromPointer(event);
});
movePad.addEventListener('pointermove', event => { if (movePad.hasPointerCapture(event.pointerId)) moveFromPointer(event); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) movePad.addEventListener(name, stopWalking);

for (const button of document.querySelectorAll('[data-input]')) {
  button.addEventListener('pointerdown', event => {
    if (mode !== 'play' || !gameRunning) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    held.set(event.pointerId, button);
    button.classList.add('is-down');
    send('input', { input: Number(button.dataset.input), value: 1 });
  });
  const release = event => {
    if (!held.has(event.pointerId)) return;
    held.delete(event.pointerId);
    button.classList.remove('is-down');
    send('input', { input: Number(button.dataset.input), value: 0 });
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, release);
  button.addEventListener('click', event => {
    if (event.detail || mode !== 'play' || !gameRunning) return;
    const input = Number(button.dataset.input);
    send('input', { input, value: 1 });
    setTimeout(() => send('input', { input, value: 0 }), 100);
  });
}
window.addEventListener('blur', () => { stopWalking(); releaseInputs(); });
window.addEventListener('storage', event => {
  if (event.key !== progressKey) return;
  const stored = readProgress();
  if (stored.open && !progress.open) {
    progress = stored;
    room?.openGrate(true);
    document.body.dataset.grate = 'open';
    updateProgress();
  }
});

try {
  room = await createRoom({ canvas, onInteract: interact, onTarget(value) { target = value; updateInteraction(); }, onScreenRect: fitScreen });
  room.setInputEnabled(false);
  if (progress.open) room.openGrate(false);
  document.body.dataset.grate = progress.open ? 'open' : 'locked';
  enterButton.textContent = 'Enter room';
  enterButton.disabled = false;
  enterButton.focus({ preventScroll: true });
  setMode('intro');
} catch (error) {
  entrance.hidden = true;
  document.getElementById('failure-detail').textContent = `This room needs a browser with WebGL 2. ${error.message || error}`;
  document.getElementById('failure').hidden = false;
}

export { room };
