// Sidewalk Zero — app.js

const screenEl      = document.getElementById('screen');
const loadingView   = document.getElementById('loading-view');
const readyView     = document.getElementById('ready-view');
const mainView      = document.getElementById('main-view');
const loadStatus    = document.getElementById('load-status');
const incidentCount = document.getElementById('incident-count');
const beginBtn      = document.getElementById('begin-btn');
const readingEl     = document.getElementById('reading');
const muteBtn       = document.getElementById('mute-btn');
const modeBtn       = document.getElementById('mode-btn');

// --- Tuning constants (adjust during field testing) ---
const REFERENCE_DIST_M = 15;   // score halves at this distance from a fatality
const RADIUS_M         = 500;  // ignore fatalities beyond this
const DISPLAY_SCALE    = 400;  // raw score × DISPLAY_SCALE = display number
const YELLOW_THRESHOLD = 40;   // display number where screen turns amber
const RED_THRESHOLD    = 150;  // display number where screen turns red

// --- Demo location (V2 only — replaced by GPS in V3) ---
// Pharr, TX (US-83 corridor) — 100m from a 2023 fatality cluster.
// Move DEMO_LAT to 25.92269 to stand on the hotspot and see 999.
// Move it to 25.92538 to see the green zone (~19).
const DEMO_LAT = 25.92359;
const DEMO_LON = -97.43182;

// Packed float32 array: [lat0, lon0, lat1, lon1, ...]
let incidents = null;

// ---- Data loader ----

async function loadIncidents() {
  try {
    const res = await fetch('incidents.bin');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    incidents = new Float32Array(buf);
    const count = incidents.length / 2;
    incidentCount.textContent = `${count.toLocaleString()} incidents loaded`;
    loadingView.hidden = true;
    readyView.hidden = false;
  } catch (err) {
    loadStatus.textContent = `error: ${err.message}`;
  }
}

// ---- Scoring engine ----

// Flat-earth approximation — accurate to < 0.5% within 1 km, no per-point trig
function distMeters(lat1, lon1, lat2, lon2) {
  const cosLat = Math.cos((lat1 + lat2) * 0.5 * Math.PI / 180);
  const dx = (lon2 - lon1) * cosLat * 111320;
  const dy = (lat2 - lat1) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}

// Returns raw score. heading is degrees 0-360 (null = no directional weighting, added in V5).
function computeScore(userLat, userLon, heading = null) {
  if (!incidents) return 0;
  const R2 = REFERENCE_DIST_M * REFERENCE_DIST_M;
  let score = 0;
  for (let i = 0; i < incidents.length; i += 2) {
    const d = distMeters(userLat, userLon, incidents[i], incidents[i + 1]);
    if (d > RADIUS_M) continue;
    score += 1 / (1 + (d * d) / R2);
    // V5: multiply by directional weight here
  }
  return score;
}

// ---- Display ----

// Maps display value [0..∞] to an HSL background color.
// 0 → dark green, YELLOW_THRESHOLD → dark amber, RED_THRESHOLD → dark red
function scoreToColor(val) {
  const t = Math.min(1, val / RED_THRESHOLD);
  const hue   = Math.round(120 - 120 * t);  // 120 (green) → 0 (red)
  const sat   = Math.round(40  + 45  * t);  // 40% → 85%
  const light = Math.round(6   + 14  * t);  // 6% → 20%
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function applyScore(score) {
  const display = Math.min(999, Math.round(score * DISPLAY_SCALE));
  readingEl.textContent = display;
  screenEl.style.backgroundColor = scoreToColor(display);
}

// ---- Main flow ----

beginBtn.addEventListener('click', () => {
  readyView.hidden = true;
  mainView.hidden = false;
  startReading();
});

function startReading() {
  // V3: replace body of this function with GPS watchPosition
  const score = computeScore(DEMO_LAT, DEMO_LON);
  applyScore(score);
}

loadIncidents();
