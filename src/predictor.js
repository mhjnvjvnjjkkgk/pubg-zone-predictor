/**
 * ZonePredictor — clusters final zone points into top predicted zones
 * Uses k-means clustering on Monte Carlo final positions
 */
export class ZonePredictor {
  static COLORS = ['#ff4d6a', '#4af0a0', '#4d9fff', '#f0c040', '#c94dff'];
  static ZONE_NAMES = ['Most Likely', '2nd Most Likely', '3rd Most Likely', '4th', '5th'];

  /**
   * @param {Float32Array} finals - interleaved x,y pairs in game coords
   * @param {number} k - number of clusters (predicted zones)
   * @param {number} finalRadius - expected final zone radius in meters
   */
  predict(finals, k = 3, finalRadius = 61) {
    const N = finals.length / 2;
    const points = [];
    for (let i = 0; i < N; i++) points.push([finals[i * 2], finals[i * 2 + 1]]);

    const clusters = this._kmeans(points, k);
    clusters.sort((a, b) => b.size - a.size);

    return clusters.map((c, i) => ({
      cx: c.cx,
      cy: c.cy,
      r: finalRadius,
      confidence: ((c.size / N) * 100).toFixed(1),
      label: ZonePredictor.ZONE_NAMES[i] || `Zone ${i + 1}`,
      color: ZonePredictor.COLORS[i],
    }));
  }

  _kmeans(points, k, maxIter = 80) {
    // Smart init: spread initial centroids
    const centroids = this._kmeansInit(points, k);
    let assignments = new Int32Array(points.length);

    for (let iter = 0; iter < maxIter; iter++) {
      let changed = false;

      // Assign
      for (let i = 0; i < points.length; i++) {
        const best = this._nearest(points[i], centroids);
        if (best !== assignments[i]) { assignments[i] = best; changed = true; }
      }
      if (!changed) break;

      // Update centroids
      const sums = Array.from({ length: k }, () => [0, 0, 0]); // [sumX, sumY, count]
      for (let i = 0; i < points.length; i++) {
        const c = assignments[i];
        sums[c][0] += points[i][0];
        sums[c][1] += points[i][1];
        sums[c][2]++;
      }
      for (let c = 0; c < k; c++) {
        if (sums[c][2] > 0) {
          centroids[c] = [sums[c][0] / sums[c][2], sums[c][1] / sums[c][2]];
        }
      }
    }

    // Build result
    const sizes = new Array(k).fill(0);
    for (let i = 0; i < points.length; i++) sizes[assignments[i]]++;

    return centroids.map((c, i) => ({ cx: c[0], cy: c[1], size: sizes[i] }));
  }

  _kmeansInit(points, k) {
    // k-means++ style: spread initial centroids by distance
    const chosen = [points[Math.floor(Math.random() * points.length)]];
    while (chosen.length < k) {
      let maxDist = -1, best = null;
      const sample = points.filter((_, i) => i % 10 === 0); // sample for speed
      for (const p of sample) {
        const d = Math.min(...chosen.map(c => this._dist2(p, c)));
        if (d > maxDist) { maxDist = d; best = p; }
      }
      chosen.push(best);
    }
    return chosen.map(p => [...p]);
  }

  _nearest(point, centroids) {
    let minD = Infinity, best = 0;
    for (let i = 0; i < centroids.length; i++) {
      const d = this._dist2(point, centroids[i]);
      if (d < minD) { minD = d; best = i; }
    }
    return best;
  }

  _dist2([x1, y1], [x2, y2]) {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
  }
}
