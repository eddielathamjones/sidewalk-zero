// Sidewalk Zero — app.js
// V1: data loader only. Scoring, GPS, sound added in V2-V5.

const screen     = document.getElementById('screen');
const loadingView = document.getElementById('loading-view');
const readyView  = document.getElementById('ready-view');
const mainView   = document.getElementById('main-view');
const loadStatus = document.getElementById('load-status');
const incidentCount = document.getElementById('incident-count');
const beginBtn   = document.getElementById('begin-btn');
const readingEl  = document.getElementById('reading');
const muteBtn    = document.getElementById('mute-btn');
const modeBtn    = document.getElementById('mode-btn');

// Packed float32 array: [lat0, lon0, lat1, lon1, ...]
let incidents = null;

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

beginBtn.addEventListener('click', () => {
  readyView.hidden = true;
  mainView.hidden = false;
  // V3: start GPS here
  // V4: unlock audio here
  // V5: request orientation permission here
});

loadIncidents();
