// node tools/test-tilt.js — checks the tilt maths used by the phone controller.
const assert = require('assert');
const Tilt = require('../tilt.js');

const near = (a, b, msg, eps = 0.5) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);

// Build beta/gamma from "which way is up, in the phone's own frame" so the poses are physically real
// (near upright portrait, gamma alone spins about the vertical axis; it is not a roll).
const D = Math.PI / 180;
const fromUp = (ux, uy, uz) => ({ beta: Math.asin(uy) / D, gamma: Math.atan2(-ux, uz) / D });
const poseOf = (u, angle) => { const { beta, gamma } = fromUp(...u); return Tilt.pose(beta, gamma, angle); };

// Portrait, held upright, rolled clockwise by θ like a steering wheel: up = (-sinθ, cosθ, 0)
for (const t of [-30, -10, 0, 10, 30]) near(poseOf([-Math.sin(t * D), Math.cos(t * D), 0], 0).roll, t, `portrait roll ${t}`);
// Flat on a table, screen up, right edge tipped down by θ: up = (-sinθ, 0, cosθ)
near(poseOf([-Math.sin(15 * D), 0, Math.cos(15 * D)], 0).roll, 15, 'flat roll');

// Landscape (screen angle 90): the phone's right edge points up, so up = (1,0,0) when upright.
// Clockwise roll by θ as the player sees it: up = (cosθ, sinθ, 0)  (device beta = θ, gamma = -90)
for (const t of [-30, -10, 0, 10, 30]) near(poseOf([Math.cos(t * D), Math.sin(t * D), 0], 90).roll, t, `landscape roll ${t}`);
// The other landscape (angle 270): up = (-1,0,0) upright; clockwise roll θ: up = (-cosθ, -sinθ, 0)
for (const t of [-30, 30]) near(poseOf([-Math.cos(t * D), -Math.sin(t * D), 0], 270).roll, t, `landscape-secondary roll ${t}`);

// Pitch: leaning the top of an upright portrait phone away from you by θ lifts the screen to face the ceiling:
// up = (0, cosθ, sinθ). Pitch rises by θ.
const p0 = poseOf([0, 1, 0], 0).pitch;
near(poseOf([0, Math.cos(20 * D), Math.sin(20 * D)], 0).pitch - p0, 20, 'pitch away 20°');
near(poseOf([0, Math.cos(20 * D), -Math.sin(20 * D)], 0).pitch - p0, -20, 'pitch toward you 20°');

// Axes: dead zone, clamp, direction
const n = { roll: 0, pitch: 0 };
assert.deepEqual(Tilt.axes({ roll: 1, pitch: 0 }, n, 25), { x: 0, y: 0 }, 'inside the dead zone');
assert.equal(Tilt.axes({ roll: 25, pitch: 0 }, n, 25).x, 1, 'full right at range');
assert.equal(Tilt.axes({ roll: 90, pitch: 0 }, n, 25).x, 1, 'clamped');
assert.equal(Tilt.axes({ roll: -25, pitch: 0 }, n, 25).x, -1, 'full left');
assert.equal(Tilt.axes({ roll: 0, pitch: 25 }, n, 25).y, -1, 'top away = up = negative y');
assert.equal(Tilt.axes({ roll: 0, pitch: -25 }, n, 25).y, 1, 'top toward you = down');
near(Tilt.axes({ roll: 12.5, pitch: 0 }, n, 25, 0).x, 0.5, 'linear without a dead zone', 0.001);
// Neutral is subtracted, and pitch wraps around ±180
assert.equal(Tilt.axes({ roll: 40, pitch: 0 }, { roll: 15, pitch: 0 }, 25).x, 1, 'recentered');
near(Tilt.axes({ roll: 0, pitch: -175 }, { roll: 0, pitch: 175 }, 25, 0).y, -10 / 25, 'pitch wrap', 0.001);

// D-pad with hysteresis
let held = Tilt.dpad(0.5, 0, new Set());
assert.deepEqual([...held], [7], 'right pressed past 0.4');
held = Tilt.dpad(0.3, 0, held);
assert.deepEqual([...held], [7], 'still held at 0.3');
held = Tilt.dpad(0.2, 0, held);
assert.deepEqual([...held], [], 'released under 0.25');
assert.deepEqual([...Tilt.dpad(0.3, 0, new Set())], [], 'not pressed at 0.3 from rest');
assert.deepEqual([...Tilt.dpad(-0.6, -0.6, new Set())].sort(), [4, 6], 'diagonal up-left');

assert.equal(Tilt.smooth(0, 1, 0.5), 0.5);
console.log('tilt ok');
