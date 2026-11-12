// node tools/test-nav.js — checks the menu-navigation helpers (which element is next, what buttons mean).
const assert = require('assert');
const Nav = require('../nav.js');

// A 3x2 grid of 100x150 cards with 10px gaps, plus a top bar of two buttons.
const bar = [{ l: 0, t: 0, r: 150, b: 40 }, { l: 160, t: 0, r: 310, b: 40 }];
const cards = [];
for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
  cards.push({ l: col * 110, t: 60 + row * 160, r: col * 110 + 100, b: 60 + row * 160 + 150 });
}
const all = [...bar, ...cards]; // indices 0-1 bar, 2-4 row one, 5-7 row two

assert.equal(Nav.pickNext(all, 3, 'right'), 4, 'right along a row');
assert.equal(Nav.pickNext(all, 3, 'left'), 2, 'left along a row');
assert.equal(Nav.pickNext(all, 4, 'right'), -1, 'no wrap at the end of a row');
assert.equal(Nav.pickNext(all, 3, 'down'), 6, 'down a column');
assert.equal(Nav.pickNext(all, 6, 'up'), 3, 'up a column');
assert.equal(Nav.pickNext(all, 2, 'up'), 0, 'up from the first card reaches the bar');
assert.equal(Nav.pickNext(all, 4, 'up'), 1, 'up from the third card reaches the second bar button');
assert.equal(Nav.pickNext(all, 0, 'down'), 2, 'down from the bar lands on the card below');
assert.equal(Nav.pickNext(all, 5, 'down'), -1, 'nothing below the last row');
assert.equal(Nav.pickNext(all, -1, 'down'), 0, 'nothing focused yet: first one');
assert.equal(Nav.pickNext([], -1, 'down'), -1);
// A short last row: down from the right-most card of a full row goes to the nearest below, not nowhere
assert.equal(Nav.pickNext([...cards.slice(0, 3), cards[3]], 2, 'down'), 3, 'down to the nearest card below');
// A vertical list in a dialog
const list = [0, 1, 2].map((i) => ({ l: 0, t: i * 50, r: 300, b: i * 50 + 44 }));
assert.equal(Nav.pickNext(list, 0, 'down'), 1);
assert.equal(Nav.pickNext(list, 2, 'up'), 1);
assert.equal(Nav.pickNext(list, 1, 'left'), -1);

// Gamepad (standard mapping)
const pad = (down = [], axes = [0, 0]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })), axes });
assert.deepEqual([...Nav.fromGamepad(pad([0]))], ['accept']);
assert.deepEqual([...Nav.fromGamepad(pad([1, 9]))].sort(), ['back', 'menu']);
assert.deepEqual([...Nav.fromGamepad(pad([12, 15]))].sort(), ['right', 'up']);
assert.deepEqual([...Nav.fromGamepad(pad([], [0.9, 0]))], ['right'], 'stick past the threshold');
assert.deepEqual([...Nav.fromGamepad(pad([], [0.3, -0.3]))], [], 'stick inside the dead zone');
assert.deepEqual([...Nav.fromGamepad(pad([4, 5]))].sort(), ['next', 'prev']);

// Phone (RetroPad indices)
assert.deepEqual([...Nav.fromRetroPad([8])], ['accept'], 'right-hand A');
assert.deepEqual([...Nav.fromRetroPad([0, 3])].sort(), ['back', 'menu']);
assert.deepEqual([...Nav.fromRetroPad([4, 7])].sort(), ['right', 'up']);
assert.deepEqual([...Nav.fromRetroPad([], 0, 0.9)], ['down'], 'analog stick');
console.log('nav ok');
