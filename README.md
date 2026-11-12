# Retro

Retro game emulators that run fully in the browser: NES, Game Boy / Color / Advance, SNES, Sega Genesis / Master System / Game Gear, PC Engine, PS1, N64, Nintendo DS, and PSP (laptop/desktop). Visit once, then it works offline (installable as an app).
Bring your own game files — nothing is uploaded, there is no server of our own, no accounts, no tracking (phone controllers use a public server only to find each other, see below).

- **Add games**: pick game files or `.zip`s from the device (several at once): `.nes`, `.gb`/`.gbc`, `.gba`, `.sfc`/`.smc`, `.md`/`.gen`/`.smd`, `.sms`, `.gg`, `.pce`, `.z64`/`.n64`/`.v64`, `.nds`, PS1 `.chd` or a `.zip` with `.cue`+`.bin`, PSP `.iso`/`.cso`/`.pbp`. Duplicates are skipped.
- **Everything except PSP** runs on phones too (PS1, N64 and DS need a recent phone) (iPhone included), with EmulatorJS's touch gamepad, keyboard or gamepad. Each core is ~1 MB and downloads the first time you play that system.
- **PSP** (laptop/desktop, recent Chrome, Edge or Firefox): games up to ~2 GB are copied into the browser's private file system (OPFS) as a stream. The PSP runtime (~16 MB) downloads the first time you open a PSP game, then works offline. Keyboard and gamepad controls come from EmulatorJS (its settings menu lets you remap them). ← saves and returns to the library.
- **Box art**: downloaded once when online from [libretro-thumbnails](https://github.com/libretro-thumbnails), shrunk to a ~20 KB JPEG and kept on the device. Games without art retry weekly; ⋯ → *Find box art again*. Best match when files use official names, e.g. `Game Name (USA).nes`.
- **Saves**: in-game battery saves are written as you play. Leaving the game (or switching apps) saves a resume point, so you continue exactly where you left off. One manual save-state slot in the ☰ menu.
- **Controls**: touch pad (multi-touch, slide between buttons), keyboard (arrows/WASD, X/K = A, Z/J = B, Enter = Start, Shift = Select, Esc = menu), and any gamepad (Xbox/PS/Switch Pro, incl. TV boxes).
- **Phones as controllers**: 📱 *Controllers* (library, NES menu, or the 📱 button in game) shows a QR code. Scan it with a phone and it becomes a controller: a floating joystick on the left (put your thumb anywhere; it follows your thumb), big buttons for the system on the right (the whole right side is live: the nearest button wins, and landing between two presses both). Each phone is the next player (up to 4; NES has 2). Phones connect straight to the computer over WebRTC; only the first handshake goes through the free public [PeerJS](https://peerjs.com) server, so connecting needs internet for a moment. The phone keeps its player number and reconnects by itself when you switch games. N64, PS1 and PSP have a *Stick: analog / d-pad* switch.

## Files

| File | What |
|---|---|
| `index.html`, `style.css`, `app.js` | the app: library, player, input, audio |
| `storage.js` | IndexedDB wrapper + tiny `.zip` reader (works in Node too) |
| `art.js` | box-art lookup and caching |
| `play.html`, `play.js` | player page for every system except NES: loads the game from OPFS, starts EmulatorJS, saves a resume point |
| `link.js` | computer side of phone controllers: room id, QR code, player slots, passes button presses to the emulator |
| `pad.html`, `pad.js`, `pad.css` | the phone controller page (`pad.html?demo=psp` previews a system's layout) |
| `lib/peerjs.min.js` | [PeerJS](https://github.com/peers/peerjs) 1.5.4 (MIT, see `lib/peerjs.LICENSE`) |
| `lib/qrcode.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 (MIT) |
| `lib/nipplejs.min.js` | [nipplejs](https://github.com/yoannmoinet/nipplejs) 1.0.4, the phone joystick (MIT, see `lib/nipplejs.LICENSE`) |
| `ejs/` | [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) 4.2.3 with cores: gambatte, mGBA, Snes9x, Genesis Plus GX, Mednafen PCE, PCSX ReARMed, Mupen64Plus-Next, melonDS, PPSSPP (GPL-3.0) |
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
To try phone controllers locally, open the computer's network address instead (e.g. http://192.168.1.20:8742) so the phone can reach the controller page; phone and computer on the same Wi-Fi.

## Notes

- Storage: everything lives in IndexedDB. The app asks the browser to keep it (`navigator.storage.persist()`).
  On iPhone, add it to the Home Screen — Safari can clear data of sites not opened for 7 days, installed apps are exempt.
- NES: iNES files; most mappers work, a few rare ones don't.
- PSP: heavy 3D games may run slowly on weaker laptops. Resume points can fail for some games; in-game saves always persist.
- Users must own the games they load. Free homebrew to test with: [Minekart Madness](https://github.com/mhughson/mbh-cart) (MIT), [Nova the Squirrel](https://github.com/NovaSquirrel/NovaTheSquirrel/releases), more at https://www.nesdev.org/wiki/Homebrew_games

## License

GPL-3.0 (see `LICENSE`), because EmulatorJS and its cores are GPL. jsnes stays Apache-2.0 (`lib/jsnes.LICENSE`).
