/* Player page for every system except NES. Runs EmulatorJS cores (GPL-3.0, files in ejs/):
 *   gb: gambatte, gba: mGBA, snes: Snes9x, Sega MD/MS/GG: Genesis Plus GX, pce: Mednafen PCE,
 *   psx: PCSX ReARMed, n64: Mupen64Plus-Next, nds: melonDS, psp: PPSSPP.
 * - The game file comes from the browser's private file system (see Files in storage.js).
 * - In-game saves (memory stick) are kept by EmulatorJS in its own IndexedDB (IDBFS at /data/saves).
 * - A resume point is saved to our 'states' store when leaving, and loaded on the next start.
 * PPSSPP needs threads (SharedArrayBuffer), which needs a cross-origin isolated page: sw.js adds the headers. */
(async () => {
  const id = decodeURIComponent(location.hash.slice(1));
  const msg = (html) => { document.querySelector('#msg').innerHTML = html; };
  const home = () => { location.href = './'; };

  const game = await Store.get('games', id);
  if (!game || game.system === 'nes') return home();
  const isPsp = game.system === 'psp';

  // 1. PSP only: cross-origin isolation (needed for threads). On the very first visit the service
  //    worker isn't controlling the page yet, so reload once after it is.
  if (isPsp && !window.crossOriginIsolated) {
    if ('serviceWorker' in navigator && !sessionStorage.getItem('retro.coi')) {
      sessionStorage.setItem('retro.coi', '1');
      await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      location.reload();
      return;
    }
    msg('This browser can\'t run PSP games here. Use a recent Chrome, Edge or Firefox on a laptop or desktop.<br><br><a href="./">Back</a>');
    return;
  }
  sessionStorage.removeItem('retro.coi');
  if (isPsp && !document.createElement('canvas').getContext('webgl2')) {
    msg('PSP games need WebGL 2 graphics, which this browser or device doesn\'t offer.<br><br><a href="./">Back</a>');
    return;
  }

  // 2. The game
  document.title = game.title + ' — Retro';
  const file = await Files.read(id, game.name);
  if (!file) { msg('The game file is missing. Add it again from the library.<br><br><a href="./">Back</a>'); return; }
  game.played = Date.now();
  Store.put('games', id, game);

  // 3. Saving
  let leaving = false;
  async function saveResume() {
    const emu = window.EJS_emulator;
    if (!emu || !emu.started) return;
    try { await Store.put('states', id + ':auto', emu.gameManager.getState()); } catch (e) { console.warn('resume point not saved', e); }
    try {
      emu.gameManager.saveSaveFiles();
      await new Promise((res) => emu.gameManager.FS.syncfs(false, res)); // flush in-game saves to IndexedDB
    } catch (e) { console.warn('saves not flushed', e); }
  }
  async function leave() {
    if (leaving) return;
    leaving = true;
    msg('Saving…');
    try { window.EJS_emulator?.pause?.(); } catch { /* not started */ }
    await saveResume();
    home();
  }
  document.querySelector('#back').onclick = leave;
  document.addEventListener('keydown', (e) => { if (e.code === 'Escape' && e.shiftKey) leave(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !leaving) saveResume(); });

  // 4. Phone controllers (link.js): phone N is player N. Buttons are RetroPad indices, which is what
  //    EmulatorJS's simulateInput takes; the analog stick is split into its four half-axes (16-19).
  Link.setSystem(game.system, game.title);
  document.querySelector('#link-btn').onclick = () => Link.show();
  const held = new Map(); // player -> Map(index -> value) currently applied
  const latest = new Map();
  function applyPhone(p, st) {
    const gm = window.EJS_emulator?.started && window.EJS_emulator.gameManager;
    if (!gm) { latest.set(p, st); return; } // applied once the game starts
    const want = new Map();
    for (const i of st.b) if (Number.isInteger(i) && i >= 0 && i <= 23) want.set(i, i >= 16 ? 0x7fff : 1);
    const ax = (v) => Math.round(Math.max(0, Math.min(1, v)) * 0x7fff);
    if (st.x > 0) want.set(16, ax(st.x)); else if (st.x < 0) want.set(17, ax(-st.x));
    if (st.y > 0) want.set(18, ax(st.y)); else if (st.y < 0) want.set(19, ax(-st.y));
    const had = held.get(p) || new Map();
    for (const [i] of had) if (!want.has(i)) gm.simulateInput(p - 1, i, 0);
    for (const [i, v] of want) if (had.get(i) !== v) gm.simulateInput(p - 1, i, v);
    held.set(p, want);
  }
  Link.onInput(applyPhone);
  // A friend far away gets the picture and sound too: tap the sound before EmulatorJS makes it.
  Link.tapAudio();
  function shareScreen() {
    const cv = window.EJS_emulator?.canvas || document.querySelector('#game canvas');
    if (cv?.captureStream) Link.share({ video: cv.captureStream(60).getVideoTracks()[0] });
  }

  // 5. Start EmulatorJS
  const resume = await Store.get('states', id + ':auto');
  Object.assign(window, {
    EJS_player: '#game',
    // Pin the core per system (EmulatorJS would pick smsplus for Master System, which we don't ship)
    EJS_core: { gb: 'gambatte', gba: 'mgba', snes: 'snes9x', segaMD: 'genesis_plus_gx', segaMS: 'genesis_plus_gx',
      segaGG: 'genesis_plus_gx', pce: 'mednafen_pce', psx: 'pcsx_rearmed', n64: 'mupen64plus_next', nds: 'melonds',
      psp: 'psp' }[game.system] || game.system,
    EJS_pathtodata: 'ejs/',
    EJS_gameUrl: file,
    EJS_gameName: id,           // stable name for EmulatorJS's own save files
    EJS_CacheLimit: 0,          // we already keep the game; don't let EmulatorJS store a second copy
    EJS_threads: isPsp,
    EJS_disableAutoLang: false, // inverted flag in EmulatorJS: false = English UI, no translation download
    EJS_color: '#e2412f',
    EJS_backgroundColor: '#000',
    EJS_startOnLoaded: true,
    EJS_Buttons: { netplay: false, exitEmulation: false, contextMenu: false },
    EJS_loadStateURL: resume ? new Blob([resume]) : undefined,
    EJS_onGameStart: () => { msg(''); for (const [p, st] of latest) applyPhone(p, st); latest.clear(); shareScreen(); },
  });
  msg('');
  const s = document.createElement('script');
  s.src = 'ejs/loader.js';
  document.body.append(s);
})();
