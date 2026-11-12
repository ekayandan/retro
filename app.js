/* Retro — emulator PWA. NES: jsnes (Apache-2.0). Other systems: EmulatorJS cores (GPL-3.0), see play.js. */
const $ = (s) => document.querySelector(s);
const library = $('#library'), player = $('#player'), shelf = $('#shelf');
const menu = $('#menu'), opts = $('#opts');

// ---------- Library ----------
const artUrls = new Map();
let optsGame = null;

function setStatus(msg) { $('#status').textContent = msg || ''; }

function isNes(u8) { return u8.length > 16 && u8[0] === 0x4e && u8[1] === 0x45 && u8[2] === 0x53 && u8[3] === 0x1a; }

async function gameId(u8) {
  if (crypto.subtle) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-1', u8));
    return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0x811c9dc5; // FNV-1a fallback (plain http)
  for (const b of u8) h = Math.imul(h ^ b, 0x01000193);
  return (h >>> 0).toString(16) + u8.length.toString(16);
}

// File extension -> system. NES runs in this page (jsnes); everything else in play.html (EmulatorJS).
const SYSTEM_BY_EXT = {
  iso: 'psp', cso: 'psp', pbp: 'psp',
  gb: 'gb', gbc: 'gb', gba: 'gba',
  sfc: 'snes', smc: 'snes',
  md: 'segaMD', gen: 'segaMD', smd: 'segaMD',
  sms: 'segaMS', gg: 'segaGG', pce: 'pce',
  z64: 'n64', n64: 'n64', v64: 'n64', nds: 'nds',
  chd: 'psx', // PS1 single-file discs; .cue/.bin go in a .zip
};
const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
const OTHER_IN_ZIP = /\.(gb|gbc|gba|sfc|smc|md|gen|smd|sms|gg|pce|z64|n64|v64|nds)$/i;

// Big files: fingerprint size + first and last MB instead of hashing gigabytes.
async function bigFileId(file, system) {
  const MB = 1 << 20;
  const head = new Uint8Array(await file.slice(0, MB).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - MB)).arrayBuffer());
  const buf = new Uint8Array(head.length + tail.length + 8);
  buf.set(head); buf.set(tail, head.length);
  new DataView(buf.buffer).setFloat64(head.length + tail.length, file.size);
  return (system === 'psp' ? 'psp-' : system + '-') + (await gameId(buf));
}

async function addFile(file, system) {
  const id = await bigFileId(file, system);
  if (await Store.get('games', id)) return false;
  const free = await navigator.storage?.estimate?.();
  if (free && free.quota - free.usage < file.size * 1.1) throw new Error('Not enough free space for ' + file.name);
  await Files.write(id, file, (p) => setStatus(`Copying ${file.name}… ${Math.round(p * 100)}%`));
  await Store.put('games', id, {
    id, name: file.name, title: Art.displayTitle(file.name), system, size: file.size, added: Date.now(), played: 0,
  });
  return true;
}

// ---------- Home: hero + shelf + dock ----------
// The shelf is one row of tiles with a roving tabindex: only the selected tile is in the Tab order, arrows
// move between tiles (see "Home navigation" below). The focused tile is the selected game; the hero shows it.
const SYSTEM_NAMES = {
  nes: 'NES', gb: 'Game Boy', gba: 'Game Boy Advance', snes: 'Super Nintendo', segaMD: 'Sega Genesis',
  segaMS: 'Master System', segaGG: 'Game Gear', pce: 'PC Engine', psx: 'PlayStation', n64: 'Nintendo 64',
  nds: 'Nintendo DS', psp: 'PSP',
};
const BADGES = { gb: 'GB', gba: 'GBA', snes: 'SNES', segaMD: 'GENESIS', segaMS: 'SMS', segaGG: 'GG', pce: 'PCE', psx: 'PS1', n64: 'N64', nds: 'DS', psp: 'PSP' };
const SYSTEMS_LINE = 'NES · Game Boy · GBA · SNES · Genesis · Master System · Game Gear · PC Engine · PS1 · N64 · DS · PSP';
let games = [];        // in shelf order: last played first
let selectedId = null; // the game the hero shows; kept while focus is on the dock

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function playedText(t) {
  if (!t) return 'Not played yet';
  const s = (Date.now() - t) / 1000;
  for (const [unit, sec] of [['year', 31536e3], ['month', 2592e3], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (s >= sec) return 'Played ' + rtf.format(-Math.floor(s / sec), unit);
  }
  return 'Played just now';
}

function showHero(g) {
  const backdrop = $('#backdrop');
  $('#steps').hidden = games.length > 0;
  if (!g) {
    $('#hero-sys').textContent = '';
    $('#hero-title').textContent = 'Insert a game to start';
    $('#hero-meta').textContent = SYSTEMS_LINE;
    backdrop.style.removeProperty('--art');
    return;
  }
  selectedId = g.id;
  $('#hero-sys').textContent = SYSTEM_NAMES[g.system] || g.system;
  $('#hero-title').textContent = g.title;
  $('#hero-meta').textContent = playedText(g.played);
  const art = artUrls.get(g.id);
  if (art) backdrop.style.setProperty('--art', `url("${art}")`); else backdrop.style.removeProperty('--art');
}

// One selected tile: in the Tab order and lit (.sel); the rest are reachable with arrows.
// data-zone says whether the shelf or the dock is selected (classes, not :focus, so the selection shows
// even while the window itself isn't focused, e.g. a TV browser before the first key press).
function rove(el) {
  shelf.querySelectorAll('.cover').forEach((c) => { c.tabIndex = c === el ? 0 : -1; c.classList.toggle('sel', c === el); });
  zone('shelf');
}
function zone(z, dockBtn) {
  library.dataset.zone = z;
  document.querySelectorAll('.dock-btn').forEach((b) => b.classList.toggle('sel', z === 'dock' && b === dockBtn));
}
function focusedGame() {
  const id = document.activeElement?.closest?.('.card')?.dataset.id;
  return games.find((g) => g.id === id);
}
function openOpts(g) { optsGame = g; $('#opts-title').textContent = g.title; disarm(); opts.showModal(); }

function tile(g) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = g.id;
  card.setAttribute('role', 'listitem');
  const cover = document.createElement('button');
  cover.className = 'cover';
  cover.setAttribute('aria-label', `${g.title}, ${SYSTEM_NAMES[g.system] || g.system}`);
  if (g.art === 'ok' && artUrls.has(g.id)) {
    const img = document.createElement('img');
    img.src = artUrls.get(g.id);
    img.alt = '';
    cover.append(img);
  } else {
    cover.classList.add('noart');
    cover.textContent = g.title;
  }
  if (g.system !== 'nes') {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = BADGES[g.system] || g.system;
    cover.append(badge);
  }
  cover.onclick = () => play(g);
  cover.onfocus = () => { rove(cover); showHero(g); };
  // Mouse: hovering selects, like a TV home screen with a pointer
  cover.onpointerenter = (e) => { if (e.pointerType === 'mouse' && !document.querySelector('dialog[open]')) cover.focus({ preventScroll: true }); };
  const more = document.createElement('button');
  more.className = 'more';
  more.tabIndex = -1; // keyboard: O, gamepad: X
  more.textContent = '⋯';
  more.setAttribute('aria-label', 'Options for ' + g.title);
  more.onclick = () => openOpts(g);
  card.append(cover, more);
  return card;
}

function addTile() {
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'listitem');
  const cover = document.createElement('button');
  cover.className = 'cover add';
  cover.innerHTML = '<span class="plus" aria-hidden="true">+</span>Insert game';
  cover.onclick = () => $('#file').click();
  cover.onfocus = () => { rove(cover); showHero(null); };
  card.append(cover);
  return card;
}

async function render() {
  const a = document.activeElement;
  const hadFocus = !a || a === document.body || shelf.contains(a); // otherwise focus is on the dock or in a dialog: leave it
  const keepId = shelf.contains(a) ? a.closest('.card')?.dataset.id : null;
  games = (await Store.all('games')).sort((x, y) => (y.played - x.played) || (y.added - x.added));
  for (const g of games) {
    if (g.art !== 'ok' || artUrls.has(g.id)) continue;
    const blob = await Store.get('art', g.id);
    if (blob) artUrls.set(g.id, URL.createObjectURL(blob));
  }
  shelf.replaceChildren(...games.map(tile));
  if (!games.length) shelf.append(addTile());
  const want = keepId || selectedId;
  const target = (want && shelf.querySelector(`[data-id="${CSS.escape(want)}"] .cover`)) || shelf.querySelector('.cover');
  rove(target);
  if (hadFocus && !library.hidden) target.focus({ preventScroll: true });
  // Fill the hero directly: focus events don't fire while the window itself isn't focused.
  const shown = hadFocus ? target.closest('.card').dataset.id : selectedId;
  showHero(games.find((g) => g.id === shown) || games[0] || null);
}

async function fetchMissingArt(force) {
  const games = force ? [force] : await Store.all('games');
  for (const g of games) {
    if (await Art.ensure(g, !!force)) await render();
  }
}

$('#file').onchange = async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  let added = 0, skipped = 0;
  setStatus('Adding…');
  for (const f of files) {
    const sys = SYSTEM_BY_EXT[extOf(f.name)];
    if (sys) {
      try { if (await addFile(f, sys)) added++; } catch (err) { skipped++; alert(err.message); }
      continue;
    }
    const buf = await f.arrayBuffer();
    let entries = [];
    if (/\.zip$/i.test(f.name)) {
      try {
        // A PS1 disc as .cue + .bin tracks: keep the whole zip, EmulatorJS unpacks it
        if ((await unzip(buf, /\.cue$/i)).length) {
          if (await addFile(f, 'psx')) added++;
          continue;
        }
        entries = await unzip(buf, /\.(nes|gb|gbc|gba|sfc|smc|md|gen|smd|sms|gg|pce|z64|n64|v64|nds)$/i);
        for (const e of entries.filter((x) => OTHER_IN_ZIP.test(x.name))) {
          if (await addFile(new File([e.data], e.name), SYSTEM_BY_EXT[extOf(e.name)])) added++;
        }
        entries = entries.filter((x) => !OTHER_IN_ZIP.test(x.name));
        if (!entries.length) continue;
      } catch { /* not a zip */ }
    }
    else entries = [{ name: f.name, data: new Uint8Array(buf) }];
    if (!entries.length) skipped++;
    for (const { name, data } of entries) {
      if (!isNes(data)) { skipped++; continue; }
      const id = await gameId(data);
      if (await Store.get('games', id)) continue; // already in library
      await Store.put('roms', id, data);
      await Store.put('games', id, {
        id, name, title: Art.displayTitle(name), system: 'nes', size: data.length, added: Date.now(), played: 0,
      });
      added++;
    }
  }
  if (navigator.storage?.persist) navigator.storage.persist(); // ask the browser not to evict our data
  await render();
  setStatus((added ? `${added} game${added > 1 ? 's' : ''} inserted` : 'No new games')
    + (skipped ? ` · ${skipped} skipped (not a game Retro knows)` : ''));
  fetchMissingArt();
};

// Deleting asks twice, inside the same dialog: the first tap arms the button, the second deletes.
const delBtn = opts.querySelector('[data-act=delete]');
function disarm() { delBtn.classList.remove('armed'); delBtn.textContent = 'Delete game and saves'; }
opts.onclick = async (e) => {
  const act = e.target.dataset?.act;
  if (!act) return;
  if (act === 'delete' && !delBtn.classList.contains('armed')) {
    delBtn.classList.add('armed');
    delBtn.textContent = 'Tap again to delete';
    return;
  }
  opts.close();
  if (act === 'delete') {
    await Store.removeGame(optsGame.id);
    artUrls.delete(optsGame.id);
    render();
  }
  if (act === 'art') {
    setStatus(navigator.onLine ? 'Looking for box art…' : 'Box art needs an internet connection');
    if (navigator.onLine) {
      const ok = await Art.ensure(optsGame, true);
      setStatus(ok ? 'Box art found' : 'No box art found — rename the file to the official title, e.g. "Game Name (USA).nes"');
      render();
    }
  }
};

window.addEventListener('online', () => fetchMissingArt());

// ---------- Emulator ----------
const canvas = $('#screen');
const ctx = canvas.getContext('2d');
const image = ctx.createImageData(256, 240);
const fb32 = new Uint32Array(image.data.buffer);

const RING = 8192;
const ringL = new Float32Array(RING), ringR = new Float32Array(RING);
let rw = 0, rr = 0;
let audio = null, outGain = null, muted = localStorage.getItem('retro.mute') === '1';

let nes = null, current = null, running = false, raf = 0, last = 0, acc = 0, sramDirty = false, sramTimer = 0;

function startAudio() {
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audio = new AC();
    const proc = audio.createScriptProcessor(1024, 0, 2);
    proc.onaudioprocess = (e) => {
      const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
      const avail = (rw - rr + RING) % RING;
      const n = Math.min(L.length, avail);
      for (let i = 0; i < L.length; i++) {
        if (i < n) {
          L[i] = ringL[rr]; R[i] = ringR[rr];
          rr = (rr + 1) % RING;
        } else { L[i] = 0; R[i] = 0; }
      }
    };
    // Mute only the speakers here; a faraway friend watching (link.js) keeps hearing the game.
    outGain = audio.createGain();
    outGain.gain.value = muted ? 0 : 1;
    proc.connect(outGain);
    outGain.connect(audio.destination);
    if (audio.createMediaStreamDestination && canvas.captureStream) {
      const dest = audio.createMediaStreamDestination();
      proc.connect(dest);
      Link.share({ video: canvas.captureStream(60).getVideoTracks()[0], audio: dest.stream.getAudioTracks()[0] });
    }
  }
  audio.resume();
}

function onAudioSample(l, r) {
  if ((rw - rr + RING) % RING > 4096) return; // keep latency low; drop if we're ahead
  ringL[rw] = l; ringR[rw] = r;
  rw = (rw + 1) % RING;
}

function onFrame(buf) {
  for (let i = 0; i < 61440; i++) fb32[i] = 0xff000000 | buf[i];
}

function tick(t) {
  if (!running) return;
  raf = requestAnimationFrame(tick);
  if (!last) last = t;
  acc += ((t - last) / 1000) * 60.0988; // NTSC frame rate
  last = t;
  if (acc > 4) acc = 1; // tab was busy: don't fast-forward
  let ran = false;
  while (acc >= 1) {
    pollGamepad();
    applyInput();
    try { nes.frame(); } catch (err) { stop(); alert('The game crashed: ' + err.message); return; }
    acc--; ran = true;
  }
  if (ran) ctx.putImageData(image, 0, 0);
}

function go() { if (running) return; running = true; last = 0; acc = 0; startAudio(); raf = requestAnimationFrame(tick); }
function stop() { running = false; cancelAnimationFrame(raf); audio?.suspend(); }

async function saveSram() {
  if (!nes || !current || !nes.rom.batteryRam || !sramDirty) return;
  sramDirty = false;
  await Store.put('sram', current.id, nes.cpu.mem.slice(0x6000, 0x8000));
}

async function saveAll() {
  if (!nes || !current) return;
  await saveSram();
  await Store.put('states', current.id + ':auto', nes.toJSON());
}

async function play(game) {
  if (game.system !== 'nes') {
    game.played = Date.now();
    await Store.put('games', game.id, game);
    location.href = 'play.html#' + game.id;
    return;
  }
  startAudio(); // must happen inside the tap for iOS
  const rom = await Store.get('roms', game.id);
  nes = new jsnes.NES({
    sampleRate: audio.sampleRate, onFrame, onAudioSample,
    onBatteryRamWrite: () => { sramDirty = true; },
  });
  try { nes.loadROM(rom); } catch (err) { alert('Can\'t run this game: ' + err.message); nes = null; return; }
  current = game;
  if (nes.rom.batteryRam) {
    const sram = await Store.get('sram', game.id);
    if (sram) nes.cpu.mem.set(sram, 0x6000);
  }
  const auto = await Store.get('states', game.id + ':auto');
  if (auto) { try { nes.fromJSON(auto); } catch { nes.reset(); } } // resume where you left off
  game.played = Date.now();
  Store.put('games', game.id, game);
  ctx.clearRect(0, 0, 256, 240);
  library.hidden = true; player.hidden = false;
  clearInterval(sramTimer);
  sramTimer = setInterval(saveSram, 2000);
  Link.setSystem('nes', game.title);
  go();
}

async function quit() {
  stop();
  clearInterval(sramTimer);
  await saveAll();
  nes = null; current = null;
  input.kb.clear(); input.touch.clear(); input.pad.clear(); applied.clear(); applied2.clear();
  Link.setSystem(null);
  player.hidden = true; library.hidden = false;
  render();
}

function openMenu() {
  if (!nes || menu.open) return;
  stop();
  saveAll();
  $('#menu-title').textContent = current.title;
  menu.querySelector('[data-act=mute]').textContent = 'Sound: ' + (muted ? 'off' : 'on');
  menu.showModal();
}

menu.onclick = async (e) => {
  const act = e.target.dataset?.act;
  if (!act) return;
  if (act === 'mute') {
    muted = !muted;
    localStorage.setItem('retro.mute', muted ? '1' : '0');
    if (outGain) outGain.gain.value = muted ? 0 : 1;
    e.target.textContent = 'Sound: ' + (muted ? 'off' : 'on');
    return;
  }
  menu.close();
  if (act === 'save') await Store.put('states', current.id + ':1', nes.toJSON());
  if (act === 'load') {
    const s = await Store.get('states', current.id + ':1');
    if (s) nes.fromJSON(s); else alert('No saved state yet.');
  }
  if (act === 'reset') {
    await saveSram();
    nes.reloadROM();
    const sram = nes.rom.batteryRam && (await Store.get('sram', current.id));
    if (sram) nes.cpu.mem.set(sram, 0x6000);
  }
  if (act === 'quit') return quit();
  if (act === 'link') return Link.show(go);
  go();
};
menu.addEventListener('cancel', (e) => { e.preventDefault(); menu.close(); go(); });

$('#menu-btn').onclick = openMenu;

document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) openMenu(); // pause + save when the app is switched away
});
window.addEventListener('pagehide', () => { saveAll(); });

// ---------- Input (keyboard + touch + gamepad + phones, merged) ----------
// jsnes buttons: 0 A, 1 B, 2 Select, 3 Start, 4 Up, 5 Down, 6 Left, 7 Right
const input = { kb: new Set(), touch: new Set(), pad: new Set(), phone: [null, new Set(), new Set()] };
const applied = new Set(), applied2 = new Set();
function applyTo(n, want, done) {
  for (const b of done) if (!want.has(b)) { nes.buttonUp(n, b); done.delete(b); }
  for (const b of want) if (!done.has(b)) { nes.buttonDown(n, b); done.add(b); }
}
function applyInput() {
  applyTo(1, new Set([...input.kb, ...input.touch, ...input.pad, ...input.phone[1]]), applied);
  applyTo(2, input.phone[2], applied2);
}

// Phone controllers (link.js) send RetroPad indices; NES has players 1 and 2.
const RETROPAD_TO_NES = { 8: 0, 0: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7 };
Link.onInput((p, st) => {
  phoneNav.set(p, st); // any phone can also drive the home screen (see "Home navigation")
  if (!input.phone[p]) return;
  input.phone[p] = new Set(st.b.map((i) => RETROPAD_TO_NES[i]).filter((x) => x !== undefined));
});
$('#link-btn').onclick = () => Link.show();

// Settings: color scheme (theme.js). Changes show at once; friends' controllers follow.
const settings = $('#settings');
$('#settings-btn').onclick = () => {
  const current = settings.querySelector(`input[value="${Theme.get()}"]`);
  current.checked = true;
  settings.showModal();
  current.focus(); // start on the active scheme, so arrows move from there
};
settings.addEventListener('change', (e) => {
  if (e.target.name !== 'theme') return;
  Theme.set(e.target.value);
  Link.resend();
});
settings.onclick = (e) => { if (e.target.dataset?.act === 'close' || e.target === settings) settings.close(); };
$('#insert-btn').onclick = () => $('#file').click();

const KEYS = {
  ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyW: 4, KeyS: 5, KeyA: 6, KeyD: 7,
  KeyX: 0, KeyK: 0, KeyZ: 1, KeyJ: 1, Enter: 3, ShiftRight: 2, ShiftLeft: 2, Backspace: 2,
};
document.addEventListener('keydown', (e) => {
  if (player.hidden || menu.open) return;
  // preventDefault: otherwise this same Escape press also cancels the menu dialog that just opened
  if (e.code === 'Escape') { e.preventDefault(); openMenu(); return; }
  if (e.code in KEYS) { input.kb.add(KEYS[e.code]); e.preventDefault(); }
});
document.addEventListener('keyup', (e) => { if (e.code in KEYS) input.kb.delete(KEYS[e.code]); });

// Touch: recompute pressed buttons from every active finger, so sliding A→B or around the d-pad works.
const pad = $('#pad');
const fingers = new Map();
function touchUpdate() {
  const next = new Set();
  for (const { x, y } of fingers.values()) {
    const el = document.elementFromPoint(x, y);
    if (!el) continue;
    const btn = el.closest('[data-b]');
    if (btn) { next.add(+btn.dataset.b); continue; }
    const dpad = el.closest('[data-dpad]');
    if (dpad) {
      const r = dpad.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
      const dead = r.width * 0.12;
      if (dx < -dead) next.add(6); if (dx > dead) next.add(7);
      if (dy < -dead) next.add(4); if (dy > dead) next.add(5);
    }
  }
  if ([...next].some((b) => !input.touch.has(b))) navigator.vibrate?.(8);
  input.touch = next;
  pad.querySelectorAll('[data-b]').forEach((b) => b.classList.toggle('on', next.has(+b.dataset.b)));
}
pad.addEventListener('pointerdown', (e) => { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); touchUpdate(); e.preventDefault(); });
pad.addEventListener('pointermove', (e) => { if (fingers.has(e.pointerId)) { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); touchUpdate(); } });
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) {
  pad.addEventListener(t, (e) => { fingers.delete(e.pointerId); touchUpdate(); });
}
pad.addEventListener('contextmenu', (e) => e.preventDefault());

function pollGamepad() {
  const gp = navigator.getGamepads?.().find((g) => g && g.connected);
  if (!gp) { input.pad.clear(); return; }
  const b = (i) => gp.buttons[i]?.pressed;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const s = new Set();
  if (b(1) || b(3)) s.add(0);            // right / top face → A
  if (b(0) || b(2)) s.add(1);            // bottom / left face → B
  if (b(8)) s.add(2); if (b(9)) s.add(3);
  if (b(12) || ay < -0.5) s.add(4); if (b(13) || ay > 0.5) s.add(5);
  if (b(14) || ax < -0.5) s.add(6); if (b(15) || ax > 0.5) s.add(7);
  if (b(16)) { openMenu(); }
  input.pad = s;
}

// ---------- Home navigation: arrows, gamepads, friends' phones ----------
// Left/right walk the shelf (or the dock), down/up switch between them. Enter / A plays, O / X opens the
// game's options, Esc / B backs out of a dialog. Inside dialogs, up/down walk the buttons.
const DIRS = ['up', 'down', 'left', 'right'];
let dockIndex = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function focusTile(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  rove(el); // also done on focus, but focus events don't fire while the window isn't focused
  const id = el.closest('.card').dataset.id;
  showHero(id ? games.find((g) => g.id === id) : null);
  // Scroll the shelf just enough to keep the selected tile (and its glow) inside the side margins.
  const card = el.closest('.card'), pad = parseFloat(getComputedStyle(shelf).paddingLeft) || 24;
  const min = card.offsetLeft - pad, max = card.offsetLeft + card.offsetWidth + pad - shelf.clientWidth;
  const x = Math.min(Math.max(shelf.scrollLeft, max), min);
  if (x !== shelf.scrollLeft) shelf.scrollTo({ left: x, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
}
function focusables(root) {
  return [...root.querySelectorAll('button, input, a[href]')].filter((el) => !el.disabled && el.offsetParent !== null && el.tabIndex >= 0);
}
function move(dir) {
  const dlg = document.querySelector('dialog[open]');
  if (dlg) {
    const list = focusables(dlg), i = list.indexOf(document.activeElement);
    const step = dir === 'up' || dir === 'left' ? -1 : 1;
    list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + step))]?.focus();
    return;
  }
  if (library.hidden) return;
  const tiles = [...shelf.querySelectorAll('.cover')], dock = [...document.querySelectorAll('.dock-btn')];
  const a = document.activeElement, t = tiles.indexOf(a), d = dock.indexOf(a);
  const selected = () => tiles.find((c) => c.tabIndex === 0) || tiles[0];
  if (t >= 0) {
    if (dir === 'left') focusTile(tiles[Math.max(0, t - 1)]);
    if (dir === 'right') focusTile(tiles[Math.min(tiles.length - 1, t + 1)]);
    if (dir === 'down') { dock[dockIndex]?.focus(); zone('dock', dock[dockIndex]); }
  } else if (d >= 0) {
    if (dir === 'left' || dir === 'right') {
      dockIndex = Math.max(0, Math.min(dock.length - 1, d + (dir === 'right' ? 1 : -1)));
      dock[dockIndex].focus();
      zone('dock', dock[dockIndex]);
    }
    if (dir === 'up') focusTile(selected());
  } else {
    focusTile(selected()); // nothing selected yet: start on the shelf
  }
}
document.querySelectorAll('.dock-btn').forEach((b, i) => {
  b.addEventListener('focus', () => { dockIndex = i; zone('dock', b); });
  b.addEventListener('blur', () => b.classList.remove('sel')); // e.g. Tab or a click elsewhere
});

function setInput(kind) { if (document.body.dataset.input !== kind) document.body.dataset.input = kind; }

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const dlg = document.querySelector('dialog[open]');
  if (library.hidden && !dlg) return; // a game is running: its own keys apply
  const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (dir) {
    setInput('kb');
    if (dlg && document.activeElement?.type === 'radio') return; // radio groups have their own arrow keys
    e.preventDefault();
    move(dir);
  } else if (!dlg && (e.key === 'o' || e.key === 'O' || e.key === 'ContextMenu')) {
    const g = focusedGame();
    if (g) { e.preventDefault(); openOpts(g); }
  }
});

// Gamepads and phones: held directions repeat (like holding a key), buttons fire once per press.
const phoneNav = new Map(); // player -> latest phone state {b: [RetroPad indices], x, y}
const navHeld = new Map();  // 'source:action' -> time of the next repeat
function navAct(a) {
  const dlg = document.querySelector('dialog[open]');
  if (DIRS.includes(a)) return move(a);
  const el = document.activeElement;
  if (a === 'ok') {
    // A gamepad or phone press isn't a user gesture, so browsers won't open the file picker for it.
    if (el?.id === 'insert-btn' || el?.classList?.contains('add')) {
      setStatus('To insert a game, click, tap or press Enter: browsers only open the file picker for those.');
      return;
    }
    if (el && el !== document.body && (dlg ? dlg.contains(el) : library.contains(el))) el.click();
    else move('right');
  }
  if (a === 'back' && dlg) {
    if (dlg === menu) { menu.close(); go(); } else dlg.close();
  }
  if (a === 'opts' && !dlg) { const g = focusedGame(); if (g) openOpts(g); }
}
function navFrame(src, acts, now) {
  for (const a of [...DIRS, 'ok', 'back', 'opts']) {
    const k = src + ':' + a, next = navHeld.get(k);
    if (!acts.has(a)) { navHeld.delete(k); continue; }
    if (next === undefined) { navHeld.set(k, DIRS.includes(a) ? now + 380 : Infinity); setInput('pad'); navAct(a); }
    else if (now >= next) { navHeld.set(k, now + 110); navAct(a); }
  }
}
function navTick(now) {
  requestAnimationFrame(navTick);
  if (running || (library.hidden && !document.querySelector('dialog[open]'))) return; // a game owns the controls
  for (const gp of navigator.getGamepads?.() || []) {
    if (!gp?.connected) continue;
    const b = (i) => gp.buttons[i]?.pressed, ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, acts = new Set();
    if (b(12) || ay < -0.5) acts.add('up'); if (b(13) || ay > 0.5) acts.add('down');
    if (b(14) || ax < -0.5) acts.add('left'); if (b(15) || ax > 0.5) acts.add('right');
    if (b(0)) acts.add('ok'); if (b(1)) acts.add('back'); if (b(2) || b(3)) acts.add('opts');
    navFrame('pad' + gp.index, acts, now);
  }
  // Phones send RetroPad indices: 4-7 d-pad, 8 A, 0 B, 9 X, 1 Y, 3 Start; x/y is the analog stick.
  for (const [p, st] of phoneNav) {
    const has = (i) => st.b.includes(i), acts = new Set();
    if (has(4) || st.y < -0.5) acts.add('up'); if (has(5) || st.y > 0.5) acts.add('down');
    if (has(6) || st.x < -0.5) acts.add('left'); if (has(7) || st.x > 0.5) acts.add('right');
    if (has(8) || has(3)) acts.add('ok'); if (has(0)) acts.add('back'); if (has(9) || has(1)) acts.add('opts');
    navFrame('phone' + p, acts, now);
  }
}
requestAnimationFrame(navTick);
window.addEventListener('gamepadconnected', () => setInput('pad'));

// Top right: who's connected (like controller lights) and the time.
Link.onChange(() => {
  $('#players').replaceChildren(...Link.players().map((p) => {
    const b = document.createElement('b'); b.dataset.p = p; b.textContent = p + 'P'; return b;
  }));
});
function tickClock() {
  const now = new Date(), clock = $('#clock');
  clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  clock.dateTime = now.toISOString();
}
tickClock();
setInterval(tickClock, 15000);

// ---------- Boot ----------
render().then(() => fetchMissingArt());
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
