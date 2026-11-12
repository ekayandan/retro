/* Nav — menus by gamepad, or by a phone controller when no game is playing.
 * Sources (a gamepad, each phone) are turned into actions: up, down, left, right, accept (bottom/A), back (right/B),
 * alt (X), alt2 (Y), prev/next (shoulders), menu (Start), select. Directions repeat while held.
 * By default: directions move the focus to the nearest button in that direction, accept clicks it, back closes the
 * open dialog. A page can take over any action with Nav.onAction((action, focusedElement) => true if handled).
 * Nav only listens while a menu is on screen (the library or an open dialog), never while a game is running, so it
 * doesn't fight the emulator for the gamepad. Elements with data-nav-skip are skipped (still reachable by Tab).
 * Pure helpers (pickNext, fromGamepad, fromRetroPad) are exported for tests. */
const Nav = (() => {
  const DIRS = ['up', 'down', 'left', 'right'];
  const FOCUSABLE = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [tabindex]';

  // ---------- Pure: what the buttons mean, and which element is next ----------
  function fromGamepad(gp) {
    const a = new Set();
    const b = (i) => gp.buttons[i]?.pressed;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (b(12) || ay < -0.55) a.add('up');
    if (b(13) || ay > 0.55) a.add('down');
    if (b(14) || ax < -0.55) a.add('left');
    if (b(15) || ax > 0.55) a.add('right');
    if (b(0)) a.add('accept');
    if (b(1)) a.add('back');
    if (b(2)) a.add('alt');
    if (b(3)) a.add('alt2');
    if (b(4)) a.add('prev');
    if (b(5)) a.add('next');
    if (b(8)) a.add('select');
    if (b(9)) a.add('menu');
    return a;
  }
  // Phone controllers send RetroPad indices (see link.js): 8 = the right-hand A button, 0 = B.
  function fromRetroPad(b, x = 0, y = 0) {
    const a = new Set();
    const has = (i) => b.includes(i);
    if (has(4) || y < -0.55) a.add('up');
    if (has(5) || y > 0.55) a.add('down');
    if (has(6) || x < -0.55) a.add('left');
    if (has(7) || x > 0.55) a.add('right');
    if (has(8)) a.add('accept');
    if (has(0)) a.add('back');
    if (has(9)) a.add('alt');
    if (has(1)) a.add('alt2');
    if (has(10)) a.add('prev');
    if (has(11)) a.add('next');
    if (has(2)) a.add('select');
    if (has(3)) a.add('menu');
    return a;
  }

  // rects: [{l,t,r,b}]; from: index or -1. Returns the index of the best one in that direction, or -1.
  // Nearest along the direction wins, with a penalty for being off to the side. Nothing wraps around.
  function pickNext(rects, from, dir) {
    if (from < 0) return rects.length ? 0 : -1;
    const s = rects[from], sx = (s.l + s.r) / 2, sy = (s.t + s.b) / 2;
    let best = -1, bestScore = Infinity;
    rects.forEach((c, i) => {
      if (i === from) return;
      const dx = (c.l + c.r) / 2 - sx, dy = (c.t + c.b) / 2 - sy;
      const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      const side = Math.abs(dir === 'left' || dir === 'right' ? dy : dx);
      if (along <= 2 || side > along * 3 + 40) return;
      const score = along + side * 2.5;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return best;
  }

  if (typeof document === 'undefined') return { fromGamepad, fromRetroPad, pickNext };

  // ---------- DOM ----------
  const html = document.documentElement;
  let handler = () => false;
  let hintsFn = null;
  const prev = new Map();   // source -> Set of actions held last time; null = swallow what's held now
  const timers = new Map(); // "source:action" -> repeat timer

  const topDialog = () => [...document.querySelectorAll('dialog[open]')].pop() || null;
  const library = () => document.querySelector('#library:not([hidden])');
  const root = () => topDialog() || library();
  const active = () => !document.hidden && !!root();

  const rectOf = (el) => {
    const box = el.matches('input[type=radio], input[type=checkbox]') ? el.closest('label') || el : el;
    return box.getBoundingClientRect();
  };
  function candidates(scope) {
    return [...scope.querySelectorAll(FOCUSABLE)].filter((el) => {
      if (el.disabled || el.tabIndex < 0 || el.hasAttribute('data-nav-skip') || el.closest('[hidden], [inert]')) return false;
      const r = rectOf(el);
      return r.width > 0 && r.height > 0;
    });
  }

  function move(dir, scope) {
    const els = candidates(scope);
    if (!els.length) return;
    const cur = els.indexOf(document.activeElement);
    let to;
    if (cur < 0) {
      const first = scope.querySelector('[data-nav-first]');
      to = Math.max(0, els.indexOf(first));
    } else {
      to = pickNext(els.map((el) => { const r = rectOf(el); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }), cur, dir);
      if (to < 0) return;
    }
    els[to].focus();
    els[to].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function back(dlg) {
    if (!dlg) return;
    // Dialogs with their own Esc handling (like the game menu) get the same 'cancel' event Esc would send.
    if (dlg.dispatchEvent(new Event('cancel', { cancelable: true }))) dlg.close();
  }

  function press(action) {
    html.classList.add('nav-active');
    const scope = root();
    if (!scope) return;
    const el = document.activeElement && scope.contains(document.activeElement) ? document.activeElement : null;
    if (!handler(action, el, scope)) {
      if (DIRS.includes(action)) move(action, scope);
      else if (action === 'accept' && el) el.click();
      else if (action === 'back') back(topDialog());
    }
    paintHints();
  }

  // Feed the actions a source is holding right now. New presses fire; held directions repeat.
  function feed(source, now) {
    const was = prev.get(source);
    prev.set(source, now);
    if (was == null) return; // first sight after (re)activation: ignore buttons that were already down
    for (const a of now) {
      if (was.has(a)) continue;
      press(a);
      if (DIRS.includes(a)) {
        const key = source + ':' + a;
        clearTimeout(timers.get(key));
        timers.set(key, setTimeout(function rep() {
          if (!prev.get(source)?.has(a) || !active()) return;
          press(a);
          timers.set(key, setTimeout(rep, 110));
        }, 380));
      }
    }
  }
  function release(source) { prev.set(source, null); }

  // ---------- Gamepad polling (only while a gamepad is plugged in and a menu is showing) ----------
  let raf = 0;
  const gamepad = () => [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected);
  function loop() {
    raf = requestAnimationFrame(loop);
    const gp = active() && gamepad();
    if (gp) feed('pad', fromGamepad(gp)); else release('pad');
  }
  function startPad() { if (!raf) raf = requestAnimationFrame(loop); }
  addEventListener('gamepadconnected', startPad);
  addEventListener('gamepaddisconnected', () => { if (!gamepad()) { cancelAnimationFrame(raf); raf = 0; release('pad'); } });
  if (gamepad()) startPad();

  // ---------- Phones: called with the state a phone sends while no game is running ----------
  function phone(p, b, x, y) {
    if (!active()) { release('phone' + p); return; }
    feed('phone' + p, fromRetroPad(b, x, y));
  }

  // ---------- Look: a focus ring only when driving by pad, and a row of button hints ----------
  for (const t of ['pointerdown', 'keydown']) {
    addEventListener(t, () => { html.classList.remove('nav-active'); paintHints(); }, true);
  }
  const bar = document.createElement('div');
  bar.id = 'nav-hints';
  bar.setAttribute('popover', 'manual'); // top layer, so it shows above open dialogs too
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  function paintHints() {
    const on = html.classList.contains('nav-active') && active();
    const scope = root();
    const items = on ? (hintsFn?.(scope) || (scope?.matches('dialog') ? [['A', 'Select'], ['B', 'Close']] : [['A', 'Select']])) : [];
    bar.replaceChildren(...items.map(([k, label]) => {
      const s = document.createElement('span');
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      s.append(kbd, ' ' + label);
      return s;
    }));
    try {
      if (bar.matches(':popover-open')) bar.hidePopover();
      if (items.length) bar.showPopover(); // re-shown each time so it stays above the newest dialog
    } catch { /* no popover support: no hints */ }
  }
  document.addEventListener('close', () => setTimeout(paintHints), true);

  return {
    fromGamepad, fromRetroPad, pickNext, phone,
    onAction(fn) { handler = fn; },
    setHints(fn) { hintsFn = fn; },
    isActive: active,
  };
})();

if (typeof module !== 'undefined') module.exports = Nav;
