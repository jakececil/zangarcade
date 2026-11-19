# ZANG Arcade Museum

The shelf links to `./arcade/` under the existing Pages site. Serve the repository over HTTP and visit `/arcade/`. All assets are local and no build or installation is required. The directory lists the verified GBA catalog. Each exhibit has a corridor doorway, a desk cartridge, a handheld, and a display that uses the game's cover, backdrop, and shell colors. Add a verified GBA entry to the catalog to add a doorway and exhibit.

Walk with WASD or arrows. Press M for mouse look, Escape to release it, or drag to look with the pointer free. Press E or use the interaction button near an object. Carry a cartridge into another exhibit to use that room's handheld, or swap it for the local game. Lower handheld or Escape returns to the same camera position with the emulator paused. Touch uses a walking pad and separate game buttons. The renderer idles during settled gameplay. The shelf and museum links share a tab, and the museum remembers the exhibit and cartridge for the session.

## Cartridge and save signal

`roms/Kingfisher-V10-Room-v1.gba` is a byte-identical copy of the existing Kingfisher V10 ROM, given its own filename for native battery-save isolation. Its separate emulator ID is `2268921765`, game name is `Kingfisher V10 room-v1`, and battery save is `/data/saves/mGBA/Kingfisher-V10-Room-v1.srm`. The room redirects its own IDBFS instance to the IndexedDB database `zang-arcade:<site-path>:room:kingfisher-v1:battery` before mounting. Its save lifecycle operates entirely in that database. The catalog cartridge uses its existing filename, database, ID, settings, and state name.

Other museum games use their existing ROM files with museum-specific emulator IDs, names and per-title battery databases. Kingfisher's existing room save keeps its original database and ID.

The unmodified Kingfisher game already saves its landed-fish count. `kingfisher-save.js` validates the 32,768-byte SRAM file, both 16,384-byte banks, `KFA1` signature, schema 3, 13,928-byte payload length, CRC32, and generation. The landed count is a little-endian unsigned 16-bit field at payload offset 14. The active and parked aquarium worlds each have their own count. Either world reaching ten opens the grate. The observatory adds one stylized 3D fish per saved catch up to ten. Those models visualize the count. They use a shared set of meshes and colors.

The game requests a save on a successful catch and also autosaves during play. Each bank takes roughly 109 emulated frames to write. `player-bridge.js` reads actual save bytes through `gameManager.getSaveFile()`, checks the parser result, and sends save metadata to its same-origin parent. Before lowering, it allows an in-progress bank write to finish, pauses the core, and awaits `FS.syncfs(false)` for IndexedDB persistence. The parent accepts messages only from its own player iframe. Grate progress is stored under `zang-arcade:<site-path>:room:kingfisher-v1` in localStorage and survives a refresh.

The nine- and ten-fish validation saves were produced by sequential normal game input. Read-only emulator telemetry helped time the minigame controls during verification. Save fixtures and test helpers remain outside the published site.

## Included dependency

Three.js 0.187.0 is vendored from its official npm package. Its license is in `vendor/THREE-LICENSE.txt`. Existing arcade artwork supplies the cartridge label and posters.

The underwater vista in `art/kingfisher-window.webp` was made with the built-in image generator. It depicts a freshwater quarry from an underwater observation window, with dark rock shelves, teal light rays, kelp, and a calm blue-green center. The original PNG and full prompt are stored outside the published site.
