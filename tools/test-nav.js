// node tools/test-nav.js: checks nav-input.js (gamepad/phone → menu actions, press/repeat/swallow timing).
const assert = require('assert');
const NavInput = require('../nav-input.js');

const pad = (buttons = [], axes = [0, 0]) => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) })),
});
const set = (s) => [...s].sort();

// ---------- Gamepad mapping (standard layout) ----------
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([12]))), ['up']);
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([13]))), ['down']);
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([14]))), ['left']);
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([15]))), ['right']);
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([0]))), ['ok']);
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([1]))), ['back']);
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([2]))), ['opts']);
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([3]))), ['opts']);
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([9, 8, 4, 5]))), [], 'Start, Select and shoulders do nothing in menus');
// Left stick, with a 0.5 dead zone; diagonals give both directions
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([], [0.4, -0.4]))), [], 'inside the dead zone');
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([], [0.9, 0]))), ['right']);
assert.deepStrictEqual(set(NavInput.fromGamepad(pad([], [-0.9, 0.9]))), ['down', 'left']);
// Missing axes or buttons (odd pads) don't throw
assert.deepStrictEqual(set(NavInput.fromGamepad({ axes: [], buttons: [] })), []);

// ---------- Phone mapping (RetroPad indices from link.js) ----------
const phone = (b = [], x = 0, y = 0) => NavInput.fromPhone({ b, x, y });
assert.deepStrictEqual(set(phone([4])), ['up']);
assert.deepStrictEqual(set(phone([5])), ['down']);
assert.deepStrictEqual(set(phone([6])), ['left']);
assert.deepStrictEqual(set(phone([7])), ['right']);
assert.deepStrictEqual(set(phone([8])), ['ok'], 'A');
assert.deepStrictEqual(set(phone([3])), ['ok'], 'Start');
assert.deepStrictEqual(set(phone([0])), ['back'], 'B');
assert.deepStrictEqual(set(phone([9])), ['opts'], 'X');
assert.deepStrictEqual(set(phone([1])), ['opts'], 'Y');
assert.deepStrictEqual(set(phone([], 0, -1)), ['up'], 'analog stick, y down');
assert.deepStrictEqual(set(phone([], 0.3, 0.3)), [], 'stick inside the dead zone');

// ---------- Repeater: presses, holds, repeats ----------
{
  const r = NavInput.repeater({ first: 380, every: 110 });
  const held = (...a) => new Set(a);
  assert.deepStrictEqual(r.frame('pad0', held('ok'), 0), ['ok'], 'a new press fires');
  assert.deepStrictEqual(r.frame('pad0', held('ok'), 16), [], 'held A does not fire again');
  assert.deepStrictEqual(r.frame('pad0', held('ok'), 5000), [], 'held A never repeats');
  assert.deepStrictEqual(r.frame('pad0', held(), 5016), [], 'release');
  assert.deepStrictEqual(r.frame('pad0', held('ok'), 5032), ['ok'], 'pressing again fires again');

  assert.deepStrictEqual(r.frame('pad0', held('right'), 10000), ['right'], 'direction fires at once');
  assert.deepStrictEqual(r.frame('pad0', held('right'), 10379), [], 'no repeat before the first delay');
  assert.deepStrictEqual(r.frame('pad0', held('right'), 10380), ['right'], 'first repeat after 380 ms');
  assert.deepStrictEqual(r.frame('pad0', held('right'), 10489), [], 'not yet');
  assert.deepStrictEqual(r.frame('pad0', held('right'), 10490), ['right'], 'then every 110 ms');
  assert.deepStrictEqual(r.frame('pad0', held(), 10500), [], 'release stops it');
  assert.deepStrictEqual(r.frame('pad0', held('right'), 10510), ['right'], 'a new press starts over');

  // Sources are independent: a phone's held A doesn't block the gamepad's A
  assert.deepStrictEqual(r.frame('phone2', held('ok'), 20000), ['ok']);
  assert.deepStrictEqual(r.frame('pad0', held('ok'), 20000), ['ok']);
}

// ---------- Swallow: what's held when a menu appears is ignored until released ----------
{
  const r = NavInput.repeater();
  const held = (...a) => new Set(a);
  assert.deepStrictEqual(r.frame('pad0', held('ok', 'right'), 0, true), [], 'held as the menu opens: ignored');
  assert.deepStrictEqual(r.frame('pad0', held('ok', 'right'), 16), [], 'still held: still ignored');
  assert.deepStrictEqual(r.frame('pad0', held('ok', 'right'), 2000), [], 'no repeats either');
  assert.deepStrictEqual(r.frame('pad0', held('right'), 2016), [], 'A released; right still held');
  assert.deepStrictEqual(r.frame('pad0', held('ok', 'right'), 2032), ['ok'], 'A pressed again fires');
  assert.deepStrictEqual(r.frame('pad0', held('ok'), 2048), [], 'right released');
  assert.deepStrictEqual(r.frame('pad0', held('ok', 'right'), 2064), ['right'], 'right pressed again fires');
  // Only what's held at that moment is swallowed
  assert.deepStrictEqual(r.frame('pad1', held(), 3000, true), []);
  assert.deepStrictEqual(r.frame('pad1', held('ok'), 3016), ['ok'], 'pressed after the menu opened: fires');
}

// ---------- reset (tab hidden) forgets everything ----------
{
  const r = NavInput.repeater();
  r.frame('pad0', new Set(['ok']), 0);
  r.reset();
  assert.deepStrictEqual(r.frame('pad0', new Set(['ok']), 16), ['ok'], 'after reset a held button counts as new');
}

console.log('nav ok');
