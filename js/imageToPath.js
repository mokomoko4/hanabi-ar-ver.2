// imageToPath.js — image URL → PathSegments for the fireworks engine

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}

// Remove white/near-white background in-place (matches design threshold)
function removeWhiteBackground(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] >= 248 && data[i + 1] >= 248 && data[i + 2] >= 248) {
      data[i + 3] = 0;
    }
  }
}

// Average color of visible, non-near-white pixels
function extractDominantColor(data) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 64) {
      const pr = data[i], pg = data[i + 1], pb = data[i + 2];
      // Skip near-white
      if (pr < 200 || pg < 200 || pb < 200) {
        r += pr; g += pg; b += pb;
        count++;
      }
    }
  }
  if (count === 0) return [255, 200, 50]; // fallback: golden
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

// Collect pixels on the boundary (adjacent to transparent or edge)
function findBoundaryPoints(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    mask[i] = data[i * 4 + 3] > 32 ? 1 : 0;
  }

  const pts = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      const onEdge =
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
        !mask[(y - 1) * width + x] ||
        !mask[(y + 1) * width + x] ||
        !mask[y * width + (x - 1)] ||
        !mask[y * width + (x + 1)];
      if (onEdge) pts.push([x, y]);
    }
  }
  return pts;
}

// Order boundary points by angle from centroid (works for convex/mildly concave shapes)
function orderByAngle(pts) {
  if (pts.length === 0) return pts;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [...pts].sort(
    (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx)
  );
}

// Evenly subsample an ordered array to at most n points
function subsample(pts, n) {
  if (pts.length <= n) return pts;
  const step = pts.length / n;
  return Array.from({ length: n }, (_, i) => pts[Math.floor(i * step)]);
}

// Normalize points to [0,1] with aspect ratio preserved
// Engine (fireworks.js) already flips Y via cy-(ny-0.5), so no flip here
function normalizePoints(pts) {
  if (pts.length === 0) return pts;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const range = Math.max(rangeX, rangeY);
  const padX = (range - rangeX) / 2;
  const padY = (range - rangeY) / 2;
  return pts.map(([x, y]) => [
    (x - minX + padX) / range,
    (y - minY + padY) / range,
  ]);
}

/**
 * Convert an image URL to PathSegments for the fireworks engine.
 * @param {string} url - CORS-accessible image URL
 * @param {number} size - processing canvas size (default 256)
 * @returns {Promise<Array<{points, color, isClosed}>>}
 */
export async function imageUrlToPathSegments(url, size = 256) {
  const img = await loadImage(url);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // White background + centered/scaled image (90% fill)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight) * 0.9;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

  const imageData = ctx.getImageData(0, 0, size, size);
  removeWhiteBackground(imageData.data);

  const color = extractDominantColor(imageData.data);
  const boundary = findBoundaryPoints(imageData.data, size, size);

  if (boundary.length < 20) {
    throw new Error(`Too few boundary pixels (${boundary.length}) — image may be blank or all-white`);
  }

  const ordered = orderByAngle(boundary);
  const sampled = subsample(ordered, 280);
  const normalized = normalizePoints(sampled);

  console.log('[imageToPath]', {
    url: url.slice(0, 80),
    boundaryPixels: boundary.length,
    outputPoints: normalized.length,
    color,
  });

  return [{ points: normalized, color, isClosed: true }];
}
