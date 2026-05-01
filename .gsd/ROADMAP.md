# ROADMAP.md

> **Current Phase**: Phase 5
> **Milestone**: v2.0 — Maximum Accuracy Zone Predictor

## Must-Haves

- [x] Interactive Erangel map with circle drawing tool
- [x] Monte Carlo zone simulation engine (zone physics accurate)
- [x] Probability heatmap rendered on canvas
- [x] Top predicted final zones displayed
- [x] Runs entirely in browser — no server needed
- [ ] Multi-zone drawing (draw Zone 2, 3 for Bayesian narrowing)
- [ ] Per-phase prediction windows (Zone 2-3, Zone 4-5, Final)
- [ ] "Most Accurate Zone" single primary prediction display
- [ ] Center-biased zone distribution (matches real PUBG behavior)

---

## Phases

### Phase 1: Foundation — Map + Zone Drawing UI
**Status**: ✅ Complete
**Objective**: Interactive Erangel map where user can draw Zone 1 by clicking+dragging. Coordinate system established. Clean, premium UI shell.
**Deliverables**:
- `index.html` — app shell
- `style.css` — dark premium styling
- `map.js` — Erangel map rendering + coordinate transforms
- `draw.js` — circle drawing interaction (click center, drag radius)
- Erangel map image asset integrated
- Display drawn circle with radius label (in meters)

---

### Phase 2: Zone Physics Engine
**Status**: ⬜ Not Started
**Objective**: Core algorithm that, given Zone 1, runs Monte Carlo simulation producing all zone paths.
**Deliverables**:
- `engine.js` — ZoneEngine class
  - `simulate(center, radius, iterations=10000)` → array of simulated final positions
  - `SHRINK_RATIOS` constants for all 8 phases
  - `isInBounds(center, radius)` — map boundary validation
  - `uniformDiskSample(maxRadius)` — proper random sampling
- Returns: array of 10k final zone centers + all intermediate zone states
- Performance target: <2s for 10k iterations

---

### Phase 3: Heatmap + Visualization
**Status**: ⬜ Not Started
**Objective**: Render Monte Carlo results as beautiful probability heatmap + predicted circles.
**Deliverables**:
- `heatmap.js` — canvas-based heatmap renderer
  - Gaussian kernel density estimation on final zone points
  - Color gradient: transparent → blue → yellow → red (hot = high probability)
  - Smooth, anti-aliased rendering
- `predictor.js` — cluster final zone points into top 3-5 zones
  - K-means or density peak clustering
  - Assign confidence % per cluster
  - Draw predicted zones as colored circles with labels
- Intermediate zone rings (semi-transparent overlaid circles showing zone migration)

---

### Phase 4: Polish + UX Refinements
**Status**: ⬜ Not Started
**Objective**: Premium UI polish, controls, and final zone path animation.
**Deliverables**:
- Reset/redraw button
- Slider: adjust number of simulations (1k / 5k / 10k / 50k)
- Toggle: show/hide heatmap, predicted circles, zone paths
- Animated zone migration paths (draw zone evolution visually)
- Mobile-responsive layout
- Loading indicator during computation
- Export screenshot button
