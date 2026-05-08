// Sidewalk Zero — core.js
// Pure functions with no DOM or browser API dependencies.

const REFERENCE_DIST_M = 129;  // score halves at this distance from a fatality
const DISPLAY_SCALE    = 320;  // raw score × DISPLAY_SCALE = display number
const YELLOW_THRESHOLD = 92;   // display number where screen turns amber
const RED_THRESHOLD    = 418;  // display number where screen turns red

// Flat-earth approximation — accurate to < 0.5% within 1 km, no per-point trig
function distMeters(lat1, lon1, lat2, lon2) {
  const cosLat = Math.cos((lat1 + lat2) * 0.5 * Math.PI / 180);
  const dx = (lon2 - lon1) * cosLat * 111320;
  const dy = (lat2 - lat1) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}

// Compass bearing from point 1 → point 2, degrees 0–360 clockwise from north
function bearingTo(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1R = lat1 * Math.PI / 180;
  const lat2R = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2R);
  const x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Returns raw score. heading degrees 0–360 (null = omni, full weight all directions).
// incidents: Float32Array [lat0, lon0, lat1, lon1, ...]
// radiusM: ignore fatalities beyond this distance
function computeScore(userLat, userLon, incidents, radiusM, heading) {
  if (heading === undefined) heading = null;
  if (!incidents) return 0;
  const R2 = REFERENCE_DIST_M * REFERENCE_DIST_M;
  let score = 0;
  for (let i = 0; i < incidents.length; i += 2) {
    const iLat = incidents[i];
    const iLon = incidents[i + 1];
    const d = distMeters(userLat, userLon, iLat, iLon);
    if (d > radiusM) continue;
    let w = 1 / (1 + (d * d) / R2);
    if (heading !== null && d > 10) {
      const b    = bearingTo(userLat, userLon, iLat, iLon);
      const diff = ((b - heading + 540) % 360) - 180;  // –180..+180
      w *= Math.max(0, Math.cos(diff * Math.PI / 180)); // 1 ahead, 0 beside, 0 behind
    }
    score += w;
  }
  return score;
}

// Maps display value [0..∞] to an HSL background color.
// 0 → dark green, YELLOW_THRESHOLD → dark amber, RED_THRESHOLD → dark red
function scoreToColor(val) {
  const t = Math.min(1, val / RED_THRESHOLD);
  const hue   = Math.round(120 - 120 * t);  // 120 (green) → 0 (red)
  const sat   = Math.round(40  + 45  * t);  // 40% → 85%
  const light = Math.round(6   + 14  * t);  // 6% → 20%
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// Quadratic curve: sparse at low scores, 14/sec at max
function clickRate(display) {
  if (display === 0) return 0;
  return 14 * Math.pow(display / 999, 2);
}

function gpsErrorMessage(err) {
  switch (err.code) {
    case 1: return 'location access denied';
    case 2: return 'location unavailable';
    case 3: return 'location timed out';
    default: return 'location error';
  }
}

// Node.js compat — no-op in browser
if (typeof module !== 'undefined') {
  module.exports = {
    distMeters,
    bearingTo,
    computeScore,
    scoreToColor,
    clickRate,
    gpsErrorMessage,
    REFERENCE_DIST_M,
    DISPLAY_SCALE,
    YELLOW_THRESHOLD,
    RED_THRESHOLD,
  };
}
