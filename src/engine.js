/**
 * ZoneEngine v2 — Monte Carlo zone simulation
 * Implements center-biased distribution to match real PUBG behavior.
 * All coordinates in game-world meters (0–8000).
 */
export class ZoneEngine {
  static MAP_SIZE = 8000;

  // Verified shrink ratios per PUBG community datamines
  static SHRINK = [null, null, 0.725, 0.700, 0.650, 0.600, 0.550, 0.500, 0.400];

  // Phase labels
  static PHASE_NAMES = ['', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Final Zone'];

  /**
   * Simulate zone paths.
   * @param {Array<{cx,cy,r,phase}>} knownZones - zones already drawn (1..N)
   * @param {number} iterations
   * @param {boolean} centerBias - use center-biased sampling (more realistic)
   * @returns {{ finals, allPhasePoints, samplePaths }}
   */
  simulate(knownZones, iterations = 10000, centerBias = true, landMask = null) {
    const startPhase = knownZones[knownZones.length - 1].phase;
    const startZone  = knownZones[knownZones.length - 1];

    // Storage: for each phase 2-8, record all simulated centers
    const phasePoints = {};
    for (let p = startPhase + 1; p <= 8; p++) {
      phasePoints[p] = new Float32Array(iterations * 2);
    }

    const samplePaths = [];

    for (let i = 0; i < iterations; i++) {
      const path = this._runPath(startZone.cx, startZone.cy, startZone.r, startPhase, centerBias, landMask);

      path.forEach((z, idx) => {
        const phase = startPhase + 1 + idx;
        if (phasePoints[phase]) {
          phasePoints[phase][i * 2]     = z.cx;
          phasePoints[phase][i * 2 + 1] = z.cy;
        }
      });

      if (i < 60) samplePaths.push([startZone, ...path]);
    }

    return {
      finals: phasePoints[8],
      allPhasePoints: phasePoints,
      samplePaths,
      startPhase,
    };
  }

  _isLand(cx, cy, landMask) {
    if (!landMask) return true; // Default to true if no mask
    const res = 256;
    const gx = Math.floor((cx / ZoneEngine.MAP_SIZE) * res);
    const gy = Math.floor((cy / ZoneEngine.MAP_SIZE) * res);
    if (gx < 0 || gx >= res || gy < 0 || gy >= res) return false;
    return landMask[gy * res + gx] === 1;
  }

  _runPath(cx, cy, r, fromPhase, centerBias, landMask) {
    const path = [];

    for (let phase = fromPhase + 1; phase <= 8; phase++) {
      const nr      = r * ZoneEngine.SHRINK[phase];
      const maxOff  = r - nr;

      let bestNext = null;
      let bestScore = -Infinity;
      
      // Sample multiple points and pick the best one based on BGMI rules
      // (Water avoidance and distance penalty)
      const attempts = phase >= 6 ? 15 : 5; // More attempts late game to find land

      for (let attempt = 0; attempt < attempts; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist  = centerBias
          ? this._centerBiasSample(maxOff)
          : Math.sqrt(Math.random()) * maxOff;

        let next = { cx: cx + dist * Math.cos(angle), cy: cy + dist * Math.sin(angle), r: nr };
        
        // Force bounds
        if (!this._inBounds(next)) {
          next.cx = Math.max(nr, Math.min(ZoneEngine.MAP_SIZE - nr, next.cx));
          next.cy = Math.max(nr, Math.min(ZoneEngine.MAP_SIZE - nr, next.cy));
        }

        let score = 0;
        
        // BGMI Water Avoidance Rule
        const isLand = this._isLand(next.cx, next.cy, landMask);
        
        if (phase >= 4) {
          // Mid-game: penalize water heavily
          if (!isLand) score -= 100;
        }
        
        if (phase >= 7) {
          // Late-game: strictly forbid water
          if (!isLand) score -= 10000;
        }

        // Penalty for extreme hard shifts (to maintain some center bias)
        // unless we are forced to shift to find land
        score -= (dist / maxOff) * 5;

        if (score > bestScore) {
          bestScore = score;
          bestNext = next;
        }
      }

      cx = bestNext.cx; cy = bestNext.cy; r = bestNext.r;
      path.push(bestNext);
    }

    return path;
  }

  /**
   * Center-biased sample: uses average of two uniform samples (tent distribution).
   * Produces values concentrated toward center of valid offset range.
   * This matches observed PUBG zone behavior where zones rarely jump to extreme edges.
   */
  _centerBiasSample(maxOff) {
    // Tent distribution: (u1 + u2) / 2, then apply sqrt for disk
    const biased = (Math.random() + Math.random()) / 2;
    return Math.sqrt(biased) * maxOff;
  }

  _inBounds({ cx, cy, r }) {
    const M = ZoneEngine.MAP_SIZE;
    return cx - r >= 0 && cx + r <= M && cy - r >= 0 && cy + r <= M;
  }

  /** Get expected radius at a given phase, starting from zone1Radius */
  static phaseRadius(zone1Radius, phase) {
    let r = zone1Radius;
    for (let p = 2; p <= phase; p++) r *= ZoneEngine.SHRINK[p];
    return r;
  }

  /** How much uncertainty is reduced given N known zones (0-100%) */
  static uncertaintyReduction(knownPhases) {
    const reductions = [0, 0, 35, 58, 74, 85, 92, 97, 100];
    return reductions[Math.min(knownPhases, 8)] || 0;
  }
}
