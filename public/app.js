// Sidewalk Zero — app.js
// Pure math functions live in core.js; this file owns browser state and DOM.

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
const omniBtn       = document.getElementById('omni-btn');
const vibBtn        = document.getElementById('vib-btn');
const radiusSlider  = document.getElementById('radius-slider');
const radiusLabel   = document.getElementById('radius-label');

// --- Demo coordinates (kept for offline testing) ---
// Pharr TX cluster: 25.92269, -97.43182 → display 999
// 100m offset:      25.92359, -97.43182 → display ~168
// 300m offset:      25.92538, -97.43182 → display ~19

// Packed float32 array: [lat0, lon0, lat1, lon1, ...]
let incidents = null;
let RADIUS_M  = 1750;  // ignore fatalities beyond this; updated by slider

// ---- Data loader ----

async function loadIncidents() {
  try {
    const res = await fetch('incidents.bin');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    incidents = new Float32Array(buf);
    const count = incidents.length / 2;
    incidentCount.textContent = count.toLocaleString();
    loadingView.hidden = true;
    readyView.hidden = false;
  } catch (err) {
    loadStatus.textContent = `error: ${err.message}`;
  }
}

// ---- Display ----

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
  if (!navigator.vibrate) vibBtn.classList.add('no-vibrate');
  startReading();
});

// ---- Omni mode ----

let omniMode = true;

omniBtn.addEventListener('click', () => {
  omniMode = !omniMode;
  omniBtn.textContent = omniMode ? 'OMNI' : 'DIR';
  omniBtn.classList.toggle('active', omniMode);
  if (lastLat !== null) applyScore(computeScore(lastLat, lastLon, incidents, RADIUS_M, omniMode ? null : currentHeading));
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
      const score = computeScore(latitude, longitude, incidents, RADIUS_M, omniMode ? null : currentHeading);
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

function setStatus(msg) {
  statusEl.textContent = msg;
}

// ---- Audio ----

let audioCtx    = null;
let soundOn     = true;
let vibOn       = false;
let soundMode   = 'click';   // 'click' | 'tone'
let clickTimer  = null;
let toneOsc     = null;
let toneGain    = null;
let lastDisplay = 0;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();

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
  const len = Math.floor(audioCtx.sampleRate * 0.030);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const src  = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  src.buffer = buf;
  gain.gain.value = 0.8;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start();
  if (vibOn && navigator.vibrate) navigator.vibrate(18);
}

function scheduleNextClick() {
  if (!audioCtx || !soundOn || soundMode !== 'click') return;
  const rate = clickRate(lastDisplay);
  if (rate === 0) return;
  // Poisson process: interarrival times are exponentially distributed
  const delay = -Math.log(Math.random()) / rate * 1000;
  clickTimer = setTimeout(() => {
    fireClick();
    scheduleNextClick();
  }, delay);
}

function stopClicks() {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
}

function updateAudio(display) {
  lastDisplay = display;
  if (!audioCtx || !soundOn) return;

  if (soundMode === 'click') {
    stopClicks();
    scheduleNextClick();
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
  muteBtn.classList.toggle('active', !soundOn);
  if (!soundOn) {
    stopClicks();
    toneGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
  } else {
    updateAudio(lastDisplay);
  }
});

modeBtn.addEventListener('click', () => {
  soundMode = soundMode === 'click' ? 'tone' : 'click';
  modeBtn.textContent = soundMode.toUpperCase();
  if (soundMode === 'tone') {
    stopClicks();
  } else {
    toneGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
  }
  updateAudio(lastDisplay);
});

vibBtn.addEventListener('click', () => {
  vibOn = !vibOn;
  vibBtn.classList.toggle('active', vibOn);
});

radiusSlider.addEventListener('input', () => {
  RADIUS_M = parseInt(radiusSlider.value, 10);
  if (lastLat !== null) applyScore(computeScore(lastLat, lastLon, incidents, RADIUS_M, omniMode ? null : currentHeading));
});

loadIncidents();
