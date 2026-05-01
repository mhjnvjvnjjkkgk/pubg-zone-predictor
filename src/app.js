import { ZoneEngine } from './engine.js';
import { HeatmapRenderer } from './heatmap.js';
import { ZonePredictor } from './predictor.js';

const MAP_SIZE = 8000;
const ZONE_COLORS = ['#f0c040','#4af0ff','#ff8c44','#c44dff','#44ff8c'];

const engine    = new ZoneEngine();
const heatmap   = new HeatmapRenderer(300);
const predictor = new ZonePredictor();

// ── DOM ──────────────────────────────────────────────────────────────────────
const mapCanvas     = document.getElementById('mapCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const mapCtx        = mapCanvas.getContext('2d');
const ovCtx         = overlayCanvas.getContext('2d');
const mapHint       = document.getElementById('mapHint');
const predictBtn    = document.getElementById('predictBtn');
const resetBtn      = document.getElementById('resetBtn');
const statusTag     = document.getElementById('statusTag');
const mapBadge      = document.querySelector('.map-badge');
const bestZonePanel = document.getElementById('bestZonePanel');
const phaseWindows  = document.getElementById('phaseWindows');
const bzConfidence  = document.getElementById('bzConfidence');
const bzCoords      = document.getElementById('bzCoords');
const bzSub         = document.getElementById('bzSub');
const bzRing        = document.getElementById('bzRing');
const drawnZonesList = document.getElementById('drawnZonesList');
const uncertaintyOverlay = document.getElementById('uncertaintyOverlay');
const uncBar        = document.getElementById('uncBar');
const uncPct        = document.getElementById('uncPct');
const footerNote    = document.getElementById('footerNote');

// ── State ────────────────────────────────────────────────────────────────────
let mapImg       = null;
let drawnZones   = [];    // [{phase,cx,cy,r}]
let activePhase  = 1;
let drawState    = null;  // {startX,startY} while dragging
let currentDraw  = null;  // zone being drawn (live preview)
let simResults   = null;
let predictions  = null;
let iterations   = 10000;
let showHeatmap  = true, showPaths = true, showZones = true, centerBias = true;

// ── Map loading ───────────────────────────────────────────────────────────────
function loadMap() {
  const img = new Image();
  img.onload  = () => { mapImg = img; resize(); renderMap(); };
  img.onerror = () => { mapImg = null; resize(); renderMap(); };
  img.src = './assets/erangel.png';
}

// ── Resize ────────────────────────────────────────────────────────────────────
function resize() {
  const wrap = document.getElementById('mapWrap');
  const { width, height } = wrap.getBoundingClientRect();
  [mapCanvas, overlayCanvas].forEach(c => { c.width = width; c.height = height; });
  renderMap();
  renderOverlay();
}
window.addEventListener('resize', resize);

// ── Coordinate transforms ─────────────────────────────────────────────────────
function w2c(wx, wy) {
  return { x: (wx / MAP_SIZE) * overlayCanvas.width, y: (wy / MAP_SIZE) * overlayCanvas.height };
}
function c2w(cx, cy) {
  return { x: (cx / overlayCanvas.width) * MAP_SIZE, y: (cy / overlayCanvas.height) * MAP_SIZE };
}
function wr2c(wr) { return (wr / MAP_SIZE) * overlayCanvas.width; }

// ── Map render ────────────────────────────────────────────────────────────────
function renderMap() {
  const W = mapCanvas.width, H = mapCanvas.height;
  mapCtx.clearRect(0, 0, W, H);
  if (mapImg) {
    mapCtx.drawImage(mapImg, 0, 0, W, H);
    mapCtx.fillStyle = 'rgba(0,0,0,0.30)';
    mapCtx.fillRect(0, 0, W, H);
  } else {
    mapCtx.fillStyle = '#1a2d1a';
    mapCtx.fillRect(0, 0, W, H);
  }
  // Grid
  mapCtx.strokeStyle = 'rgba(255,255,255,0.055)';
  mapCtx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    const x = W / 8 * i, y = H / 8 * i;
    mapCtx.beginPath(); mapCtx.moveTo(x,0); mapCtx.lineTo(x,H); mapCtx.stroke();
    mapCtx.beginPath(); mapCtx.moveTo(0,y); mapCtx.lineTo(W,y); mapCtx.stroke();
  }
}

// ── Overlay render ────────────────────────────────────────────────────────────
function renderOverlay() {
  const W = overlayCanvas.width, H = overlayCanvas.height;
  ovCtx.clearRect(0, 0, W, H);

  if (simResults && showHeatmap) heatmap.render(ovCtx, 0.72);
  if (simResults && showPaths && simResults.samplePaths) drawPaths(simResults.samplePaths);
  if (predictions && showZones) drawPredictions();
  drawnZones.forEach(z => drawZoneRing(z));
  if (currentDraw) drawZoneRing(currentDraw, true);
}

function drawZoneRing(z, isPreview = false) {
  const p = w2c(z.cx, z.cy);
  const cr = wr2c(z.r);
  const color = ZONE_COLORS[(z.phase || 1) - 1] || '#fff';

  // Glow fill
  const grad = ovCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, cr);
  grad.addColorStop(0, hexToRgba(color, 0.06));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ovCtx.fillStyle = grad;
  ovCtx.beginPath(); ovCtx.arc(p.x, p.y, cr, 0, Math.PI*2); ovCtx.fill();

  // Ring
  ovCtx.strokeStyle = color;
  ovCtx.lineWidth = isPreview ? 2 : 2.5;
  ovCtx.setLineDash(isPreview ? [5,5] : [10,7]);
  ovCtx.shadowColor = color; ovCtx.shadowBlur = isPreview ? 6 : 14;
  ovCtx.globalAlpha = isPreview ? 0.6 : 1;
  ovCtx.beginPath(); ovCtx.arc(p.x, p.y, cr, 0, Math.PI*2); ovCtx.stroke();
  ovCtx.setLineDash([]); ovCtx.shadowBlur = 0; ovCtx.globalAlpha = 1;

  // Center dot
  ovCtx.fillStyle = color;
  ovCtx.beginPath(); ovCtx.arc(p.x, p.y, isPreview ? 3 : 5, 0, Math.PI*2); ovCtx.fill();

  // Label
  if (!isPreview) {
    ovCtx.font = '600 11px Outfit,sans-serif';
    ovCtx.fillStyle = color;
    ovCtx.shadowColor = '#000'; ovCtx.shadowBlur = 8;
    ovCtx.fillText(`Z${z.phase} · ${Math.round(z.r)}m`, p.x + cr * 0.7 + 4, p.y - 5);
    ovCtx.shadowBlur = 0;
  } else {
    const rLabel = Math.round(z.r) + 'm';
    ovCtx.font = '600 12px Outfit,sans-serif';
    ovCtx.fillStyle = color;
    ovCtx.shadowColor = '#000'; ovCtx.shadowBlur = 6;
    ovCtx.fillText(rLabel, p.x + cr * 0.72, p.y - 6);
    ovCtx.shadowBlur = 0;
  }
}

function drawPaths(paths) {
  ovCtx.lineWidth = 1;
  paths.forEach(path => {
    ovCtx.strokeStyle = 'rgba(255,255,255,0.07)';
    ovCtx.beginPath();
    path.forEach((z, i) => {
      const p = w2c(z.cx, z.cy);
      i === 0 ? ovCtx.moveTo(p.x, p.y) : ovCtx.lineTo(p.x, p.y);
    });
    ovCtx.stroke();
  });
}

function drawPredictions() {
  predictions.forEach((z, i) => {
    const p = w2c(z.cx, z.cy);
    const cr = Math.max(wr2c(z.r) * 2.5, 8);
    const color = z.color;

    ovCtx.shadowColor = color; ovCtx.shadowBlur = 22;
    ovCtx.strokeStyle = color;
    ovCtx.lineWidth = i === 0 ? 3 : 1.8;
    ovCtx.globalAlpha = i === 0 ? 1 : 0.65;
    ovCtx.beginPath(); ovCtx.arc(p.x, p.y, cr, 0, Math.PI*2); ovCtx.stroke();
    ovCtx.shadowBlur = 0; ovCtx.globalAlpha = 1;

    ovCtx.fillStyle = color;
    ovCtx.beginPath(); ovCtx.arc(p.x, p.y, i === 0 ? 6 : 4, 0, Math.PI*2); ovCtx.fill();

    ovCtx.font = `700 ${i === 0 ? 13 : 11}px Outfit,sans-serif`;
    ovCtx.fillStyle = color;
    ovCtx.shadowColor = '#000'; ovCtx.shadowBlur = 8;
    ovCtx.fillText(`#${i+1} · ${z.confidence}%`, p.x + cr + 5, p.y + 4);
    ovCtx.shadowBlur = 0;
  });
}

// ── Phase window mini-maps ────────────────────────────────────────────────────
function renderPhaseWindow(canvasId, phasePoints, color, label, confEl) {
  const pw = document.getElementById(canvasId);
  if (!pw) return;
  const ctx = pw.getContext('2d');
  const W = pw.width, H = pw.height;
  ctx.clearRect(0, 0, W, H);

  // Background map
  if (mapImg) { ctx.drawImage(mapImg, 0, 0, W, H); ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,W,H); }
  else { ctx.fillStyle='#1a2d1a'; ctx.fillRect(0,0,W,H); }

  if (!phasePoints) return;

  // Mini heatmap for this phase
  const miniHeat = new (HeatmapRenderer)(100);
  miniHeat.build(phasePoints, MAP_SIZE);
  miniHeat.render(ctx, 0.80);

  // Top prediction
  const preds = predictor.predict(phasePoints, 2, 200);
  if (preds.length) {
    const best = preds[0];
    const bx = (best.cx / MAP_SIZE) * W;
    const by = (best.cy / MAP_SIZE) * H;
    const br = Math.max((best.r / MAP_SIZE) * W * 2, 6);

    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI*2); ctx.fill();

    if (confEl) confEl.textContent = `${best.confidence}%`;
  }
}

// ── Drawing events ────────────────────────────────────────────────────────────
function getPos(e) {
  const rect = overlayCanvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return { x: cx, y: cy };
}

function isPhaseDrawn(ph) { return drawnZones.some(z => z.phase === ph); }

overlayCanvas.addEventListener('mousedown', e => {
  if (isPhaseDrawn(activePhase)) return; // already drawn
  const pos = getPos(e);
  drawState = { startX: pos.x, startY: pos.y };
  mapHint.style.display = 'none';
});

overlayCanvas.addEventListener('mousemove', e => {
  if (!drawState) return;
  const pos = getPos(e);
  const dx = pos.x - drawState.startX;
  const dy = pos.y - drawState.startY;
  const cr = Math.sqrt(dx*dx + dy*dy);
  const world = c2w(drawState.startX, drawState.startY);
  const wr = Math.max((cr / overlayCanvas.width) * MAP_SIZE, 50);
  currentDraw = { phase: activePhase, cx: world.x, cy: world.y, r: wr };
  renderOverlay();
});

overlayCanvas.addEventListener('mouseup', () => {
  if (!drawState || !currentDraw) return;
  const z = { ...currentDraw };
  drawnZones.push(z);
  currentDraw = null;
  drawState = null;
  updateUI();
  renderOverlay();
});

overlayCanvas.addEventListener('mouseleave', () => {
  if (drawState && currentDraw) {
    drawnZones.push({ ...currentDraw });
    currentDraw = null;
    drawState = null;
    updateUI();
    renderOverlay();
  }
});

// Touch
overlayCanvas.addEventListener('touchstart', e => { e.preventDefault(); overlayCanvas.dispatchEvent(new MouseEvent('mousedown', touchToMouse(e))); }, { passive:false });
overlayCanvas.addEventListener('touchmove', e => { e.preventDefault(); overlayCanvas.dispatchEvent(new MouseEvent('mousemove', touchToMouse(e))); }, { passive:false });
overlayCanvas.addEventListener('touchend', e => { e.preventDefault(); overlayCanvas.dispatchEvent(new MouseEvent('mouseup', {})); }, { passive:false });
function touchToMouse(e) { const t = e.touches[0]||e.changedTouches[0]; return { clientX:t.clientX, clientY:t.clientY, bubbles:true }; }

// ── UI state updates ──────────────────────────────────────────────────────────
function updateUI() {
  const hasAnyZone = drawnZones.length > 0;

  // Phase buttons
  document.querySelectorAll('.phase-btn').forEach(btn => {
    const ph = parseInt(btn.dataset.phase);
    const drawn = isPhaseDrawn(ph);
    btn.classList.toggle('drawn', drawn);
    btn.classList.toggle('active', ph === activePhase && !drawn);
    btn.disabled = ph > 1 && !isPhaseDrawn(ph - 1) && !drawn;
  });

  // Predict button
  predictBtn.disabled = !hasAnyZone;

  // Map badge
  mapBadge.textContent = `ZONE ${activePhase} · ${isPhaseDrawn(activePhase) ? 'DRAWN' : 'DRAW MODE'}`;

  // Uncertainty display
  const reduction = ZoneEngine.uncertaintyReduction(drawnZones.length);
  if (hasAnyZone) {
    uncertaintyOverlay.style.display = 'block';
    uncBar.style.width = reduction + '%';
    uncPct.textContent = reduction + '% accurate';
  }

  // Drawn zones list
  drawnZonesList.innerHTML = '';
  if (drawnZones.length === 0) {
    drawnZonesList.innerHTML = '<div class="empty-state">No zones drawn yet</div>';
  } else {
    drawnZones.forEach((z, i) => {
      const div = document.createElement('div');
      div.className = 'zone-item';
      div.innerHTML = `
        <div class="zone-item-dot" style="background:${ZONE_COLORS[z.phase-1]};box-shadow:0 0 6px ${ZONE_COLORS[z.phase-1]}80"></div>
        <div class="zone-item-info">
          <div class="zone-item-name">Zone ${z.phase}</div>
          <div class="zone-item-sub">r=${Math.round(z.r)}m · (${Math.round(z.cx)}, ${Math.round(z.cy)})</div>
        </div>
        <button class="zone-item-del" data-idx="${i}" title="Remove">✕</button>
      `;
      drawnZonesList.appendChild(div);
    });
    drawnZonesList.querySelectorAll('.zone-item-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const removedPhase = drawnZones[idx].phase;
        // Remove this and all higher phases
        drawnZones = drawnZones.filter(z => z.phase < removedPhase);
        simResults = null; predictions = null;
        bestZonePanel.style.display = 'none';
        phaseWindows.style.display = 'none';
        uncertaintyOverlay.style.display = 'none';
        updateUI();
        renderOverlay();
      });
    });
  }

  // Auto-advance active phase if current one is drawn
  if (isPhaseDrawn(activePhase) && activePhase < 4) {
    activePhase++;
    document.querySelectorAll('.phase-btn').forEach(b => {
      b.classList.remove('active');
      if (parseInt(b.dataset.phase) === activePhase) b.classList.add('active');
    });
  }
}

// ── Phase button clicks ────────────────────────────────────────────────────────
document.querySelectorAll('.phase-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const ph = parseInt(btn.dataset.phase);
    if (ph > 1 && !isPhaseDrawn(ph - 1)) return;
    if (isPhaseDrawn(ph)) return;
    activePhase = ph;
    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ── Predict ───────────────────────────────────────────────────────────────────
predictBtn.addEventListener('click', () => {
  if (drawnZones.length === 0) return;
  runSim();
});

function runSim() {
  statusTag.textContent = 'SIMULATING';
  statusTag.className = 'tag tag-status simulating';
  predictBtn.disabled = true;

  setTimeout(() => {
    const t0 = performance.now();

    // Sort and use all drawn zones as constraints
    const sorted = [...drawnZones].sort((a,b) => a.phase - b.phase);
    simResults = engine.simulate(sorted, iterations, centerBias);

    // Build heatmap from final zone (phase 8)
    if (simResults.finals) heatmap.build(simResults.finals, MAP_SIZE);

    // Top predictions for final zone
    const finalR = ZoneEngine.phaseRadius(sorted[0].r, 8);
    if (simResults.finals) {
      predictions = predictor.predict(simResults.finals, 3, finalR);
    }

    const ms = (performance.now() - t0).toFixed(0);

    renderOverlay();
    showResults(ms);

    statusTag.textContent = 'PREDICTED';
    statusTag.className = 'tag tag-status predicted';
    predictBtn.disabled = false;

    footerNote.textContent = `Monte Carlo · ${iterations.toLocaleString()} simulations · ${ms}ms · ${centerBias ? 'center-biased' : 'uniform'}`;
  }, 50);
}

function showResults(ms) {
  // Best zone panel
  if (predictions && predictions.length) {
    const best = predictions[0];
    bestZonePanel.style.display = 'block';
    bzConfidence.textContent = `${best.confidence}%`;
    bzCoords.textContent = `${Math.round(best.cx)} , ${Math.round(best.cy)}`;
    bzRing.style.borderColor = best.color;
    bzSub.textContent = `Most likely final circle · r≈${Math.round(best.r)}m`;
  }

  // Phase windows
  if (simResults.allPhasePoints) {
    phaseWindows.style.display = 'flex';

    // Early (show zone 3 prediction)
    renderPhaseWindow('pwCanvasEarly', simResults.allPhasePoints[3], '#4af0ff', 'Z3', document.getElementById('confEarly'));

    // Mid (show zone 5 prediction)
    renderPhaseWindow('pwCanvasMid', simResults.allPhasePoints[5], '#ff8c44', 'Z5', document.getElementById('confMid'));

    // Final (zone 8)
    renderPhaseWindow('pwCanvasFinal', simResults.allPhasePoints[8], '#ff4d6a', 'Final', document.getElementById('confFinal'));
  }
}

// ── Reset ──────────────────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  drawnZones = []; activePhase = 1; drawState = null; currentDraw = null;
  simResults = null; predictions = null;
  bestZonePanel.style.display = 'none';
  phaseWindows.style.display = 'none';
  uncertaintyOverlay.style.display = 'none';
  mapHint.style.display = 'flex';
  statusTag.textContent = 'READY';
  statusTag.className = 'tag tag-status';
  predictBtn.disabled = true;
  footerNote.textContent = `Monte Carlo · ${iterations.toLocaleString()} simulations · Center-biased`;
  document.querySelectorAll('.phase-btn').forEach((b,i) => {
    b.classList.remove('active','drawn');
    if (i === 0) b.classList.add('active');
    b.disabled = i > 0;
  });
  updateUI();
  ovCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
});

// ── Iteration buttons ──────────────────────────────────────────────────────────
document.querySelectorAll('.iter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.iter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    iterations = parseInt(btn.dataset.val);
    footerNote.textContent = `Monte Carlo · ${iterations.toLocaleString()} simulations · ${centerBias?'center-biased':'uniform'}`;
  });
});

// ── Toggles ────────────────────────────────────────────────────────────────────
document.getElementById('togHeatmap').addEventListener('change', e => { showHeatmap = e.target.checked; if(simResults) renderOverlay(); });
document.getElementById('togPaths').addEventListener('change', e => { showPaths = e.target.checked; if(simResults) renderOverlay(); });
document.getElementById('togZones').addEventListener('change', e => { showZones = e.target.checked; if(simResults) renderOverlay(); });
document.getElementById('togCenterBias').addEventListener('change', e => { centerBias = e.target.checked; });

// ── Helpers ────────────────────────────────────────────────────────────────────
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.querySelectorAll('.phase-btn').forEach((b,i) => { if(i>0) b.disabled = true; });
loadMap();
