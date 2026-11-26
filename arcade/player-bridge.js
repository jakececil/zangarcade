import { parseKingfisherSave } from "./kingfisher-save.js";

const INPUTS = new Set([0, 2, 3, 4, 5, 6, 7, 8, 10, 11]);
export function createPlayerBridge(player, game = "kingfisher", room = "kingfisher-v1") {
  const kingfisher = room === "kingfisher-v1";
  const saveNamespace = kingfisher ? room : `${room}:${game}`;
  const batteryDatabase = `zang-arcade:${new URL("./", location.href).pathname}:room:${saveNamespace}:battery`;
  let emulator;
  let playing = false;
  let lowering = false;
  let reading = false;
  let previousSave = "";
  const touchPresses = new Map();
  let observedManager;
  let heldControls = 0;
  let displayEdges = [];
  let displayFeed;

  function post(event, data = {}) {
    if (window.parent === window) return;
    window.parent.postMessage({ type: "zang-room-player", room, game, event, ...data }, location.origin);
  }

  function snapshot() {
    return parseKingfisherSave(emulator.gameManager.getSaveFile());
  }

  function observeHandheld() {
    const manager = emulator.gameManager;
    if (manager === observedManager) return;
    observedManager = manager;
    const simulateInput = manager.simulateInput;
    manager.simulateInput = function (port, input, value) {
      simulateInput.call(this, port, input, value);
      if (port !== 0 || !INPUTS.has(input)) return;
      const bit = 1 << input;
      const mask = value && playing ? heldControls | bit : heldControls & ~bit;
      if (mask === heldControls) return;
      heldControls = mask;
      post("controls", { mask });
    };
  }

  function startDisplayFeed() {
    if (displayFeed || document.hidden || !emulator.canvas?.captureStream) return;
    let stream;
    try {
      // A presentation capture can see the frame even when WebGL clears its
      // drawing buffer after presenting it. This stream stays in the iframe.
      stream = emulator.canvas.captureStream(8);
    } catch { return; }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const sample = document.createElement("canvas");
    sample.width = 12;
    sample.height = 8;
    const sampler = sample.getContext("2d", { willReadFrequently: true });
    const feed = { video, stream };
    displayFeed = feed;
    if (!sampler) { stopDisplayFeed(); return; }

    function readDisplay() {
      if (displayFeed !== feed || video.readyState < 2) return;
      try {
        sampler.drawImage(video, 0, 0, 12, 8);
        const rgba = sampler.getImageData(0, 0, 12, 8).data;
        const sums = [0, 0, 0, 0, 0, 0];
        for (let row = 1; row < 7; row++) {
          for (let column = 0; column < 3; column++) {
            const left = (row * 12 + column) * 4;
            const right = (row * 12 + 11 - column) * 4;
            for (let channel = 0; channel < 3; channel++) {
              sums[channel] += rgba[left + channel];
              sums[3 + channel] += rgba[right + channel];
            }
          }
        }
        const edges = sums.map((sum, channel) => {
          const value = sum / 18;
          return Math.round(value * .72 + (displayEdges[channel] ?? value) * .28);
        });
        if (edges.some((value, channel) => Math.abs(value - (displayEdges[channel] ?? -255)) >= 7)) {
          displayEdges = edges;
          post("display-light", { edges });
        }
      } catch {
        stopDisplayFeed();
      }
    }

    video.play().then(() => {
      if (displayFeed !== feed) return;
      if (video.requestVideoFrameCallback) {
        const next = () => {
          readDisplay();
          if (displayFeed === feed) feed.frame = video.requestVideoFrameCallback(next);
        };
        feed.frame = video.requestVideoFrameCallback(next);
      } else {
        feed.timer = setInterval(readDisplay, 125);
      }
    }).catch(() => { if (displayFeed === feed) stopDisplayFeed(); });
  }

  function stopDisplayFeed() {
    if (!displayFeed) return;
    const { video, stream, frame, timer } = displayFeed;
    displayFeed = undefined;
    if (frame !== undefined) video.cancelVideoFrameCallback(frame);
    if (timer !== undefined) clearInterval(timer);
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    displayEdges = [];
  }

  function publishSave(save) {
    const value = JSON.stringify(save);
    if (value === previousSave) return;
    previousSave = value;
    post("save", { save });
  }

  function readSave() {
    if (!kingfisher || !emulator?.started || reading || lowering) return;
    reading = true;
    try {
      publishSave(snapshot());
    } catch (error) {
      post("error", { error: `The cartridge save could not be read. ${error.message}` });
    } finally {
      reading = false;
    }
  }

  function syncSave() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Browser save persistence timed out.")), 8000);
      emulator.gameManager.FS.syncfs(false, error => {
        clearTimeout(timeout);
        if (error) reject(new Error("The browser could not persist this save."));
        else resolve();
      });
    });
  }

  function releaseInputs() {
    for (const press of touchPresses.values()) clearTimeout(press.release);
    touchPresses.clear();
    if (!emulator?.started) return;
    // Include native keyboard input which may lose its keyup when focus leaves the iframe.
    for (const input of INPUTS) emulator.gameManager.simulateInput(0, input, 0);
  }

  function touchInput(input, value) {
    const previous = touchPresses.get(input);
    if (value === 1) {
      clearTimeout(previous?.release);
      touchPresses.set(input, { started: performance.now() });
      emulator.gameManager.simulateInput(0, input, 1);
      return;
    }
    if (!previous || previous.release) return;
    const release = () => {
      touchPresses.delete(input);
      emulator.gameManager.simulateInput(0, input, 0);
    };
    // A brief tap can arrive entirely between two emulated GBA frames.
    const remaining = 65 - (performance.now() - previous.started);
    if (remaining > 0) previous.release = setTimeout(release, remaining);
    else release();
  }

  function pausePlayback() {
    emulator.pause();
    // Silence queued audio without changing the user's persisted mute preference.
    emulator.Module.AL?.currentCtx?.sources?.forEach(source => { source.gain.gain.value = 0; });
  }

  async function waitForBank() {
    const deadline = Date.now() + 8000;
    // Let the native input frame and an already-requested save begin before checking its header.
    await new Promise(resolve => setTimeout(resolve, 120));
    let save = snapshot();
    if (save.writing) post("saving");
    while (save.writing) {
      if (Date.now() >= deadline) throw new Error("The cartridge is still saving. Resume play and try lowering it again.");
      await new Promise(resolve => setTimeout(resolve, 120));
      save = snapshot();
    }
    return save;
  }

  async function lower() {
    if (lowering) return;
    lowering = true;
    playing = false;
    stopDisplayFeed();
    let save = { valid: false };
    let failure;
    try {
      if (emulator?.started) {
        releaseInputs();
        // The game writes one native bank over several live frames.
        emulator.play();
        if (kingfisher) save = await waitForBank();
        pausePlayback();
        if (!kingfisher) emulator.gameManager.getSaveFile();
        await syncSave();
        publishSave(save);
      }
    } catch (error) {
      if (emulator?.started) pausePlayback();
      failure = error.message;
    } finally {
      lowering = false;
      post("lowered", { save, ...(failure ? { error: failure } : {}) });
    }
  }

  window.addEventListener("message", event => {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== "zang-room-command") return;
    const command = event.data;
    if (command.action === "lower") lower();
    else if (command.action === "start" && document.body.dataset.playState === "ready") player.querySelector(".ejs_start_button")?.click();
    else if (command.action === "resume" && emulator?.started && !lowering) {
      emulator.play();
      emulator.setVolume(emulator.muted ? 0 : emulator.volume);
      playing = true;
      startDisplayFeed();
      player.focus({ preventScroll: true });
    } else if (command.action === "input" && playing && !lowering && INPUTS.has(command.input) && [0, 1].includes(command.value)) {
      touchInput(command.input, command.value);
    }
  });

  window.addEventListener("blur", releaseInputs);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      releaseInputs();
      stopDisplayFeed();
    } else if (playing) startDisplayFeed();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    releaseInputs();
    post("request-lower");
  }, true);

  const timer = setInterval(() => { if (playing) readSave(); }, 2000);
  window.addEventListener("pagehide", () => {
    clearInterval(timer);
    stopDisplayFeed();
  }, { once: true });

  return {
    get acceptsGamepad() { return playing && !lowering; },
    ready(instance) {
      emulator = instance;
      const managerPrototype = window.EJS_GameManager.prototype;
      const mountFileSystems = managerPrototype.mountFileSystems;
      managerPrototype.mountFileSystems = function () {
        // This iframe owns its IDBFS instance. Redirect its battery mount before the first sync.
        const idbfs = this.FS.filesystems.IDBFS;
        const getDB = idbfs.getDB;
        idbfs.getDB = function (name, callback) {
          return getDB.call(this, name === "/data/saves" ? batteryDatabase : name, callback);
        };
        return mountFileSystems.call(this);
      };
      emulator.on("saveSaveFiles", () => {
        if (!reading && !lowering) readSave();
      });
      post("ready");
    },
    running() {
      playing = true;
      observeHandheld();
      startDisplayFeed();
      // The pinned native exit handler restarts the core and flushes again before unmounting.
      // Keep this room's already-persisted battery intact while its iframe is destroyed.
      emulator.functions.exit = [() => {
        releaseInputs();
        pausePlayback();
        try {
          emulator.gameManager.getSaveFile();
          emulator.gameManager.FS.syncfs(false, () => {});
        } catch (error) {
          post("error", { error: `The cartridge save could not be persisted. ${error.message}` });
        }
      }];
      emulator.changeSettingOption("virtual-gamepad", "disabled", true);
      emulator.toggleVirtualGamepad(false);
      readSave();
      post("running");
    },
    error(message) {
      post("error", { error: message });
    }
  };
}
