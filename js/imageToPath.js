// imageToPath.js — image URL → PathSegments via connected-component outer-contour tracing
//
// Algorithm:
//  1. Draw image on canvas, remove white background → binary mask
//  2. BFS flood fill → connected components (4-connectivity)
//  3. Each component: Moore-neighbor contour trace from topmost-leftmost pixel
//     → this naturally gives the OUTER contour only (inner holes are never visited)
//  4. Resample contours evenly, proportional to perimeter length
//  5. Normalize all components together (preserve relative layout)

// 8-connectivity directions, clockwise from East
// 0=E  1=SE  2=S  3=SW  4=W  5=NW  6=N  7=NE
const DX8 = [ 1,  1,  0, -1, -1, -1,  0,  1];
const DY8 = [ 0,  1,  1,  1,  0, -1, -1, -1];

// 4-connectivity offsets for BFS
const DX4 = [ 1, -1,  0,  0];
const DY4 = [ 0,  0,  1, -1];

// ── image loading ─────────────────────────────────────────────────────────

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}

// ── mask preprocessing ────────────────────────────────────────────────────

function removeWhiteBackground(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] >= 230 && data[i+1] >= 230 && data[i+2] >= 230) data[i+3] = 0;
  }
}

function extractDominantColor(data) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i+3] > 64) {
      const pr = data[i], pg = data[i+1], pb = data[i+2];
      // Skip near-white pixels that survived background removal
      if (pr < 220 || pg < 220 || pb < 220) { r += pr; g += pg; b += pb; count++; }
    }
  }
  if (count === 0) return [255, 210, 60]; // fallback: golden
  return correctColor([Math.round(r/count), Math.round(g/count), Math.round(b/count)]);
}

function correctColor([r, g, b]) {
  const br = (r + g + b) / 3;
  if (br > 210) return [255, 220, 120]; // near-white  → golden
  if (br <  30) return [255, 160,  60]; // near-black  → warm orange
  return [r, g, b];
}

// ── connected components (BFS, 4-connected) ───────────────────────────────

function findComponents(mask, width, height) {
  const labels = new Int32Array(width * height).fill(-1);
  const components = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!mask[start] || labels[start] !== -1) continue;

      const label = components.length;
      const pixels = [];
      const queue  = [start];
      labels[start] = label;
      let head = 0;

      while (head < queue.length) {
        const idx = queue[head++];
        const cx  = idx % width;
        const cy  = (idx / width) | 0;
        pixels.push([cx, cy]);

        for (let d = 0; d < 4; d++) {
          const nx = cx + DX4[d], ny = cy + DY4[d];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nidx = ny * width + nx;
          if (mask[nidx] && labels[nidx] === -1) {
            labels[nidx] = label;
            queue.push(nidx);
          }
        }
      }

      components.push({ pixels, area: pixels.length });
    }
  }

  return components;
}

// ── Moore-neighbor outer contour tracing ──────────────────────────────────
//
// Starting from the topmost-leftmost pixel (which is guaranteed to be on the
// outer boundary), we follow the 8-connected Moore neighborhood clockwise.
// Because we start at the topmost pixel and always seek the next foreground
// pixel clockwise, we trace the OUTER contour only.  Inner holes and the inner
// edge of stroke rings are never reached.

function traceOuterContour(mask, width, height, startX, startY) {
  const contour = [];
  let cx = startX, cy = startY;

  // The topmost-leftmost pixel has background to the west (x-1 same row).
  // "backDir" = direction from current pixel back toward the previous pixel
  // (or the virtual entry background pixel).  For the start we entered from W.
  let backDir = 4; // West

  const MAX = width * height; // safe upper bound: contour can't exceed total pixel count
  let steps = 0;

  do {
    contour.push([cx, cy]);

    let moved = false;
    // Search clockwise starting one step past the backtrack direction
    for (let i = 1; i <= 8; i++) {
      const dir = (backDir + i) % 8;
      const nx  = cx + DX8[dir];
      const ny  = cy + DY8[dir];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (mask[ny * width + nx]) {
        backDir = (dir + 4) % 8; // direction back to previous pixel
        cx = nx; cy = ny;
        moved = true;
        break;
      }
    }

    if (!moved) break; // isolated pixel — contour is just that one point
    steps++;
  } while ((cx !== startX || cy !== startY) && steps < MAX);

  return contour;
}

// ── even resampling ───────────────────────────────────────────────────────

function resampleEvenly(pts, n) {
  if (pts.length <= 1) return pts;
  if (pts.length <= n) return pts;

  // Cumulative arc lengths (treating contour as closed)
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i-1][0], dy = pts[i][1] - pts[i-1][1];
    cum.push(cum[i-1] + Math.sqrt(dx*dx + dy*dy));
  }
  const last  = pts[pts.length - 1], first = pts[0];
  const close = Math.sqrt((last[0]-first[0])**2 + (last[1]-first[1])**2);
  const total = cum[cum.length-1] + close;
  if (total === 0) return Array(n).fill(pts[0]);

  const result = [];
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total;
    // Binary search for segment
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      cum[mid] <= target ? (lo = mid) : (hi = mid);
    }
    const next   = lo + 1 < cum.length ? cum[lo + 1] : total;
    const segLen = next - cum[lo];
    const t      = segLen > 0 ? Math.min(1, (target - cum[lo]) / segLen) : 0;
    const p0 = pts[lo], p1 = pts[(lo + 1) % pts.length];
    result.push([p0[0] + (p1[0]-p0[0])*t, p0[1] + (p1[1]-p0[1])*t]);
  }
  return result;
}

// ── global normalization (all segments share one coordinate space) ─────────

function normalizeAll(segments) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of segments) {
    for (const [x, y] of seg.points) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const range  = Math.max(rangeX, rangeY);
  const padX   = (range - rangeX) / 2;
  const padY   = (range - rangeY) / 2;
  return segments.map(seg => ({
    ...seg,
    points: seg.points.map(([x, y]) => [(x-minX+padX)/range, (y-minY+padY)/range]),
  }));
}

// ── main export ───────────────────────────────────────────────────────────

export async function imageUrlToPathSegments(url, size = 256) {
  const img = await loadImage(url);

  // Render to canvas at 90% fill
  const offscreen = document.createElement('canvas');
  offscreen.width = offscreen.height = size;
  const ctx = offscreen.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight) * 0.9;
  const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
  ctx.drawImage(img, (size-dw)/2, (size-dh)/2, dw, dh);

  const imageData = ctx.getImageData(0, 0, size, size);
  removeWhiteBackground(imageData.data);

  const color = extractDominantColor(imageData.data);

  // Binary mask: 1 = visible pixel
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    mask[i] = imageData.data[i * 4 + 3] > 32 ? 1 : 0;
  }

  // Connected components
  const allComponents = findComponents(mask, size, size);

  // Filter noise; keep up to 8 largest
  const MIN_AREA = 20;
  const validComps = allComponents
    .filter(c => c.area >= MIN_AREA)
    .sort((a, b) => b.area - a.area)
    .slice(0, 8);

  if (validComps.length === 0) {
    throw new Error(`No components (largest area=${allComponents[0]?.area ?? 0}, min=${MIN_AREA})`);
  }

  // Trace outer contour for each component
  const traced = [];
  for (const comp of validComps) {
    // Topmost-leftmost pixel (scan order guarantees this is on the outer boundary)
    let sx = Infinity, sy = Infinity;
    for (const [px, py] of comp.pixels) {
      if (py < sy || (py === sy && px < sx)) { sx = px; sy = py; }
    }
    const contour = traceOuterContour(mask, size, size, sx, sy);
    if (contour.length < 3) continue;
    traced.push({ contour, area: comp.area });
  }

  if (traced.length === 0) throw new Error('No valid contours extracted');

  // Compute contour perimeters for proportional point allocation
  const perimeters = traced.map(({ contour }) => {
    let len = 0;
    for (let i = 1; i < contour.length; i++) {
      const dx = contour[i][0]-contour[i-1][0], dy = contour[i][1]-contour[i-1][1];
      len += Math.sqrt(dx*dx + dy*dy);
    }
    return len;
  });
  const totalPerimeter = perimeters.reduce((s, l) => s + l, 0);

  // Allocate target points proportional to perimeter; min 20 per component
  const TOTAL_TARGET = 320;
  const segments = traced.map(({ contour }, i) => {
    const target = Math.max(20, Math.round(TOTAL_TARGET * perimeters[i] / totalPerimeter));
    const resampled = resampleEvenly(contour, target);
    return { points: resampled, color, isClosed: true };
  });

  const normalized = normalizeAll(segments);

  console.log('[imageToPath]', {
    url:         url.slice(0, 80),
    components:  allComponents.length,
    used:        traced.length,
    pointsPerSeg: normalized.map(s => s.points.length),
    color,
  });

  return normalized;
}
