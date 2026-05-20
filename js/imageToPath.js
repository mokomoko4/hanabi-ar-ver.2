// imageToPath.js - smartphone-style pixel extraction for monitor fireworks.
//
// The phone app treats a white-background drawing as a cloud of non-white
// pixels. This monitor version keeps that recognition model, then returns a
// single pixel segment that fireworks.js can launch at a higher point count.

const DEFAULT_SIZE = 320;
const DRAW_SCALE = 0.94;

const PIXEL_LIMITS = {
  outline: 3200,
  feature: 1200,
  fill: 1000,
  max: 5200,
};

const DX8 = [ 1,  1,  0, -1, -1, -1,  0,  1];
const DY8 = [ 0,  1,  1,  1,  0, -1, -1, -1];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}

function isColored(r, g, b, a) {
  return a >= 15 && !(r > 248 && g > 248 && b > 248);
}

function isDark(r, g, b) {
  return (r < 92 && g < 92 && b < 92) || (r + g + b) < 220;
}

function isRed(r, g, b) {
  return r > 145 && g < 135 && b < 145 && r > g * 1.25;
}

function isOrange(r, g, b) {
  return r > 165 && g > 60 && g < 195 && b < 115 && r > g * 1.05;
}

function isYellow(r, g, b) {
  return r > 165 && g > 135 && b < 135 && Math.abs(r - g) < 105;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function neighborCount(colored, x, y, size) {
  let n = 0;
  for (let k = 0; k < 8; k++) {
    const nx = x + DX8[k], ny = y + DY8[k];
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    if (colored[ny * size + nx]) n++;
  }
  return n;
}

function touchesBackground(colored, x, y, size) {
  for (let k = 0; k < 8; k++) {
    const nx = x + DX8[k], ny = y + DY8[k];
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return true;
    if (!colored[ny * size + nx]) return true;
  }
  return false;
}

function makePixel(x, y, r, g, b, type, norm) {
  const nx = (x - norm.cx) / norm.scale;
  const ny = (y - norm.cy) / norm.scale;
  return {
    nx,
    ny,
    r: r / 255,
    g: g / 255,
    b: b / 255,
    type,
  };
}

function collectDrawingPixels(imageData, size) {
  const data = imageData.data;
  const colored = new Uint8Array(size * size);
  let minX = size, minY = size, maxX = -1, maxY = -1;
  let coloredCount = 0;
  let whiteCount = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (isColored(r, g, b, a)) {
        colored[y * size + x] = 1;
        coloredCount++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      } else {
        whiteCount++;
      }
    }
  }

  if (coloredCount === 0) return { pixels: [], metrics: { coloredCount, whiteCount } };

  const bw = Math.max(1, maxX - minX + 1);
  const bh = Math.max(1, maxY - minY + 1);
  const padding = Math.max(3, Math.round(Math.max(bw, bh) * 0.07));
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(size - 1, maxX + padding);
  maxY = Math.min(size - 1, maxY + padding);

  const norm = {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    scale: Math.max(maxX - minX + 1, maxY - minY + 1) / 2,
  };

  const outlinePx = [];
  const featurePx = [];
  const fillPx = [];
  let edgeCount = 0;
  const colorBins = new Set();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!colored[y * size + x]) continue;

      const nb = neighborCount(colored, x, y, size);
      if (nb <= 1) continue;

      const i = (y * size + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const bgEdge = touchesBackground(colored, x, y, size);
      if (bgEdge) edgeCount++;
      colorBins.add(`${r >> 5},${g >> 5},${b >> 5}`);

      if (isDark(r, g, b) || isRed(r, g, b) || isOrange(r, g, b)) {
        featurePx.push(makePixel(x, y, r, g, b, 1, norm));
      } else if (bgEdge || isYellow(r, g, b)) {
        outlinePx.push(makePixel(x, y, r, g, b, 0, norm));
      } else if (Math.random() < 0.18) {
        fillPx.push(makePixel(x, y, r, g, b, 2, norm));
      }
    }
  }

  shuffleInPlace(outlinePx);
  shuffleInPlace(featurePx);
  shuffleInPlace(fillPx);

  const pixels = [
    ...outlinePx.slice(0, PIXEL_LIMITS.outline),
    ...featurePx.slice(0, PIXEL_LIMITS.feature),
    ...fillPx.slice(0, PIXEL_LIMITS.fill),
  ].slice(0, PIXEL_LIMITS.max);

  return {
    pixels,
    metrics: {
      coloredCount,
      whiteCount,
      coloredRatio: coloredCount / (size * size),
      edgeDensity: edgeCount / Math.max(1, coloredCount),
      colorVariety: colorBins.size,
      bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      outline: outlinePx.length,
      feature: featurePx.length,
      fill: fillPx.length,
    },
  };
}

async function makeImagePixels(url, size) {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(size / iw, size / ih) * DRAW_SCALE;
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);

  return collectDrawingPixels(ctx.getImageData(0, 0, size, size), size);
}

export async function imageUrlToPathSegments(url, size = DEFAULT_SIZE) {
  const { pixels, metrics } = await makeImagePixels(url, size);

  if (pixels.length === 0) throw new Error('No valid drawing pixels found');

  const segment = {
    layer: 'image-pixels',
    kind: 'character-pixels',
    mode: 'character',
    isClosed: false,
    color: [255, 220, 80],
    points: pixels.map(p => [(p.nx + 1) / 2, (p.ny + 1) / 2]),
    pixels,
  };

  console.log('[imageToPath] smartphone pixel mode', {
    url: url.slice(0, 80),
    size,
    pixels: pixels.length,
    metrics,
  });

  return [segment];
}
