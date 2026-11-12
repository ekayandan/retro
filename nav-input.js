/* Menu input from gamepads and friends' phones, as actions: up, down, left, right, ok, back, opts.
 * Pure logic, no DOM, so tools/test-nav.js runs it in Node. app.js reads the pads and phones every frame,
 * turns their state into held actions with fromGamepad / fromPhone, and asks a repeater what fires now. */
const NavInput = (() => {
  const DIRS = ['up', 'down', 'left', 'right'];
  const ACTIONS = [...DIRS, 'ok', 'back', 'opts'];

  // A "standard"-mapping gamepad: d-pad (12-15) or left stick, A (0) = ok, B (1) = back, X (2) / Y (3) = options.
  function fromGamepad(gp, dead = 0.5) {
    const b = (i) => !!gp.buttons[i]?.pressed, ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, held = new Set();
    if (b(12) || ay < -dead) held.add('up');
    if (b(13) || ay > dead) held.add('down');
    if (b(14) || ax < -dead) held.add('left');
    if (b(15) || ax > dead) held.add('right');
    if (b(0)) held.add('ok');
    if (b(1)) held.add('back');
    if (b(2) || b(3)) held.add('opts');
    return held;
  }

  // A phone controller's state (link.js): RetroPad indices 4-7 d-pad, 8 A, 0 B, 9 X, 1 Y, 3 Start;
  // x/y is the analog stick, -1..1 with y down.
  function fromPhone(st, dead = 0.5) {
    const has = (i) => st.b.includes(i), x = st.x || 0, y = st.y || 0, held = new Set();
    if (has(4) || y < -dead) held.add('up');
    if (has(5) || y > dead) held.add('down');
    if (has(6) || x < -dead) held.add('left');
    if (has(7) || x > dead) held.add('right');
    if (has(8) || has(3)) held.add('ok');
    if (has(0)) held.add('back');
    if (has(9) || has(1)) held.add('opts');
    return held;
  }

  // Turns "what is held now" into "what fires now", per source (each pad, each phone):
  // - a new press fires once; a held direction repeats after `first` ms, then every `every` ms
  // - swallow: whatever is held right then is ignored until it's released. app.js passes it on the first
  //   frame a menu is on screen, so the A that was held in a game doesn't also press "Resume".
  function repeater({ first = 380, every = 110 } = {}) {
    const next = new Map(); // 'source:action' -> time of the next repeat; Infinity = no repeat, or swallowed
    return {
      frame(source, held, now, swallow = false) {
        const fire = [];
        for (const a of ACTIONS) {
          const key = source + ':' + a, t = next.get(key);
          if (!held.has(a)) { next.delete(key); continue; }
          if (t === undefined) {
            if (swallow) { next.set(key, Infinity); continue; }
            next.set(key, DIRS.includes(a) ? now + first : Infinity);
            fire.push(a);
          } else if (now >= t) {
            next.set(key, now + every);
            fire.push(a);
          }
        }
        return fire;
      },
      reset() { next.clear(); },
    };
  }

  return { DIRS, ACTIONS, fromGamepad, fromPhone, repeater };
})();
if (typeof module !== 'undefined') module.exports = NavInput;
