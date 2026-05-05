// main.js – App state machine
// States: upload → processing → preview → ar

import { loadImage }          from './moduleA-input.js';
import { removeBackground, renderNoBg } from './moduleB-background.js';
import { extractOutline, renderOutline } from './moduleC-outline.js';
import { vectorize }          from './moduleD-vectorize.js';
import { generateParticles, renderParticles } from './moduleE-particles.js';
import { FireworkSystem }     from './moduleF-firework.js';
import { ARRenderer }         from './moduleG-ar.js';
import { DebugPanel }         from './moduleH-debug.js';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const fileInput   = document.getElementById('file-input');
const screens     = {
  upload:     document.getElementById('screen-upload'),
  processing: document.getElementById('screen-processing'),
  preview:    document.getElementById('screen-preview'),
  ar:         document.getElementById('screen-ar'),
};
const statusEl    = document.getElementById('processing-status');
const statsEl     = document.getElementById('preview-stats');
const btnLaunch   = document.getElementById('btn-launch');
const btnRetry    = document.getElementById('btn-retry');
const btnArBack   = document.getElementById('btn-ar-back');
const btnDebugTog = document.getElementById('btn-debug-toggle');
const btnDebugCls = document.getElementById('btn-debug-close');
const arHint      = document.getElementById('ar-hint');

const previewCanvases = {
  original:  document.getElementById('canvas-original'),
  noBg:      document.getElementById('canvas-no-bg'),
  outline:   document.getElementById('canvas-outline'),
  particles: document.getElementById('canvas-particles'),
};

// ─── Singletons ───────────────────────────────────────────────────────────────
const ar    = new ARRenderer(
  document.getElementById('three-canvas'),
  document.getElementById('camera-video')
);
const debug = new DebugPanel(
  document.getElementById('debug-panel'),
  document.getElementById('debug-content')
);
let firework = null;
let particleData = null;

// ─── Screen helper ────────────────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// Copy a canvas element's content into a small preview canvas.
function copyToPreview(src, targetEl) {
  if (!src) return;
  targetEl.width  = src.width;
  targetEl.height = src.height;
  targetEl.getContext('2d').drawImage(src, 0, 0);
}

// ─── Processing pipeline ──────────────────────────────────────────────────────
async function processImage(file) {
  showScreen('processing');
  const t0 = performance.now();

  try {
    // A: Load
    statusEl.textContent = '画像を読み込み中...';
    const { canvas: origCanvas, imageData, width, height } =
      await loadImage(file, 480);

    // B: Background removal
    statusEl.textContent = '背景を除去中...';
    const noBgData = removeBackground(imageData, 248);
    const canvasNoBg = renderNoBg(noBgData);

    // C: Outline extraction
    statusEl.textContent = '輪郭を抽出中...';
    const { edgeMask, edgeCount } = extractOutline(noBgData);
    const canvasOutline = renderOutline(edgeMask, width, height);

    // D: Vectorize
    statusEl.textContent = 'ベクター化中...';
    const paths = vectorize(edgeMask, width, height, { epsilon: 1.5, minLength: 4 });

    // E: Particle placement
    statusEl.textContent = '粒子を配置中...';
    const spacing = Math.max(2, Math.round(edgeCount / 800));
    particleData  = generateParticles(paths, imageData, {
      spacing,
      maxParticles: 1000,
      particleSize: 9,
    });
    const canvasParticles = renderParticles(particleData, width, height);

    const ms = performance.now() - t0;

    // Update preview canvases
    copyToPreview(origCanvas,     previewCanvases.original);
    copyToPreview(canvasNoBg,     previewCanvases.noBg);
    copyToPreview(canvasOutline,  previewCanvases.outline);
    copyToPreview(canvasParticles, previewCanvases.particles);

    statsEl.textContent =
      `粒子数: ${particleData.length.toLocaleString()}　` +
      `パス数: ${paths.length}　` +
      `処理時間: ${ms.toFixed(0)} ms`;

    debug.update({
      processingMs:    ms,
      imageSize:       { w: width, h: height },
      edgeCount,
      pathCount:       paths.length,
      particleCount:   particleData.length,
      canvasNoBg,
      canvasOutline,
      canvasParticles,
    });

    showScreen('preview');
  } catch (err) {
    console.error(err);
    alert('処理中にエラーが発生しました: ' + err.message);
    showScreen('upload');
  }
}

// ─── AR launch ────────────────────────────────────────────────────────────────
async function startAR() {
  if (!particleData || particleData.length === 0) return;

  showScreen('ar');
  arHint.classList.remove('hidden');

  // One-time AR init
  if (!ar.renderer) {
    await ar.init();
    ar.startLoop((dt) => {
      if (firework) firework.update(dt);
    });
  }

  await ar.startCamera();

  // Load particles into a fresh firework system
  if (firework) firework.dispose();
  firework = new FireworkSystem(ar.scene);
  firework.load(particleData);

  // Auto-launch on first entry
  launchFirework();
}

function launchFirework() {
  if (!firework) return;
  firework.launch();
  arHint.classList.add('hidden');

  // Re-show hint after animation finishes (~5 s)
  setTimeout(() => arHint.classList.remove('hidden'), 5200);
}

function stopAR() {
  ar.stopCamera();
  if (firework) { firework.dispose(); firework = null; }
  showScreen('preview');
}

// ─── Event listeners ─────────────────────────────────────────────────────────
fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) processImage(file);
  // Reset so same file can be re-selected
  e.target.value = '';
});

btnLaunch.addEventListener('click', startAR);
btnRetry.addEventListener('click', () => showScreen('upload'));
btnArBack.addEventListener('click', stopAR);

// Tap anywhere in AR view to (re-)launch
screens.ar.addEventListener('click', (e) => {
  if (e.target === btnArBack) return;
  if (firework) {
    firework.dispose();
    firework = new FireworkSystem(ar.scene);
    firework.load(particleData);
    launchFirework();
  }
});

btnDebugTog.addEventListener('click', () => debug.show());
btnDebugCls.addEventListener('click', () => debug.hide());
