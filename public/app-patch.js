// app-patch.js — Sidewalk Zero v9
// Patches the visual layer without touching app.js logic.
// Load AFTER app.js in index.html.
//
// Changes from v8:
//   1. scoreToBackground() — radial glow instead of flat bg color
//   2. Glow jitter — Poisson-interval micro-fluctuations on #glow-inner
//   3. Meter fill + text-shadow + mode dot update with score
//   4. Sensitivity segmented bar synced to #radius-slider
//   5. Hold-to-begin on #begin-btn
//   6. MUTE / VIB toggle visual state sync

(function () {
  'use strict';

  /* ── DOM refs ───────────────────────────────────────────── */
  const screenEl      = document.getElementById('screen');
  const glowInner     = document.getElementById('glow-inner');
  const glowHalo      = document.getElementById('glow-halo');
  const meterFill     = document.getElementById('meter-fill');
  const modeDot       = document.getElementById('mode-dot');
  const modeBtn       = document.getElementById('mode-btn');
  const muteBtn       = document.getElementById('mute-btn');
  const vibBtn        = document.getElementById('vib-btn');
  const beginBtn      = document.getElementById('begin-btn');
  const beginText     = document.getElementById('begin-text');
  const beginFill     = document.getElementById('begin-fill');
  const radiusSlider  = document.getElementById('radius-slider');
  const sensitivityValue = document.getElementById('sensitivity-value');
  const ssegEls       = document.querySelectorAll('.sseg');
  const readingEl     = document.getElementById('reading');
  const loadSegs      = document.querySelectorAll('#load-bar .seg');

  /* ── Color helpers ──────────────────────────────────────── */
  function hslForScore(val) {
    const t   = Math.min(1, val / 999);
    const hue = Math.round(120 - 120 * t);
    const sat = Math.round(45  + 45  * t);
    const lit = Math.round(8   + 16  * t);
    return { hue, sat, lit, t };
  }

  function accentCSS(val) {
    const { hue, sat } = hslForScore(val);
    return `hsl(${hue}, ${sat}%, 52%)`;
  }

  /* ── 1. Background: override app.js scoreToColor ───────── */
  // app.js sets screenEl.style.backgroundColor via scoreToColor().
  // We null that out and drive the glow layers ourselves.
  // Intercept by patching applyScore's visual side-effect.

  const _origApplyScore = window.applyScore;

  function applyGlow(display) {
    const { hue, sat, lit, t } = hslForScore(display);

    // inner radial glow
    const innerLit   = Math.round(lit * 2.2);
    const glowAlpha  = (0.55 + 0.45 * t).toFixed(2);
    glowInner.style.background =
      `radial-gradient(ellipse 75% 65% at 50% 44%, ` +
      `hsla(${hue},${sat}%,${innerLit}%,${glowAlpha}) 0%, #080806 68%)`;

    // halo (edge color)
    const edgeR = hue < 60 ? '80,20,0' : hue < 90 ? '60,60,0' : '0,40,0';
    const edgeA = (0.12 + 0.2 * t).toFixed(2);
    glowHalo.style.background =
      `radial-gradient(ellipse 95% 85% at 50% 44%, ` +
      `transparent 50%, rgba(${edgeR},${edgeA}) 100%)`;

    // clear the flat bg set by app.js
    screenEl.style.backgroundColor = 'transparent';

    // meter fill
    const accent = accentCSS(display);
    meterFill.style.width      = `${(display / 999) * 100}%`;
    meterFill.style.background = accent;
    meterFill.style.boxShadow  = `0 0 10px ${accent}99`;

    // number text-shadow
    readingEl.style.textShadow =
      `0 0 80px ${accent}66, 0 0 20px ${accent}33, 0 2px 0 rgba(0,0,0,0.5)`;

    // mode dot color
    modeDot.style.background = accent;
    modeDot.style.boxShadow  = `0 0 8px ${accent}`;
  }

  // Monkey-patch applyScore if it exists; also works if app.js calls
  // screenEl.style.backgroundColor directly (we clear it each frame).
  const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
  let lastDisplay = 0;

  // Poll approach: watch #reading for changes and re-apply glow.
  // This avoids patching app.js internals.
  const observer = new MutationObserver(() => {
    const val = parseInt(readingEl.textContent, 10);
    if (!isNaN(val) && val !== lastDisplay) {
      lastDisplay = val;
      applyGlow(val);
    }
    // always clear flat bg
    screenEl.style.backgroundColor = 'transparent';
  });
  observer.observe(readingEl, { childList: true, subtree: true, characterData: true });

  /* ── 2. Glow jitter ─────────────────────────────────────── */
  // Poisson-interval micro-fluctuations on the inner glow layer.
  (function scheduleJitter() {
    const delay = 200 + Math.random() * 700;
    setTimeout(() => {
      const scaleX = 1 + (Math.random() - 0.5) * 0.06;
      const scaleY = 1 + (Math.random() - 0.5) * 0.06;
      const alpha  = 1 + (Math.random() - 0.5) * 0.18;
      glowInner.style.transform = `scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`;
      glowInner.style.opacity   = alpha.toFixed(3);
      scheduleJitter();
    }, delay);
  })();

  /* ── 3. Hold-to-begin ───────────────────────────────────── */
  const HOLD_MS = 1400;
  let holdTimer = null;
  let isActivated = false;

  function startHold() {
    if (isActivated) return;
    beginBtn.classList.add('holding');
    beginBtn.style.setProperty('--hold-ms', HOLD_MS + 'ms');
    beginText.textContent = 'HOLD\u2026';
    holdTimer = setTimeout(() => {
      isActivated = true;
      beginBtn.classList.remove('holding');
      beginBtn.classList.add('activated');
      beginText.textContent = 'ACTIVE';
      // trigger the original click behaviour
      beginBtn.dispatchEvent(new Event('_begin_activate'));
    }, HOLD_MS);
  }

  function endHold() {
    if (isActivated) return;
    beginBtn.classList.remove('holding');
    beginText.textContent = 'BEGIN';
    clearTimeout(holdTimer);
  }

  if (beginBtn) {
    beginBtn.addEventListener('mousedown',  startHold);
    beginBtn.addEventListener('touchstart', startHold, { passive: true });
    beginBtn.addEventListener('mouseup',    endHold);
    beginBtn.addEventListener('mouseleave', endHold);
    beginBtn.addEventListener('touchend',   endHold);

    // app.js listens for 'click' on #begin-btn.
    // We re-fire a click when activated so it still works.
    beginBtn.addEventListener('_begin_activate', () => {
      beginBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  /* ── 4. Sensitivity segmented bar ──────────────────────── */
  // Sensitivity levels: map slider value (50–5000) to 0–8 segments.
  // Low  = high sensitivity (small radius) → more segs lit
  // High = low sensitivity (large radius) → fewer segs lit
  // We invert so the bar feels like "how tuned-in you are"
  const SEG_LABELS = ['LOW', 'LOW-MED', 'MED', 'MED', 'MED', 'MED-HIGH', 'HIGH', 'HIGH', 'MAX'];
  const SEG_NAMES  = ['LOW', 'MED', 'HIGH'];

  function updateSensitivity() {
    const v     = parseInt(radiusSlider.value, 10); // 50–5000
    const norm  = (v - 50) / (5000 - 50);           // 0(low/small) → 1(high/large)
    const segs  = Math.round(norm * 8);              // 0–8 segs lit

    ssegEls.forEach((el, i) => {
      el.classList.toggle('lit', i <= segs);
    });

    // label
    if (norm < 0.33)       sensitivityValue.textContent = 'LOW';
    else if (norm < 0.66)  sensitivityValue.textContent = 'MED';
    else                   sensitivityValue.textContent = 'HIGH';
  }

  if (radiusSlider) {
    radiusSlider.addEventListener('input', updateSensitivity);

    // Touch/click on the visual segment bar adjusts slider
    const segWrap = document.getElementById('sensitivity-segs');
    if (segWrap) {
      function handleSegTouch(e) {
        const rect = segWrap.getBoundingClientRect();
        const cx   = (e.touches ? e.touches[0].clientX : e.clientX);
        const pct  = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
        const val  = Math.round(50 + pct * (5000 - 50));
        radiusSlider.value = val;
        radiusSlider.dispatchEvent(new Event('input', { bubbles: true }));
        updateSensitivity();
      }
      segWrap.addEventListener('click',      handleSegTouch);
      segWrap.addEventListener('touchstart', handleSegTouch, { passive: true });
      segWrap.style.cursor = 'pointer';
    }

    updateSensitivity(); // initial state
  }

  /* ── 5. Loading bar segments ─────────────────────────────── */
  // app.js updates #load-status text. We watch it and animate segs.
  const loadStatus = document.getElementById('load-status');
  if (loadStatus && loadSegs.length) {
    const loadObserver = new MutationObserver(() => {
      const text = loadStatus.textContent || '';
      const match = text.match(/(\d+)/);
      const pct   = match ? parseInt(match[1], 10) : 0;
      const lit   = Math.round((pct / 100) * 9);
      loadSegs.forEach((seg, i) => seg.classList.toggle('lit', i < lit));
    });
    loadObserver.observe(loadStatus, { childList: true, characterData: true, subtree: true });
  }

  /* ── 6. MUTE / VIB toggle visual sync ───────────────────── */
  // app.js toggles classes on buttons — we just mirror .active → .toggle-btn.active
  // The existing .active class triggers our CSS, so this is handled automatically.
  // However, app.js adds .active on omni-btn; mute/vib need manual wiring.

  // Re-map button visuals: app.js calls btn.classList.toggle('active', …)
  // on mute/vib already — our CSS picks that up on .toggle-btn.active.
  // Nothing extra needed unless the markup diverges.

  // Mode btn: app.js sets modeBtn.textContent to 'CLICK' or 'TONE'
  // The mode dot color is driven by score (already wired above).
  // We just ensure font stays Bebas on text change.
  if (modeBtn) {
    const modeObserver = new MutationObserver(() => {
      // keep label uppercase, font is Bebas via CSS
    });
    modeObserver.observe(modeBtn, { childList: true, characterData: true, subtree: true });
  }

})();
