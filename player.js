"use strict";

const player = document.getElementById("game");
const viewport = document.getElementById("viewport");
const standby = document.getElementById("standby");
const gameTitle = document.getElementById("title");
const titleMark = document.getElementById("title-mark");
const worldBackdrop = document.getElementById("world-backdrop");
const slotBridge = document.getElementById("slot-bridge");
const consoleState = document.getElementById("console-state");
const fullscreen = document.getElementById("fullscreen");
const closeExpanded = document.getElementById("close-expanded");
const failure = document.getElementById("failure");
const failureDetail = document.getElementById("failure-detail");
const retry = document.getElementById("retry");
const controls = document.getElementById("controls");
const keyboardProfile = document.getElementById("keyboard-profile");
const applyKeyboardProfile = document.getElementById("apply-keyboard-profile");
const keyGuide = document.querySelectorAll(".key-guide [data-input]");
const remap = document.getElementById("remap");
const touchControls = document.getElementById("touch-controls");
const shareLayout = document.getElementById("share-layout");
const clearLayout = document.getElementById("clear-layout");
const layoutStatus = document.getElementById("layout-status");
const pageFolder = new URL("./", location.href);
const artFolder = new URL("./art/", pageFolder);
const playParams = new URLSearchParams(location.search);
const roomId = playParams.get("room");
const kingfisherRoom = playParams.get("game") === "kingfisher" && roomId === "kingfisher-v1";
const roomMode = kingfisherRoom || roomId === "museum-v1";
const roomRom = new URL("./arcade/roms/Kingfisher-V10-Room-v1.gba", pageFolder);
const layoutKey = `zang-arcade:${pageFolder.pathname}:gba-controls-v1`;
const commonKeys = {
  2: 16, // Select
  3: 13, // Start
  24: 49, 25: 50, 26: 51, // Native quick state shortcuts
  27: 52, 29: 53, 28: 54 // Fast-forward, slow motion, rewind
};
// EmulatorJS maps a RetroPad input number to a browser keyCode for each player.
const keyboardPresets = {
  arrows: { ...commonKeys, 4: 38, 5: 40, 6: 37, 7: 39, 8: 65, 0: 68, 10: 81, 11: 69 },
  wasd: { ...commonKeys, 4: 87, 5: 83, 6: 65, 7: 68, 8: 74, 0: 75, 10: 85, 11: 73 }
};
const arrowLabels = { 37: "←", 38: "↑", 39: "→", 40: "↓" };
let bootTimer;
let errorObserver;
let roomBridge;

function setState(state, label) {
  document.body.dataset.playState = state;
  consoleState.textContent = label;
}

function showFailure(message, canRetry = false) {
  clearTimeout(bootTimer);
  errorObserver?.disconnect();
  setState("error", "Cartridge unavailable");
  standby.hidden = true;
  fullscreen.hidden = true;
  controls.hidden = true;
  failureDetail.textContent = message;
  retry.hidden = !canRetry;
  failure.hidden = false;
  roomBridge?.error(message);
}

function stableGameId(id) {
  let hash = 2166136261;
  for (const character of id) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return (hash >>> 0) || 1;
}

function artworkPath(path) {
  if (typeof path !== "string") return null;
  try {
    const resolved = new URL(path, pageFolder);
    return resolved.origin === artFolder.origin && resolved.pathname.startsWith(artFolder.pathname)
      ? resolved.href
      : null;
  } catch {
    return null;
  }
}

function revealArtwork(image, path, reveal = () => { image.hidden = false; }) {
  if (!path) return;
  image.addEventListener("load", reveal, { once: true });
  image.src = path;
}

function scheduleBackdrop(path) {
  if (!path) return;
  document.body.classList.add("has-world");
  const assignImage = () => revealArtwork(worldBackdrop, path, () => {
    document.body.classList.add("has-backdrop");
  });
  if (typeof requestIdleCallback === "function") requestIdleCallback(assignImage, { timeout: 600 });
  else setTimeout(assignImage, 0);
}

function playSlotArrival(theme, cartridgeLabel) {
  if (playParams.get("from") !== "slot" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dock = document.getElementById("incoming-machine");
  dock.dataset.machineTheme = theme;
  dock.dataset.loaded = "true";
  revealArtwork(document.getElementById("incoming-label"), cartridgeLabel);
  slotBridge.hidden = false;
  slotBridge.addEventListener("animationend", event => {
    if (event.target === slotBridge) slotBridge.hidden = true;
  });
  setTimeout(() => { slotBridge.hidden = true; }, 700);
}

function machineToken(value, fallback) {
  return typeof value === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) ? value : fallback;
}

function configureMachine(game) {
  const theme = machineToken(game.machineTheme, "neutral");
  const variant = machineToken(game.shellVariant, "standard");
  document.body.dataset.machineTheme = theme;
  document.body.dataset.shellVariant = variant;
  if (Number.isInteger(game.backdropFocus) && game.backdropFocus >= 0 && game.backdropFocus <= 100) {
    document.body.style.setProperty("--machine-mobile-backdrop", `${game.backdropFocus}% center`);
  }
  const colors = getComputedStyle(document.body);
  const browserColor = colors.getPropertyValue("--machine-browser-color").trim() || "#111217";
  const emulatorColor = colors.getPropertyValue("--machine-emulator-color").trim() || "#516328";
  document.querySelector('meta[name="theme-color"]').content = browserColor;

  revealArtwork(titleMark, artworkPath(game.titleMark), () => {
    titleMark.hidden = false;
    gameTitle.classList.add("visually-hidden");
  });

  const label = artworkPath(game.cartLabel);
  if (theme === "neutral" && !label) return emulatorColor;

  if (theme !== "neutral") {
    document.body.classList.add("is-themed");
    document.querySelector(".console-hardware").hidden = false;
  }
  const eject = document.getElementById("eject");
  eject.href = `./?eject=${encodeURIComponent(game.id)}`;
  eject.hidden = false;
  document.getElementById("console-cart").hidden = false;
  revealArtwork(document.getElementById("console-cart-label"), label);
  playSlotArrival(theme, label);
  return emulatorColor;
}

function setKeyboardBindings(controllers, preset) {
  for (const [input, keyCode] of Object.entries(preset)) {
    controllers[0][input] = { ...controllers[0][input], value: keyCode };
  }
}

function syncKeyboardGuide(emulator) {
  const playerBindings = emulator.controls[0];
  for (const key of keyGuide) {
    const keyCode = playerBindings[key.dataset.input]?.value;
    const name = emulator.keyMap[keyCode];
    key.textContent = arrowLabels[keyCode] || (name ? name[0].toUpperCase() + name.slice(1) : keyCode > 0 ? `Key ${keyCode}` : "—");
  }
  const matchingPreset = Object.entries(keyboardPresets).find(([, preset]) =>
    Object.entries(preset).every(([input, value]) => playerBindings[input]?.value === value)
  );
  keyboardProfile.value = matchingPreset?.[0] || "";
  applyKeyboardProfile.disabled = keyboardProfile.disabled || !matchingPreset;
}

function configureKeyboardDefaults(emulator) {
  setKeyboardBindings(emulator.defaultControllers, keyboardPresets.arrows);
  setKeyboardBindings(emulator.controls, keyboardPresets.arrows);

  // The runtime refreshes binding labels after a native remap, reset or settings load.
  const refreshBindings = emulator.checkGamepadInputs;
  emulator.checkGamepadInputs = () => {
    refreshBindings();
    syncKeyboardGuide(emulator);
  };
  emulator.checkGamepadInputs();
}

function readSharedLayout() {
  try {
    const layout = JSON.parse(localStorage.getItem(layoutKey));
    const playerIndexes = [0, 1, 2, 3];
    return playerIndexes.every(index => layout?.[index] && typeof layout[index] === "object") ? layout : null;
  } catch {
    return null;
  }
}

function applySharedLayout() {
  // EmulatorJS 4.2.3 loads title-specific settings before emitting its start event.
  const emulator = window.EJS_emulator;
  const layout = readSharedLayout();
  remap.disabled = !emulator.controlMenu;
  shareLayout.disabled = !emulator.controls || typeof emulator.checkGamepadInputs !== "function";
  clearLayout.hidden = !layout || shareLayout.disabled;
  if (layout && !shareLayout.disabled) {
    emulator.controls = layout;
    emulator.checkGamepadInputs();
  }
  layoutStatus.textContent = layout && !shareLayout.disabled
    ? "Using your shared GBA layout. Save it again here after making changes."
    : "Remaps are saved for this game. Share the current layout to use it across the shelf.";
}

function assignConnectedGamepads(emulator) {
  // The pinned runtime can detect a controller before its connection listener is registered.
  for (const gamepad of emulator.gamepad.gamepads) {
    const identifier = `${gamepad.id}_${gamepad.index}`;
    const playerIndex = emulator.gamepadSelection.indexOf("");
    if (playerIndex !== -1 && !emulator.gamepadSelection.includes(identifier)) {
      emulator.gamepadSelection[playerIndex] = identifier;
    }
  }
  emulator.updateGamepadLabels();
}

function setTouchControls(enabled, startup = false) {
  const emulator = window.EJS_emulator;
  emulator.changeSettingOption("virtual-gamepad", enabled ? "enabled" : "disabled", startup);

  // The pinned runtime briefly measures this overlay with opacity zero during resize.
  // Its pending resize callback can hide the overlay after the core has started.
  if (enabled && emulator.virtualGamepad.style.opacity === "0") {
    setTimeout(() => {
      emulator.toggleVirtualGamepad(emulator.getSettingValue("virtual-gamepad") === "enabled");
    }, 300);
  }
}

function configureTouchControls() {
  const emulator = window.EJS_emulator;
  if (!emulator.touch && !emulator.hasTouchScreen) return;

  touchControls.hidden = false;
  const setting = emulator.preGetSetting("virtual-gamepad");
  const prefersTouch = emulator.touch || matchMedia("(pointer: coarse)").matches;
  setTouchControls(setting ? setting === "enabled" : prefersTouch, true);

  const syncTouchButton = () => {
    const style = emulator.virtualGamepad.style;
    touchControls.setAttribute("aria-pressed", String(style.display !== "none" && style.opacity !== "0"));
  };
  syncTouchButton();
  new MutationObserver(syncTouchButton).observe(emulator.virtualGamepad, { attributes: true, attributeFilter: ["style"] });
}

function configureToolbarKeyboard() {
  const toolbar = window.EJS_emulator.elements.menu;
  // Keyboard events from toolbar controls should reach the browser's button and slider handlers.
  for (const type of ["keydown", "keyup"]) {
    toolbar.addEventListener(type, event => event.stopPropagation());
  }
}

function startPlayer(game, romUrl, emulatorColor) {
  if (document.body.dataset.playState !== "loading") return;
  const gameId = Number.isSafeInteger(game.emulatorId) && game.emulatorId > 0
    ? game.emulatorId
    : stableGameId(game.id);

  Object.assign(window, {
    EJS_player: "#game",
    EJS_pathtodata: "./emulator/",
    EJS_core: "mgba",
    EJS_controlScheme: "gba",
    EJS_gameUrl: romUrl.href,
    EJS_gameName: `${game.title} ${game.version}${roomMode ? " room-v1" : ""}`,
    EJS_gameID: roomMode ? stableGameId(`${game.id}:${roomId}`) : gameId,
    EJS_threads: false,
    EJS_language: "en-US",
    // This release treats false as the switch to skip browser-locale detection.
    EJS_disableAutoLang: false,
    EJS_startOnLoaded: false,
    EJS_color: emulatorColor,
    EJS_backgroundColor: "#080a0d",
    EJS_CacheLimit: 0,
    EJS_hideSettings: ["ejs_threads"],
    EJS_defaultOptions: { "save-state-location": "browser", rewindEnabled: "enabled", ...(roomMode ? { "virtual-gamepad": "disabled" } : {}) },
    EJS_Buttons: { cheat: false, cacheManager: false, exitEmulation: false, netplay: false },
    EJS_ready() {
      if (document.body.dataset.playState !== "loading") return;
      configureKeyboardDefaults(window.EJS_emulator);
      clearTimeout(bootTimer);
      standby.hidden = true;
      setState("ready", "Ready to start");
      roomBridge?.ready(window.EJS_emulator);
      if (!roomMode) scheduleBackdrop(artworkPath(game.backdrop));

      const button = player.querySelector(".ejs_start_button");
      button.setAttribute("role", "button");
      button.tabIndex = 0;
      button.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        button.click();
      });

      window.EJS_emulator.on("start-clicked", () => {
        setState("booting", "Loading cartridge");
        bootTimer = setTimeout(() => showFailure("The cartridge took too long to start. Reload the player to try again.", true), 90000);
      });

      errorObserver = new MutationObserver(() => {
        const error = player.querySelector(".ejs_error_text");
        if (error) showFailure(`${error.textContent.trim()} Reload the player to try again.`, true);
      });
      errorObserver.observe(player, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    },
    EJS_onGameStart() {
      if (document.body.dataset.playState === "error") return;
      clearTimeout(bootTimer);
      errorObserver?.disconnect();
      setState("running", "Game running");
      fullscreen.hidden = false;
      document.getElementById("save-help").hidden = false;
      if (!roomMode) configureTouchControls();
      keyboardProfile.disabled = false;
      applySharedLayout();
      syncKeyboardGuide(window.EJS_emulator);
      assignConnectedGamepads(window.EJS_emulator);
      configureToolbarKeyboard();
      if (player.classList.contains("ejs_small_screen")) window.EJS_emulator.menu.close();
      roomBridge?.running();
    }
  });

  const script = document.createElement("script");
  script.src = "./emulator/loader.js";
  script.addEventListener("error", () => showFailure("The local emulator files could not be loaded. Reload the player to try again.", true));
  document.head.appendChild(script);
}

async function loadCartridge() {
  const id = playParams.get("game");
  if (!id) return showFailure("Choose a cartridge from the shelf to start playing.");
  if (location.protocol === "file:") return showFailure("Open the arcade through its local HTTP preview or GitHub Pages to play.");

  bootTimer = setTimeout(() => showFailure("The player took too long to load. Reload the player to try again.", true), 25000);
  let catalog;
  try {
    const response = await fetch("./catalog.json");
    if (!response.ok) throw new Error("Catalog unavailable");
    catalog = await response.json();
    if (!Array.isArray(catalog.games)) throw new Error("Catalog incomplete");
  } catch {
    return showFailure("The game catalog could not be loaded. Reload the player to try again.", true);
  }

  const game = catalog.games.find(entry => entry.id === id);
  if (!game || game.status !== "verified" || String(game.platform).toLowerCase() !== "gba") {
    return showFailure("This game link is unavailable. Choose a playable cartridge from the shelf.");
  }

  const romFolder = new URL("./roms/", pageFolder);
  const rom = kingfisherRoom ? roomRom : typeof game.rom === "string" ? new URL(game.rom, pageFolder) : null;
  const validRoomRom = kingfisherRoom && rom?.href === roomRom.href;
  const validCatalogRom = rom && rom.origin === romFolder.origin && rom.pathname.startsWith(romFolder.pathname) && /\.gba$/i.test(rom.pathname);
  if (!validRoomRom && !validCatalogRom) {
    return showFailure("This cartridge is missing a valid ROM path.");
  }

  document.title = `${game.title} | ZANG Arcade`;
  gameTitle.textContent = game.title;
  document.getElementById("platform").textContent = "GBA";
  document.getElementById("version").textContent = `Prototype ${game.version}`;
  document.getElementById("metadata").hidden = false;
  document.getElementById("core-name").hidden = false;
  controls.hidden = false;
  if (roomMode) {
    const { createPlayerBridge } = await import("./arcade/player-bridge.js");
    roomBridge = createPlayerBridge(player, game.id, roomId);
    document.body.classList.add("room-player");
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "./arcade/player-embed.css";
    document.head.appendChild(style);
  }
  startPlayer(game, rom, roomMode ? "#516328" : configureMachine(game));
}

function setExpanded(expanded) {
  viewport.classList.toggle("is-expanded", expanded);
  document.body.classList.toggle("is-expanded", expanded);
  closeExpanded.hidden = !expanded;
  (expanded ? player : fullscreen).focus({ preventScroll: true });
  window.dispatchEvent(new Event("resize"));
}

fullscreen.addEventListener("click", async () => {
  const requestFullscreen = player.requestFullscreen || player.webkitRequestFullscreen;
  if (requestFullscreen) {
    try {
      await requestFullscreen.call(player);
      player.focus({ preventScroll: true });
      return;
    } catch {
      // An expanded player remains available when the browser declines fullscreen.
    }
  }
  setExpanded(true);
});

closeExpanded.addEventListener("click", () => setExpanded(false));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && viewport.classList.contains("is-expanded")) setExpanded(false);
}, true);
document.addEventListener("fullscreenchange", () => window.dispatchEvent(new Event("resize")));
retry.addEventListener("click", () => location.reload());

player.addEventListener("keydown", event => {
  const emulator = window.EJS_emulator;
  if (event.target !== player || !emulator?.started) return;
  const capturingBinding = !emulator.controlPopup.parentElement.parentElement.hidden;
  const playing = !emulator.isPopupOpen() && emulator.settingsMenu.style.display === "none";

  // The emulator ignores key repeats, so it does not cancel scrolling on a held arrow.
  if (event.key.startsWith("Arrow") && (playing || capturingBinding)) event.preventDefault();
  if (event.key !== "Tab" || capturingBinding) return;

  // Keep keyboard navigation available unless Tab is deliberately mapped.
  const tabIsMapped = Object.values(emulator.controls).some(playerControls =>
    Object.values(playerControls).some(binding => binding.value === 9)
  );
  if (!tabIsMapped) event.stopImmediatePropagation();
}, true);

keyboardProfile.addEventListener("change", () => {
  applyKeyboardProfile.disabled = !keyboardProfile.value;
});

applyKeyboardProfile.addEventListener("click", () => {
  const emulator = window.EJS_emulator;
  const preset = keyboardPresets[keyboardProfile.value];
  setKeyboardBindings(emulator.controls, preset);
  emulator.checkGamepadInputs();
  try {
    emulator.saveSettings();
    layoutStatus.textContent = "Keyboard preset applied to this game. Share the layout to use it across the shelf.";
  } catch {
    layoutStatus.textContent = "Keyboard preset applied. This browser could not save it for next time.";
  }
});

remap.addEventListener("click", () => {
  window.EJS_emulator.controlMenu.style.display = "";
  viewport.scrollIntoView({ block: "nearest" });
  player.focus({ preventScroll: true });
});

touchControls.addEventListener("click", () => setTouchControls(touchControls.getAttribute("aria-pressed") !== "true"));

shareLayout.addEventListener("click", () => {
  try {
    localStorage.setItem(layoutKey, JSON.stringify(window.EJS_emulator.controls));
    clearLayout.hidden = false;
    layoutStatus.textContent = "Keyboard and controller layout saved for all GBA games in this browser.";
  } catch {
    layoutStatus.textContent = "This browser could not save the shared layout.";
  }
});

clearLayout.addEventListener("click", () => {
  try {
    localStorage.removeItem(layoutKey);
    clearLayout.hidden = true;
    shareLayout.focus();
    layoutStatus.textContent = "Future sessions will use each game's saved layout.";
  } catch {
    layoutStatus.textContent = "This browser could not clear the shared layout.";
  }
});

loadCartridge().catch(() => showFailure("The player encountered an error while preparing this cartridge.", true));
