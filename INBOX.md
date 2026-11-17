# ZANG Arcade inbox inventory

The supplied ZIP contained 21 files. The 19 GBA prototypes below opened in the browser emulator, advanced emulated frames, and rendered a title, opening scene, or game screen. No two input files had the same SHA-256. The two CHD disc images are held for future platform work.

The first test used the supplied **Jumbo Mini Golf V2**. The requested V1 cartridge was absent from the archive. **The Weather Engine v0.1** was the second test.

| Title | Platform | Version | Source file | Result |
| --- | --- | --- | --- | --- |
| Jumbo Mini Golf | GBA | V2 | `JUMBO-MINI-GOLF-V2.gba` | Playable |
| The Weather Engine | GBA | v0.1 | `TheWeatherEngine-v0.1.gba` | Playable |
| Blamball | GBA | V2 | `ZANG-Blamball-V2.gba` | Playable |
| Cat’s Cradle | GBA | V6 | `Cats-Cradle-V6.gba` | Playable |
| Garden Song | GBA | v0.1 | `Garden-song-v0.1.gba` | Playable. Opening screen reads Choir Engine. |
| Gut Punch: Lower Management | GBA | v2 | `Gut_Punch_Lower_Management_v2.gba` | Playable |
| Gut Punch: Specimen Run | GBA | v0.7 | `Gut-Punch-Specimen-Run-v0.7.gba` | Playable |
| Kingfisher | GBA | V10 | `Kingfisher-V10.gba` | Playable |
| Landfill | GBA | V2 | `LANDFILL-V2.gba` | Playable. Opening screen reads Trashland. |
| Lighthouse Keeper | GBA | V1 | `Lighthouse-Keeper-V1.gba` | Playable |
| Little Company | GBA | v0.3 | `ZANG-LittleCompany-v0.3.gba` | Playable |
| Parasol | GBA | V1 | `Parasol-V1.gba` | Playable |
| Riverbed | GBA | V8 | `RIVERBED-V8.gba` | Playable. Allow a few seconds for the intro. |
| Sugar Drum | GBA | V1 | `ZANG-Sugar-Drum-V1.gba` | Playable |
| Swamp Rocket | GBA | V7 | `Swamp-Rocket-V7.gba` | Playable |
| Trashland Pinball | GBA | V2.1 | `TRASHLAND-PINBALL-V2.1.gba` | Playable |
| Triple Giblet | GBA | V1 | `TripleGiblet-V1.gba` | Playable |
| Undergrowth Advance | GBA | v0.3.1 | `Undergrowth-Advance-v0.3.1.gba` | Playable |
| ZONK | GBA | V6.3.1 | `ZONK-V6.3.1.gba` | Playable |
| Amber Term | PlayStation, per filename | v0.2-1 | `Amber-Term-PS1-v0.2-1.chd` | Held. PlayStation player not configured. |
| Loose Ends | Platform unconfirmed, Mode 2 CD | v5 | `Loose-Ends-v5.chd` | Held. Confirm platform and core before release. |

Titles and versions follow the supplied filenames. The site retains the original ROM bytes and in-game credits.

## Browser checks

- Served the shelf and direct Play links at both `/` and `/zang-arcade/`. Confirmed the clearance key and tap, session persistence after reload, and label swapping. The held PlayStation entry returned an unavailable-game page.
- Launched each GBA prototype in Chrome through the reusable player and checked video output. Jumbo Mini Golf responded to keyboard input in its menu and produced audio during play. Browser fullscreen worked, and a save state restored in a fresh tab on the same origin. A keyboard remap shared from Jumbo carried over to The Weather Engine.
- Chrome’s emulated touch profile showed the controls and passed an A-button press and release through to mGBA. The touch toggle hid and restored the buttons.
- Simulated standard browser gamepads passed automatic assignment at startup, reconnect, input, and shared remapping between Jumbo Mini Golf and The Weather Engine.
- In the keyboard update, Jumbo booted with the Arrow keys preset. Held arrows moved in the game without scrolling the page while it had focus. The WASD preset persisted on reload and kept the existing controller mapping. The 4, 5 and 6 keys reached the emulator’s speed and rewind controls.
- This was a boot check across the catalog. Full playthroughs, individual in-game save formats, physical controllers and phones, and Safari and Firefox remain untested. The public Pages URL can be checked after publication.
