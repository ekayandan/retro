/* Link — phones as controllers. The laptop (host) registers a fixed "room" id on the PeerJS broker;
 * each phone opens pad.html#<room> and connects straight to the laptop over WebRTC. Only the short
 * handshake goes through the broker; button presses travel device-to-device (on the same Wi-Fi, they
 * stay on the local network).
 *
 * Messages, JSON:
 *   host → phone  {t:'hello', player, system, title}       on connect and whenever the game changes
 *   phone → host  {t:'in', b:[RetroPad indices], x, y}     full state on every change (+ keepalive)
 * RetroPad indices (EmulatorJS simulateInput): 0 B, 1 Y, 2 Select, 3 Start, 4-7 Up/Down/Left/Right,
 * 8 A, 9 X, 10 L, 11 R, 12 L2, 13 R2, 20-23 right stick (N64 C buttons). x, y: left stick, -1..1, y down.
 * Pages that host a game call Link.onInput(fn) and Link.setSystem(system, title). */
const Link = (() => {
  const ON = 'retro.link', ROOM = 'retro.room', SLOTS = 'retro.slots';
  const PREFIX = 'retro-pad-';
  const MAX_PLAYERS = 4;

  let peer = null, retry = 0, closing = false;
  let system = null, title = '';
  let inputFn = () => {};
  const players = new Map(); // DataConnection -> player number
  const seen = new Map();    // DataConnection -> last message time (phones send a keepalive every second)
  const listeners = new Set();

  function room() {
    let r = localStorage.getItem(ROOM);
    if (!r) {
      const abc = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes, easy to type
      const rnd = crypto.getRandomValues(new Uint8Array(6));
      r = [...rnd].map((n) => abc[n % abc.length]).join('');
      localStorage.setItem(ROOM, r);
    }
    return r;
  }
  const padUrl = () => new URL('pad.html#' + room(), location.href).href;
  const enabled = () => localStorage.getItem(ON) === '1';
  const changed = () => listeners.forEach((f) => f());

  // Same phone gets the same player number back after a reconnect (e.g. the laptop opened another game).
  function pickSlot(cid) {
    const used = new Set(players.values());
    const remembered = JSON.parse(localStorage.getItem(SLOTS) || '{}');
    let p = remembered[cid];
    if (!p || used.has(p)) for (p = 1; used.has(p) && p <= MAX_PLAYERS; p++);
    if (p > MAX_PLAYERS) return 0;
    remembered[cid] = p;
    localStorage.setItem(SLOTS, JSON.stringify(remembered));
    return p;
  }

  function hello(conn) {
    conn.send({ t: 'hello', player: players.get(conn), system, title });
  }

  function open() {
    if (peer || !window.Peer) return;
    closing = false;
    peer = new Peer(PREFIX + room(), { debug: 0 });
    peer.on('open', () => { retry = 0; changed(); });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        const p = pickSlot(String(conn.metadata?.cid || conn.peer));
        if (!p) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
        players.set(conn, p);
        seen.set(conn, Date.now());
        hello(conn);
        changed();
      });
      conn.on('data', (d) => {
        const p = players.get(conn);
        if (!p || !d) return;
        seen.set(conn, Date.now());
        if (d.t === 'in') inputFn(p, { b: Array.isArray(d.b) ? d.b : [], x: +d.x || 0, y: +d.y || 0 });
        if (d.t === 'bye') { gone(conn); conn.close(); }
      });
      conn.on('close', () => gone(conn));
      conn.on('error', () => gone(conn));
    });
    peer.on('disconnected', () => { if (!closing && peer && !peer.destroyed) peer.reconnect(); });
    peer.on('error', (e) => {
      // 'unavailable-id': the previous page's registration hasn't expired yet (we just navigated) — retry.
      if (['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
        peer?.destroy(); peer = null;
        if (!closing) setTimeout(open, Math.min(1000 * 2 ** retry++, 15000));
      } else console.warn('link:', e.type, e);
      changed();
    });
  }

  function gone(conn) {
    const p = players.get(conn);
    seen.delete(conn);
    if (!players.delete(conn)) return;
    inputFn(p, { b: [], x: 0, y: 0 }); // release everything that phone held
    changed();
  }

  // A phone that vanishes (tab closed, Wi-Fi dropped) can take WebRTC half a minute to report.
  // Silent for 3 s: let go of its buttons. Silent for 15 s: drop it so its player slot frees up.
  setInterval(() => {
    const now = Date.now();
    for (const [conn, t] of seen) {
      if (now - t > 15000) { gone(conn); conn.close(); }
      else if (now - t > 3000) inputFn(players.get(conn), { b: [], x: 0, y: 0 });
    }
  }, 1000);

  function close() {
    closing = true;
    for (const c of players.keys()) inputFn(players.get(c), { b: [], x: 0, y: 0 });
    players.clear(); seen.clear();
    peer?.destroy(); peer = null;
    changed();
  }

  // ---------- Dialog (QR code, who is connected, turn off) ----------
  let dlg = null;
  function dialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'link-dlg';
    dlg.innerHTML = `
      <h2>Phone controllers</h2>
      <p class="link-help">Scan with your phone's camera. It becomes a controller — a second phone is player 2.</p>
      <div class="link-qr" aria-label="QR code"></div>
      <a class="link-url" target="_blank" rel="noopener"></a>
      <p class="link-warn" hidden></p>
      <ul class="link-list"></ul>
      <p class="link-state"></p>
      <button class="btn danger" data-act="off">Turn off</button>
      <button class="btn" data-act="close">Close</button>`;
    dlg.addEventListener('click', (e) => {
      const act = e.target.dataset?.act;
      if (act === 'off') { localStorage.removeItem(ON); close(); dlg.close(); }
      if (act === 'close' || e.target === dlg) dlg.close();
    });
    document.body.append(dlg);
    listeners.add(paint);
    return dlg;
  }

  function paint() {
    if (!dlg?.open) return;
    const url = padUrl();
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    dlg.querySelector('.link-qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
    const a = dlg.querySelector('.link-url');
    a.href = url; a.textContent = url.replace(/^https?:\/\//, '');
    const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
    const warn = dlg.querySelector('.link-warn');
    warn.hidden = !local;
    warn.textContent = 'Your phone can\'t open "localhost". Open this page on the laptop through its network address (e.g. http://192.168.1.20:8742) and scan again.';
    const list = dlg.querySelector('.link-list');
    list.replaceChildren(...[...new Set(players.values())].sort().map((p) => {
      const li = document.createElement('li'); li.textContent = `Player ${p} connected`; return li;
    }));
    dlg.querySelector('.link-state').textContent =
      !navigator.onLine ? 'Offline — connecting a phone needs internet for a moment.'
        : peer?.open ? (players.size ? '' : 'Waiting for a phone…') : 'Getting ready…';
  }

  function show(onClose) {
    localStorage.setItem(ON, '1');
    open();
    const d = dialog();
    if (onClose) d.addEventListener('close', onClose, { once: true });
    d.showModal();
    paint();
  }

  if (enabled()) open();
  window.addEventListener('pagehide', (e) => { if (!e.persisted) close(); }); // free the id for the next page
  window.addEventListener('pageshow', (e) => { if (e.persisted && enabled()) open(); });
  window.addEventListener('online', () => { if (enabled() && !peer) open(); });

  return {
    show,
    onInput(fn) { inputFn = fn; },
    onChange(fn) { listeners.add(fn); fn(); },
    count: () => players.size,
    setSystem(s, t) {
      system = s; title = t || '';
      for (const c of players.keys()) if (c.open) hello(c);
    },
  };
})();
