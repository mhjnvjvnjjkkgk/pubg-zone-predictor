/**
 * app.js — Main orchestrator for PUBG Zone Predictor
 * Handles: map rendering, zone drawing, simulation, visualization
 */
import { ZoneEngine } from './engine.js';
import { HeatmapRenderer } from './heatmap.js';
import { ZonePredictor } from './predictor.js';

const MAP_SIZE = 8000; // game world meters
const engine   = new ZoneEngine();
const heatmap  = new HeatmapRenderer(300);
const predictor = new ZonePredictor();

// ── DOM refs ────────────────────────────────────────────────────────────────
const mapCanvas     = document.getElementById('mapCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const mapCtx        = mapCanvas.getContext('2d');
const ovCtx         = overlayCanvas.getContext('2d');
const hint          = document.getElementById('hint');
const predictBtn    = document.getElementById('predictBtn');
const resetBtn      = document.getElementById('resetBtn');
const resultsPanel  = document.getElementById('resultsPanel');
const resultsList   = document.getElementById('resultsList');
const loadingPanel  = document.getElementById('loadingPanel');
const loadingText   = document.getElementById('loadingText');
const statusTag     = document.getElementById('statusTag');
const statRadius    = document.getElementById('statRadius');
const statArea      = document.getElementById('statArea');
const statCenter    = document.getElementById('statCenter');
const iterCount     = document.getElementById('iterCount');

// ── State ────────────────────────────────────────────────────────────────────
let mapImg = null;
let zone1 = null;         // { cx, cy, r } in game coords
let drawState = null;     // { startX, startY } during drag
let simResults = null;    // { finals, samplePaths }
let predictions = null;
let iterations = 10000;
let showHeatmap = true, showPaths = true, showZones = true;

// ── Load map image ───────────────────────────────────────────────────────────
function loadMap() {
  const img = new Image();
  img.onload = () => {
    mapImg = img;
    resizeCanvases();
    renderMap();
  };
  img.onerror = () => {
    // Fallback: draw a simple green rectangle
    mapImg = null;
    resizeCanvases();
    renderMap();
  };
  img.src = './assets/erangel.png';
}

// ── Canvas sizing ────────────────────────────────────────────────────────────
function resizeCanvases() {
  const wrap = document.getElementById('mapWrap');
  const { width, height } = wrap.getBoundingClientRect();
  const size = Math.min(width, height);
  [mapCanvas, overlayCanvas].forEach(c => {
    c.width  = width;
    c.height = height;
  });
  renderMap();
  if (zone1 || simResults) renderOverlay();
}

// ── Coordinate transforms ─────────────────────────────────────────────────────
function worldToCanvas(wx, wy) {
  const W = overlayCanvas.width, H = overlayCanvas.height;
  return { x: (wx / MAP_SIZE) * W, y: (wy / MAP_SIZE) * H };
}

function canvasToWorld(cx, cy) {
  const W = overlayCanvas.width, H = overlayCanvas.height;
  return { x: (cx / W) * MAP_SIZE, y: (cy / H) * MAP_SIZE };
}

function worldRadiusToCanvas(wr) {
  return (wr / MAP_SIZE) * overlayCanvas.width;
}

// ── Map rendering ─────────────────────────────────────────────────────────────
function renderMap() {
  const W = mapCanvas.width, H = mapCanvas.height;
  mapCtx.clearRect(0, 0, W, H);

  if (mapImg) {
    mapCtx.drawImage(mapImg, 0, 0, W, H);
    // Darken slightly for contrast
    mapCtx.fillStyle = 'rgba(0,0,0,0.35)';
    mapCtx.fillRect(0, 0, W, H);
  } else {
    // Fallback map
    mapCtx.fillStyle = '#1a2d1a';
    mapCtx.fillRect(0, 0, W, H);
    mapCtx.fillStyle = '#243d24';
    for (let i = 0; i < 6; i++) {
      mapCtx.beginPath();
      mapCtx.arc(Math.random() * W, Math.random() * H, 30 + Math.random() * 60, 0, Math.PI * 2);
      mapCtx.fill();
    }
  }

  // Grid overlay
  mapCtx.strokeStyle = 'rgba(255,255,255,0.06)';
  mapCtx.lineWidth = 1;
  const gridSteps = 8;
  for (let i = 1; i < gridSteps; i++) {
    const x = (W / gridSteps) * i;
    const y = (H / gridSteps) * i;
    mapCtx.beginPath(); mapCtx.moveTo(x, 0); mapCtx.lineTo(x, H); mapCtx.stroke();
    mapCtx.beginPath(); mapCtx.moveTo(0, y); mapCtx.lineTo(W, y); mapCtx.stroke();
  }
}

// ── Overlay rendering ─────────────────────────────────────────────────────────
function renderOverlay() {
  const W = overlayCanvas.width, H = overlayCanvas.height;
  ovCtx.clearRect(0, 0, W, H);

  // Heatmap
  if (simResults && showHeatmap) {
    heatmap.render(ovCtx, 0.75);
  }

  // Sample zone paths
  if (simResults && showPaths && simResults.samplePaths) {
    drawPaths(simResults.samplePaths);
  }

  // Predicted final zones
  if (predictions && showZones) {
    predictions.forEach((z, i) => {
      const p = worldToCanvas(z.cx, z.cy);
      const cr = worldRadiusToCanvas(z.r * 2.5); // scaled for visibility
      drawPredictedZone(ovCtx, p.x, p.y, cr, z.color, i + 1);
    });
  }

  // Zone 1 circle
  if (zone1) {
    drawZone1(zone1);
  }
}

function drawZone1(z) {
  const p = worldToCanvas(z.cx, z.cy);
  const cr = worldRadiusToCanvas(z.r);

  // Glow fill
  const grad = ovCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, cr);
  grad.addColorStop(0, 'rgba(240,192,64,0.04)');
  grad.addColorStop(1, 'rgba(240,192,64,0)');
  ovCtx.fillStyle = grad;
  ovCtx.beginPath();
  ovCtx.arc(p.x, p.y, cr, 0, Math.PI * 2);
  ovCtx.fill();

  // Zone ring
  ovCtx.strokeStyle = '#f0c040';
  ovCtx.lineWidth = 2.5;
  ovCtx.setLineDash([8, 6]);
  ovCtx.shadowColor = '#f0c040';
  ovCtx.shadowBlur = 12;
  ovCtx.beginPath();
  ovCtx.arc(p.x, p.y, cr, 0, Math.PI * 2);
  ovCtx.stroke();
  ovCtx.setLineDash([]);
  ovCtx.shadowBlur = 0;

  // Center dot
  ovCtx.fillStyle = '#f0c040';
  ovCtx.beginPath();
  ovCtx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ovCtx.fill();

  // Radius label
  const rLabel = Math.round(z.r) + 'm';
  ovCtx.font = '600 12px Outfit, sans-serif';
  ovCtx.fillStyle = '#f0c040';
  ovCtx.shadowColor = '#000';
  ovCtx.shadowBlur = 6;
  ovCtx.fillText(rLabel, p.x + cr * 0.7, p.y - 8);
  ovCtx.shadowBlur = 0;
}

function drawPaths(paths) {
  paths.forEach(path => {
    ovCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    ovCtx.lineWidth = 1;
    ovCtx.beginPath();
    path.forEach((z, i) => {
      const p = worldToCanvas(z.cx, z.cy);
      i === 0 ? ovCtx.moveTo(p.x, p.y) : ovCtx.lineTo(p.x, p.y);
    });
    ovCtx.stroke();
  });
}

function drawPredictedZone(ctx, x, y, r, color, rank) {
  // Glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.strokeStyle = color;
  ctx.lineWidth = rank === 1 ? 2.5 : 1.8;
  ctx.globalAlpha = rank === 1 ? 1 : 0.7;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // Center marker
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, rank === 1 ? 5 : 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Rank label
  ctx.font = `700 ${rank === 1 ? 13 : 11}px Outfit, sans-serif`;
  ctx.fillStyle = color;
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.fillText(`#${rank}`, x + r + 4, y + 4);
  ctx.shadowBlur = 0;
}

// ── Zone drawing interaction ──────────────────────────────────────────────────
function getPos(e) {
  const rect = overlayCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

overlayCanvas.addEventListener('mousedown', e => {
  if (zone1 && simResults) return; // locked after prediction
  const pos = getPos(e);
  drawState = { startX: pos.x, startY: pos.y };
  hint.style.display = 'none';
});

overlayCanvas.addEventListener('mousemove', e => {
  if (!drawState) return;
  const pos = getPos(e);
  const dx = pos.x - drawState.startX;
  const dy = pos.y - drawState.startY;
  const r = Math.sqrt(dx * dx + dy * dy);

  const world = canvasToWorld(drawState.startX, drawState.startY);
  const wr = (r / overlayCanvas.width) * MAP_SIZE;

  zone1 = { cx: world.x, cy: world.y, r: Math.max(wr, 200) };
  updateStats();
  renderOverlay();
});

overlayCanvas.addEventListener('mouseup', () => {
  if (!drawState || !zone1) return;
  drawState = null;
  predictBtn.disabled = false;
  statusTag.textContent = 'ZONE DRAWN';
});

overlayCanvas.addEventListener('mouseleave', () => {
  if (drawState && zone1) {
    drawState = null;
    predictBtn.disabled = false;
  }
});

// Touch support
overlayCanvas.addEventListener('touchstart', e => { e.preventDefault(); overlayCanvas.dispatchEvent(new MouseEvent('mousedown', getMouseFromTouch(e))); }, { passive: false });
overlayCanvas.addEventListener('touchmove', e => { e.preventDefault(); overlayCanvas.dispatchEvent(new MouseEvent('mousemove', getMouseFromTouch(e))); }, { passive: false });
overlayCanvas.addEventListener('touchend', e => { e.preventDefault(); overlayCanvas.dispatchEvent(new MouseEvent('mouseup', {})); }, { passive: false });

function getMouseFromTouch(e) {
  const t = e.touches[0] || e.changedTouches[0];
  return { clientX: t.clientX, clientY: t.clientY, bubbles: true };
}

// ── Stat updates ──────────────────────────────────────────────────────────────
function updateStats() {
  if (!zone1) return;
  statRadius.textContent = Math.round(zone1.r).toLocaleString();
  statArea.textContent   = ((Math.PI * zone1.r ** 2) / 1e6).toFixed(2);
  statCenter.textContent = `${Math.round(zone1.cx)}, ${Math.round(zone1.cy)}`;
}

// ── Predict button ────────────────────────────────────────────────────────────
predictBtn.addEventListener('click', async () => {
  if (!zone1) return;
  runSimulation();
});

function runSimulation() {
  loadingPanel.style.display = 'flex';
  loadingText.textContent = `Running ${iterations.toLocaleString()} simulations…`;
  resultsPanel.style.display = 'none';
  predictBtn.disabled = true;
  statusTag.textContent = 'SIMULATING';

  // Use setTimeout to let the UI update before heavy computation
  setTimeout(() => {
    const t0 = performance.now();
    simResults = engine.simulate(zone1.cx, zone1.cy, zone1.r, iterations);

    heatmap.build(simResults.finals, MAP_SIZE);

    const finalR = ZoneEngine.phaseRadius(zone1.r, 8);
    predictions = predictor.predict(simResults.finals, 3, finalR);

    const elapsed = (performance.now() - t0).toFixed(0);
    loadingPanel.style.display = 'none';
    loadingText.textContent = `Simulated in ${elapsed}ms`;

    renderOverlay();
    showResults(elapsed);
    statusTag.textContent = 'PREDICTED';
  }, 60);
}

function showResults(elapsed) {
  resultsPanel.style.display = 'block';
  resultsList.innerHTML = '';

  predictions.forEach((z, i) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.style.animationDelay = `${i * 0.1}s`;
    item.innerHTML = `
      <div class="result-swatch" style="background:${z.color}; box-shadow:0 0 8px ${z.color}80"></div>
      <div class="result-info">
        <div class="result-label">${z.label}</div>
        <div class="result-sub">${Math.round(z.cx)}, ${Math.round(z.cy)} · r≈${Math.round(z.r)}m</div>
      </div>
      <div class="result-conf">${z.confidence}%</div>
    `;
    resultsList.appendChild(item);
  });

  const note = document.createElement('div');
  note.style.cssText = 'font-size:0.68rem;color:var(--text-dim);margin-top:6px;text-align:center';
  note.textContent = `${iterations.toLocaleString()} paths · ${elapsed}ms`;
  resultsList.appendChild(note);
}

// ── Reset ─────────────────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  zone1 = null; drawState = null; simResults = null; predictions = null;
  predictBtn.disabled = true;
  resultsPanel.style.display = 'none';
  loadingPanel.style.display = 'none';
  hint.style.display = 'flex';
  statusTag.textContent = 'READY';
  statRadius.textContent = '—';
  statArea.textContent   = '—';
  statCenter.textContent = '— , —';
  ovCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
});

// ── Iteration buttons ─────────────────────────────────────────────────────────
document.querySelectorAll('.iter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.iter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    iterations = parseInt(btn.dataset.val);
    iterCount.textContent = iterations >= 1000 ? (iterations / 1000) + 'K' : iterations;
    iterCount.textContent = iterations.toLocaleString();
  });
});

// ── Layer toggles ─────────────────────────────────────────────────────────────
document.getElementById('togHeatmap').addEventListener('change', e => {
  showHeatmap = e.target.checked;
  if (simResults) renderOverlay();
});
document.getElementById('togPaths').addEventListener('change', e => {
  showPaths = e.target.checked;
  if (simResults) renderOverlay();
});
document.getElementById('togZones').addEventListener('change', e => {
  showZones = e.target.checked;
  if (simResults) renderOverlay();
});

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  resizeCanvases();
  renderMap();
  renderOverlay();
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadMap();
