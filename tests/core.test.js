// node --test tests/core.test.js

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const {
  distMeters, bearingTo, computeScore, scoreToColor, clickRate, gpsErrorMessage,
  REFERENCE_DIST_M, DISPLAY_SCALE, RED_THRESHOLD,
} = require('../public/core.js');

// ---- distMeters ----

test('distMeters — same point returns 0', () => {
  assert.strictEqual(distMeters(40, -74, 40, -74), 0);
});

test('distMeters — 1 degree of latitude is ~111 km', () => {
  const d = distMeters(40, -74, 41, -74);
  assert.ok(d > 110_000 && d < 112_000, `expected ~111 km, got ${d}`);
});

test('distMeters — 1 degree of longitude at equator is ~111 km', () => {
  const d = distMeters(0, 0, 0, 1);
  assert.ok(d > 110_000 && d < 112_000, `expected ~111 km, got ${d}`);
});

test('distMeters — REFERENCE_DIST_M apart scores 0.5 weight', () => {
  // distMeters doesn't compute weight, but we can verify the distance is real
  const d = distMeters(40, -74, 40 + REFERENCE_DIST_M / 111320, -74);
  assert.ok(Math.abs(d - REFERENCE_DIST_M) < 1, `expected ~${REFERENCE_DIST_M}m, got ${d}`);
});

// ---- bearingTo ----

test('bearingTo — due north is 0°', () => {
  const b = bearingTo(40, -74, 41, -74);
  assert.ok(Math.abs(b - 0) < 1 || Math.abs(b - 360) < 1, `expected ~0°, got ${b}`);
});

test('bearingTo — due south is 180°', () => {
  const b = bearingTo(41, -74, 40, -74);
  assert.ok(Math.abs(b - 180) < 1, `expected ~180°, got ${b}`);
});

test('bearingTo — due east is ~90°', () => {
  const b = bearingTo(40, -74, 40, -73);
  assert.ok(Math.abs(b - 90) < 1, `expected ~90°, got ${b}`);
});

test('bearingTo — due west is ~270°', () => {
  const b = bearingTo(40, -74, 40, -75);
  assert.ok(Math.abs(b - 270) < 1, `expected ~270°, got ${b}`);
});

test('bearingTo — always returns value in [0, 360)', () => {
  const cases = [
    [40, -74, 41, -73],
    [41, -73, 40, -74],
    [0, 0, -1, -1],
  ];
  for (const [a, b, c, d] of cases) {
    const bearing = bearingTo(a, b, c, d);
    assert.ok(bearing >= 0 && bearing < 360, `bearing ${bearing} out of range`);
  }
});

// ---- computeScore ----

test('computeScore — null incidents returns 0', () => {
  assert.strictEqual(computeScore(40, -74, null, 1750, null), 0);
});

test('computeScore — empty incidents returns 0', () => {
  assert.strictEqual(computeScore(40, -74, new Float32Array([]), 1750, null), 0);
});

test('computeScore — incident at same location scores ~1.0 raw', () => {
  const inc = new Float32Array([40, -74]);
  const score = computeScore(40, -74, inc, 1750, null);
  // At d=0: w = 1/(1+0) = 1.0
  assert.ok(Math.abs(score - 1.0) < 0.01, `expected ~1.0, got ${score}`);
});

test('computeScore — incident beyond radius is ignored', () => {
  const inc = new Float32Array([40, -74]);
  // Place user 2000m away (radius is 500m)
  const userLat = 40 + 2000 / 111320;
  const score = computeScore(userLat, -74, inc, 500, null);
  assert.strictEqual(score, 0);
});

test('computeScore — incident at REFERENCE_DIST_M scores 0.5', () => {
  const incLat = 40 + REFERENCE_DIST_M / 111320;
  const inc = new Float32Array([incLat, -74]);
  const score = computeScore(40, -74, inc, 1750, null);
  // w = 1/(1 + R²/R²) = 0.5
  assert.ok(Math.abs(score - 0.5) < 0.01, `expected ~0.5, got ${score}`);
});

test('computeScore — directional: ahead scores higher than behind', () => {
  // Incident is due north of user
  const incLat = 40 + 100 / 111320;
  const inc = new Float32Array([incLat, -74]);

  // Heading north (0°) — incident is directly ahead
  const scoreAhead = computeScore(40, -74, inc, 1750, 0);
  // Heading south (180°) — incident is directly behind
  const scoreBehind = computeScore(40, -74, inc, 1750, 180);

  assert.ok(scoreAhead > scoreBehind, `ahead (${scoreAhead}) should exceed behind (${scoreBehind})`);
  assert.ok(scoreBehind === 0, `behind score should be 0 (cos(180°)=−1, clamped to 0), got ${scoreBehind}`);
});

test('computeScore — directional: beside (90°) scores 0', () => {
  // Incident is due north, user is heading east (90°)
  const incLat = 40 + 100 / 111320;
  const inc = new Float32Array([incLat, -74]);
  const score = computeScore(40, -74, inc, 1750, 90);
  assert.ok(score < 0.01, `beside score should be ~0, got ${score}`);
});

test('computeScore — multiple incidents accumulate', () => {
  const inc = new Float32Array([40, -74, 40, -74, 40, -74]);
  const score = computeScore(40, -74, inc, 1750, null);
  assert.ok(Math.abs(score - 3.0) < 0.01, `3 incidents at same spot expected ~3.0, got ${score}`);
});

// ---- scoreToColor ----

test('scoreToColor — zero is dark green', () => {
  const color = scoreToColor(0);
  assert.ok(color.startsWith('hsl(120,'), `expected green hsl, got ${color}`);
});

test('scoreToColor — RED_THRESHOLD is red', () => {
  const color = scoreToColor(RED_THRESHOLD);
  assert.ok(color.startsWith('hsl(0,'), `expected red hsl, got ${color}`);
});

test('scoreToColor — value beyond RED_THRESHOLD clamps to red', () => {
  const color1 = scoreToColor(RED_THRESHOLD);
  const color2 = scoreToColor(RED_THRESHOLD * 10);
  assert.strictEqual(color1, color2);
});

test('scoreToColor — returns a valid hsl() string', () => {
  const color = scoreToColor(200);
  assert.match(color, /^hsl\(\d+, \d+%, \d+%\)$/);
});

// ---- clickRate ----

test('clickRate — display 0 returns 0', () => {
  assert.strictEqual(clickRate(0), 0);
});

test('clickRate — display 999 returns 14', () => {
  assert.strictEqual(clickRate(999), 14);
});

test('clickRate — monotonically increases', () => {
  let prev = 0;
  for (let d = 1; d <= 999; d += 50) {
    const rate = clickRate(d);
    assert.ok(rate >= prev, `rate not monotonic at display=${d}`);
    prev = rate;
  }
});

// ---- gpsErrorMessage ----

test('gpsErrorMessage — code 1 is access denied', () => {
  assert.strictEqual(gpsErrorMessage({ code: 1 }), 'location access denied');
});

test('gpsErrorMessage — code 2 is unavailable', () => {
  assert.strictEqual(gpsErrorMessage({ code: 2 }), 'location unavailable');
});

test('gpsErrorMessage — code 3 is timed out', () => {
  assert.strictEqual(gpsErrorMessage({ code: 3 }), 'location timed out');
});

test('gpsErrorMessage — unknown code is generic error', () => {
  assert.strictEqual(gpsErrorMessage({ code: 99 }), 'location error');
});
