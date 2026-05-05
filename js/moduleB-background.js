// Module B: Background Removal
// Removes near-white pixels (default threshold r,g,b >= 248) by setting alpha=0.
// Returns a new ImageData object.

export function removeBackground(imageData, threshold = 248) {
  const { data, width, height } = imageData;
  const out = new ImageData(
    new Uint8ClampedArray(data),
    width,
    height
  );
  const d = out.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      d[i + 3] = 0;
    }
  }

  return out;
}

// Returns a canvas showing the result for debug/preview purposes.
export function renderNoBg(imageData) {
  const { width, height } = imageData;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
