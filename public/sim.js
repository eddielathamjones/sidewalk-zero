// Sidewalk Zero — sim.js (formula simulator)

// --- Live parameter state ---
let P = {
  refDist : 15,
  radius  : 500,
  scale   : 400,
  yellow  : 40,
  red     : 150,
  heading : 0,
  omni    : true,
};

let incidents = null;

// --- DOM refs ---
const scoreNum   = document.getElementById('score-num');
const scoreBox   = document.getElementById('score-box');
const posLat     = document.getElementById('pos-lat');
const posLon     = document.getElementById('pos-lon');
const inRadius   = document.getElementById('in-radius');
const statusMsg  = document.getElementById('status-msg');
const omniCb     = document.getElementById('omni-cb');
const headingRow = document.getElementById('row-heading');

// --- Map ---
const map = L.map('map', { zoomControl: true }).setView([32.22, -110.97], 14);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
  maxZoom: 19,
}).addTo(map);

const canvasRenderer = L.canvas({ padding: 0.5 });
const incidentLayer  = L.layerGroup().addTo(map);

const radiusCircle = L.circle([32.22, -110.97], {
  radius      : P.radius,
  color       : 'rgba(255,255,255,0.35)',
  weight      : 1,
  fill        : false,
  interactive : false,
}).addTo(map);

const headingArrow = L.polyline([], {
  color       : 'rgba(255,255,255,0.6)',
  weight      : 2,
  interactive : false,
}).addTo(map);

const marker = L.marker([32.22, -110.97], {
  draggable : true,
  autoPan   : true,
}).addTo(map);

// --- Math (verbatim from app.js) ---

function distMeters(lat1, lon1, lat2, lon2) {
  const cosLat = Math.cos((lat1 + lat2) * 0.5 * Math.PI / 180);
  const dx = (lon2 - lon1) * cosLat * 111320;
  const dy = (lat2 - lat1) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}

function bearingTo(lat1, lon1, lat2, lon2) {
  const dLon  = (lon2 - lon1) * Math.PI / 180;
  const lat1R = lat1 * Math.PI / 180;
  const lat2R = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2R);
  const x = Math.cos(lat1R) * Math.sin(lat2R)
          - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function scoreToColor(val) {
  const t     = Math.min(1, val / P.red);
  const hue   = Math.round(120 - 120 * t);
  const sat   = Math.round(40  + 45  * t);
  const light = Math.round(6   + 14  * t);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function weightToColor(w) {
  const t = Math.sqrt(Math.min(1, w));
  return `hsl(${Math.round(120 * (1 - t))}, 80%, 50%)`;
}

// --- Core recompute ---

function recompute() {
  if (!incidents) return;

  const ll  = marker.getLatLng();
  const lat = ll.lat;
  const lon = ll.lng;
  const heading = P.omni ? null : P.heading;
  const R2 = P.refDist * P.refDist;

  let score = 0;
  const inRad = [];

  for (let i = 0; i < incidents.length; i += 2) {
    const iLat = incidents[i];
    const iLon = incidents[i + 1];
    const d = distMeters(lat, lon, iLat, iLon);
    if (d > P.radius) continue;

    let w = 1 / (1 + (d * d) / R2);

    if (heading !== null && d > 10) {
      const b    = bearingTo(lat, lon, iLat, iLon);
      const diff = ((b - heading + 540) % 360) - 180;
      w *= Math.max(0, Math.cos(diff * Math.PI / 180));
    }

    score += w;
    inRad.push({ lat: iLat, lon: iLon, w });
  }

  const display = Math.min(999, Math.round(score * P.scale));
  scoreNum.textContent = display;
  scoreBox.style.backgroundColor = scoreToColor(display);

  posLat.textContent = `LAT  ${lat.toFixed(5)}`;
  posLon.textContent = `LON  ${lon.toFixed(5)}`;
  inRadius.textContent = `${inRad.length} incident${inRad.length !== 1 ? 's' : ''} in radius`;

  radiusCircle.setLatLng(ll).setRadius(P.radius);

  if (!P.omni) {
    const RAD    = Math.PI / 180;
    const len    = P.radius * 0.4;
    const cosLat = Math.cos(lat * RAD);
    const headR  = P.heading * RAD;
    const tipLat = lat + (len / 111320) * Math.cos(headR);
    const tipLon = lon + (len / 111320 / cosLat) * Math.sin(headR);
    headingArrow.setLatLngs([[lat, lon], [tipLat, tipLon]]);
  } else {
    headingArrow.setLatLngs([]);
  }

  incidentLayer.clearLayers();
  for (const { lat: iLat, lon: iLon, w } of inRad) {
    L.circleMarker([iLat, iLon], {
      renderer    : canvasRenderer,
      radius      : 5,
      color       : weightToColor(w),
      weight      : 0,
      fillColor   : weightToColor(w),
      fillOpacity : 0.85,
      interactive : false,
    }).addTo(incidentLayer);
  }
}

// --- Slider wiring ---

const sliderDefs = [
  { id: 'sl-ref',     valId: 'val-ref',     key: 'refDist', suffix: 'm' },
  { id: 'sl-radius',  valId: 'val-radius',  key: 'radius',  suffix: 'm' },
  { id: 'sl-scale',   valId: 'val-scale',   key: 'scale',   suffix: ''  },
  { id: 'sl-yellow',  valId: 'val-yellow',  key: 'yellow',  suffix: ''  },
  { id: 'sl-red',     valId: 'val-red',     key: 'red',     suffix: ''  },
  { id: 'sl-heading', valId: 'val-heading', key: 'heading', suffix: '°' },
];

for (const def of sliderDefs) {
  const sl  = document.getElementById(def.id);
  const val = document.getElementById(def.valId);
  sl.addEventListener('input', () => {
    P[def.key] = parseInt(sl.value, 10);
    val.textContent = P[def.key] + def.suffix;
    recompute();
  });
}

omniCb.addEventListener('change', () => {
  P.omni = omniCb.checked;
  headingRow.classList.toggle('disabled', P.omni);
  recompute();
});

marker.on('drag',    recompute);
marker.on('dragend', recompute);

// Initialise heading row as disabled (OMNI is checked by default)
headingRow.classList.add('disabled');

// --- Data load ---

async function loadIncidents() {
  try {
    const res = await fetch('incidents.bin');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    incidents = new Float32Array(buf);
    statusMsg.textContent = `${(incidents.length / 2).toLocaleString()} incidents loaded`;
    recompute();
  } catch (err) {
    statusMsg.textContent = `error: ${err.message}`;
  }
}

loadIncidents();
