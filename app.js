/* Retro — NES emulator PWA. Core: jsnes (Apache-2.0). */
const $ = (s) => document.querySelector(s);
const library = $('#library'), player = $('#player'), grid = $('#grid');
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

async function render() {
  const games = (await Store.all('games')).sort((a, b) => (b.played - a.played) || (b.added - a.added));
  $('#empty').hidden = games.length > 0;
  grid.replaceChildren();
  for (const g of games) {
    const card = document.createElement('div');
    card.className = 'card';
    const cover = document.createElement('button');
    cover.className = 'cover';
    cover.setAttribute('aria-label', 'Play ' + g.title);
    if (g.art === 'ok') {
      if (!artUrls.has(g.id)) {
        const blob = await Store.get('art', g.id);
        if (blob) artUrls.set(g.id, URL.createObjectURL(blob));
      }
      const img = document.createElement('img');
      img.src = artUrls.get(g.id) || '';
      img.alt = '';
      cover.append(img);
    } else {
      cover.classList.add('noart');
      cover.textContent = g.title;
    }
    cover.onclick = () => play(g);
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = g.title;
    const more = document.createElement('button');
    more.className = 'more';
    more.textContent = '⋯';
    more.setAttribute('aria-label', 'Options');
    more.onclick = () => { optsGame = g; $('#opts-title').textContent = g.title; opts.showModal(); };
    row.append(name, more);
    card.append(cover, row);
    grid.append(card);
  }
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
    const buf = await f.arrayBuffer();
    let entries = [];
    if (/\.zip$/i.test(f.name)) { try { entries = await unzip(buf); } catch { /* not a zip */ } }
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
  setStatus(`${added} added${skipped ? `, ${skipped} skipped (not an NES game)` : ''}`);
  fetchMissingArt();
};

opts.onclick = async (e) => {
  const act = e.target.dataset?.act;
  if (!act) return;
  opts.close();
  if (act === 'delete' && confirm(`Delete "${optsGame.title}" and its saves?`)) {
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
let audio = null, muted = localStorage.getItem('retro.mute') === '1';

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
          L[i] = muted ? 0 : ringL[rr]; R[i] = muted ? 0 : ringR[rr];
          rr = (rr + 1) % RING;
        } else { L[i] = 0; R[i] = 0; }
      }
    };
    proc.connect(audio.destination);
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
  go();
}

async function quit() {
  stop();
  clearInterval(sramTimer);
  await saveAll();
  nes = null; current = null;
  input.kb.clear(); input.touch.clear(); input.pad.clear(); applied.clear();
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
  go();
};
menu.addEventListener('cancel', (e) => { e.preventDefault(); menu.close(); go(); });

$('#menu-btn').onclick = openMenu;

document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) openMenu(); // pause + save when the app is switched away
});
window.addEventListener('pagehide', () => { saveAll(); });

// ---------- Input (keyboard + touch + gamepad, merged) ----------
// jsnes buttons: 0 A, 1 B, 2 Select, 3 Start, 4 Up, 5 Down, 6 Left, 7 Right
const input = { kb: new Set(), touch: new Set(), pad: new Set() };
const applied = new Set();
function applyInput() {
  const want = new Set([...input.kb, ...input.touch, ...input.pad]);
  for (const b of applied) if (!want.has(b)) { nes.buttonUp(1, b); applied.delete(b); }
  for (const b of want) if (!applied.has(b)) { nes.buttonDown(1, b); applied.add(b); }
}

const KEYS = {
  ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyW: 4, KeyS: 5, KeyA: 6, KeyD: 7,
  KeyX: 0, KeyK: 0, KeyZ: 1, KeyJ: 1, Enter: 3, ShiftRight: 2, ShiftLeft: 2, Backspace: 2,
};
document.addEventListener('keydown', (e) => {
  if (player.hidden || menu.open) return;
  if (e.code === 'Escape') { openMenu(); return; }
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

// ---------- Boot ----------
render().then(() => fetchMissingArt());
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
