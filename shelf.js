'use strict';

const arcade = document.getElementById('arcade');
const arcadeTitle = document.getElementById('arcade-title');
const clearanceKey = document.getElementById('clearance-key');
const clearanceStorageKey = 'zang-arcade-clearance';
const siteDirectory = new URL('./', document.baseURI);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const counter = document.getElementById('counter');
const featuredList = document.getElementById('featured-list');
const grid = document.getElementById('game-grid');
const inventoryStatus = document.getElementById('inventory-status');
const cardTemplate = document.getElementById('game-card-template');
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
const cartTitle = document.getElementById('ritual-cart-title');
const cartMark = document.getElementById('ritual-cart-mark');
const dock = document.getElementById('ritual-device-motion');
const machine = document.getElementById('ritual-machine');
const slot = document.getElementById('ritual-slot');

let activeRitual;
let pendingEject;

function openArcade(moveFocus) {
  document.documentElement.dataset.clearance = 'open';
  arcade.inert = false;
  if (moveFocus) arcadeTitle.focus({ preventScroll: true });
  showPendingEject();
}

function grantClearance() {
  openArcade(true);
  try {
    sessionStorage.setItem(clearanceStorageKey, '4');
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

function setArtwork(element, property, asset) {
  if (asset) {
    element.style.setProperty(property, 'url(' + JSON.stringify(asset) + ')');
  } else {
    element.style.removeProperty(property);
  }
}

function themeFor(game) {
  return typeof game.machineTheme === 'string' && game.machineTheme !== 'neutral' &&
    /^[a-z][a-z0-9-]*$/.test(game.machineTheme) ? game.machineTheme : '';
}

function canAnimate() {
  return !reduceMotion.matches && typeof ritual.showModal === 'function' &&
    typeof cart.animate === 'function';
}

function buildGameCard(game, index, featured) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  const link = card.querySelector('.game-card');
  const cover = card.querySelector('.box-cover');
  const fallback = card.querySelector('.box-fallback');
  const theme = themeFor(game);
  const action = card.querySelector('.game-action');
  const coverUrl = localAsset(game.cover) || localAsset(game.art);
  const tone = game.id === 'jumbo-mini-golf' ? 'gold' : palette[index % palette.length];
  link.href = playLink(game);
  link.dataset.palette = tone;
  link.setAttribute('aria-label', 'Play ' + game.title + ', prototype ' + game.version);
  card.querySelector('.game-title').textContent = game.title;
  card.querySelector('.game-meta').textContent = game.platform + ' · Prototype ' + game.version;
  fallback.querySelector('strong').textContent = game.title;

  if (coverUrl) {
    cover.loading = featured ? 'eager' : 'lazy';
    cover.decoding = 'async';
    cover.addEventListener('load', () => { fallback.hidden = true; }, { once: true });
    cover.addEventListener('error', () => {
      cover.hidden = true;
      fallback.hidden = false;
    }, { once: true });
    cover.src = coverUrl;
    cover.hidden = false;
  }

  if (theme) {
    action.firstChild.textContent = 'Load ';
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey ||
          event.shiftKey || event.metaKey || !canAnimate()) return;
      if (openRitual(game, 'load', link)) event.preventDefault();
    });
  }

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

function cartPath() {
  const stageRect = stage.getBoundingClientRect();
  const start = centerOf(box, stageRect);
  const opening = centerOf(slot, stageRect);
  const height = cart.offsetHeight;
  const raised = { x: opening.x, y: opening.y - height * .46 };
  const midway = {
    x: (start.x + raised.x) / 2,
    y: Math.max(height * .72, Math.min(start.y, raised.y) - height * .36)
  };
  const partlySeated = { x: opening.x, y: opening.y + height * .11 };
  const seated = { x: opening.x, y: opening.y + height * .39 };
  return { start, raised, midway, partlySeated, seated };
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
  const { start, raised, midway, partlySeated, seated } = path;
  ritualStatus.textContent = 'Opening the box…';
  await animate(run, lid, [
    { transform: 'rotateY(0deg)' },
    { transform: 'rotateY(-120deg)' }
  ], 455, 'cubic-bezier(.24,.72,.25,1)');

  ritualStatus.textContent = 'Lifting cartridge…';
  await animate(run, cart, [
    { ...pose(start, -16, .72, 0), offset: 0 },
    { ...pose(start, -16, .77, 1), offset: .05 },
    { ...pose(midway, -12, 1.06), offset: .46 },
    pose(raised)
  ], 655, 'cubic-bezier(.2,.72,.35,1)');

  ritualStatus.textContent = 'Seating cartridge…';
  await animate(run, cart, [
    pose(raised),
    { ...pose(partlySeated, 0, 1, 1, 57), offset: .62 },
    { ...pose(seated, 0, 1, 1, 90), offset: .96 },
    pose(seated, 0, 1, 0, 90)
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
  const { start, raised, midway, partlySeated, seated } = path;
  ritualStatus.textContent = 'Returning to the counter…';
  await animate(run, dock, [
    { transform: 'translateY(' + stage.offsetHeight + 'px)' },
    { transform: 'translateY(0)' }
  ], 445, 'cubic-bezier(.23,.68,.33,1)');

  machine.dataset.loaded = 'false';
  ritualStatus.textContent = 'Ejecting cartridge…';
  await animate(run, cart, [
    pose(seated, 0, 1, 1, 90),
    { ...pose(partlySeated, 0, 1, 1, 57), offset: .43 },
    pose(raised)
  ], 340, 'cubic-bezier(.27,.68,.3,1)');

  ritualStatus.textContent = 'Returning cartridge to its box…';
  await animate(run, cart, [
    pose(raised),
    { ...pose(midway, -12, 1.05), offset: .51 },
    { ...pose(start, -16, .77), offset: .91 },
    pose(start, -16, .72, 0)
  ], 630, 'cubic-bezier(.43,.1,.32,1)');

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
  const label = localAsset(game.cartLabel);
  const titleMark = localAsset(game.titleMark);
  const backdrop = localAsset(game.backdrop);
  const run = { game, mode, trigger, animations: [] };

  ritual.dataset.machineTheme = themeFor(game);
  stage.dataset.shellVariant = typeof game.shellVariant === 'string' ? game.shellVariant : '';
  machine.dataset.loaded = String(returning);
  ritualHeader.textContent = returning ? 'Eject cartridge' : 'Load cartridge';
  ritualTitle.textContent = game.title;
  ritualSkip.href = returning ? '#inventory' : playLink(game);
  ritualSkip.firstChild.textContent = returning ? 'Return to shelf ' : 'Skip to game ';
  boxTitle.textContent = game.title;
  boxTitle.hidden = Boolean(cover);
  cartTitle.textContent = game.title;
  cartTitle.hidden = Boolean(titleMark);
  cartMark.hidden = !titleMark;
  if (titleMark) {
    cartMark.src = titleMark;
  } else {
    cartMark.removeAttribute('src');
  }
  lid.style.transform = returning ? 'rotateY(-120deg)' : '';
  setArtwork(lid, '--box-art', cover);
  setArtwork(cart, '--cart-art', label);
  setArtwork(stage, '--stage-art', backdrop);

  try {
    ritual.showModal();
  } catch {
    return false;
  }

  activeRitual = run;
  ritualSkip.focus({ preventScroll: true });
  const path = cartPath();
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

cartMark.addEventListener('error', () => {
  cartMark.hidden = true;
  cartTitle.hidden = false;
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

if (document.documentElement.dataset.clearance === 'open') {
  openArcade(false);
} else {
  clearanceKey.focus({ preventScroll: true });
}

clearanceKey.addEventListener('click', grantClearance);
document.addEventListener('keydown', (event) => {
  if (event.key === '4' && document.documentElement.dataset.clearance === 'closed') {
    event.preventDefault();
    grantClearance();
  }
});

async function loadShelf() {
  try {
    const response = await fetch('./catalog.json');
    if (!response.ok) throw new Error('Catalog returned HTTP ' + response.status);
    const catalog = await response.json();
    const games = catalog.games.filter((game) => game.status === 'verified');
    const featured = new Set(games.filter(themeFor).slice(0, 2));
    const shelfCards = [];
    const counterCards = [];

    for (const [index, game] of games.entries()) {
      const onCounter = featured.has(game);
      const card = buildGameCard(game, index, onCounter);
      (onCounter ? counterCards : shelfCards).push(card);
    }

    grid.replaceChildren(...shelfCards);
    featuredList.replaceChildren(...counterCards);
    counter.hidden = counterCards.length === 0;

    if (games.length === 0) {
      inventoryStatus.textContent = 'The shelf is awaiting its first verified game.';
      return;
    }

    const count = shelfCards.length;
    inventoryStatus.textContent = count + (counterCards.length && count ? ' more' : '') +
      (count === 1 ? ' prototype' : ' prototypes');

    const request = new URL(window.location.href);
    if (request.searchParams.has('eject')) {
      const ejected = games.find((game) => game.id === request.searchParams.get('eject') && themeFor(game));
      request.searchParams.delete('eject');
      window.history.replaceState(window.history.state, '', request);
      if (ejected) {
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
