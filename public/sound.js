// Sidewalk Zero — sound.js (sound lab)

// --- State ---
let P = {
  score    : 200,
  maxRate  : 25,
  clickLen : 12,
  rateDiv  : 8,
  minFreq  : 80,
  maxFreq  : 1000,
  maxGain  : 0.25,
  wave     : 'sawtooth',
  mode     : 'click',
};

let playing    = false;
let audioCtx   = null;
let clickTimer = null;
let toneOsc    = null;
let toneGain   = null;

// --- DOM refs ---
const displayEl  = document.getElementById('display');
const scoreNum   = document.getElementById('score-num');
const rateOut    = document.getElementById('rate-readout');
const ctxState   = document.getElementById('ctx-state');
const startBtn   = document.getElementById('start-btn');
const modeOpts   = document.querySelectorAll('.mode-opt');
const clickSect  = document.getElementById('click-params');
const toneSect   = document.getElementById('tone-params');

// --- scoreToColor (mirrors app.js, uses RED_THRESHOLD = 418) ---
function scoreToColor(val) {
  const RED = 418;
  const t     = Math.min(1, val / RED);
  const hue   = Math.round(120 - 120 * t);
  const sat   = Math.round(40  + 45  * t);
  const light = Math.round(6   + 14  * t);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// --- Audio init (must be called from user gesture) ---
async function initAudio() {
  if (audioCtx) { await audioCtx.resume(); return; }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume();

  toneOsc  = audioCtx.createOscillator();
  toneGain = audioCtx.createGain();
  toneOsc.type = P.wave;
  toneOsc.frequency.value = P.minFreq;
  toneGain.gain.value = 0;
  toneOsc.connect(toneGain);
  toneGain.connect(audioCtx.destination);
  toneOsc.start();
}

// --- Click engine ---
function fireClick() {
  if (!audioCtx) return;
  const len = Math.floor(audioCtx.sampleRate * (P.clickLen / 1000));
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

function stopClicks() {
  if (clickTimer) { clearInterval(clickTimer); clickTimer = null; }
}

function applyClicks() {
  stopClicks();
  if (!playing || P.mode !== 'click') return;
  const rate = P.score === 0 ? 0 : Math.max(0.2, Math.min(P.maxRate, P.score / P.rateDiv));
  if (rate > 0) clickTimer = setInterval(fireClick, 1000 / rate);
  updateRateReadout(rate);
}

// --- Tone engine ---
function applyTone() {
  if (!audioCtx || P.mode !== 'tone') return;
  const t    = Math.min(1, P.score / 999);
  const freq = P.minFreq + t * (P.maxFreq - P.minFreq);
  const gain = P.score === 0 ? 0 : Math.max(0.04, t * P.maxGain);
  toneOsc.type = P.wave;
  toneOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.1);
  if (playing) {
    toneGain.gain.setTargetAtTime(gain, audioCtx.currentTime, 0.1);
    updateRateReadout(`${Math.round(freq)} Hz`);
  } else {
    toneGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    rateOut.textContent = '';
  }
}

function silenceTone() {
  if (toneGain) toneGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
}

// --- Unified update ---
function update() {
  scoreNum.textContent = P.score;
  displayEl.style.backgroundColor = playing ? scoreToColor(P.score) : '#0d0d0d';

  if (!playing) {
    stopClicks();
    if (audioCtx) silenceTone();
    rateOut.textContent = '';
    return;
  }

  if (P.mode === 'click') {
    silenceTone();
    applyClicks();
  } else {
    stopClicks();
    applyTone();
  }
}

function updateRateReadout(val) {
  rateOut.textContent = typeof val === 'number'
    ? (val === 0 ? 'silent' : `${val.toFixed(1)} clicks / sec`)
    : val;
}

// --- Start / Stop ---
startBtn.addEventListener('click', async () => {
  await initAudio();
  ctxState.textContent = `ctx: ${audioCtx.state}`;
  playing = !playing;
  startBtn.textContent = playing ? 'STOP' : 'START';
  startBtn.classList.toggle('playing', playing);
  if (playing) fireClick();  // immediate feedback click
  update();
});

// --- Mode toggle ---
modeOpts.forEach(btn => {
  btn.addEventListener('click', () => {
    P.mode = btn.dataset.mode;
    modeOpts.forEach(b => b.classList.toggle('active', b === btn));
    clickSect.classList.toggle('hidden', P.mode !== 'click');
    toneSect.classList.toggle('hidden',  P.mode !== 'tone');
    update();
  });
});

// --- Slider wiring ---
const sliderDefs = [
  { id: 'sl-score',   valId: 'val-score',   key: 'score',    fmt: v => v          },
  { id: 'sl-maxrate', valId: 'val-maxrate',  key: 'maxRate',  fmt: v => `${v} /sec`},
  { id: 'sl-clicklen',valId: 'val-clicklen', key: 'clickLen', fmt: v => `${v} ms`  },
  { id: 'sl-ratediv', valId: 'val-ratediv',  key: 'rateDiv',  fmt: v => v          },
  { id: 'sl-minfreq', valId: 'val-minfreq',  key: 'minFreq',  fmt: v => `${v} Hz`  },
  { id: 'sl-maxfreq', valId: 'val-maxfreq',  key: 'maxFreq',  fmt: v => `${v} Hz`  },
  { id: 'sl-maxgain', valId: 'val-maxgain',  key: 'maxGain',  fmt: v => v          },
];

for (const def of sliderDefs) {
  const sl  = document.getElementById(def.id);
  const val = document.getElementById(def.valId);
  sl.addEventListener('input', () => {
    P[def.key] = def.key === 'maxGain' ? parseFloat(sl.value) : parseInt(sl.value, 10);
    val.textContent = def.fmt(def.key === 'maxGain' ? parseFloat(sl.value) : parseInt(sl.value, 10));
    update();
  });
}

// Waveform select
document.getElementById('sel-wave').addEventListener('change', e => {
  P.wave = e.target.value;
  if (toneOsc) toneOsc.type = P.wave;
});

// Initial display
scoreNum.textContent = P.score;
