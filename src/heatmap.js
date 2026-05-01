/**
 * HeatmapRenderer — canvas-based density heatmap
 * Uses a fast grid accumulation + box-blur approach
 */
export class HeatmapRenderer {
  constructor(resolution = 256) {
    this.res = resolution;
    this.grid = new Float32Array(resolution * resolution);
  }

  /** Build grid from Monte Carlo final zone points */
  build(finals, mapSize = 8000) {
    const { res, grid } = this;
    grid.fill(0);

    const N = finals.length / 2;
    const scale = res / mapSize;

    for (let i = 0; i < N; i++) {
      const gx = Math.floor(finals[i * 2]     * scale);
      const gy = Math.floor(finals[i * 2 + 1] * scale);
      if (gx >= 0 && gx < res && gy >= 0 && gy < res) {
        grid[gy * res + gx] += 1;
      }
    }

    // 3-pass box blur for smooth Gaussian approximation
    this._boxBlur(12);
    this._boxBlur(12);
    this._boxBlur(8);
  }

  /** Render heatmap onto a canvas context (scaled to full canvas size) */
  render(ctx, opacity = 0.72) {
    const { res, grid } = this;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    // Create small ImageData
    const imgData = new ImageData(res, res);
    const px = imgData.data;

    const maxVal = this._max();
    if (maxVal === 0) return;

    for (let i = 0; i < grid.length; i++) {
      const t = grid[i] / maxVal;
      if (t < 0.02) continue;
      const [r, g, b] = heatColor(t);
      const a = Math.floor(Math.pow(t, 0.55) * 255 * opacity);
      px[i * 4]     = r;
      px[i * 4 + 1] = g;
      px[i * 4 + 2] = b;
      px[i * 4 + 3] = a;
    }

    // Draw to temp canvas then scale up
    const tmp = document.createElement('canvas');
    tmp.width = res; tmp.height = res;
    tmp.getContext('2d').putImageData(imgData, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmp, 0, 0, W, H);
    ctx.restore();
  }

  _max() {
    let m = 0;
    for (let i = 0; i < this.grid.length; i++) if (this.grid[i] > m) m = this.grid[i];
    return m;
  }

  _boxBlur(r) {
    const { res, grid } = this;
    const tmp = new Float32Array(grid.length);

    // Horizontal pass
    for (let y = 0; y < res; y++) {
      let sum = 0, count = 0;
      for (let x = 0; x < res; x++) {
        sum += grid[y * res + x];
        count++;
        if (x >= r) { sum -= grid[y * res + (x - r)]; count--; }
        tmp[y * res + x] = sum / count;
      }
    }

    // Vertical pass
    for (let x = 0; x < res; x++) {
      let sum = 0, count = 0;
      for (let y = 0; y < res; y++) {
        sum += tmp[y * res + x];
        count++;
        if (y >= r) { sum -= tmp[(y - r) * res + x]; count--; }
        grid[y * res + x] = sum / count;
      }
    }
  }
}

/** Thermal color map: dark blue → cyan → yellow → red → white */
function heatColor(t) {
  if (t < 0.2)       return [0,   Math.floor(t * 5 * 200), 255];
  if (t < 0.4)       return [0,   255, Math.floor((0.4 - t) * 5 * 255)];
  if (t < 0.65)      return [Math.floor((t - 0.4) * 4 * 255), 255, 0];
  if (t < 0.85)      return [255, Math.floor((0.85 - t) * 5 * 255), 0];
  return              [255, 255, Math.floor((t - 0.85) * 6.67 * 255)];
}
