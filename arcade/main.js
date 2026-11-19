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
const directory = document.getElementById('exhibit-select');
const mouseLook = document.getElementById('mouse-look');
const carryButton = document.getElementById('carry-cart');
const locationName = document.getElementById('location-name');
const shelfLink = document.getElementById('game-shelf');
const base = new URL('../', location.href);
const progressKey = `zang-arcade:${base.pathname}:room:kingfisher-v1`;
const visitKey = `zang-arcade:${base.pathname}:museum-visit-v1`;
const games = new Map();
let room;
let exhibit;
let cartridge;
let playerGame;
let leaveForShelf = false;
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
  const carried = cartridge ? `${cartridge.title} ${cartState === 'inserted' ? 'seated' : 'in hand'}. ` : '';
  if (!exhibit) progressLabel.textContent = carried + 'Walk up to a doorway or choose an exhibit from the directory.';
  else if (exhibit.id === 'kingfisher') {
    progressLabel.textContent = carried + (progress.open ? 'The floor grate is open.' : `${progress.catches} / 10 fish saved. Catch ten to open the floor grate.`);
  } else progressLabel.textContent = carried || exhibit.blurb || `Find the ${exhibit.title} cartridge.`;
}

function updatePlayerLabel() {
  if (!gameRunning) playerState.textContent = 'Choose Start Game on the screen.';
  else if (playerGame?.id === 'kingfisher') playerState.textContent = progress.open ? 'Ten fish saved. The grate is open.' : `${progress.catches} / 10 fish saved`;
  else playerState.textContent = playerGame.title;
}

function acceptSave(save) {
  if (!save?.valid || !Number.isInteger(save.catches) || !Number.isInteger(save.parkedCatches)) return;
  const count = Math.max(save.catches, save.parkedCatches);
  const opens = !progress.open && count >= 10;
  if (count <= progress.catches && !opens) return;
  progress = { version: 1, catches: Math.max(progress.catches, count), open: progress.open || count >= 10 };
  room.setFishCount(progress.catches);
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
  iframe.contentWindow?.postMessage({ type: 'zang-room-command', room: playerRoom(), action, ...data }, location.origin);
}

function playerRoom() {
  return playerGame?.id === 'kingfisher' ? 'kingfisher-v1' : 'museum-v1';
}

function updateInteraction() {
  interactButton.disabled = mode !== 'room' || !target;
  const labels = {
    cart: exhibit ? `Pick up ${exhibit.title}` : '',
    handheld: cartState === 'held' ? `Insert ${cartridge?.title}` : cartState === 'inserted' ? 'Raise handheld' : 'Inspect handheld',
    grate: progress.open ? 'Look below the grate' : 'Inspect floor grate'
  };
  interactButton.textContent = labels[target?.id] || target?.label || (!exhibit ? 'Approach a doorway' : cartridge ? 'Walk to the handheld' : 'Walk to the cartridge');
  const swappable = exhibit && cartridge && cartridge !== exhibit;
  carryButton.hidden = cartState !== 'inserted' && !swappable;
  carryButton.textContent = cartState === 'inserted' ? 'Take cartridge' : swappable ? `Take ${exhibit.title} instead` : 'Take cartridge';
}

function rememberVisit() {
  try { sessionStorage.setItem(visitKey, JSON.stringify({ exhibit: exhibit?.id || '', cartridge: cartridge?.id || '' })); }
  catch {}
}

function readVisit() {
  try { return JSON.parse(sessionStorage.getItem(visitKey)); }
  catch { return null; }
}

function changeExhibit(game) {
  if (mode !== 'room' || game === exhibit) return;
  exhibit = game;
  cartState = cartridge ? 'held' : 'on-desk';
  room.setLocation(game);
  directory.value = game?.id || '';
  locationName.textContent = game?.title || 'Arcade Museum';
  rememberVisit();
  updateProgress();
  updateInteraction();
  canvas.focus({ preventScroll: true });
}

function takeCartridge(game) {
  cartridge = game;
  cartState = 'held';
  room.setCartridge(game);
  rememberVisit();
  updateProgress();
  updateInteraction();
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
  if (mode !== 'room' || !cartridge) return;
  unlockAudio();
  const inserting = cartState === 'held';
  cartState = 'inserted';
  setMode('docking');
  lowerButton.disabled = true;
  playerState.textContent = inserting ? `Seating ${cartridge.title}…` : 'Raising handheld…';
  if (playerGame !== cartridge) {
    playerGame = cartridge;
    gameRunning = false;
    const url = new URL('../play.html', location.href);
    url.searchParams.set('game', playerGame.id);
    url.searchParams.set('room', playerRoom());
    iframe.title = `${playerGame.title} handheld`;
    iframe.src = url.href;
  }
  await room.dock();
  if (inserting) click();
  iframe.hidden = false;
  setMode('play');
  lowerButton.disabled = false;
  lowerButton.innerHTML = 'Lower handheld <kbd>Esc</kbd>';
  updatePlayerLabel();
  send('resume');
  iframe.focus();
  if (leaveForShelf) lowerHandheld();
}

async function interact(id) {
  if (mode !== 'room') return;
  if (id.startsWith('door:')) changeExhibit(games.get(id.slice(5)));
  else if (id === 'exit') changeExhibit(undefined);
  else if (id === 'cart' && cartState === 'on-desk' && exhibit) {
    unlockAudio();
    takeCartridge(exhibit);
    announcement.textContent = `${cartridge.title} picked up. Find the handheld slot.`;
  } else if (id === 'handheld') {
    if (!cartridge) announcement.textContent = 'An empty slot. The cartridge is on the nearby desk.';
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
  if (leaveForShelf && !error) location.assign(shelfLink.href);
  leaveForShelf = false;
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
  if (message?.type !== 'zang-room-player' || message.room !== playerRoom() || message.game !== playerGame?.id) return;
  if (message.save && playerGame.id === 'kingfisher') acceptSave(message.save);
  if (message.event === 'ready') updatePlayerLabel();
  if (message.event === 'running') { gameRunning = true; updatePlayerLabel(); }
  if (message.event === 'request-lower') lowerHandheld();
  if (message.event === 'lowered' && mode === 'saving') returnToRoom(message.error || '');
  if (message.event === 'error') playerState.textContent = message.error || 'The cartridge could not start. Lower the handheld to return.';
});

function enterMuseum() {
  entrance.hidden = true;
  setMode('room');
  room.setInputEnabled(true);
  canvas.focus({ preventScroll: true });
  updateProgress();
  rememberVisit();
}
enterButton.addEventListener('click', () => {
  unlockAudio();
  enterMuseum();
});
interactButton.addEventListener('click', () => {
  room.interact();
  if (mode === 'room') canvas.focus({ preventScroll: true });
});
lowerButton.addEventListener('click', lowerHandheld);
directory.addEventListener('change', () => changeExhibit(games.get(directory.value)));
mouseLook.addEventListener('click', () => room.toggleMouseLook());
carryButton.addEventListener('click', () => {
  takeCartridge(cartState === 'inserted' ? cartridge : exhibit);
  canvas.focus({ preventScroll: true });
});
shelfLink.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (mode === 'play' || mode === 'saving' || mode === 'docking') {
    event.preventDefault();
    leaveForShelf = true;
    if (mode === 'play') lowerHandheld();
  }
});
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
  if (stored.catches > progress.catches || (stored.open && !progress.open)) {
    progress = stored;
    room?.setFishCount(progress.catches);
    if (stored.open) {
      room?.openGrate(true);
      document.body.dataset.grate = 'open';
    }
    updateProgress();
  }
});

try {
  const response = await fetch(new URL('catalog.json', base));
  if (!response.ok) throw new Error('The game catalog could not be loaded.');
  const entries = (await response.json()).games.filter(game => game.status === 'verified' && game.platform === 'GBA');
  for (const game of entries) {
    games.set(game.id, game);
    directory.add(new Option(game.title, game.id));
  }
  room = await createRoom({
    canvas, games: entries, onInteract: interact, onTarget(value) { target = value; updateInteraction(); }, onScreenRect: fitScreen,
    onMouseLook(locked, error) {
      mouseLook.setAttribute('aria-pressed', String(locked));
      mouseLook.textContent = locked ? 'Release mouse (Esc)' : 'Mouse look';
      if (error) warn(error);
    }
  });
  room.setInputEnabled(false);
  const visit = readVisit();
  const requested = new URLSearchParams(location.search).get('room');
  exhibit = games.get(requested ?? visit?.exhibit);
  if (!requested && visit?.cartridge) cartridge = games.get(visit.cartridge);
  if (cartridge) cartState = 'held';
  room.setLocation(exhibit);
  room.setCartridge(cartridge);
  directory.value = exhibit?.id || '';
  locationName.textContent = exhibit?.title || 'Arcade Museum';
  room.setFishCount(progress.catches);
  if (progress.open) room.openGrate(false);
  document.body.dataset.grate = progress.open ? 'open' : 'locked';
  enterButton.textContent = 'Enter museum';
  enterButton.disabled = false;
  enterButton.focus({ preventScroll: true });
  if (visit && !requested) enterMuseum();
  else setMode('intro');
} catch (error) {
  entrance.hidden = true;
  document.getElementById('failure-detail').textContent = `${error.message || error} The museum uses WebGL 2.`;
  document.getElementById('failure').hidden = false;
}

export { room };
