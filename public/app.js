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
const radiusSlider  = document.getElementById('radius-slider');
const radiusLabel   = document.getElementById('radius-label');

// --- Tuning constants (adjust during field testing) ---
const REFERENCE_DIST_M = 129;  // score halves at this distance from a fatality
let   RADIUS_M         = 1750; // ignore fatalities beyond this
const DISPLAY_SCALE    = 320;  // raw score × DISPLAY_SCALE = display number
const YELLOW_THRESHOLD = 92;   // display number where screen turns amber
const RED_THRESHOLD    = 418;  // display number where screen turns red

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
function computeScore(userLat, userLon, heading = null) {
  if (!incidents) return 0;
  const R2 = REFERENCE_DIST_M * REFERENCE_DIST_M;
  let score = 0;
  for (let i = 0; i < incidents.length; i += 2) {
    const iLat = incidents[i];
    const iLon = incidents[i + 1];
    const d = distMeters(userLat, userLon, iLat, iLon);
    if (d > RADIUS_M) continue;
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
  updateAudio(display);
}

// ---- Main flow ----

beginBtn.addEventListener('click', () => {
  readyView.hidden = true;
  mainView.hidden = false;
  initAudio();              // must happen inside a user gesture to unlock iOS audio
  requestCompassPermission(); // iOS 13+ requires user gesture for orientation
  startReading();
});

// ---- Compass ----

let currentHeading = null;

async function requestCompassPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result === 'granted') {
        window.addEventListener('deviceorientation', handleOrientation);
      } else {
        console.log('[sw0] orientation permission denied');
      }
    } catch (e) {
      console.log('[sw0] orientation permission error:', e);
    }
  } else {
    // Android / desktop — no permission call needed
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
  }
}

function handleOrientation(e) {
  if (e.webkitCompassHeading != null) {
    // iOS: reliable magnetic heading, 0 = north, clockwise
    currentHeading = e.webkitCompassHeading;
  } else if (e.alpha != null) {
    // Android absolute event: alpha=0 = north, counterclockwise
    currentHeading = (360 - e.alpha) % 360;
  }
}

// ---- GPS ----

let watchId  = null;
let lastLat  = null;
let lastLon  = null;

function startReading() {
  console.log('[sw0] startReading called');
  if (!navigator.geolocation) {
    console.log('[sw0] geolocation not available');
    setStatus('geolocation not available');
    return;
  }

  setStatus('locating...');

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      lastLat = latitude;
      lastLon = longitude;
      console.log(`[sw0] position: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} ±${Math.round(accuracy)}m heading: ${currentHeading}`);
      const score = computeScore(latitude, longitude, currentHeading);
      applyScore(score);
      setStatus(`GPS ±${Math.round(accuracy)}m`);
    },
    (err) => {
      console.log(`[sw0] geolocation error: code=${err.code} message=${err.message}`);
      setStatus(gpsErrorMessage(err));
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );

  console.log('[sw0] watchPosition registered, watchId:', watchId);
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

// ---- Audio ----

let audioCtx    = null;
let soundOn     = true;
let soundMode   = 'click';   // 'click' | 'tone'
let clickTimer  = null;
let toneOsc     = null;
let toneGain    = null;
let lastDisplay = 0;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();

  // Tone engine — always running, gain set to 0 when silent
  toneOsc  = audioCtx.createOscillator();
  toneGain = audioCtx.createGain();
  toneOsc.type = 'sawtooth';
  toneOsc.frequency.value = 80;
  toneGain.gain.value = 0;
  toneOsc.connect(toneGain);
  toneGain.connect(audioCtx.destination);
  toneOsc.start();
}

function fireClick() {
  if (!audioCtx || !soundOn || soundMode !== 'click') return;
  const len = Math.floor(audioCtx.sampleRate * 0.012);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  }
  const src  = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  src.buffer = buf;
  gain.gain.value = 0.5;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start();
}

function updateAudio(display) {
  lastDisplay = display;
  if (!audioCtx || !soundOn) return;

  if (soundMode === 'click') {
    // clicks/sec: 0 when silent, 0.2 minimum when any danger, up to 25 at max
    const rate = display === 0 ? 0 : Math.max(0.2, Math.min(25, display / 8));
    if (clickTimer) { clearInterval(clickTimer); clickTimer = null; }
    if (rate > 0) clickTimer = setInterval(fireClick, 1000 / rate);
  } else {
    // tone: 80 Hz quiet hum → 1000 Hz at max
    const t    = Math.min(1, display / 999);
    const freq = 80 + t * 920;
    const gain = display === 0 ? 0 : Math.max(0.04, t * 0.25);
    toneOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.15);
    toneGain.gain.setTargetAtTime(gain, audioCtx.currentTime, 0.15);
  }
}

muteBtn.addEventListener('click', () => {
  if (!audioCtx) return;
  soundOn = !soundOn;
  muteBtn.textContent = soundOn ? 'MUTE' : 'UNMUTE';
  if (!soundOn) {
    if (clickTimer) { clearInterval(clickTimer); clickTimer = null; }
    toneGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
  } else {
    updateAudio(lastDisplay);
  }
});

modeBtn.addEventListener('click', () => {
  soundMode = soundMode === 'click' ? 'tone' : 'click';
  modeBtn.textContent = soundMode.toUpperCase();
  // Silence whichever engine we're leaving
  if (soundMode === 'tone') {
    if (clickTimer) { clearInterval(clickTimer); clickTimer = null; }
  } else {
    toneGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
  }
  updateAudio(lastDisplay);
});

radiusSlider.addEventListener('input', () => {
  RADIUS_M = parseInt(radiusSlider.value, 10);
  radiusLabel.textContent = `RADIUS: ${RADIUS_M}m`;
  if (lastLat !== null) applyScore(computeScore(lastLat, lastLon, currentHeading));
});

loadIncidents();
