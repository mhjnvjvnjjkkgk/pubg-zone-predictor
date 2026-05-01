/**
 * ZoneEngine — Monte Carlo zone physics simulation
 * All coordinates in game-world meters (0–8000)
 */
export class ZoneEngine {
  static MAP_SIZE = 8000;

  // Shrink ratio for each phase transition (index = target phase)
  static SHRINK = [null, null, 0.725, 0.700, 0.650, 0.600, 0.550, 0.500, 0.400];

  /**
   * Run Monte Carlo simulation.
   * @param {number} cx - Zone 1 center X (meters)
   * @param {number} cy - Zone 1 center Y (meters)
   * @param {number} r  - Zone 1 radius (meters)
   * @param {number} iterations
   * @returns {{ finals: Float32Array, samplePaths: Array }}
   */
  simulate(cx, cy, r, iterations = 10000) {
    const finals = new Float32Array(iterations * 2);
    const samplePaths = [];

    for (let i = 0; i < iterations; i++) {
      const path = this._runPath(cx, cy, r);
      const last = path[path.length - 1];
      finals[i * 2]     = last.cx;
      finals[i * 2 + 1] = last.cy;
      if (i < 80) samplePaths.push(path);
    }

    return { finals, samplePaths };
  }

  _runPath(cx, cy, r) {
    const path = [{ cx, cy, r }];

    for (let phase = 2; phase <= 8; phase++) {
      const nr = r * ZoneEngine.SHRINK[phase];
      const maxOff = r - nr; // max distance from current center to next center

      let next, attempts = 0;
      do {
        const angle = Math.random() * Math.PI * 2;
        // sqrt trick: uniform distribution inside disk (not just on edge)
        const dist = Math.sqrt(Math.random()) * maxOff;
        next = {
          cx: cx + dist * Math.cos(angle),
          cy: cy + dist * Math.sin(angle),
          r: nr
        };
        attempts++;
      } while (!this._inBounds(next) && attempts < 30);

      // Clamp if still out of bounds
      if (!this._inBounds(next)) {
        next.cx = Math.max(nr, Math.min(ZoneEngine.MAP_SIZE - nr, next.cx));
        next.cy = Math.max(nr, Math.min(ZoneEngine.MAP_SIZE - nr, next.cy));
      }

      cx = next.cx; cy = next.cy; r = next.r;
      path.push(next);
    }

    return path;
  }

  _inBounds({ cx, cy, r }) {
    const M = ZoneEngine.MAP_SIZE;
    return cx - r >= 0 && cx + r <= M && cy - r >= 0 && cy + r <= M;
  }

  /** Compute the expected radius for a given phase, starting from zone1Radius */
  static phaseRadius(zone1Radius, phase) {
    let r = zone1Radius;
    for (let p = 2; p <= phase; p++) r *= ZoneEngine.SHRINK[p];
    return r;
  }
}
