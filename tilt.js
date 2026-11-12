/* Tilt steering: turns the phone's orientation into joystick axes. Pure functions (no DOM), so Node tests can run them.
 * Orientation comes from the deviceorientation event (alpha/beta/gamma), which iOS and Android report the same way
 * (devicemotion's acceleration sign differs between them, so it isn't used).
 *
 * pose(beta, gamma, screenAngle) -> {roll, pitch} in degrees, relative to how the screen is held:
 *   roll  = rolling the phone like a steering wheel (screen's right side down = positive)
 *   pitch = leaning the screen's top edge away from you (positive)
 * axes(pose, neutral, range, dead) -> {x, y} in -1..1, y down (push the top away = up, like pushing a stick forward)
 * dpad(x, y, held) -> Set of RetroPad d-pad indices (4 up, 5 down, 6 left, 7 right), with hysteresis so it doesn't flicker. */
const Tilt = (() => {
  const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function pose(beta, gamma, angle = 0) {
    const b = rad(beta), g = rad(gamma), a = rad(angle);
    // Which way is "up" (away from the ground) in the phone's own frame
    const ux = -Math.sin(g) * Math.cos(b), uy = Math.sin(b), uz = Math.cos(g) * Math.cos(b);
    // ...and in the screen's frame, which is what the player sees (angle = screen.orientation.angle)
    const sx = ux * Math.cos(a) - uy * Math.sin(a);
    const sy = ux * Math.sin(a) + uy * Math.cos(a);
    return { roll: deg(Math.atan2(-sx, Math.hypot(sy, uz))), pitch: deg(Math.atan2(uz, sy)) };
  }

  // Past `range` degrees from neutral is full deflection; `dead` (0..1) is the stick's dead zone.
  function axes(p, neutral, range, dead = 0.08) {
    const shape = (v) => {
      const m = Math.abs(v);
      return m < dead ? 0 : Math.sign(v) * (m - dead) / (1 - dead);
    };
    let dr = p.roll - neutral.roll;
    let dp = p.pitch - neutral.pitch;
    if (dp > 180) dp -= 360; else if (dp < -180) dp += 360;
    return { x: shape(clamp(dr / range, -1, 1)), y: shape(clamp(-dp / range, -1, 1)) };
  }

  // Press at 0.4, let go at 0.25
  function dpad(x, y, held = new Set()) {
    const out = new Set();
    const test = (v, neg, pos) => {
      if (v < -0.4 || (v < -0.25 && held.has(neg))) out.add(neg);
      else if (v > 0.4 || (v > 0.25 && held.has(pos))) out.add(pos);
    };
    test(y, 4, 5);
    test(x, 6, 7);
    return out;
  }

  // Exponential smoothing: k near 1 = quick, near 0 = smooth
  const smooth = (prev, next, k = 0.35) => prev + (next - prev) * k;

  return { pose, axes, dpad, smooth };
})();

if (typeof module !== 'undefined') module.exports = Tilt;
