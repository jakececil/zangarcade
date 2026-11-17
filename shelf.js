'use strict';

const arcade = document.getElementById('arcade');
const clearanceKey = document.getElementById('clearance-key');
const arcadeTitle = document.getElementById('arcade-title');
const clearanceStorageKey = 'zang-arcade-clearance';

function openArcade(moveFocus) {
  document.documentElement.dataset.clearance = 'open';
  arcade.inert = false;
  if (moveFocus) arcadeTitle.focus({ preventScroll: true });
}

function grantClearance() {
  openArcade(true);
  try {
    sessionStorage.setItem(clearanceStorageKey, '4');
  } catch {
    // The gate still opens when the browser blocks session storage.
  }
}

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

const grid = document.getElementById('game-grid');
const inventoryStatus = document.getElementById('inventory-status');
const showcase = document.getElementById('showcase');
const featurePlay = document.getElementById('feature-play');
const previewTitle = document.getElementById('preview-title');
const previousButton = document.getElementById('preview-back');
const nextButton = document.getElementById('preview-next');
const motionButton = document.getElementById('preview-motion');
const labelTitles = showcase.querySelectorAll('.cartridge-title');
const labelVersions = showcase.querySelectorAll('.cartridge-version');

const siteDirectory = new URL('./', document.baseURI);
const palette = ['gold', 'cyan', 'orchid', 'coral', 'lime', 'blue', 'pink'];
const fallbackArt = ['./art/arcade.png', './art/isobars.png'];

function playLink(game) {
  return `./play.html?game=${encodeURIComponent(game.id)}`;
}

function selectArt(game, index) {
  if (/jumbo.*mini.*golf/i.test(game.title)) return ['./art/fairway.png', 'gold'];
  if (/weather engine/i.test(game.title)) return ['./art/isobars.png', 'cyan'];
  return [fallbackArt[index % fallbackArt.length], palette[index % palette.length]];
}

function styleArtwork(element, game, index) {
  const [genericArt, tone] = selectArt(game, index);
  let image = `url(${JSON.stringify(genericArt)})`;
  if (typeof game.art === 'string' && game.art) {
    try {
      const customArt = new URL(game.art, siteDirectory);
      if (customArt.href.startsWith(siteDirectory.href)) {
        image = `url(${JSON.stringify(customArt.href)}), ${image}`;
      }
    } catch {
      // Keep the bundled cover when a catalog artwork path is invalid.
    }
  }
  element.dataset.palette = tone;
  element.style.setProperty('--artwork', image);
}

function buildGameCard(game, index) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'game-card';
  link.href = playLink(game);
  link.setAttribute('aria-label', `Play ${game.title}, prototype ${game.version}`);
  styleArtwork(link, game, index);

  const art = document.createElement('div');
  art.className = 'game-card-art';
  art.setAttribute('aria-hidden', 'true');
  const ink = document.createElement('div');
  ink.className = 'game-art';
  art.append(ink);

  const body = document.createElement('div');
  body.className = 'game-card-body';

  const meta = document.createElement('span');
  meta.className = 'game-meta';
  meta.textContent = `${game.platform} · Prototype ${game.version}`;

  const title = document.createElement('h3');
  title.className = 'game-title';
  title.textContent = game.title;

  const play = document.createElement('span');
  play.className = 'game-play';
  play.setAttribute('aria-hidden', 'true');
  play.textContent = 'Play →';

  body.append(meta, title, play);
  link.append(art, body);
  item.append(link);
  return item;
}

function previewGame(game, index) {
  styleArtwork(showcase, game, index);
  previewTitle.textContent = `${game.title} · ${game.version}`;
  for (const title of labelTitles) title.textContent = game.title;
  for (const version of labelVersions) version.textContent = `Prototype ${game.version}`;
  featurePlay.href = playLink(game);
  featurePlay.firstChild.textContent = `Play ${game.title} `;
}

motionButton.addEventListener('click', () => {
  const still = showcase.dataset.still !== 'true';
  showcase.dataset.still = String(still);
  motionButton.textContent = still ? '▶' : 'Ⅱ';
  motionButton.setAttribute('aria-label', still ? 'Resume cartridge rotation' : 'Pause cartridge rotation');
});

async function loadShelf() {
  try {
    const response = await fetch('./catalog.json');
    if (!response.ok) throw new Error(`Catalog returned HTTP ${response.status}`);
    const catalog = await response.json();
    const games = catalog.games.filter((game) => game.status === 'verified');
    grid.replaceChildren(...games.map(buildGameCard));

    if (games.length === 0) {
      inventoryStatus.textContent = 'The shelf is awaiting its first verified game.';
      return;
    }

    inventoryStatus.textContent = `${games.length} playable ${games.length === 1 ? 'prototype' : 'prototypes'}`;
    let selection = Math.max(0, games.findIndex((game) => /jumbo.*mini.*golf/i.test(game.title)));
    previewGame(games[selection], selection);

    if (games.length > 1) {
      previousButton.disabled = false;
      nextButton.disabled = false;

      const rotateSelection = (step) => {
        selection = (selection + step + games.length) % games.length;
        previewGame(games[selection], selection);
      };

      previousButton.addEventListener('click', () => rotateSelection(-1));
      nextButton.addEventListener('click', () => rotateSelection(1));
    }
  } catch (error) {
    inventoryStatus.textContent = 'The game catalog could not load. Reload to try again.';
    console.error(error);
  }
}

loadShelf();
