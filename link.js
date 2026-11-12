/* Link — play with a friend. The laptop (host) registers a fixed "room" id on the PeerJS broker;
 * each phone opens pad.html#<room> and connects straight to the laptop over WebRTC. Only the short
 * handshake goes through the broker; button presses travel device-to-device (on the same Wi-Fi, they
 * stay on the local network). A friend far away opens the invite link (pad.html?watch#<room>): the
 * host also sends them the game's picture and sound as a WebRTC media call, so they see what you see.
 * If a direct connection isn't possible, WebRTC falls back to PeerJS's free relay (TURN) servers.
 *
 * Messages, JSON:
 *   host → phone  {t:'hello', player, system, title}       on connect and whenever the game changes
 *   phone → host  {t:'in', b:[RetroPad indices], x, y}     full state on every change (+ keepalive)
 *   phone → host  {t:'watch', on}                          send me the screen (or stop)
 *   host → phone  media call, metadata {t:'screen'}        the game's video + audio
 * RetroPad indices (EmulatorJS simulateInput): 0 B, 1 Y, 2 Select, 3 Start, 4-7 Up/Down/Left/Right,
 * 8 A, 9 X, 10 L, 11 R, 12 L2, 13 R2, 20-23 right stick (N64 C buttons). x, y: left stick, -1..1, y down.
 * Pages that host a game call Link.onInput(fn), Link.setSystem(system, title) and Link.share({video, audio})
 * with the game's tracks (Link.tapAudio() captures sound from emulators that play it themselves). */
const Link = (() => {
  const ON = 'retro.link', ROOM = 'retro.room', SLOTS = 'retro.slots';
  const PREFIX = 'retro-pad-';
  const MAX_PLAYERS = 4;

  let peer = null, retry = 0, closing = false;
  let system = null, title = '';
  let inputFn = () => {};
  const players = new Map(); // DataConnection -> player number
  const seen = new Map();    // DataConnection -> last message time (phones send a keepalive every second)
  const watching = new Set(); // DataConnections that want the screen
  const calls = new Map();    // DataConnection -> MediaConnection carrying the screen
  const listeners = new Set();
  const tracks = { video: null, audio: null };
  let stream = null, recallTimer = 0;

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
  const inviteUrl = () => new URL('pad.html?watch#' + room(), location.href).href;
  const enabled = () => localStorage.getItem(ON) === '1';
  const changed = () => listeners.forEach((f) => f());

  // Same phone gets the same player number back after a reconnect (e.g. the laptop opened another game).
  // A friend far away (watching the screen) starts at player 2: player 1 is whoever sits at the computer.
  function pickSlot(cid, first) {
    const used = new Set(players.values());
    const remembered = JSON.parse(localStorage.getItem(SLOTS) || '{}');
    let p = remembered[cid];
    if (!p || used.has(p) || p < first) for (p = first; used.has(p) && p <= MAX_PLAYERS; p++);
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
        const p = pickSlot(String(conn.metadata?.cid || conn.peer), conn.metadata?.watch ? 2 : 1);
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
        if (d.t === 'watch') { if (d.on) { watching.add(conn); callScreen(conn); } else stopScreen(conn); changed(); }
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

  // ---------- The screen, for friends who aren't in the room ----------
  function callScreen(conn) {
    calls.get(conn)?.close();
    calls.delete(conn);
    if (!stream || !peer?.open || !conn.open) return; // called again once there is a game to show
    const call = peer.call(conn.peer, stream, { metadata: { t: 'screen' } });
    if (!call) return;
    calls.set(conn, call);
    const done = () => { if (calls.get(conn) === call) calls.delete(conn); };
    call.on('close', done);
    call.on('error', done);
  }
  function stopScreen(conn) {
    watching.delete(conn);
    calls.get(conn)?.close();
    calls.delete(conn);
  }
  function share(t) {
    let diff = false;
    for (const k of ['video', 'audio']) if (k in t && t[k] !== tracks[k]) { tracks[k] = t[k] || null; diff = true; }
    if (!diff) return;
    const live = [tracks.video, tracks.audio].filter((x) => x && x.readyState === 'live');
    stream = live.length ? new MediaStream(live) : null;
    // Picture and sound often show up a moment apart: call once, after both.
    clearTimeout(recallTimer);
    recallTimer = setTimeout(() => { for (const c of watching) callScreen(c); }, 300);
  }
  // Emulators that play sound themselves (EmulatorJS): also send whatever reaches the speakers.
  // Call before the emulator creates its AudioContext.
  function tapAudio() {
    const connect = AudioNode.prototype.connect;
    const taps = new WeakMap();
    AudioNode.prototype.connect = function (target, ...rest) {
      const r = connect.call(this, target, ...rest);
      if (target instanceof AudioDestinationNode && target.context.createMediaStreamDestination) {
        let tap = taps.get(target.context);
        if (!tap) {
          tap = target.context.createMediaStreamDestination();
          taps.set(target.context, tap);
          share({ audio: tap.stream.getAudioTracks()[0] });
        }
        connect.call(this, tap);
      }
      return r;
    };
  }

  function gone(conn) {
    const p = players.get(conn);
    stopScreen(conn);
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
    for (const call of calls.values()) call.close();
    players.clear(); seen.clear(); watching.clear(); calls.clear();
    peer?.destroy(); peer = null;
    changed();
  }

  // ---------- Dialog: next to you (QR), far away (invite link), who's here ----------
  let dlg = null, copiedTimer = 0;
  function dialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'link-dlg';
    dlg.innerHTML = `
      <h2>Play with a friend</h2>
      <section class="link-sec link-near">
        <div class="link-qr" role="img" aria-label="QR code for the controller page"></div>
        <div>
          <h3>Next to you</h3>
          <p class="link-help">Scan with a phone's camera. The phone becomes a controller.</p>
        </div>
      </section>
      <section class="link-sec link-far">
        <h3>Far away</h3>
        <p class="link-help">Send this link. Your friend sees and hears the game on their phone and plays along.</p>
        <button class="btn primary" data-act="invite">Send invite link</button>
        <span class="link-url"></span>
      </section>
      <p class="link-warn" hidden></p>
      <ul class="link-list"></ul>
      <p class="link-state" role="status"></p>
      <div class="link-actions">
        <button class="btn" data-act="off">Stop</button>
        <button class="btn" data-act="close">Done</button>
      </div>`;
    dlg.addEventListener('click', async (e) => {
      const act = e.target.dataset?.act;
      if (act === 'invite') invite(e.target);
      if (act === 'off') { localStorage.removeItem(ON); close(); dlg.close(); }
      if (act === 'close' || e.target === dlg) dlg.close();
    });
    document.body.append(dlg);
    listeners.add(paint);
    return dlg;
  }

  // Phones get the share sheet (Messages, WhatsApp…); laptops copy the link.
  async function invite(btn) {
    const url = inviteUrl();
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: 'Retro', text: 'Come play with me', url }); return; }
      catch (err) { if (err.name === 'AbortError') return; }
    }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch { /* no clipboard: the link is shown below */ }
    btn.textContent = ok ? 'Link copied. Paste it to your friend' : 'Copy the link below';
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { btn.textContent = 'Send invite link'; }, 2500);
  }

  function paint() {
    if (!dlg?.open) return;
    const qr = qrcode(0, 'M');
    qr.addData(padUrl());
    qr.make();
    dlg.querySelector('.link-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    dlg.querySelector('.link-url').textContent = inviteUrl().replace(/^https?:\/\//, '');
    const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
    const warn = dlg.querySelector('.link-warn');
    warn.hidden = !local;
    warn.textContent = 'Phones can\'t open "localhost". Open Retro through this computer\'s network address (e.g. http://192.168.1.20:8742) or the published site.';
    const list = dlg.querySelector('.link-list');
    list.replaceChildren(...[...players].sort((a, b) => a[1] - b[1]).map(([conn, p]) => {
      const li = document.createElement('li');
      li.dataset.p = p;
      li.textContent = `${p}P${watching.has(conn) ? ' · watching' : ''}`;
      return li;
    }));
    dlg.querySelector('.link-state').textContent =
      !navigator.onLine ? 'Offline. Inviting needs internet for a moment.'
        : peer?.open ? (players.size ? '' : 'Waiting for a friend…') : 'Getting ready…';
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
    share,
    tapAudio,
    setSystem(s, t) {
      system = s; title = t || '';
      for (const c of players.keys()) if (c.open) hello(c);
    },
  };
})();
