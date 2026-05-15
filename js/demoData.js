// demoData.js — dummy PathSegment data for fireworks engine testing

function norm(pts, flipY = true) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rx = maxX - minX || 1, ry = maxY - minY || 1;
  return pts.map(([x, y]) => [
    (x - minX) / rx,
    flipY ? 1 - (y - minY) / ry : (y - minY) / ry,
  ]);
}

function makeHeart(n = 400) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([
      16 * Math.pow(Math.sin(t), 3),
      13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t),
    ]);
  }
  return [{ points: norm(pts), color: [255, 80, 140], isClosed: true }];
}

function makeStar(arms = 5, n = 100) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    // lerp between outer and inner radius over each arm
    const phase = (i / n) * arms;
    const frac  = phase - Math.floor(phase);
    const r     = frac < 0.5
      ? 1.0 - (0.6 * frac * 2)       // outer → inner
      : 0.4 + (0.6 * (frac - 0.5) * 2); // inner → outer
    pts.push([0.5 + r * Math.cos(angle), 0.5 + r * Math.sin(angle)]);
  }
  return [{ points: pts, color: [255, 220, 50], isClosed: true }];
}

function makeCircle(n = 80) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([0.5 + 0.45 * Math.cos(t), 0.5 + 0.45 * Math.sin(t)]);
  }
  return [{ points: pts, color: [100, 200, 255], isClosed: true }];
}

function makeRenkon(n = 80) {
  // れんこん断面: 外円 + 7穴（穴はマイナス輪郭として別パス）
  const outer = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    outer.push([0.5 + 0.45 * Math.cos(t), 0.5 + 0.45 * Math.sin(t)]);
  }
  const holes = [
    [0.5, 0.5],
    [0.5, 0.22], [0.5, 0.78],
    [0.25, 0.36], [0.75, 0.36],
    [0.25, 0.64], [0.75, 0.64],
  ].map(([cx, cy]) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      pts.push([cx + 0.09 * Math.cos(t), cy + 0.09 * Math.sin(t)]);
    }
    return { points: pts, color: [255, 140, 60], isClosed: true };
  });
  return [
    { points: outer, color: [255, 140, 60], isClosed: true },
    ...holes,
  ];
}

function makeTulip() {
  const petals = [];
  // center petal
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * Math.PI * 2;
    const r = 0.18 + 0.07 * Math.cos(t * 2);
    petals.push([0.5 + r * Math.cos(t - Math.PI/2), 0.35 + r * Math.sin(t - Math.PI/2)]);
  }
  // left petal
  const left = [];
  for (let i = 0; i <= 50; i++) {
    const t = (i / 50) * Math.PI * 2;
    const r = 0.13 + 0.05 * Math.cos(t * 2);
    left.push([0.31 + r * Math.cos(t - Math.PI/2 - 0.4), 0.42 + r * Math.sin(t - Math.PI/2 - 0.4)]);
  }
  // right petal
  const right = left.map(([x, y]) => [1 - x, y]);
  // stem
  const stem = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    stem.push([0.5 + 0.02 * Math.sin(t * Math.PI * 2), 0.55 + t * 0.38]);
  }
  return [
    { points: petals, color: [255, 80,  140], isClosed: true },
    { points: left,   color: [255, 110, 160], isClosed: true },
    { points: right,  color: [255, 110, 160], isClosed: true },
    { points: stem,   color: [60,  200,  80], isClosed: false },
  ];
}

export const DEMO_SHAPES = [
  { label: 'ハート',     segments: makeHeart(),   nickname: 'テストちゃん' },
  { label: '星',         segments: makeStar(),    nickname: 'ほしくん' },
  { label: 'まる',       segments: makeCircle(),  nickname: 'まるちゃん' },
  { label: 'れんこん',   segments: makeRenkon(),  nickname: 'れんこんくん' },
  { label: 'チューリップ', segments: makeTulip(), nickname: 'はなちゃん' },
];
