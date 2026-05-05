// Module E: Particle Placement
// Walks along vectorized paths and samples a particle every `spacing` pixels.
// Returns particles in image-normalized coordinates (x,y ∈ [-0.5, 0.5], y-up).

function fireworkColor(r, g, b) {
  // Black / very dark → gold
  if (r < 60 && g < 60 && b < 60) {
    return { r: 1.0, g: 0.88, b: 0.2 };
  }
  // Near-white → warm gold/cream
  if (r > 210 && g > 210 && b > 210) {
    return { r: 1.0, g: 0.95, b: 0.7 };
  }
  // Otherwise: normalize and boost brightness
  const max = Math.max(r, g, b, 1);
  const factor = 0.85 / (max / 255);
  return {
    r: Math.min(1.0, (r / 255) * factor + 0.15),
    g: Math.min(1.0, (g / 255) * factor + 0.05),
    b: Math.min(1.0, (b / 255) * factor),
  };
}

function sampleColor(imageData, x, y) {
  const xi = Math.round(x), yi = Math.round(y);
  const { data, width, height } = imageData;
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) {
    return { r: 1, g: 0.9, b: 0.3 };
  }
  const i = (yi * width + xi) * 4;
  return fireworkColor(data[i], data[i + 1], data[i + 2]);
}

export function generateParticles(paths, originalImageData, options = {}) {
  const { width, height } = originalImageData;
  const {
    spacing = 3,       // pixels along path between particles
    maxParticles = 1200,
    particleSize = 8,  // base size (shader uses this × DPR / distance)
  } = options;

  const particles = [];

  for (const path of paths) {
    if (path.length < 2) continue;
    let carry = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const ax = path[i].x,     ay = path[i].y;
      const bx = path[i + 1].x, by = path[i + 1].y;
      const segLen = Math.hypot(bx - ax, by - ay);
      let t = carry;

      while (t <= segLen) {
        const frac = segLen > 0 ? t / segLen : 0;
        const px = ax + (bx - ax) * frac;
        const py = ay + (by - ay) * frac;

        const col = sampleColor(originalImageData, px, py);

        particles.push({
          // Normalized coords: centre = (0,0), y-up
          nx: px / width - 0.5,
          ny: 0.5 - py / height,
          r: col.r,
          g: col.g,
          b: col.b,
          size: particleSize,
        });

        if (particles.length >= maxParticles) return particles;
        t += spacing;
      }

      carry = t - segLen;
    }
  }

  return particles;
}

// Debug: draws particles as dots on a canvas.
export function renderParticles(particles, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  for (const p of particles) {
    const px = (p.nx + 0.5) * width;
    const py = (0.5 - p.ny) * height;
    ctx.fillStyle = `rgb(${Math.round(p.r * 255)},${Math.round(p.g * 255)},${Math.round(p.b * 255)})`;
    ctx.beginPath();
    ctx.arc(px, py, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}
