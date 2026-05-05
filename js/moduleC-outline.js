// Module C: Outline Extraction
// Finds border pixels: non-transparent pixels that have at least one
// transparent 4-neighbour.  Returns a Uint8Array mask and a debug canvas.

export function extractOutline(imageData) {
  const { data, width, height } = imageData;

  const isOpaque = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return data[(y * width + x) * 4 + 3] > 32;
  };

  const edgeMask = new Uint8Array(width * height);
  let edgeCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isOpaque(x, y)) continue;

      const border =
        !isOpaque(x - 1, y) ||
        !isOpaque(x + 1, y) ||
        !isOpaque(x, y - 1) ||
        !isOpaque(x, y + 1);

      if (border) {
        edgeMask[y * width + x] = 1;
        edgeCount++;
      }
    }
  }

  return { edgeMask, edgeCount, width, height };
}

// Returns a canvas with white edge pixels on black background for debugging.
export function renderOutline(edgeMask, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);
  const d = imgData.data;

  for (let i = 0; i < edgeMask.length; i++) {
    if (edgeMask[i]) {
      const p = i * 4;
      d[p] = 255; d[p + 1] = 255; d[p + 2] = 255; d[p + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
