# SPEC.md — PUBG Mobile Zone Prediction Algorithm

> **Status**: `FINALIZED`

## Vision

A web-based interactive tool where the user draws Zone 1 (the first safe zone) on an Erangel map by placing a circle, and the system predicts the most probable locations for all subsequent zones (Zone 2 through final zone) using Monte Carlo simulation + PUBG zone physics. Output is a probability heatmap layered over the Erangel minimap, with the top 3-5 most likely final circle positions highlighted.

## Goals

1. **Interactive Zone Drawing** — User clicks/drags to draw Zone 1 circle on Erangel map
2. **Physics-Accurate Zone Simulation** — Run thousands of simulations using real PUBG Mobile zone shrink ratios and containment constraints
3. **Visual Probability Heatmap** — Render a color-coded heatmap showing probability density of where final zones will land
4. **Predicted Final Zones** — Show top N most likely final circle positions as overlaid circles with confidence percentages
5. **Zone Path Visualization** — Show probable zone "paths" (how the zone migrates across the map)

## Non-Goals (Out of Scope)

- Real-time game data ingestion (no API to PUBG Mobile)
- Multiplayer or online features
- Other maps (Miramar, Vikendi, Sanhok) in v1 — Erangel only
- Accounting for player count impact on zone timing (only geometry matters here)
- Mobile app — web only

## Users

**Primary:** Competitive PUBG Mobile players (solo/squad) who want to make smarter rotations by predicting where the game will end. They draw Zone 1 after it's revealed in-game and instantly see where to position for late game.

**Secondary:** PUBG content creators and coaches demonstrating zone theory.

## Core Domain Knowledge — Zone Physics

### How PUBG Mobile Zones Work
- There are 8 zone phases on Erangel Classic (100 players)
- Each zone (N+1) is **always fully contained within** zone N
- The center of zone N+1 is picked randomly within a **valid placement region**
- The valid placement region for the new center is: a circle with radius = (current_radius - next_radius), centered at the current zone's center
- This means: `distance(current_center, next_center) ≤ current_radius - next_radius`

### Erangel Zone Shrink Ratios (PUBG Mobile Classic)
| Phase | Radius Factor | Center Offset Max |
|-------|--------------|-------------------|
| Zone 1 → 2 | ~0.725 | r1 × 0.275 |
| Zone 2 → 3 | ~0.700 | r2 × 0.300 |
| Zone 3 → 4 | ~0.650 | r3 × 0.350 |
| Zone 4 → 5 | ~0.600 | r4 × 0.400 |
| Zone 5 → 6 | ~0.550 | r5 × 0.450 |
| Zone 6 → 7 | ~0.500 | r6 × 0.500 |
| Zone 7 → 8 | ~0.400 | r7 × 0.600 |
| Zone 8 (final) | ~0.300 | r8 × 0.700 |

### Geographic Bias (Map-Aware)
- Erangel map = 8km × 8km grid
- Zones cannot extend over water/map edges
- Zones near the coast of Erangel tend to skew inland
- This is modeled by **rejecting invalid samples** during Monte Carlo

### Monte Carlo Simulation Algorithm
```
function simulateZonePath(zone1_center, zone1_radius, N=5000):
  results = []
  for i in 0..N:
    current_center = zone1_center
    current_radius = zone1_radius
    for phase in 2..8:
      shrink_factor = SHRINK_RATIOS[phase]
      next_radius = current_radius * shrink_factor
      max_offset = current_radius - next_radius
      # Pick random point within valid offset circle
      angle = random(0, 2π)
      distance = random(0, max_offset)  # uniform disk sampling
      next_center = current_center + (cos(angle)*distance, sin(angle)*distance)
      # Reject if out of map bounds
      if not in_bounds(next_center, next_radius):
        resample...
      current_center = next_center
      current_radius = next_radius
    results.push(current_center)  # final zone center
  return results  # heatmap from density of these points
```

## Constraints

- **No backend required** — Pure browser-side JavaScript (Canvas API + no framework needed)
- **Performance** — 10,000 Monte Carlo iterations must run in <2 seconds in browser
- **Map resolution** — Use publicly available Erangel minimap image (high resolution)
- **Coordinate system** — Internal coordinates in game-world meters (8000×8000), mapped to canvas pixels

## Success Criteria

- [ ] User can draw Zone 1 circle on Erangel map by clicking center and dragging to set radius
- [ ] Prediction runs in <2s and produces a visible heatmap
- [ ] Heatmap correctly concentrates near zone center for a central Zone 1 and shows geographic skew for coastal zones
- [ ] Top 3 predicted final zone circles are shown with percentage confidence
- [ ] UI is premium-quality and intuitive without instructions
