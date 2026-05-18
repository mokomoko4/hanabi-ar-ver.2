// imageToPath.js — color-aware contour extraction for character fireworks
//
// Output:
//   layer:'main'   — primary silhouette (yellow/large components)
//   layer:'accent' — face parts, markings (black/red/orange small components)
//
// For non-colorful images, falls back to size-based main/accent split.

const DX8 = [ 1,  1,  0, -1, -1, -1,  0,  1];
const DY8 = [ 0,  1,  1,  1,  0, -1, -1, -1];
const DX4 = [ 1, -1,  0,  0];
const DY4 = [ 0,  0,  1, -1];

// ── color group definitions ────────────────────────────────────────────────
// Display colors are chosen to be visible against black background (additive blend)
const COLOR_GROUPS = [
  { name: 'yellow', layer: 'main',   displayColor: [255, 215,  50], minArea: 30, maxN: 6,
    match: (h, s, v) => h >= 38 && h <= 80 && s > 0.28 && v > 0.35 },
  { name: 'black',  layer: 'accent', displayColor: [200, 225, 255], minArea: 8,  maxN: 8,
    match: (h, s, v) => v < 0.28 },
  { name: 'red',    layer: 'accent', displayColor: [255, 110, 140], minArea: 8,  maxN: 4,
    match: (h, s, v) => (h < 20 || h > 340) && s > 0.35 && v > 0.28 },
  { name: 'orange', layer: 'accent', displayColor: [255, 175,  60], minArea: 12, maxN: 4,
    match: (h, s, v) => h >= 15 && h < 38 && s > 0.45 && v > 0.25 },
];

// ── helpers ───────────────────────────────────────────────────────────────

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}

function rgbToHsv(r, g, b) {
  const rf = r/255, gf = g/255, bf = b/255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rf)      h = ((gf - bf) / d + 6) % 6;
    else if (max === gf) h = (bf - rf) / d + 2;
    else                 h = (rf - gf) / d + 4;
  }
  return [h * 60, max > 0 ? d / max : 0, max]; // [hue°, sat, val]
}

function classifyPixel(pr, pg, pb) {
  const [h, s, v] = rgbToHsv(pr, pg, pb);
  for (const grp of COLOR_GROUPS) {
    if (grp.match(h, s, v)) return grp.name;
  }
  return null; // visible but unclassified
}

function correctColor([r, g, b]) {
  const br = (r + g + b) / 3;
  if (br > 210) return [255, 220, 120];
  if (br <  30) return [255, 160,  60];
  return [r, g, b];
}

function extractDominantColor(data) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i+3] > 64) {
      const pr = data[i], pg = data[i+1], pb = data[i+2];
      if (pr < 220 || pg < 220 || pb < 220) { r += pr; g += pg; b += pb; count++; }
    }
  }
  if (count === 0) return [255, 210, 60];
  return correctColor([Math.round(r/count), Math.round(g/count), Math.round(b/count)]);
}

// ── per-color binary masks ────────────────────────────────────────────────

function buildColorMasks(data, size) {
  const out = { any: new Uint8Array(size * size) };
  for (const grp of COLOR_GROUPS) out[grp.name] = new Uint8Array(size * size);

  for (let i = 0; i < size * size; i++) {
    if (data[i*4+3] <= 32) continue;
    const pr = data[i*4], pg = data[i*4+1], pb = data[i*4+2];
    if (pr >= 230 && pg >= 230 && pb >= 230) continue; // skip near-white
    out.any[i] = 1;
    const cls = classifyPixel(pr, pg, pb);
    if (cls) out[cls][i] = 1;
  }
  return out;
}

// ── connected components (BFS, 4-connected) ───────────────────────────────

function findComponents(mask, width, height) {
  const labels = new Int32Array(width * height).fill(-1);
  const components = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!mask[start] || labels[start] !== -1) continue;

      const label  = components.length;
      const pixels = [];
      const queue  = [start];
      labels[start] = label;
      let head = 0;

      while (head < queue.length) {
        const idx = queue[head++];
        const cx = idx % width, cy = (idx / width) | 0;
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

// ── Moore-neighbor outer contour trace ────────────────────────────────────

function traceOuterContour(mask, width, height, startX, startY) {
  const contour = [];
  let cx = startX, cy = startY, backDir = 4;
  const MAX = width * height;
  let steps = 0;

  do {
    contour.push([cx, cy]);
    let moved = false;
    for (let i = 1; i <= 8; i++) {
      const dir = (backDir + i) % 8;
      const nx  = cx + DX8[dir], ny = cy + DY8[dir];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (mask[ny * width + nx]) {
        backDir = (dir + 4) % 8;
        cx = nx; cy = ny;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    steps++;
  } while ((cx !== startX || cy !== startY) && steps < MAX);

  return contour;
}

// ── even resampling ───────────────────────────────────────────────────────

function resampleEvenly(pts, n) {
  if (pts.length <= 1) return pts;
  if (pts.length <= n)  return pts;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0]-pts[i-1][0], dy = pts[i][1]-pts[i-1][1];
    cum.push(cum[i-1] + Math.sqrt(dx*dx + dy*dy));
  }
  const last = pts[pts.length-1], first = pts[0];
  const total = cum[cum.length-1] + Math.sqrt((last[0]-first[0])**2+(last[1]-first[1])**2);
  if (total === 0) return Array(n).fill(pts[0]);
  const result = [];
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const mid=(lo+hi)>>1; cum[mid]<=target?(lo=mid):(hi=mid); }
    const next   = lo+1 < cum.length ? cum[lo+1] : total;
    const segLen = next - cum[lo];
    const t      = segLen > 0 ? Math.min(1, (target-cum[lo])/segLen) : 0;
    const p0 = pts[lo], p1 = pts[(lo+1) % pts.length];
    result.push([p0[0]+(p1[0]-p0[0])*t, p0[1]+(p1[1]-p0[1])*t]);
  }
  return result;
}

// ── global normalization ──────────────────────────────────────────────────

function normalizeAll(segments) {
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for (const seg of segments) {
    for (const [x, y] of seg.points) {
      if (x<minX) minX=x; if (x>maxX) maxX=x;
      if (y<minY) minY=y; if (y>maxY) maxY=y;
    }
  }
  const rangeX=maxX-minX||1, rangeY=maxY-minY||1;
  const range=Math.max(rangeX,rangeY);
  const padX=(range-rangeX)/2, padY=(range-rangeY)/2;
  return segments.map(seg => ({
    ...seg,
    points: seg.points.map(([x,y]) => [(x-minX+padX)/range, (y-minY+padY)/range]),
  }));
}

// ── mask → PathSegments ───────────────────────────────────────────────────

function maskToSegments(mask, size, { minArea, maxN, displayColor, layer, targetPoints }) {
  const comps = findComponents(mask, size, size)
    .filter(c => c.area >= minArea)
    .sort((a, b) => b.area - a.area)
    .slice(0, maxN);

  const raw = [];
  for (const comp of comps) {
    let sx = Infinity, sy = Infinity;
    for (const [px, py] of comp.pixels) {
      if (py < sy || (py === sy && px < sx)) { sx = px; sy = py; }
    }
    const contour = traceOuterContour(mask, size, size, sx, sy);
    if (contour.length < 3) continue;
    let perim = 0;
    for (let i = 1; i < contour.length; i++) {
      const dx=contour[i][0]-contour[i-1][0], dy=contour[i][1]-contour[i-1][1];
      perim += Math.sqrt(dx*dx+dy*dy);
    }
    raw.push({ contour, perim });
  }

  if (raw.length === 0) return [];

  const totalPerim = raw.reduce((s, r) => s + r.perim, 0);
  return raw.map(({ contour, perim }) => ({
    points:   resampleEvenly(contour, Math.max(15, Math.round(targetPoints * perim / totalPerim))),
    color:    displayColor,
    isClosed: true,
    layer,
  }));
}

// ── main export ───────────────────────────────────────────────────────────

export async function imageUrlToPathSegments(url, size = 256) {
  const img = await loadImage(url);

  const offscreen = document.createElement('canvas');
  offscreen.width = offscreen.height = size;
  const ctx = offscreen.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const sc = Math.min(size/img.naturalWidth, size/img.naturalHeight) * 0.9;
  const dw = img.naturalWidth*sc, dh = img.naturalHeight*sc;
  ctx.drawImage(img, (size-dw)/2, (size-dh)/2, dw, dh);

  const imageData = ctx.getImageData(0, 0, size, size);
  const masks = buildColorMasks(imageData.data, size);

  // Count pixels per group to decide extraction strategy
  const groupCounts = {};
  for (const grp of COLOR_GROUPS) {
    groupCounts[grp.name] = masks[grp.name].reduce((s, v) => s + v, 0);
  }
  const totalVisible = masks.any.reduce((s, v) => s + v, 0);
  const yellowRatio  = totalVisible > 0 ? groupCounts.yellow / totalVisible : 0;

  const useColorMode = yellowRatio > 0.05; // >5% yellow → treat as colored image

  const segments = [];

  if (useColorMode) {
    // Colored image: extract each color group separately
    for (const grp of COLOR_GROUPS) {
      if (groupCounts[grp.name] < grp.minArea) continue;
      const segs = maskToSegments(masks[grp.name], size, {
        ...grp,
        targetPoints: grp.layer === 'main' ? 300 : 160,
      });
      segments.push(...segs);
    }
  }

  // Fallback / supplement: use all visible pixels as main if no main segments found
  const hasMain = segments.some(s => s.layer === 'main');
  if (!hasMain) {
    const fallbackColor = extractDominantColor(imageData.data);
    const segs = maskToSegments(masks.any, size, {
      minArea: 20, maxN: 8, displayColor: fallbackColor, layer: 'main', targetPoints: 300,
    });
    segments.push(...segs);
  }

  if (segments.length === 0) throw new Error('No valid segments found');

  const normalized = normalizeAll(segments);

  const mainN   = normalized.filter(s => s.layer === 'main').length;
  const accentN = normalized.filter(s => s.layer === 'accent').length;
  console.log('[imageToPath]', {
    url:          url.slice(0, 80),
    colorMode:    useColorMode,
    yellowRatio:  yellowRatio.toFixed(2),
    groupCounts,
    mainSegs:     mainN,
    accentSegs:   accentN,
    pointsPerSeg: normalized.map(s => `${s.layer}:${s.points.length}`).join(', '),
  });

  return normalized;
}
