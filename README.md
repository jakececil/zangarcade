# ZANG Arcade

ZANG Arcade is a free browser shelf for original game prototypes. The site serves the supplied cartridges byte for byte, preserving the credits inside each game. The cartridge labels are original ZANG Arcade artwork. All runtime assets are included in the folder.

## Local preview

Open a terminal in this folder. With Python 3 installed, run:

```powershell
py -3 -m http.server 8765 --bind 127.0.0.1
```

On macOS or Linux, use `python3 -m http.server 8765 --bind 127.0.0.1`. Visit `http://127.0.0.1:8765/` while the terminal is open. The browser needs HTTP to fetch the catalog, runtime and cartridges. The player works in a modern browser with WebAssembly enabled. No Node.js, package install, build, or BIOS is required.

At the clearance screen, press or tap **4**. To open a game directly, use `play.html?game=jumbo-mini-golf` or `play.html?game=the-weather-engine` under the same site URL. Choose **Start Game** to run the cartridge and enable browser audio.

## Publish with GitHub Desktop and Pages

1. Extract the full ZIP for a first install. If your clone already has the first build, extract the smaller update ZIP. In GitHub Desktop, select the `zangarcade` repository and use **Repository → Show in Explorer**. Copy the extracted files into the folder that contains `index.html` and `.nojekyll`, or into the root of the clone for a first install.
2. In GitHub Desktop, check **Changes**, enter a commit summary such as `Update arcade controls and cartridge display`, and click **Commit to main**. If the toolbar shows **Publish repository**, use it and make the repository public for Pages on GitHub Free. If it shows **Push origin**, use that to upload the commit to the existing remote.
3. On the repository on GitHub, open **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, **Branch** to **main**, and **Folder** to **/(root)**. Click **Save**. The bundled `.nojekyll` tells Pages to serve the static files as supplied.
4. After the Pages job in **Actions** finishes, open **Settings → Pages → Visit site**. For `jakececil/zangarcade` the expected URL is `https://jakececil.github.io/zangarcade/`. Test the shelf, then open `play.html?game=jumbo-mini-golf` under that URL in a fresh tab and start the game. Share the `github.io` site URL.

[Publish from GitHub Desktop](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop?platform=windows) · [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Play and save

- **Keyboard.** The default layout uses the arrows for the D-pad, A/D for A/B, and Q/E for L/R. The WASD layout uses W/A/S/D for the D-pad, J/K for A/B, and U/I for L/R. Both use Shift for Select, Enter for Start, and 4/5/6 for fast-forward, slow motion, and rewind. Click the game to focus it. Use the keyboard profile picker below the game to switch layouts. Existing custom bindings load until you apply a profile.
- **Controller.** Connect a browser-compatible controller and press a button to activate it. Use **Remap controls** below the game to open the emulator's control settings. **Use layout for all GBA games** applies the current keyboard and controller bindings across the catalog in this browser.
- **Touch and fullscreen.** Start the game by tapping on a touch browser. Use the on-screen controls or switch them on or off with **Touch controls** below the game. **Fullscreen** uses browser fullscreen where available and expands the play area to fill the viewport otherwise.
- **Saves.** In-game save behavior depends on the prototype. **Save State** and **Load State** store and restore a snapshot on the same browser profile and site origin. **Export Save File** can back up compatible in-game saves. Preview and GitHub Pages have separate browser storage.

## Replace a game label

1. Drag an image, for example `jumbo-mini-golf.webp`, into the clone’s `art` folder. PNG or WebP works.
2. In `catalog.json`, find the entry with `"id": "jumbo-mini-golf"` and add `"art": "./art/jumbo-mini-golf.webp",` immediately above its `status` line. Match the filename’s capitalization.
3. Refresh the local shelf to check both the tile and the rotating cartridge. Commit the image and the catalog edit together, then push the change.

The current template centers, crops, and tints the image to fit both surfaces. Keep any important detail near the center. The game title and version are added by the site. For a fully textured cartridge, give the front, back, and any printed edges their own image files and map them to the cartridge geometry. A new cartridge shape will need matching geometry.

## Add a cartridge

| Path | Purpose |
| --- | --- |
| `index.html`, `shelf.css`, `shelf.js` | Clearance screen, shelf and rotating display cartridge |
| `play.html`, `player.css`, `player.js` | Shared browser player |
| `catalog.json` | Shelf order, direct-link IDs, title, version and ROM paths |
| `roms/` | Verified original GBA cartridges |
| `emulator/` | Pinned EmulatorJS 4.2.3, mGBA and upstream notices |
| `art/` | Generic label artwork and optional game labels |
| `INBOX.md` | Inventory and release checks |

1. Check that the new file is an original cartridge intended for public distribution. Check versions and compare hashes when multiple copies are present. Leave BIOS, commercial ROMs, personal saves and unverified disc images out of the site folder.
2. Copy the `.gba` into `roms/` and add its entry to `catalog.json`. Use a lowercase slug for its stable `id`, a display `title`, `version`, `platform: "GBA"`, and a relative `rom` path. An optional relative `art` path supplies label art. Keep an existing `id` when updating its ROM. Back up saves before swapping builds since snapshots may depend on the exact ROM and emulator version.
3. On a local draft, set the catalog entry's `status` to `verified` for the smoke test. Open the direct link under HTTP, start the cartridge, wait for a rendered game screen, and check a game-specific input. Check sound and saves where the prototype supports them. If it fails, remove the draft entry and its ROM from the release and record the issue in `INBOX.md`.
4. Commit and push the catalog, cartridge and any label together. Verify the direct link again on Pages. The same folder works at `/` and `/zang-arcade/`.

The current player runs the GBA catalog with single-threaded mGBA so it can run on GitHub Pages. To add a platform later, extend the player’s platform check to select the appropriate core and input scheme. Validate the console, image format, firmware needs, controls and static-host behavior with a single game before adding Play links. Keep the versioned runtime and core together when updating dependencies. [Bundled emulator source, provenance and licenses](emulator/NOTICE.md)
