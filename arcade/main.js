import { createRoom } from './room.js?v=c277fe133984';
import { HOME } from './guts.js?v=5261e0e93b27';
import { HANDHELD_RETURN_BUTTON, stick, watchGamepad } from './gamepads.js?v=af46a223244a';

const canvas = document.getElementById('room');
const entrance = document.getElementById('entrance');
const enterButton = document.getElementById('enter-room');
const roomHud = document.getElementById('room-hud');
const playHud = document.getElementById('play-hud');
const interactButton = document.getElementById('interact');
const lowerButton = document.getElementById('lower-handheld');
const lowerLabel = lowerButton.innerHTML;
const iframe = document.getElementById('handheld-screen');
const progressLabel = document.getElementById('progress-label');
const playerState = document.getElementById('player-state');
const saveWarning = document.getElementById('save-warning');
const announcement = document.getElementById('announcement');
const movePad = document.getElementById('move-pad');
const padThumb = document.getElementById('pad-thumb');
const directory = document.getElementById('exhibit-select');
const directoryDialog = document.getElementById('directory-dialog');
const directoryList = document.getElementById('directory-list');
const mouseLook = document.getElementById('mouse-look');
const inventoryToggle = document.getElementById('inventory-toggle');
const inventoryDialog = document.getElementById('inventory-dialog');
const inventoryList = document.getElementById('inventory-list');
const inventoryPlay = document.getElementById('inventory-play');
const raiseButton = document.getElementById('raise-handheld');
const inspectButton = document.getElementById('inspect-cartridge');
const inspectHud = document.getElementById('inspect-hud');
const inspectTitle = document.getElementById('inspect-title');
const inspectHint = document.getElementById('inspect-hint');
const inspectDrums = document.getElementById('inspect-drums');
const inspectSlots = document.getElementById('inspect-slots');
const inspectLever = document.getElementById('inspect-pull-lever');
const inspectSlotResult = document.getElementById('inspect-slot-result');
const inspectDrumAuto = document.getElementById('inspect-drum-auto');
const closeInspection = document.getElementById('close-inspection');
const runButton = document.getElementById('run-toggle');
const locationName = document.getElementById('location-name');
const shelfLink = document.getElementById('game-shelf');
const atlasLink = document.getElementById('landfill-atlas');
const base = new URL('../', location.href);
const progressKey = `zang-arcade:${base.pathname}:room:kingfisher-v1`;
const visitKey = `zang-arcade:${base.pathname}:museum-visit-v1`;
const collectionKey = `zang-arcade:${base.pathname}:museum-collection-v1`;
const games = new Map();
const discovered = new Set();
const shelved = new Set();
let room;
let exhibit;
let cartridge;
let playerGame;
let leaveForShelf = false;
let mode = 'loading';
let cartState = 'on-desk';
let target;
let gameRunning = false;
let gameReady = false;
let lowerTimer;
let audio;
let running = false;
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
  if (next === 'docking' || next === 'saving') room?.resetHandheldFeedback();
  document.body.dataset.mode = next;
  roomHud.hidden = next !== 'room';
  inspectHud.hidden = next !== 'inspect';
  playHud.hidden = !['docking', 'play', 'saving'].includes(next);
  updateInteraction();
}

function updateProgress() {
  atlasLink.hidden = exhibit?.id !== 'landfill';
  const carried = cartridge ? `${cartridge.title} ${cartState === 'inserted' ? 'seated' : 'in hand'}. ` : '';
  if (!exhibit) progressLabel.textContent = carried.trimEnd();
  else if (exhibit === HOME) progressLabel.textContent = discovered.size > shelved.size ? 'Approach the shelf to box your new cartridges.' : 'Bring found cartridges here to fill the shelf.';
  else if (exhibit.id === 'kingfisher') {
    progressLabel.textContent = carried + (progress.open ? 'The floor grate is open.' : `${progress.catches} / 10 fish saved. Catch ten to open the floor grate.`);
  } else if (exhibit.id === 'landfill') {
    progressLabel.textContent = carried || 'Cross the sorting lanes on blue. The cartridge is down by the coast.';
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
  interactButton.disabled = mode !== 'room' || !target || inventoryDialog.open || directoryDialog.open;
  interactButton.textContent = target?.label || (!exhibit ? 'Approach a doorway' : exhibit === HOME ? 'Approach the shelf' : discovered.has(exhibit.id) ? 'Explore the exhibit' : 'Approach the cartridge');
  raiseButton.disabled = !cartridge || mode !== 'room';
  const inspectable = inspectionChoice();
  inspectButton.hidden = !inspectable;
  if (inspectable) inspectButton.setAttribute('aria-label', `Inspect ${inspectable.title} cartridge`);
  raiseButton.setAttribute('aria-label', cartridge ? `Raise handheld with ${cartridge.title}` : 'Raise handheld');
}

function inspectionChoice() {
  if (cartridge?.cartridgeModel) return cartridge;
  if (exhibit?.cartridgeModel && discovered.has(exhibit.id)) return exhibit;
}

function setRun(enabled) {
  running = enabled;
  room?.setRun(enabled);
  runButton.setAttribute('aria-pressed', String(enabled));
  runButton.textContent = enabled ? 'Running' : 'Run';
}

function updateCollection() {
  try {
    const latest = JSON.parse(localStorage.getItem(collectionKey));
    for (const id of latest?.discovered || []) if (games.has(id)) discovered.add(id);
    for (const id of latest?.shelved || []) if (discovered.has(id)) shelved.add(id);
  } catch {}
  room.setCollection(discovered, shelved);
  try { localStorage.setItem(collectionKey, JSON.stringify({ discovered: [...discovered], shelved: [...shelved] })); }
  catch { warn('The browser could not save your cartridge collection.'); }
  updateProgress();
}

function loadCollection(visit) {
  try {
    const data = JSON.parse(localStorage.getItem(collectionKey));
    for (const id of data?.discovered || []) if (games.has(id)) discovered.add(id);
    for (const id of data?.shelved || []) if (discovered.has(id)) shelved.add(id);
  } catch {}
  if (visit?.cartridge && games.has(visit.cartridge)) discovered.add(visit.cartridge);
  if (progress.catches) discovered.add('kingfisher');
  updateCollection();
}

function renderInventory() {
  inventoryList.replaceChildren();
  for (const game of games.values()) {
    if (!discovered.has(game.id)) continue;
    const li = document.createElement('li');
    const button = document.createElement('button');
    const image = document.createElement('img');
    const title = document.createElement('span');
    const state = document.createElement('span');
    button.type = 'button';
    button.className = 'inventory-cart';
    button.setAttribute('aria-pressed', String(game === cartridge));
    image.src = new URL(game.cover, base);
    image.alt = '';
    title.textContent = game.title;
    state.textContent = shelved.has(game.id) ? 'Boxed' : 'Found';
    button.append(image, title, state);
    button.addEventListener('click', () => {
      takeCartridge(game);
      inventoryDialog.close();
    });
    li.append(button);
    inventoryList.append(li);
  }
  document.getElementById('inventory-count').textContent = `${discovered.size} of ${games.size} found`;
  document.getElementById('inventory-empty').hidden = discovered.size > 0;
  inventoryPlay.disabled = !cartridge;
}

function toggleInventory() {
  if (mode !== 'room' || directoryDialog.open || room.getState().transitioning) return;
  if (inventoryDialog.open) { inventoryDialog.close(); return; }
  setRun(false);
  room.setInputEnabled(false);
  renderInventory();
  inventoryDialog.showModal();
  inventoryList.querySelector('[aria-pressed=true]')?.focus();
}

function openDirectory() {
  if (mode !== 'room' || inventoryDialog.open || room.getState().transitioning) return;
  if (directoryDialog.open) { directoryDialog.close(); return; }
  setRun(false);
  room.setInputEnabled(false);
  directoryList.replaceChildren();
  function addEntry(label, selected, choose) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (selected) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => {
      directoryDialog.close();
      choose();
    });
    item.append(button);
    directoryList.append(item);
  }
  for (const option of directory.options) {
    addEntry(option.text, option.value === directory.value,
      () => changeExhibit(option.value === HOME.id ? HOME : games.get(option.value)));
  }
  addEntry('Game shelf', false, () => shelfLink.click());
  directoryDialog.showModal();
  directoryList.querySelector('[aria-current=true]')?.focus();
}

function navigateMenu(list, edge) {
  const buttons = Array.from(list.querySelectorAll('button:not(:disabled)'));
  const current = buttons.indexOf(document.activeElement);
  if (!buttons.length) return;
  const previous = edge(12) || edge(14);
  const next = edge(13) || edge(15);
  if (previous || next) {
    const index = current < 0 ? (previous ? buttons.length - 1 : 0)
      : (current + (previous ? -1 : 1) + buttons.length) % buttons.length;
    buttons[index].focus();
  } else if (edge(0)) (buttons[current] || buttons[0]).click();
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
  if (mode !== 'room' || game === exhibit || room.getState().transitioning) return;
  exhibit = game;
  setRun(false);
  room.setLocation(game);
  directory.value = game?.id || '';
  rememberVisit();
  updateProgress();
  updateInteraction();
  canvas.focus({ preventScroll: true });
}

function takeCartridge(game) {
  if (!game || game === cartridge) return;
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
  if (mode !== 'room' || !cartridge || room.getState().transitioning) return;
  unlockAudio();
  setRun(false);
  const inserting = cartState === 'held';
  cartState = 'inserted';
  setMode('docking');
  lowerButton.disabled = true;
  playerState.textContent = inserting ? `Seating ${cartridge.title}…` : 'Raising handheld…';
  if (playerGame !== cartridge) {
    playerGame = cartridge;
    gameRunning = false;
    gameReady = false;
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
  lowerButton.innerHTML = lowerLabel;
  updatePlayerLabel();
  send('resume');
  iframe.focus();
  if (leaveForShelf) lowerHandheld();
}

async function interact(id) {
  if (mode !== 'room') return;
  if (id.startsWith('door:')) changeExhibit(games.get(id.slice(5)));
  else if (id === 'home') changeExhibit(HOME);
  else if (id === 'exit') changeExhibit(undefined);
  else if (id === 'inspect-cart') openInspection(exhibit);
  else if (id === 'cart' && exhibit && !discovered.has(exhibit.id)) {
    unlockAudio();
    discovered.add(exhibit.id);
    updateCollection();
    takeCartridge(exhibit);
    announcement.textContent = `${cartridge.title} added to your inventory.`;
    progressLabel.textContent = `${cartridge.title} acquired. Raise your handheld to play here.`;
  } else if (id === 'store') {
    for (const gameId of discovered) shelved.add(gameId);
    updateCollection();
    progressLabel.textContent = 'Cartridges boxed. Face a box and interact to pull it out.';
  } else if (id.startsWith('box:')) {
    const game = games.get(id.slice(4));
    if (game && shelved.has(game.id)) {
      await room.pullBox(game.id);
      takeCartridge(game);
      progressLabel.textContent = `${game.title} selected. Raise your handheld to play.`;
    }
  } else if (id === 'guide') {
    progressLabel.textContent = 'Maze keeper: “Follow the wall until it runs out. The way through keeps changing sides.”';
  } else if (id === 'food-truck') {
    progressLabel.textContent = 'The cook: “Bale fries are up. Anything that fell in the chute is going back on the menu.”';
    announcement.textContent = progressLabel.textContent;
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
  room.setInputEnabled(true);
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
  if (message.event === 'ready') { gameReady = true; updatePlayerLabel(); }
  if (message.event === 'running') { gameRunning = true; updatePlayerLabel(); }
  if (mode === 'play' && message.event === 'controls' &&
      Number.isInteger(message.mask) && message.mask >= 0 && message.mask <= 0xfff) room.setHandheldControls(message.mask);
  if (mode === 'play' && message.event === 'display-light' && Array.isArray(message.edges) && message.edges.length === 6 &&
      message.edges.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) room.setDisplayLight(message.edges);
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
function interactAtTarget() {
  room.interact();
  if (mode === 'room') canvas.focus({ preventScroll: true });
}
let lastTouchInteraction = -Infinity;
interactButton.addEventListener('pointerup', event => {
  if (event.pointerType !== 'touch' || !event.isPrimary || interactButton.disabled) return;
  if (!interactButton.contains(document.elementFromPoint(event.clientX, event.clientY))) return;
  lastTouchInteraction = event.timeStamp;
  interactAtTarget();
});
interactButton.addEventListener('click', event => {
  if (event.detail && event.timeStamp - lastTouchInteraction < 400) return;
  interactAtTarget();
});
lowerButton.addEventListener('click', lowerHandheld);
directory.addEventListener('change', () => changeExhibit(directory.value === HOME.id ? HOME : games.get(directory.value)));
mouseLook.addEventListener('click', () => room.toggleMouseLook());
inventoryToggle.addEventListener('click', toggleInventory);
raiseButton.addEventListener('click', raiseHandheld);
inspectButton.addEventListener('click', () => openInspection(inspectionChoice()));
function openInspection(game) {
  if (!game || mode !== 'room' || !room.inspectCartridge(game)) return;
  setRun(false);
  inspectTitle.textContent = game.title;
  setMode('inspect');
  closeInspection.focus({ preventScroll: true });
}
function exitInspection() {
  room.inspectCartridge();
  setMode('room');
  canvas.focus({ preventScroll: true });
}
closeInspection.addEventListener('click', exitInspection);
document.getElementById('turn-cartridge').addEventListener('click', () => room.turnCartridge());
inspectLever.addEventListener('click', () => room.pullInspectionLever());
inspectDrums.addEventListener('click', event => {
  if (event.target.matches('[data-band]')) room.turnInspectionBand(Number(event.target.dataset.band));
});
inspectDrumAuto.addEventListener('click', () => {
  const active = inspectDrumAuto.getAttribute('aria-pressed') !== 'true';
  inspectDrumAuto.setAttribute('aria-pressed', String(active));
  room.setInspectionAuto(active);
});
runButton.addEventListener('click', () => {
  setRun(!running);
  canvas.focus({ preventScroll: true });
});
document.getElementById('inventory-close').addEventListener('click', () => inventoryDialog.close());
document.getElementById('directory-close').addEventListener('click', () => directoryDialog.close());
document.getElementById('inventory-home').addEventListener('click', () => { inventoryDialog.close(); changeExhibit(HOME); });
inventoryPlay.addEventListener('click', () => { inventoryDialog.close(); raiseHandheld(); });
for (const dialog of [inventoryDialog, directoryDialog]) {
  dialog.addEventListener('close', () => {
    if (mode !== 'room' || inventoryDialog.open || directoryDialog.open) return;
    room.setInputEnabled(true);
    updateInteraction();
    canvas.focus({ preventScroll: true });
  });
}
shelfLink.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (mode === 'play' || mode === 'saving' || mode === 'docking') {
    event.preventDefault();
    leaveForShelf = true;
    if (mode === 'play') lowerHandheld();
  }
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mode === 'inspect') { event.preventDefault(); exitInspection(); return; }
  if (event.key === 'Escape' && mode === 'play') { event.preventDefault(); lowerHandheld(); }
  if (event.repeat || mode !== 'room' || event.target === directory) return;
  if (event.code === 'KeyI') { event.preventDefault(); toggleInventory(); }
  if (event.code === 'KeyH' && !inventoryDialog.open && !directoryDialog.open) { event.preventDefault(); raiseHandheld(); }
});

watchGamepad((pad, down, edge, delta) => {
  const connected = Boolean(pad);
  const body = document.body;
  if (body.hasAttribute('data-gamepad') !== connected) body.toggleAttribute('data-gamepad', connected);
  if (!room) return;
  if (!pad) { room.moveGamepad(0, 0); return; }
  if (mode === 'intro' && (edge(0) || edge(9))) { enterButton.click(); return; }
  if (mode === 'play') {
    if (edge(HANDHELD_RETURN_BUTTON)) lowerHandheld();
    else if (gameReady && !gameRunning && (edge(0) || edge(9))) send('start');
    return;
  }
  if (directoryDialog.open) {
    if (edge(1) || edge(9)) directoryDialog.close();
    else navigateMenu(directoryList, edge);
    return;
  }
  if (inventoryDialog.open) {
    if (edge(1) || edge(8)) { inventoryDialog.close(); return; }
    if (edge(3)) {
      const selected = document.activeElement;
      if (inventoryList.contains(selected)) selected.click();
      if (cartridge) { inventoryDialog.close(); raiseHandheld(); }
      return;
    }
    navigateMenu(inventoryList, edge);
    return;
  }
  const [lookX, lookY] = stick(pad.axes[2],pad.axes[3]);
  if (mode === 'inspect') {
    if (lookX || lookY) room.look(lookX*145*delta, lookY*145*delta);
    if (edge(1)) exitInspection();
    else if (edge(0) && !inspectSlots.hidden) room.pullInspectionLever();
    else if (edge(4) || edge(5)) room.turnCartridge();
    else if (!inspectDrums.hidden) {
      if (edge(14)) room.turnInspectionBand(0);
      else if (edge(12)) room.turnInspectionBand(1);
      else if (edge(15)) room.turnInspectionBand(2);
      else if (edge(3)) inspectDrumAuto.click();
    }
    return;
  }
  if (mode !== 'room') return;
  const [x, y] = stick(pad.axes[0],pad.axes[1]);
  if (edge(6)) setRun(!running);
  room.moveGamepad(x || Number(down(15))-Number(down(14)), -y || Number(down(12))-Number(down(13)));
  if (lookX || lookY) room.look(lookX*680*delta, lookY*540*delta);
  if (edge(0)) room.interact();
  else if (edge(3)) raiseHandheld();
  else if (edge(2)) openInspection(inspectionChoice());
  else if (edge(8)) toggleInventory();
  else if (edge(9)) openDirectory();
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
window.addEventListener('blur', () => { stopWalking(); releaseInputs(); setRun(false); });
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
  const response = await fetch(new URL('catalog.json', base), { cache: 'no-cache' });
  if (!response.ok) throw new Error('The game catalog could not be loaded.');
  const entries = (await response.json()).games.filter(game => game.status === 'verified' && game.platform === 'GBA');
  directory.add(new Option(HOME.title, HOME.id));
  for (const game of entries) {
    games.set(game.id, game);
    directory.add(new Option(game.title, game.id));
  }
  room = await createRoom({
    onArea(name) {
      locationName.textContent = name;
      document.body.toggleAttribute('data-district', !exhibit);
      updateProgress();
    },
    onHazard() {
      const message = 'The chute fired. Cross while the lane is blue.';
      progressLabel.textContent = message;
      announcement.textContent = message;
      window.setTimeout(() => {
        if (exhibit?.id === 'landfill' && progressLabel.textContent === message) updateProgress();
      }, 2600);
    },
    onInspectionDrums(available, hasSlots) {
      inspectDrums.hidden = !available;
      inspectSlots.hidden = !hasSlots;
      inspectLever.disabled = false;
      inspectSlotResult.textContent = '';
      inspectHint.textContent = available ? 'Drag to rotate. Tap a band to turn it.' :
        hasSlots ? 'Drag to rotate. Tap the lever to spin.' : 'Drag to rotate.';
    },
    onInspectionSlotsState(state) {
      inspectLever.disabled = state === 'spinning';
      inspectSlotResult.textContent = state === 'match' ? 'Three matching candies!' : state === 'miss' ? 'No match' : '';
    },
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
  loadCollection(visit);
  const destination = requested ?? visit?.exhibit ?? HOME.id;
  exhibit = destination === HOME.id ? HOME : games.get(destination);
  if (!requested && visit?.cartridge) cartridge = games.get(visit.cartridge);
  if (cartridge) cartState = 'held';
  room.setLocation(exhibit, destination);
  room.setCartridge(cartridge);
  directory.value = exhibit?.id || '';
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
