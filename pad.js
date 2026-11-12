/* Phone controller. Opened from the QR code on the laptop: pad.html#<room>. See link.js for the protocol.
 * Left half: a floating joystick (put your thumb anywhere). Right half: big buttons for the system that's
 * playing; slide between them, press several at once. */
(() => {
  const $ = (s) => document.querySelector(s);
  const PREFIX = 'retro-pad-';

  // Buttons per system. i = RetroPad index (what EmulatorJS expects), at = position:
  // n/w/e/s = diamond, two buttons sit w/e, three sit a/b/c in a row.
  // stick: 'dpad' = the joystick acts as a d-pad, 'analog' = real analog stick (switchable when both are listed).
  const DIAMOND_ABXY = [{ l: 'X', i: 9, at: 'n' }, { l: 'Y', i: 1, at: 'w' }, { l: 'A', i: 8, at: 'e' }, { l: 'B', i: 0, at: 's' }];
  const DIAMOND_PS = [{ l: '△', i: 9, at: 'n', c: 'tri' }, { l: '□', i: 1, at: 'w', c: 'sq' }, { l: '○', i: 8, at: 'e', c: 'ci' }, { l: '✕', i: 0, at: 's', c: 'cr' }];
  const SEL_START = [{ l: 'Select', i: 2 }, { l: 'Start', i: 3 }];
  const LAYOUTS = {
    nes: { face: [{ l: 'B', i: 0, at: 'w' }, { l: 'A', i: 8, at: 'e' }], mid: SEL_START, stick: ['dpad'] },
    gb: { face: [{ l: 'B', i: 0, at: 'w' }, { l: 'A', i: 8, at: 'e' }], mid: SEL_START, stick: ['dpad'] },
    gba: { face: [{ l: 'B', i: 0, at: 'w' }, { l: 'A', i: 8, at: 'e' }], mid: SEL_START, L: [{ l: 'L', i: 10 }], R: [{ l: 'R', i: 11 }], stick: ['dpad'] },
    snes: { face: DIAMOND_ABXY, mid: SEL_START, L: [{ l: 'L', i: 10 }], R: [{ l: 'R', i: 11 }], stick: ['dpad'] },
    nds: { face: DIAMOND_ABXY, mid: SEL_START, L: [{ l: 'L', i: 10 }], R: [{ l: 'R', i: 11 }], stick: ['dpad'] },
    segaMD: { face: [{ l: 'A', i: 1, at: 'a' }, { l: 'B', i: 0, at: 'b' }, { l: 'C', i: 8, at: 'c' }], mid: [{ l: 'Mode', i: 2 }, { l: 'Start', i: 3 }], stick: ['dpad'] },
    segaMS: { face: [{ l: '1', i: 0, at: 'w' }, { l: '2', i: 8, at: 'e' }], mid: [{ l: 'Pause', i: 3 }], stick: ['dpad'] },
    segaGG: { face: [{ l: '1', i: 0, at: 'w' }, { l: '2', i: 8, at: 'e' }], mid: [{ l: 'Start', i: 3 }], stick: ['dpad'] },
    pce: { face: [{ l: 'II', i: 0, at: 'w' }, { l: 'I', i: 8, at: 'e' }], mid: [{ l: 'Select', i: 2 }, { l: 'Run', i: 3 }], stick: ['dpad'] },
    psx: { face: DIAMOND_PS, mid: SEL_START, L: [{ l: 'L2', i: 12 }, { l: 'L1', i: 10 }], R: [{ l: 'R2', i: 13 }, { l: 'R1', i: 11 }], stick: ['dpad', 'analog'] },
    psp: { face: DIAMOND_PS, mid: SEL_START, L: [{ l: 'L', i: 10 }], R: [{ l: 'R', i: 11 }], stick: ['analog', 'dpad'] },
    n64: {
      face: [{ l: 'B', i: 1, at: 'w', c: 'n64b' }, { l: 'A', i: 0, at: 'e', c: 'n64a' }],
      cpad: [{ l: '▲', i: 23, at: 'n' }, { l: '◀', i: 21, at: 'w' }, { l: '▶', i: 20, at: 'e' }, { l: '▼', i: 22, at: 's' }],
      mid: [{ l: 'Start', i: 3 }], L: [{ l: 'Z', i: 12 }, { l: 'L', i: 10 }], R: [{ l: 'R', i: 11 }], stick: ['analog', 'dpad'],
    },
  };
  LAYOUTS.none = LAYOUTS.nes;

  // ---------- Connection ----------
  let room = decodeURIComponent(location.hash.slice(1)).trim().toLowerCase();
  let cid = localStorage.getItem('retro.cid');
  if (!cid) { cid = Math.random().toString(36).slice(2, 10); localStorage.setItem('retro.cid', cid); }

  let peer = null, conn = null, retryTimer = 0, layout = null, system = null;
  const cover = $('#cover'), coverMsg = $('#coverMsg');
  const showCover = (msg) => { cover.hidden = false; coverMsg.textContent = msg; };

  function askCode() {
    cover.hidden = false;
    $('#join').hidden = false;
    coverMsg.textContent = '';
  }
  $('#join').onsubmit = (e) => {
    e.preventDefault();
    room = $('#code').value.trim().toLowerCase();
    if (!room) return;
    history.replaceState(null, '', '#' + room);
    $('#join').hidden = true;
    connect();
  };

  function connect() {
    clearTimeout(retryTimer);
    if (!navigator.onLine) { showCover('No internet — connecting needs it for a moment.'); return retryLater(); }
    if (!peer || peer.destroyed) {
      peer = new Peer({ debug: 0 });
      peer.on('open', dial);
      peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
      peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') showCover('Looking for the computer… keep Retro open there.');
        else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { peer.destroy(); peer = null; showCover('Connection trouble, retrying…'); }
        retryLater();
      });
      return;
    }
    if (peer.open) dial();
  }
  function retryLater() { clearTimeout(retryTimer); retryTimer = setTimeout(connect, 1500); }

  function dial() {
    if (conn?.open) return;
    conn?.close();
    const c = peer.connect(PREFIX + room, { metadata: { cid }, serialization: 'json', reliable: true });
    conn = c;
    const timeout = setTimeout(() => { if (!c.open) { c.close(); retryLater(); } }, 8000);
    c.on('open', () => { clearTimeout(timeout); sendNow(); });
    c.on('data', (d) => {
      if (d?.t === 'hello') {
        cover.hidden = true;
        $('#who').textContent = 'Player ' + d.player;
        $('#who').dataset.p = d.player;
        $('#game').textContent = d.title || 'Pick a game on the computer';
        if (d.system !== system || !layout) build(d.system);
        navigator.vibrate?.([20, 40, 20]);
      }
      if (d?.t === 'full') showCover('Four controllers are already connected.');
    });
    c.on('close', () => {
      clearTimeout(timeout);
      if (conn !== c) return;
      showCover('Reconnecting…'); // the computer opened another game, or went away
      retryLater();
    });
  }

  // ---------- State ----------
  const touchBtns = new Set();     // from the right side
  let stickBtns = new Set();       // d-pad directions from the stick
  let ax = 0, ay = 0;              // analog stick
  let stickMode = 'dpad';
  let dirty = false;

  function stateMsg() {
    return { t: 'in', b: [...new Set([...touchBtns, ...stickBtns])], x: +ax.toFixed(3), y: +ay.toFixed(3) };
  }
  function sendNow() {
    dirty = false;
    if (!conn?.open) return;
    conn.send(stateMsg());
  }
  function markDirty() { if (!dirty) { dirty = true; requestAnimationFrame(sendNow); } }
  setInterval(() => { if (conn?.open) sendNow(); }, 1000); // keepalive; also fixes anything lost

  // ---------- Layout ----------
  function button(spec, cls) {
    const b = document.createElement('button');
    b.className = cls + (spec.c ? ' ' + spec.c : '') + (spec.at ? ' at-' + spec.at : '');
    b.textContent = spec.l;
    b.dataset.i = spec.i;
    return b;
  }
  function build(sys) {
    system = sys;
    layout = LAYOUTS[sys] || LAYOUTS.none;
    const face = $('#face');
    face.className = 'face n' + layout.face.length;
    face.replaceChildren(...layout.face.map((s) => button(s, 'btn round')));
    $('#cpad').hidden = !layout.cpad;
    $('#cpad').replaceChildren(...(layout.cpad || []).map((s) => button(s, 'btn round small')));
    $('#mid').replaceChildren(...layout.mid.map((s) => button(s, 'btn pill')));
    $('#shL').replaceChildren(...(layout.L || []).map((s) => button(s, 'btn shoulder')));
    $('#shR').replaceChildren(...(layout.R || []).map((s) => button(s, 'btn shoulder')));
    const saved = localStorage.getItem('retro.stick.' + sys);
    stickMode = layout.stick.includes(saved) ? saved : layout.stick[0];
    $('#mode').hidden = layout.stick.length < 2;
    paintMode();
    touchBtns.clear(); stickBtns.clear(); ax = ay = 0;
    markDirty();
  }
  function paintMode() { $('#mode').textContent = stickMode === 'analog' ? 'Stick: analog' : 'Stick: d-pad'; }
  $('#mode').onclick = () => {
    stickMode = stickMode === 'analog' ? 'dpad' : 'analog';
    localStorage.setItem('retro.stick.' + system, stickMode);
    paintMode();
    stickBtns.clear(); ax = ay = 0;
    markDirty();
  };

  // ---------- Buttons (right side + shoulders + start/select): every finger counts ----------
  const fingers = new Map(); // pointerId -> {x,y}, fingers not on the stick
  function buttonsUpdate() {
    const next = new Set();
    for (const { x, y } of fingers.values()) {
      const el = document.elementFromPoint(x, y)?.closest('[data-i]');
      if (el) next.add(+el.dataset.i);
    }
    if ([...next].some((i) => !touchBtns.has(i))) navigator.vibrate?.(12);
    touchBtns.clear(); next.forEach((i) => touchBtns.add(i));
    document.querySelectorAll('[data-i]').forEach((b) => b.classList.toggle('on', touchBtns.has(+b.dataset.i)));
    markDirty();
  }

  // ---------- Stick: floating, appears where the thumb lands ----------
  const zone = $('#stickZone'), base = $('#base'), knob = $('#knob');
  let stickId = null, ox = 0, oy = 0;
  const R = () => Math.min(70, zone.clientWidth * 0.25);
  function stickMove(x, y) {
    const r = R();
    let dx = (x - ox) / r, dy = (y - oy) / r;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    knob.style.transform = `translate(${dx * r}px, ${dy * r}px)`;
    if (stickMode === 'analog') {
      const dead = 0.12, m = Math.min(1, len);
      const k = m < dead ? 0 : (m - dead) / (1 - dead) / (m || 1);
      ax = dx * k; ay = dy * k;
      stickBtns.clear();
    } else {
      // 8 directions, 0.35 dead zone: diagonals need a clear diagonal push
      const next = new Set();
      if (len > 0.35) {
        const a = Math.atan2(dy, dx) * 180 / Math.PI; // 0 = right, 90 = down
        if (a > -67.5 && a < 67.5) next.add(7);
        if (a > 112.5 || a < -112.5) next.add(6);
        if (a > 22.5 && a < 157.5) next.add(5);
        if (a < -22.5 && a > -157.5) next.add(4);
      }
      if ([...next].some((b) => !stickBtns.has(b))) navigator.vibrate?.(6);
      stickBtns = next; ax = ay = 0;
    }
    markDirty();
  }
  function stickEnd() {
    stickId = null;
    base.classList.remove('active');
    knob.style.transform = '';
    stickBtns.clear(); ax = ay = 0;
    markDirty();
  }

  const pad = $('#pad');
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stickId === null && zone.contains(e.target) && !e.target.closest('[data-i]')) {
      stickId = e.pointerId;
      const zr = zone.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      base.style.left = (ox - zr.left) + 'px';
      base.style.top = (oy - zr.top) + 'px';
      base.classList.add('active');
      stickMove(ox, oy);
      return;
    }
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    buttonsUpdate();
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) return stickMove(e.clientX, e.clientY);
    if (fingers.has(e.pointerId)) { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); buttonsUpdate(); }
  });
  for (const t of ['pointerup', 'pointercancel']) {
    pad.addEventListener(t, (e) => {
      if (e.pointerId === stickId) return stickEnd();
      if (fingers.delete(e.pointerId)) buttonsUpdate();
    });
  }
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
  // Release everything if the phone locks or the app is switched away.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { fingers.clear(); stickEnd(); buttonsUpdate(); sendNow(); }
    else { keepAwake(); if (!conn?.open && room) connect(); }
  });

  // ---------- Phone niceties ----------
  let lock = null;
  async function keepAwake() { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed */ } }
  $('#full').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); }
    } catch { /* iPhone: add to Home Screen instead */ }
  };
  if (!document.documentElement.requestFullscreen) $('#full').hidden = true;
  window.addEventListener('online', () => { if (room && !conn?.open) connect(); });
  window.addEventListener('pagehide', () => { try { conn?.send({ t: 'bye' }); } catch { /* already closed */ } });

  // pad.html?demo=psp shows a system's layout without connecting (for checking layouts).
  const demo = new URLSearchParams(location.search).get('demo');
  build(demo && LAYOUTS[demo] ? demo : 'none');
  keepAwake();
  if (demo) { cover.hidden = true; $('#who').textContent = 'Demo'; $('#game').textContent = demo; }
  else if (room) connect(); else askCode();
})();
