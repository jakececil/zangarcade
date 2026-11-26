# ZANG Arcade Museum

The shelf links to `./arcade/` under the existing Pages site. Serve the repository over HTTP and visit `/arcade/`. All assets are local and no build or installation is required. The directory lists the verified GBA catalog. Each exhibit has a neighborhood doorway and a collectible cartridge. Exhibit dimensions and special room families are configured in `guts.js`. ZONK uses alternating collision baffles and a maze keeper.

Walk with WASD or arrows and hold Shift to run. Press M for mouse look, Escape to release it, or drag to look with the pointer free. Press E near an object to interact. I opens the inventory, and H raises your handheld wherever you stand. Lower handheld or Escape returns to the same camera position with the emulator paused. Touch uses a walking pad, Run toggle, and separate game buttons. Gamepads use the sticks to move and look, with L2 / LT toggling sprint. The renderer idles during settled gameplay. The shelf and museum links share a tab, and the museum remembers the exhibit and cartridge for the session.

Discovered cartridges persist under `zang-arcade:<site-path>:museum-collection-v1`. Bring them to the living-room shelf and use **Box new cartridges**. Once stored, face an individual box and interact to pull it out and load its title into your portable selection. Earlier visitors keep their last selected cartridge, and a saved Kingfisher catch also preserves discovery. Undergrowth Advance uses a translucent amber shell with a visible board and contacts.

## The neighborhood

Exit the apartment into the landing and turn into the arcade and Enamel Market. The Salvage Ramp climbs to the Trashland Overlook and rejoins the arcade by the Sorting Roof and Freight Ramp. The Service Descent leads into Gut Punch Works. The Backflow Crosscut and apartment service ramp connect it back to the landing. Direct arrivals are available at `?room=market`, `?room=trashland`, and `?room=gut-punch`. The earlier `?room=works` bookmark arrives at Gut Punch Works.

The footprint in `district-layout.js` is measured in metres. Attach a module along a shared edge with a walkable overlap and matching floor heights. Add its doorway to the slot table. The same plan builds floor slopes, wall openings, collision, and where each exhibit deposits the player on return. `district-architecture.js` adds the zone finishes and props. The illustrated market front and Trashland horizon sit on surfaces in the authored geometry. A separate Atlas Chisel pass can use depth rendered from this footprint. [World Labs Chisel inputs](https://docs.atlas.worldlabs.ai/atlas-chisel-tutorial)

## Cartridge and save signal

`roms/Kingfisher-V10-Room-v1.gba` is a byte-identical copy of the existing Kingfisher V10 ROM, given its own filename for native battery-save isolation. Its separate emulator ID is `2268921765`, game name is `Kingfisher V10 room-v1`, and battery save is `/data/saves/mGBA/Kingfisher-V10-Room-v1.srm`. The room redirects its own IDBFS instance to the IndexedDB database `zang-arcade:<site-path>:room:kingfisher-v1:battery` before mounting. Its save lifecycle operates entirely in that database. The catalog cartridge uses its existing filename, database, ID, settings, and state name.

Other museum games use their existing ROM files with museum-specific emulator IDs, names and per-title battery databases. Kingfisher's existing room save keeps its original database and ID.

The unmodified Kingfisher game already saves its landed-fish count. `kingfisher-save.js` validates the 32,768-byte SRAM file, both 16,384-byte banks, `KFA1` signature, schema 3, 13,928-byte payload length, CRC32, and generation. The landed count is a little-endian unsigned 16-bit field at payload offset 14. The active and parked aquarium worlds each have their own count. Either world reaching ten opens the grate. The observatory adds one stylized 3D fish per saved catch up to ten. Those models visualize the count. They use a shared set of meshes and colors.

The game requests a save on a successful catch and also autosaves during play. Each bank takes roughly 109 emulated frames to write. `player-bridge.js` reads actual save bytes through `gameManager.getSaveFile()`, checks the parser result, and sends save metadata to its same-origin parent. Before lowering, it allows an in-progress bank write to finish, pauses the core, and awaits `FS.syncfs(false)` for IndexedDB persistence. The parent accepts messages only from its own player iframe. Grate progress is stored under `zang-arcade:<site-path>:room:kingfisher-v1` in localStorage and survives a refresh.

The nine- and ten-fish validation saves were produced by sequential normal game input. Read-only emulator telemetry helped time the minigame controls during verification. Save fixtures and test helpers remain outside the published site.

## Included dependency

Three.js 0.187.0 is vendored from its official npm package. Its license is in `vendor/THREE-LICENSE.txt`. Existing arcade artwork supplies the cartridge label and posters.

The underwater vista in `art/kingfisher-window.webp` and the enamel surface in `art/guts-enamel.webp` were made with the built-in image generator. The original PNGs and full prompts are stored outside the published site. Museum posters and cases use independent print materials for cover colors.
