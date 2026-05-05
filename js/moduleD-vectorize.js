// Module D: Vectorization
// Traces paths through the edge mask using directional 8-connectivity,
// then simplifies each path with Douglas-Peucker.

// 8-neighbourhood offsets [dx, dy]
const DIRS = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function tracePaths(edgeMask, width, height, minLength = 4) {
  const visited = new Uint8Array(edgeMask.length);
  const paths = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!edgeMask[idx] || visited[idx]) continue;

      const path = [];
      let cx = x, cy = y;
      let prevDx = 0, prevDy = 0;

      while (true) {
        const i = cy * width + cx;
        if (visited[i]) break;
        visited[i] = 1;
        path.push({ x: cx, y: cy });

        let bestScore = -3;
        let nx = -1, ny = -1;

        for (const [dx, dy] of DIRS) {
          const bx = cx + dx, by = cy + dy;
          if (bx < 0 || by < 0 || bx >= width || by >= height) continue;
          if (!edgeMask[by * width + bx] || visited[by * width + bx]) continue;

          // Prefer continuing in the same direction
          const score = prevDx * dx + prevDy * dy;
          if (score > bestScore) {
            bestScore = score;
            nx = bx;
            ny = by;
          }
        }

        if (nx === -1) break;
        prevDx = nx - cx;
        prevDy = ny - cy;
        cx = nx;
        cy = ny;
      }

      if (path.length >= minLength) paths.push(path);
    }
  }

  return paths;
}

// Perpendicular distance from point p to line segment (a, b).
function perpDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function douglasPeucker(pts, epsilon) {
  if (pts.length <= 2) return pts;

  let maxDist = 0, maxIdx = 0;
  const first = pts[0], last = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(pts.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(pts.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

// Main export: returns array of simplified paths [{x,y}[]].
export function vectorize(edgeMask, width, height, options = {}) {
  const { epsilon = 1.5, minLength = 5 } = options;

  const rawPaths = tracePaths(edgeMask, width, height, minLength);
  return rawPaths.map(p => douglasPeucker(p, epsilon));
}
