'use strict';

const arcade = document.getElementById('arcade');
const arcadeTitle = document.getElementById('arcade-title');
const enterArcadeButton = document.getElementById('enter-arcade');
const clearanceStorageKey = 'zang-arcade-entrance-v2';
const siteDirectory = new URL('./', document.baseURI);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const gallery = document.getElementById('cartridge-gallery');
const galleryCartridge = document.getElementById('gallery-cartridge');
const galleryMesh = document.getElementById('gallery-mesh');
const carouselTurn = document.getElementById('carousel-turn');
const drumControls = document.getElementById('carousel-drum-controls');
const slotControls = document.getElementById('carousel-slot-controls');
const pullLever = document.getElementById('carousel-pull-lever');
const slotResult = document.getElementById('carousel-slot-result');
const drumAuto = document.getElementById('carousel-drum-auto');
const carouselMachine = document.getElementById('carousel-machine');
const carouselSelect = document.getElementById('carousel-select');
const carouselPrevious = document.getElementById('carousel-prev');
const carouselNext = document.getElementById('carousel-next');
const carouselPlay = document.getElementById('carousel-play');
const carouselMeta = document.getElementById('carousel-meta');
const carouselMotion = document.getElementById('carousel-motion');
const carouselAnnouncement = document.getElementById('carousel-announcement');
const grid = document.getElementById('game-grid');
const inventoryStatus = document.getElementById('inventory-status');
const cardTemplate = document.getElementById('game-card-template');
const cartridgeTemplate = document.getElementById('cartridge-template');
const palette = ['gold', 'cyan', 'orchid', 'coral', 'lime', 'blue', 'pink'];
const gameLinks = new Map();

const ritual = document.getElementById('ritual');
const ritualHeader = document.getElementById('ritual-overline');
const ritualTitle = document.getElementById('ritual-title');
const ritualSkip = document.getElementById('ritual-skip');
const ritualStatus = document.getElementById('ritual-status');
const stage = document.getElementById('ritual-stage');
const box = document.getElementById('ritual-box');
const lid = document.getElementById('ritual-lid');
const boxTitle = document.getElementById('ritual-box-title');
const cart = document.getElementById('ritual-cart');
const dock = document.getElementById('ritual-device-motion');
const machine = document.getElementById('ritual-machine');
const slot = document.getElementById('ritual-slot');

let activeRitual;
let pendingEject;
let carouselGames = [];
let selectedIndex = 0;
let previewEntry;
let pendingPreview;
let previewTimer;
let meshView;
let meshViewer;
let meshSelection = 0;

function openArcade(moveFocus) {
  document.documentElement.dataset.clearance = 'open';
  arcade.inert = false;
  if (moveFocus) arcadeTitle.focus({ preventScroll: true });
  showPendingEject();
}

function grantClearance() {
  openArcade(true);
  try {
    sessionStorage.setItem(clearanceStorageKey, 'entered');
  } catch {
    // A visitor can still open the gate when the browser blocks session storage.
  }
}

function playLink(game) {
  return './play.html?game=' + encodeURIComponent(game.id);
}

function localAsset(value) {
  if (typeof value !== 'string' || !value) return '';
  try {
    const asset = new URL(value, siteDirectory);
    return asset.href.startsWith(siteDirectory.href) ? asset.href : '';
  } catch {
    return '';
  }
}

function watchImage(image, update) {
  const settle = () => update(image.naturalWidth > 0);
  image.addEventListener('load', settle);
  image.addEventListener('error', settle);
  if (image.complete) settle();
}

function setArtwork(element, property, asset) {
  if (asset) {
    element.style.setProperty(property, 'url(' + JSON.stringify(asset) + ')');
  } else {
    element.style.removeProperty(property);
  }
}

function themeFor(game) {
  return typeof game.machineTheme === 'string' && /^[a-z][a-z0-9-]*$/.test(game.machineTheme)
    ? game.machineTheme : 'neutral';
}

function hasRitual(game) {
  return Boolean(localAsset(game.cartridgePreview) || localAsset(game.cartLabel)) || themeFor(game) !== 'neutral';
}

function shellColor(game, channel) {
  const color = game.shellColors?.[channel];
  return typeof color === 'string' && /^#[a-f0-9]{6}$/i.test(color) ? color : '';
}

function styleShell(element, game) {
  for (const channel of ['top', 'plastic', 'edge']) {
    const color = shellColor(game, channel);
    if (color) {
      element.style.setProperty('--shell-' + channel, color);
    } else {
      element.style.removeProperty('--shell-' + channel);
    }
  }
}

function addCartridgePreview(element, game) {
  const src = localAsset(game.cartridgePreview);
  if (!src) return;
  const image = document.createElement('img');
  image.className = 'cartridge-render';
  image.alt = '';
  image.decoding = 'async';
  image.hidden = true;
  image.addEventListener('load', () => {
    element.classList.add('has-cartridge-preview');
    image.hidden = false;
  }, { once: true });
  image.src = src;
  element.append(image);
}

function buildCartridge(game) {
  const model = cartridgeTemplate.content.firstElementChild.cloneNode(true);
  model.dataset.shellVariant = game.shellVariant || 'standard';
  styleShell(model, game);
  setArtwork(model, '--cart-art', localAsset(game.cartLabel));

  const title = model.querySelector('.cartridge-label-title');
  const mark = model.querySelector('.cartridge-mark');
  const titleMark = localAsset(game.titleMark);
  title.textContent = game.title;
  title.hidden = game.cartLabelIncludesTitle && Boolean(localAsset(game.cartLabel));
  if (titleMark) {
    mark.addEventListener('error', () => {
      mark.hidden = true;
      title.hidden = false;
    }, { once: true });
    mark.src = titleMark;
    mark.hidden = false;
    title.hidden = true;
  }
  addCartridgePreview(model, game);
  return model;
}

function canAnimate() {
  return !reduceMotion.matches && typeof ritual.showModal === 'function' &&
    typeof cart.animate === 'function';
}

function connectPlay(link, getGame) {
  link.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey ||
        event.shiftKey || event.metaKey || !canAnimate()) return;
    const game = getGame();
    if (game && hasRitual(game) && openRitual(game, 'load', link)) event.preventDefault();
  });
}

function selectCartridge(index) {
  const count = carouselGames.length;
  if (!count) return;
  selectedIndex = (index + count) % count;
  const game = carouselGames[selectedIndex];
  galleryCartridge.replaceChildren(buildCartridge(game));
  showGalleryModel(game);
  gallery.style.setProperty('--gallery-glow', shellColor(game, 'top') || '#b4be78');
  carouselSelect.value = String(selectedIndex);
  carouselPlay.href = playLink(game);
  carouselPlay.setAttribute('aria-label', 'Play ' + game.title);
  carouselMeta.textContent = (selectedIndex + 1) + ' / ' + count + ' · Prototype ' + game.version;
  carouselAnnouncement.textContent = game.title + ', cartridge ' + (selectedIndex + 1) + ' of ' + count;
}

async function showGalleryModel(game) {
  const version = ++meshSelection;
  meshView?.hide();
  delete gallery.dataset.mesh;
  carouselTurn.hidden = true;
  drumControls.hidden = true;
  slotControls.hidden = true;
  pullLever.disabled = false;
  slotResult.textContent = '';
  if (!localAsset(game.cartridgeModel)) return;
  try {
    meshViewer ??= import('./shelf-cartridge-view.js?v=d984d7d5b65a').then(({ createShelfCartridgeView }) => {
      meshView = createShelfCartridgeView(galleryMesh, {
        isPaused: () => gallery.dataset.paused === 'true', reducedMotion: reduceMotion,
        onSlotsState(state) {
          pullLever.disabled = state === 'spinning';
          slotResult.textContent = state === 'match' ? 'Three matching candies!' : state === 'miss' ? 'No match' : '';
        }
      });
      return meshView;
    });
    const view = await meshViewer;
    if (version !== meshSelection || !await view.show(game.cartridgeModel) || version !== meshSelection) return;
    gallery.dataset.mesh = 'true';
    carouselTurn.hidden = false;
    drumControls.hidden = !view.hasDrums;
    slotControls.hidden = !view.hasSlots;
    view.setDrumAuto(drumAuto.getAttribute('aria-pressed') === 'true');
  } catch {
    // The existing cartridge art stays in the display if WebGL or the model is unavailable.
  }
}

function clearPreviewTimer() {
  window.clearTimeout(previewTimer);
  pendingPreview = undefined;
}

function closeCasePreview() {
  const entry = previewEntry;
  if (!entry) return;
  previewEntry = undefined;
  entry.card.classList.remove('is-preview');
  entry.button.setAttribute('aria-expanded', 'false');
  entry.button.setAttribute('aria-label', 'Preview ' + entry.game.title);
  entry.button.textContent = 'Preview';
  entry.blurb.hidden = true;
}

function openCasePreview(entry) {
  clearPreviewTimer();
  if (activeRitual || previewEntry === entry) return;
  closeCasePreview();
  previewEntry = entry;
  if (!entry.pocket.firstElementChild) entry.pocket.append(buildCartridge(entry.game));
  entry.card.classList.add('is-preview');
  entry.button.setAttribute('aria-expanded', 'true');
  entry.button.setAttribute('aria-label', 'Close preview for ' + entry.game.title);
  entry.button.textContent = 'Close preview';
  entry.blurb.hidden = !entry.blurb.textContent;
}

function scheduleCasePreview(entry) {
  if (pendingPreview === entry || previewEntry === entry) return;
  clearPreviewTimer();
  pendingPreview = entry;
  previewTimer = window.setTimeout(() => openCasePreview(entry), 430);
}

function stopCasePreview(entry) {
  if (pendingPreview === entry) clearPreviewTimer();
  if (previewEntry === entry) closeCasePreview();
}

function connectCasePreview(card, game) {
  const button = card.querySelector('.case-preview-button');
  const blurb = card.querySelector('.box-blurb');
  const pocket = card.querySelector('.case-cartridge');
  const entry = { card, game, button, blurb, pocket };
  blurb.id = 'case-notes-' + game.id;
  blurb.textContent = typeof game.blurb === 'string' ? game.blurb : '';
  button.setAttribute('aria-label', 'Preview ' + game.title);
  button.setAttribute('aria-controls', blurb.id);
  if (blurb.textContent) card.querySelector('.game-card').setAttribute('aria-describedby', blurb.id);

  card.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'touch') scheduleCasePreview(entry);
  });
  card.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'touch' && !card.querySelector(':focus-visible')) stopCasePreview(entry);
  });
  card.addEventListener('focusin', (event) => {
    if (event.target.matches(':focus-visible')) scheduleCasePreview(entry);
  });
  card.addEventListener('focusout', (event) => {
    if (!card.contains(event.relatedTarget) && !card.matches(':hover')) stopCasePreview(entry);
  });
  button.addEventListener('click', () => {
    if (previewEntry === entry) stopCasePreview(entry);
    else openCasePreview(entry);
  });
}

function buildGameCard(game, index) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  const link = card.querySelector('.game-card');
  const cover = card.querySelector('.box-cover');
  const fallback = card.querySelector('.box-fallback');
  const coverUrl = localAsset(game.cover) || localAsset(game.art);
  const tone = game.id === 'jumbo-mini-golf' ? 'gold' : palette[index % palette.length];
  link.href = playLink(game);
  card.dataset.palette = tone;
  link.setAttribute('aria-label', 'Play ' + game.title + ', prototype ' + game.version);
  card.querySelector('.game-title').textContent = game.title;
  card.querySelector('.game-meta').textContent = game.platform + ' · Prototype ' + game.version;
  fallback.querySelector('strong').textContent = game.title;

  if (coverUrl) {
    cover.loading = 'lazy';
    cover.decoding = 'async';
    cover.addEventListener('load', () => { fallback.hidden = true; }, { once: true });
    cover.addEventListener('error', () => {
      cover.hidden = true;
      fallback.hidden = false;
    }, { once: true });
    cover.src = coverUrl;
    cover.hidden = false;
  }

  connectPlay(link, () => game);
  connectCasePreview(card, game);
  gameLinks.set(game.id, link);
  return card;
}

function centerOf(element, stageRect) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - stageRect.left - stage.clientLeft,
    y: rect.top + rect.height / 2 - stageRect.top - stage.clientTop
  };
}

function cartPath(fullCart) {
  const stageRect = stage.getBoundingClientRect();
  const start = centerOf(box, stageRect);
  const opening = centerOf(slot, stageRect);
  const height = cart.offsetHeight;
  const raised = { x: opening.x, y: opening.y - height * (fullCart ? .78 : .46) };
  const midway = {
    x: (start.x + raised.x) / 2,
    y: Math.max(height * .72, Math.min(start.y, raised.y) - height * .36)
  };
  const partlySeated = { x: opening.x, y: opening.y + height * (fullCart ? -.44 : .11) };
  const seated = { x: opening.x, y: opening.y + height * (fullCart ? -.38 : .39) };
  return { start, raised, midway, partlySeated, seated, partialClip: fullCart ? 6 : 57, seatedClip: fullCart ? 12 : 90 };
}

function pose(point, angle = 0, scale = 1, opacity = 1, clip = 0) {
  return {
    transform: 'translate(' + point.x + 'px, ' + point.y + 'px) translate(-50%, -50%) rotate(' + angle + 'deg) scale(' + scale + ')',
    opacity,
    clipPath: 'inset(0 0 ' + clip + '% 0)'
  };
}

function animate(run, element, keyframes, duration, easing, delay = 0) {
  const animation = element.animate(keyframes, { duration, easing, delay, fill: 'both' });
  run.animations.push(animation);
  return animation.finished;
}

async function loadCartridge(run, path) {
  const { start, raised, midway, partlySeated, seated, partialClip, seatedClip } = path;
  ritualStatus.textContent = 'Opening the box…';
  await animate(run, lid, [
    { transform: 'rotateY(0deg)' },
    { transform: 'rotateY(-120deg)' }
  ], 455, 'cubic-bezier(.24,.72,.25,1)');

  ritualStatus.textContent = 'Lifting cartridge…';
  await animate(run, cart, [
    { ...pose(start, -16, .72, 0), offset: 0 },
    { ...pose(start, -16, .77, 1), offset: .045, easing: 'cubic-bezier(.16,.72,.24,1)' },
    { ...pose(midway, -8, 1.13), offset: .31, easing: 'ease-in-out' },
    { ...pose(midway, 3, 1.16), offset: .71, easing: 'cubic-bezier(.55,.02,.3,1)' },
    pose(raised)
  ], 1100, 'linear');

  ritualStatus.textContent = 'Seating cartridge…';
  await animate(run, cart, [
    pose(raised),
    { ...pose(partlySeated, 0, 1, 1, partialClip), offset: .62 },
    { ...pose(seated, 0, 1, 1, seatedClip), offset: .96 },
    pose(seated, 0, 1, 0, seatedClip)
  ], 320, 'cubic-bezier(.46,0,.28,1)');

  machine.dataset.loaded = 'true';
  ritualStatus.textContent = 'Cartridge seated';
  await animate(run, dock, [
    { transform: 'translateY(0)' },
    { transform: 'translateY(.42rem)', offset: .24 },
    { transform: 'translateY(' + stage.offsetHeight + 'px)' }
  ], 510, 'cubic-bezier(.44,0,.4,1)', 125);

  if (activeRitual === run) window.location.assign(playLink(run.game) + '&from=slot');
}

async function ejectCartridge(run, path) {
  const { start, raised, midway, partlySeated, seated, partialClip, seatedClip } = path;
  ritualStatus.textContent = 'Returning to the shelf…';
  await animate(run, dock, [
    { transform: 'translateY(' + stage.offsetHeight + 'px)' },
    { transform: 'translateY(0)' }
  ], 445, 'cubic-bezier(.23,.68,.33,1)');

  machine.dataset.loaded = 'false';
  ritualStatus.textContent = 'Ejecting cartridge…';
  await animate(run, cart, [
    pose(seated, 0, 1, 1, seatedClip),
    { ...pose(partlySeated, 0, 1, 1, partialClip), offset: .43 },
    pose(raised)
  ], 340, 'cubic-bezier(.27,.68,.3,1)');

  ritualStatus.textContent = 'Returning cartridge to its box…';
  await animate(run, cart, [
    pose(raised),
    { ...pose(midway, 3, 1.15), offset: .32 },
    { ...pose(midway, -8, 1.12), offset: .61 },
    { ...pose(start, -16, .77), offset: .91 },
    pose(start, -16, .72, 0)
  ], 925, 'ease-in-out');

  await animate(run, lid, [
    { transform: 'rotateY(-120deg)' },
    { transform: 'rotateY(0deg)' }
  ], 425, 'cubic-bezier(.43,.1,.32,1)');

  if (activeRitual === run) closeRitual();
}

function closeRitual(restoreFocus = true) {
  const run = activeRitual;
  if (!run) return;
  activeRitual = undefined;
  for (const animation of run.animations) animation.cancel();
  ritual.close();
  if (restoreFocus) run.trigger?.focus();
}

function openRitual(game, mode, trigger) {
  if (activeRitual) return false;
  const returning = mode === 'eject';
  const cover = localAsset(game.cover) || localAsset(game.art);
  const backdrop = localAsset(game.backdrop);
  const run = { game, mode, trigger, animations: [] };

  clearPreviewTimer();
  closeCasePreview();
  ritual.dataset.machineTheme = themeFor(game);
  styleShell(stage, game);
  machine.dataset.loaded = String(returning);
  ritualHeader.textContent = returning ? 'Eject cartridge' : 'Load cartridge';
  ritualTitle.textContent = game.title;
  ritualSkip.href = returning ? '#inventory' : playLink(game);
  ritualSkip.firstChild.textContent = returning ? 'Return to shelf ' : 'Skip to game ';
  boxTitle.textContent = game.title;
  boxTitle.hidden = Boolean(cover);
  cart.replaceChildren(buildCartridge(game));
  const seatedPreview = slot.querySelector('.slot-loaded-cart');
  seatedPreview.replaceChildren();
  seatedPreview.classList.remove('has-cartridge-preview');
  addCartridgePreview(seatedPreview, game);
  lid.style.transform = returning ? 'rotateY(-120deg)' : '';
  setArtwork(lid, '--box-art', cover);
  setArtwork(stage, '--stage-art', backdrop);

  try {
    ritual.showModal();
  } catch {
    return false;
  }

  activeRitual = run;
  ritualSkip.focus({ preventScroll: true });
  const path = cartPath(Boolean(localAsset(game.cartridgePreview)));
  const sequence = returning ? ejectCartridge(run, path) : loadCartridge(run, path);
  sequence.catch((error) => {
    if (activeRitual !== run) return;
    console.warn('Cartridge transition stopped.', error);
    closeRitual(returning);
    if (!returning) window.location.assign(playLink(game));
  });
  return true;
}

function showPendingEject() {
  if (!pendingEject || document.documentElement.dataset.clearance !== 'open') return;
  const { game, trigger } = pendingEject;
  pendingEject = undefined;
  if (!canAnimate() || !openRitual(game, 'eject', trigger)) trigger?.focus();
}

ritual.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeRitual();
});

ritualSkip.addEventListener('click', (event) => {
  if (activeRitual?.mode === 'eject') {
    event.preventDefault();
    closeRitual();
  } else {
    closeRitual(false);
  }
});

window.addEventListener('pagehide', () => { closeRitual(false); });

carouselPrevious.addEventListener('click', () => selectCartridge(selectedIndex - 1));
carouselNext.addEventListener('click', () => selectCartridge(selectedIndex + 1));
carouselSelect.addEventListener('change', () => selectCartridge(Number(carouselSelect.value)));
carouselTurn.addEventListener('click', () => meshView?.turn());
pullLever.addEventListener('click', () => meshView?.pullLever());
drumControls.addEventListener('click', event => {
  if (event.target.matches('[data-band]')) meshView?.turnBand(Number(event.target.dataset.band));
});
drumAuto.addEventListener('click', () => {
  const enabled = drumAuto.getAttribute('aria-pressed') !== 'true';
  drumAuto.setAttribute('aria-pressed', String(enabled));
  meshView?.setDrumAuto(enabled);
});
connectPlay(carouselPlay, () => carouselGames[selectedIndex]);

carouselMotion.addEventListener('click', () => {
  const paused = gallery.dataset.paused !== 'true';
  gallery.dataset.paused = String(paused);
  carouselMotion.setAttribute('aria-pressed', String(paused));
  carouselMotion.title = paused ? 'Resume cartridge motion' : 'Pause cartridge motion';
  carouselMotion.setAttribute('aria-label', carouselMotion.title);
  carouselMotion.textContent = paused ? '▶' : 'Ⅱ';
  meshView?.invalidate();
});

document.addEventListener('pointerdown', (event) => {
  if (pendingPreview && !pendingPreview.card.contains(event.target)) clearPreviewTimer();
  if (previewEntry && !previewEntry.card.contains(event.target)) closeCasePreview();
});

if (document.documentElement.dataset.clearance === 'open') {
  openArcade(false);
} else {
  enterArcadeButton.focus({ preventScroll: true });
}

enterArcadeButton.addEventListener('click', grantClearance);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !activeRitual && (previewEntry || pendingPreview)) {
    event.preventDefault();
    clearPreviewTimer();
    closeCasePreview();
  }
});

for (const element of document.querySelectorAll('[data-image-fallback]')) {
  watchImage(element.querySelector('img'), (loaded) => element.classList.toggle('has-image', loaded));
}

async function loadShelf() {
  try {
    const response = await fetch('./catalog.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Catalog returned HTTP ' + response.status);
    const catalog = await response.json();
    const games = catalog.games.filter((game) => game.status === 'verified')
      .sort((first, second) => first.title.localeCompare(second.title, 'en'));
    if (games.length === 0) {
      inventoryStatus.textContent = 'The shelf is awaiting its first verified game.';
      return;
    }

    const count = games.length;
    grid.replaceChildren(...games.map(buildGameCard));
    inventoryStatus.textContent = count + (count === 1 ? ' prototype' : ' prototypes');
    carouselGames = games;
    carouselSelect.replaceChildren(...games.map((game, index) => new Option(game.title, index)));
    carouselPrevious.disabled = count < 2;
    carouselNext.disabled = count < 2;
    const request = new URL(window.location.href);
    selectCartridge(Math.max(0, games.findIndex(game => game.id === request.searchParams.get('cart'))));
    carouselMachine.hidden = false;
    if (request.searchParams.has('eject')) {
      const ejectedIndex = games.findIndex((game) => game.id === request.searchParams.get('eject') && hasRitual(game));
      request.searchParams.delete('eject');
      window.history.replaceState(window.history.state, '', request);
      if (ejectedIndex >= 0) {
        const ejected = games[ejectedIndex];
        selectCartridge(ejectedIndex);
        pendingEject = { game: ejected, trigger: gameLinks.get(ejected.id) };
        showPendingEject();
      }
    }
  } catch (error) {
    inventoryStatus.textContent = 'The game catalog could not load. Reload to try again.';
    console.error(error);
  }
}

loadShelf();
