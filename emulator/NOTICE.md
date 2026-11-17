# Emulator files and source

ZANG Arcade includes the EmulatorJS 4.2.3 frontend and two unmodified, single-threaded mGBA core archives from the same release. The core report identifies the build as June 14, 2025. The archives support both graphics backends and include their mGBA license. The runtime is served from this folder.

- **EmulatorJS** is copyright Ethan O’Brien and contributors and distributed under the GNU GPL. Corresponding frontend source and the upstream minification script are available from the [EmulatorJS 4.2.3 source tree](https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3). The frontend source under `src/` and `emulator.css` is included here. [GNU GPL text and EmulatorJS notice](licenses/EmulatorJS-GPL-3.0.txt)
- **mGBA and RetroArch** are distributed under the Mozilla Public License 2.0 and GNU GPL 3.0 respectively. EmulatorJS supplies the binary variants and build report in [its mGBA 4.2.3 package](https://www.npmjs.com/package/@emulatorjs/core-mgba/v/4.2.3). Build scripts and source repositories are maintained by EmulatorJS. [Build scripts](https://github.com/EmulatorJS/build), [mGBA source](https://github.com/EmulatorJS/mgba), [RetroArch source](https://github.com/EmulatorJS/RetroArch), [mGBA license](licenses/mGBA-MPL-2.0.txt), [RetroArch license](licenses/RetroArch-GPL-3.0.txt)
- **Compression worker** `compression/extract7z.js` is supplied unchanged by EmulatorJS 4.2.3 to open the core archives. [Worker file in the tagged source](https://github.com/EmulatorJS/EmulatorJS/blob/v4.2.3/data/compression/extract7z.js)
- **nipplejs** (Yoann Moinet) and **Socket.IO client 4.8.1** (Guillermo Rauch and contributors) are distributed under the MIT License. [nipplejs source](https://github.com/yoannmoinet/nipplejs/tree/v0.10.2), [nipplejs license](licenses/nipplejs-MIT.txt), [Socket.IO source](https://github.com/socketio/socket.io/tree/socket.io%404.8.1), [Socket.IO license](licenses/Socket.IO-MIT.txt)
- **Font Awesome Free 6.5.1** icons in the upstream frontend are copyright Fonticons, Inc. The SVG icons are distributed under CC BY 4.0. [Upstream license](https://github.com/FortAwesome/Font-Awesome/blob/6.5.1/LICENSE.txt), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Provenance and local change

`loader.js`, the frontend source, and compression worker came from the [EmulatorJS 4.2.3 npm package](https://www.npmjs.com/package/@emulatorjs/emulatorjs/v/4.2.3). The minified JavaScript and CSS came from the [pinned EmulatorJS CDN directory](https://cdn.emulatorjs.org/4.2.3/data/). The two npm archives were checked against the upstream package lock’s SHA-512 values.

On November 16, 2026, ZANG Arcade adjusted `src/emulator.js` and the matching `emulator.min.js` bundle. The local updater reads bundled `version.json` instead of requesting the release CDN. Controller connection and input handlers look up the browser's `Gamepad.index` in the list of attached controllers. This keeps input working when a controller has a nonconsecutive index. Older per-game profiles load configured defaults for settings they do not contain. Run the upstream minification script with the included frontend source to rebuild the bundle.

| File | SHA-256 |
| --- | --- |
| `emulator.min.js` as distributed here | `fa3b7ed6fb5365e682f061707ee209c4f16aac8b3ee022e55e806fb326c16375` |
| `emulator.min.js` upstream | `6aec3fd7bb2721255801b0a6af02e47e78b05e28a1822b1f213aacbd348abaee` |
| `emulator.min.css` | `16406c60b2dc3b04ae9b115e308613e6f567a0cc7068e21d9d0c1e5030fb395e` |
| `cores/mgba-legacy-wasm.data` | `e300d2f368c82bf61d77c972c36e367cf16408ec3d50beede080337519a3d696` |
| `cores/mgba-wasm.data` | `01fcaf6d4296ef1db6676e0c69400c4474e24572d0b2b99cc097e4ae885e02d7` |
