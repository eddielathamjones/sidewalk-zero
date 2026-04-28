// Sidewalk Zero — sound.js (sound lab)

// --- State (defaults mirror current app.js) ---
let P = {
  score    : 200,
  maxRate  : 4,     // clicks/sec at score 999
  rateExp  : 2.0,   // curve shape: 1=linear, 2=quadratic, 3=cubic
  clickLen : 30,    // ms
  decayExp : 3.0,   // envelope decay: low=baritone, high=crisp
  clickGain: 0.8,
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

// --- scoreToColor (mirrors app.js) ---
function scoreToColor(val) {
  const t     = Math.min(1, val / 418);
  const hue   = Math.round(120 - 120 * t);
  const sat   = Math.round(40  + 45  * t);
  const light = Math.round(6   + 14  * t);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// --- Audio init ---
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
function clickRate(score) {
  if (score === 0) return 0;
  return P.maxRate * Math.pow(score / 999, P.rateExp);
}

function fireClick() {
  if (!audioCtx) return;
  const len = Math.floor(audioCtx.sampleRate * (P.clickLen / 1000));
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, P.decayExp);
  }
  const src  = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  src.buffer = buf;
  gain.gain.value = P.clickGain;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start();
}

function stopClicks() {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
}

function scheduleNextClick() {
  if (!playing || P.mode !== 'click') return;
  const rate = clickRate(P.score);
  if (rate === 0) { updateRateReadout(0); return; }
  const delay = -Math.log(Math.random()) / rate * 1000;
  clickTimer = setTimeout(() => {
    fireClick();
    scheduleNextClick();
  }, delay);
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
  toneGain.gain.setTargetAtTime(playing ? gain : 0, audioCtx.currentTime, 0.1);
  updateRateReadout(`${Math.round(freq)} Hz`);
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
    stopClicks();
    scheduleNextClick();
  } else {
    stopClicks();
    applyTone();
  }
}

function updateRateReadout(val) {
  rateOut.textContent = typeof val === 'number'
    ? (val === 0 ? 'silent' : `${val.toFixed(2)} clicks / sec`)
    : val;
}

// --- Start / Stop ---
startBtn.addEventListener('click', async () => {
  await initAudio();
  ctxState.textContent = `ctx: ${audioCtx.state}`;
  playing = !playing;
  startBtn.textContent = playing ? 'STOP' : 'START';
  startBtn.classList.toggle('playing', playing);
  if (playing) fireClick();
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
  { id: 'sl-score',     valId: 'val-score',     key: 'score',     fmt: v => v,              parse: 'int'   },
  { id: 'sl-maxrate',   valId: 'val-maxrate',   key: 'maxRate',   fmt: v => `${v} /sec`,    parse: 'float' },
  { id: 'sl-rateexp',   valId: 'val-rateexp',   key: 'rateExp',   fmt: v => v,              parse: 'float' },
  { id: 'sl-clicklen',  valId: 'val-clicklen',  key: 'clickLen',  fmt: v => `${v} ms`,      parse: 'int'   },
  { id: 'sl-decayexp',  valId: 'val-decayexp',  key: 'decayExp',  fmt: v => v,              parse: 'float' },
  { id: 'sl-clickgain', valId: 'val-clickgain', key: 'clickGain', fmt: v => v,              parse: 'float' },
  { id: 'sl-minfreq',   valId: 'val-minfreq',   key: 'minFreq',   fmt: v => `${v} Hz`,      parse: 'int'   },
  { id: 'sl-maxfreq',   valId: 'val-maxfreq',   key: 'maxFreq',   fmt: v => `${v} Hz`,      parse: 'int'   },
  { id: 'sl-maxgain',   valId: 'val-maxgain',   key: 'maxGain',   fmt: v => v,              parse: 'float' },
];

for (const def of sliderDefs) {
  const sl  = document.getElementById(def.id);
  const val = document.getElementById(def.valId);
  sl.addEventListener('input', () => {
    const v = def.parse === 'float' ? parseFloat(sl.value) : parseInt(sl.value, 10);
    P[def.key] = v;
    val.textContent = def.fmt(v);
    update();
  });
}

document.getElementById('sel-wave').addEventListener('change', e => {
  P.wave = e.target.value;
  if (toneOsc) toneOsc.type = P.wave;
});

scoreNum.textContent = P.score;
