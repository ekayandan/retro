/* PSP player page. Runs PPSSPP through EmulatorJS (GPL-3.0, files in ejs/).
 * - The game file comes from the browser's private file system (see Files in storage.js).
 * - In-game saves (memory stick) are kept by EmulatorJS in its own IndexedDB (IDBFS at /data/saves).
 * - A resume point is saved to our 'states' store when leaving, and loaded on the next start.
 * PPSSPP needs threads (SharedArrayBuffer), which needs a cross-origin isolated page: sw.js adds the headers. */
(async () => {
  const id = decodeURIComponent(location.hash.slice(1));
  const msg = (html) => { document.querySelector('#msg').innerHTML = html; };
  const home = () => { location.href = './'; };

  // 1. Cross-origin isolation (needed for threads). On the very first visit the service worker
  //    isn't controlling the page yet, so reload once after it is.
  if (!window.crossOriginIsolated) {
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
  if (!document.createElement('canvas').getContext('webgl2')) {
    msg('PSP games need WebGL 2 graphics, which this browser or device doesn\'t offer.<br><br><a href="./">Back</a>');
    return;
  }

  // 2. The game
  const game = await Store.get('games', id);
  if (!game || game.system !== 'psp') return home();
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

  // 4. Start EmulatorJS
  const resume = await Store.get('states', id + ':auto');
  Object.assign(window, {
    EJS_player: '#game',
    EJS_core: 'psp',
    EJS_pathtodata: 'ejs/',
    EJS_gameUrl: file,
    EJS_gameName: id,           // stable name for EmulatorJS's own save files
    EJS_CacheLimit: 0,          // we already keep the game; don't let EmulatorJS store a second copy
    EJS_threads: true,
    EJS_disableAutoLang: false, // inverted flag in EmulatorJS: false = English UI, no translation download
    EJS_color: '#6366f1',
    EJS_backgroundColor: '#000',
    EJS_startOnLoaded: true,
    EJS_Buttons: { netplay: false, exitEmulation: false, contextMenu: false },
    EJS_loadStateURL: resume ? new Blob([resume]) : undefined,
    EJS_onGameStart: () => msg(''),
  });
  msg('');
  const s = document.createElement('script');
  s.src = 'ejs/loader.js';
  document.body.append(s);
})();
