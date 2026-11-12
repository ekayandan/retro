# Retro

NES and PSP emulators that run fully in the browser. Visit once, then it works offline (installable as an app).
Bring your own game files — nothing is uploaded, there is no server, no accounts, no tracking.

- **Add games**: pick `.nes`/`.zip` (NES) or `.iso`/`.cso`/`.pbp` (PSP) files from the device (several at once). Duplicates are skipped.
- **PSP** (laptop/desktop, recent Chrome, Edge or Firefox): games up to ~2 GB are copied into the browser's private file system (OPFS) as a stream. The PSP runtime (~16 MB) downloads the first time you open a PSP game, then works offline. Keyboard and gamepad controls come from EmulatorJS (its settings menu lets you remap them). ← saves and returns to the library.
- **Box art**: downloaded once when online from [libretro-thumbnails](https://github.com/libretro-thumbnails), shrunk to a ~20 KB JPEG and kept on the device. Games without art retry weekly; ⋯ → *Find box art again*. Best match when files use official names, e.g. `Game Name (USA).nes`.
- **Saves**: in-game battery saves are written as you play. Leaving the game (or switching apps) saves a resume point, so you continue exactly where you left off. One manual save-state slot in the ☰ menu.
- **Controls**: touch pad (multi-touch, slide between buttons), keyboard (arrows/WASD, X/K = A, Z/J = B, Enter = Start, Shift = Select, Esc = menu), and any gamepad (Xbox/PS/Switch Pro, incl. TV boxes).

## Files

| File | What |
|---|---|
| `index.html`, `style.css`, `app.js` | the app: library, player, input, audio |
| `storage.js` | IndexedDB wrapper + tiny `.zip` reader (works in Node too) |
| `art.js` | box-art lookup and caching |
| `psp.html`, `psp.js` | PSP player page: loads the game from OPFS, starts EmulatorJS, saves a resume point |
| `ejs/` | [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) 4.2.3 with the PPSSPP core (GPL-3.0) |
| `lib/jsnes.min.js` | emulator core, [jsnes](https://github.com/bfirsh/jsnes) 2.1.0 (Apache-2.0, see `lib/jsnes.LICENSE`) |
| `sw.js` | offline cache, plus the cross-origin isolation headers PSP threads need (GitHub Pages can't send them). **Bump `VERSION` on every change** so phones update |
| `tools/test-core.js` | `node tools/test-core.js` checks core, battery saves, save states, zip (runs in CI) |
| `tools/make-test-rom.js` | builds a tiny homebrew test program |
| `tools/make-icons.py` | redraws the icons |

## Run locally

```bash
python3 -m http.server 8742
```

Open http://localhost:8742. Offline mode needs `localhost` or HTTPS.

## Notes

- Storage: everything lives in IndexedDB. The app asks the browser to keep it (`navigator.storage.persist()`).
  On iPhone, add it to the Home Screen — Safari can clear data of sites not opened for 7 days, installed apps are exempt.
- NES: iNES files; most mappers work, a few rare ones don't.
- PSP: heavy 3D games may run slowly on weaker laptops. Resume points can fail for some games; in-game saves always persist.
- Users must own the games they load. Free homebrew to test with: [Minekart Madness](https://github.com/mhughson/mbh-cart) (MIT), [Nova the Squirrel](https://github.com/NovaSquirrel/NovaTheSquirrel/releases), more at https://www.nesdev.org/wiki/Homebrew_games

## License

GPL-3.0 (see `LICENSE`), because the PSP emulator is GPL. jsnes stays Apache-2.0 (`lib/jsnes.LICENSE`).
