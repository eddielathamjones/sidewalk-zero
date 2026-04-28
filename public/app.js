// Sidewalk Zero — app.js

const screenEl      = document.getElementById('screen');
const loadingView   = document.getElementById('loading-view');
const readyView     = document.getElementById('ready-view');
const mainView      = document.getElementById('main-view');
const loadStatus    = document.getElementById('load-status');
const incidentCount = document.getElementById('incident-count');
const beginBtn      = document.getElementById('begin-btn');
const readingEl     = document.getElementById('reading');
const statusEl      = document.getElementById('status');
const muteBtn       = document.getElementById('mute-btn');
const modeBtn       = document.getElementById('mode-btn');

// --- Tuning constants (adjust during field testing) ---
const REFERENCE_DIST_M = 15;   // score halves at this distance from a fatality
const RADIUS_M         = 500;  // ignore fatalities beyond this
const DISPLAY_SCALE    = 400;  // raw score × DISPLAY_SCALE = display number
const YELLOW_THRESHOLD = 40;   // display number where screen turns amber
const RED_THRESHOLD    = 150;  // display number where screen turns red

// --- Demo coordinates (kept for offline testing) ---
// Pharr TX cluster: 25.92269, -97.43182 → display 999
// 100m offset:      25.92359, -97.43182 → display ~168
// 300m offset:      25.92538, -97.43182 → display ~19

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

// ---- GPS ----

let watchId = null;

function startReading() {
  if (!navigator.geolocation) {
    setStatus('geolocation not available');
    return;
  }

  setStatus('locating...');

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const score = computeScore(latitude, longitude);
      applyScore(score);
      setStatus(accuracy < 20 ? '' : `±${Math.round(accuracy)}m`);
    },
    (err) => {
      setStatus(gpsErrorMessage(err));
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
}

function gpsErrorMessage(err) {
  switch (err.code) {
    case 1: return 'location access denied';
    case 2: return 'location unavailable';
    case 3: return 'location timed out';
    default: return 'location error';
  }
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

loadIncidents();
