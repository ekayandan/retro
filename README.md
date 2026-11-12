# Retro

An NES emulator that runs fully in the browser. Visit once, then it works offline (installable as an app).
Bring your own game files — nothing is uploaded, there is no server, no accounts, no tracking.

- **Add games**: pick `.nes` or `.zip` files from the device (several at once). Duplicates are skipped.
- **Box art**: downloaded once when online from [libretro-thumbnails](https://github.com/libretro-thumbnails), shrunk to a ~20 KB JPEG and kept on the device. Games without art retry weekly; ⋯ → *Find box art again*. Best match when files use official names, e.g. `Game Name (USA).nes`.
- **Saves**: in-game battery saves are written as you play. Leaving the game (or switching apps) saves a resume point, so you continue exactly where you left off. One manual save-state slot in the ☰ menu.
- **Controls**: touch pad (multi-touch, slide between buttons), keyboard (arrows/WASD, X/K = A, Z/J = B, Enter = Start, Shift = Select, Esc = menu), and any gamepad (Xbox/PS/Switch Pro, incl. TV boxes).

## Files

| File | What |
|---|---|
| `index.html`, `style.css`, `app.js` | the app: library, player, input, audio |
| `storage.js` | IndexedDB wrapper + tiny `.zip` reader (works in Node too) |
| `art.js` | box-art lookup and caching |
| `lib/jsnes.min.js` | emulator core, [jsnes](https://github.com/bfirsh/jsnes) 2.1.0 (Apache-2.0, see `lib/jsnes.LICENSE`) |
| `sw.js` | offline cache for the app. **Bump `VERSION` on every change** so phones update |
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
- Only NES/Famicom (iNES files). Most mappers work; a few rare ones don't.
- Users must own the games they load. Free homebrew to test with: https://www.nesdev.org/wiki/Homebrew_games
