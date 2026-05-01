# DECISIONS.md — Architecture Decision Records
## ADR-001: Pure JavaScript, No Backend
**Decision**: Build entirely client-side with HTML/CSS/JS + Canvas API
**Reason**: 10k Monte Carlo iterations runs in <500ms in modern browsers. No need for Python/server. Instant deployment, zero infrastructure.
**Alternatives Rejected**: Python Flask backend, WebAssembly

## ADR-002: Monte Carlo over Machine Learning
**Decision**: Use geometric Monte Carlo simulation, not trained ML model
**Reason**: No labeled dataset of PUBG zone sequences is publicly available. The zone physics are deterministic rules (containment + shrink ratio), so simulation IS the ground truth.
**Result**: Our simulation IS as accurate as ML could be, given the zone system is purely stochastic within known constraints.

## ADR-003: Canvas API for Rendering
**Decision**: Use raw HTML5 Canvas (2D context) for map, heatmap, and circles
**Reason**: Maximum control, no dependencies, fastest rendering for heatmap pixel manipulation
**Alternatives Rejected**: SVG (too slow for heatmap), WebGL (overkill), Leaflet.js (map-focused but overkill)

## ADR-004: Coordinate System
**Decision**: Internal coordinates in normalized 0-1 space (0,0=top-left, 1,1=bottom-right of Erangel)
**Reason**: Decouples game world units from canvas pixel size. Easy to scale.
**Conversion**: `canvas_x = norm_x * canvas.width`, `game_x = norm_x * 8000` (8km map)
