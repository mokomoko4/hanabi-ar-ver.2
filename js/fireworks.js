// fireworks.js — outline-based fireworks engine
import * as THREE from 'three';

const VERT = `
  attribute vec3  aColor;
  attribute float aAlpha;
  attribute float aSize;
  uniform float uMaxPointSize;
  varying float vAlpha;
  varying vec3  vCol;
  void main() {
    vAlpha = aAlpha;
    vCol   = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float sz = aSize * (280.0 / -mv.z);
    gl_PointSize = clamp(sz, 2.0, uMaxPointSize);
    gl_Position  = projectionMatrix * mv;
  }
`;

const FRAG = `
  uniform float uBrightness;
  uniform float uGlowA;
  uniform float uGlowB;
  uniform float uCoreBoost;
  varying float vAlpha;
  varying vec3  vCol;
  void main() {
    vec2  uv   = gl_PointCoord - 0.5;
    float d    = length(uv);
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0,  0.22, d);
    float glow = 1.0 - smoothstep(0.22, 0.5,  d);
    float a    = (core * uGlowA + glow * uGlowB) * vAlpha;
    vec3  col  = vCol * uBrightness + vec3(core * uCoreBoost);
    gl_FragColor = vec4(col, a);
  }
`;

const MODE_PRESETS = {
  normal:           { nTotal: 600, baseSize: 3.5, maxPointSize: 60, glowA: 0.85, glowB: 0.35, coreBoost: 0.25, decay: 0.005, decayDelay: 0.45, rocketTime: 1.1, fallTime: 4.5 },
  finale:           { nTotal: 280, baseSize: 3.0, maxPointSize: 40, glowA: 0.80, glowB: 0.28, coreBoost: 0.18, decay: 0.008, decayDelay: 0.25, rocketTime: 0.7, fallTime: 2.0 },
  'image-readable': { nTotal: 400, baseSize: 2.4, maxPointSize: 38, glowA: 0.75, glowB: 0.18, coreBoost: 0.10, decay: 0.005, decayDelay: 0.40, rocketTime: 1.1, fallTime: 4.5 },
};

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function lerp(a, b, t)   { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function samplePathEvenly(pts, n) {
  if (pts.length < 2) return pts.length ? Array(n).fill(pts[0]) : [];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i-1][0], dy = pts[i][1] - pts[i-1][1];
    cum.push(cum[i-1] + Math.sqrt(dx*dx + dy*dy));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return Array(n).fill(pts[0]);
  const result = [];
  for (let i = 0; i < n; i++) {
    const target = (i / Math.max(n - 1, 1)) * total;
    let lo = 0, hi = cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      cum[mid + 1] < target ? (lo = mid + 1) : (hi = mid);
    }
    const segLen = cum[lo + 1] - cum[lo];
    const t = segLen > 0 ? (target - cum[lo]) / segLen : 0;
    const p0 = pts[lo], p1 = pts[lo + 1];
    result.push([lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t)]);
  }
  return result;
}

export class FireworksEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.particles = [];
    this.show = null;
    this.rocket = null;
    this.onComplete = null;
    this.brightnessMode = 'normal';
    this._overrides = { sizeScale: 1, glowMult: 1, brightness: 1, nTotalMult: 1, maxPointSize: null };
    this._init();
    this._loop();
  }

  _init() {
    const c = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas: c, alpha: false, antialias: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, c.clientWidth / c.clientHeight, 0.1, 500);
    this.camera.position.set(0, 0, 10);

    this._buildStars();

    const MAX = 12000;
    this.MAX = MAX;
    this.bufPos  = new Float32Array(MAX * 3);
    this.bufCol  = new Float32Array(MAX * 3);
    this.bufAlph = new Float32Array(MAX);
    this.bufSize = new Float32Array(MAX);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.bufPos,  3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(this.bufCol,  3));
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(this.bufAlph, 1));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(this.bufSize, 1));
    geo.setDrawRange(0, 0);

    this.uniforms = {
      uBrightness:   { value: 1.0 },
      uMaxPointSize: { value: 60.0 },
      uGlowA:        { value: 0.85 },
      uGlowB:        { value: 0.35 },
      uCoreBoost:    { value: 0.25 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);
    this.geo = geo;

    new ResizeObserver(() => this._resize()).observe(c);
    this._resize();
  }

  _resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _buildStars() {
    const n = 300;
    const pos  = new Float32Array(n * 3);
    const col  = new Float32Array(n * 3);
    const alph = new Float32Array(n);
    const sz   = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i*3]   = (Math.random() - 0.5) * 30;
      pos[i*3+1] = (Math.random() - 0.5) * 18;
      pos[i*3+2] = -1;
      const b = 0.5 + Math.random() * 0.5;
      col[i*3] = b; col[i*3+1] = b; col[i*3+2] = b;
      alph[i] = 0.3 + Math.random() * 0.5;
      sz[i]   = 1 + Math.random() * 1.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos,  3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(col,  3));
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alph, 1));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sz,   1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uBrightness: { value: 1.0 }, uMaxPointSize: { value: 12.0 }, uGlowA: { value: 0.85 }, uGlowB: { value: 0.35 }, uCoreBoost: { value: 0.25 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.starField = new THREE.Points(geo, mat);
    this.scene.add(this.starField);
    this._starAlph = alph;
    this._starTime = 0;
  }

  // ── public API ────────────────────────────────────────────────────────────

  launch(pathSegments, mode = 'normal') {
    const preset = MODE_PRESETS[mode] ?? MODE_PRESETS.normal;
    const ov = this._overrides;
    const gm = ov.glowMult;

    const params = {
      nTotal:       Math.round(preset.nTotal * ov.nTotalMult),
      baseSize:     preset.baseSize * ov.sizeScale,
      maxPointSize: ov.maxPointSize ?? preset.maxPointSize,
      glowA:        preset.glowA     * gm,
      glowB:        preset.glowB     * gm,
      coreBoost:    preset.coreBoost * gm,
      decay:        preset.decay,
      decayDelay:   preset.decayDelay,
    };

    this.uniforms.uMaxPointSize.value = params.maxPointSize;
    this.uniforms.uGlowA.value        = params.glowA;
    this.uniforms.uGlowB.value        = params.glowB;
    this.uniforms.uCoreBoost.value    = params.coreBoost;
    this.uniforms.uBrightness.value   = this.brightnessMode === 'high' ? 1.5 : ov.brightness;

    this.particles = [];
    this.show = {
      pathSegments, mode, params,
      phase: 'rocket', phaseT: 0,
      timings: { rocket: preset.rocketTime, fall: preset.fallTime },
    };
    this.center = new THREE.Vector3(0, 0.8, 0);
    this._launchRocket();
  }

  setBrightness(mode) {
    this.brightnessMode = mode;
    this.uniforms.uBrightness.value = mode === 'high' ? 1.5 : this._overrides.brightness;
  }

  setDisplayOverrides(updates) {
    Object.assign(this._overrides, updates);
    const ov = this._overrides;
    if ('brightness' in updates) {
      this.uniforms.uBrightness.value = this.brightnessMode === 'high' ? 1.5 : ov.brightness;
    }
    if ('maxPointSize' in updates) {
      this.uniforms.uMaxPointSize.value = ov.maxPointSize ?? (MODE_PRESETS[this.show?.mode] ?? MODE_PRESETS.normal).maxPointSize;
    }
    if ('glowMult' in updates) {
      const preset = MODE_PRESETS[this.show?.mode] ?? MODE_PRESETS.normal;
      this.uniforms.uGlowA.value     = preset.glowA     * ov.glowMult;
      this.uniforms.uGlowB.value     = preset.glowB     * ov.glowMult;
      this.uniforms.uCoreBoost.value = preset.coreBoost * ov.glowMult;
    }
  }

  setStarVisible(visible) {
    this.starField.visible = visible;
  }

  // ── internal ──────────────────────────────────────────────────────────────

  _launchRocket() {
    this.rocket = { x: 0, y: -7, z: 0, tx: this.center.x, ty: this.center.y, elapsed: 0, trailTimer: 0 };
  }

  _burstFlash() {
    const { x, y } = this.center;
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 0.04 + Math.random() * 0.12;
      this._addParticle({ x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd, r:1, g:0.95, b:0.8, a:1, size:9, decay:0.035, kind:'burst' });
    }
  }

  // Spawn contour (path) particles — used for main and accent layers
  _spawnContourSegs(segs, params) {
    const { x: cx, y: cy } = this.center;
    const { nTotal, baseSize, decay, decayDelay } = params;
    const totalPts = segs.reduce((s, seg) => s + seg.points.length, 0);
    const SCALE = 4.2;

    for (const seg of segs) {
      const n = Math.max(20, Math.round(nTotal * seg.points.length / Math.max(totalPts, 1)));
      const sampled = samplePathEvenly(seg.points, n);
      const [cr, cg, cb] = seg.color;
      for (const [nx, ny] of sampled) {
        const tx = cx + (nx - 0.5) * SCALE * 2;
        const ty = cy - (ny - 0.5) * SCALE * 2;
        const lx = tx - cx, ly = ty - cy;
        const len = Math.sqrt(lx*lx + ly*ly) || 1;
        this._addParticle({
          x: cx, y: cy, cx0: cx, cy0: cy, tx, ty,
          dirX: lx/len, dirY: ly/len, vx: 0, vy: 0, age: 0,
          r: cr/255, g: cg/255, b: cb/255, a: 1,
          size: baseSize * (0.85 + Math.random() * 0.3),
          decay, decayDelay, kind: 'outline',
        });
      }
    }
  }

  // Spawn fill particles from scattered interior points — used for fill and accent-fill layers
  _spawnFillSegs(segs, params) {
    const { x: cx, y: cy } = this.center;
    const { nTotal, baseSize, decay, decayDelay } = params;
    const alphaInit  = params.alphaInit  ?? 0.70;
    const colorScale = params.colorScale ?? 0.82;
    const totalPts = segs.reduce((s, seg) => s + seg.points.length, 0);
    const SCALE = 4.2;

    for (const seg of segs) {
      const n = Math.max(8, Math.round(nTotal * seg.points.length / Math.max(totalPts, 1)));
      const pts = seg.points;
      const step = Math.max(1, pts.length / n);
      const [cr, cg, cb] = seg.color;
      for (let i = 0; i < n; i++) {
        const [nx, ny] = pts[Math.min(Math.floor(i * step + Math.random() * step * 0.9), pts.length - 1)];
        const tx = cx + (nx - 0.5) * SCALE * 2;
        const ty = cy - (ny - 0.5) * SCALE * 2;
        const lx = tx - cx, ly = ty - cy;
        const len = Math.sqrt(lx*lx + ly*ly) || 1;
        this._addParticle({
          x: cx, y: cy, cx0: cx, cy0: cy, tx, ty,
          dirX: lx/len, dirY: ly/len, vx: 0, vy: 0, age: 0,
          r: cr/255 * colorScale, g: cg/255 * colorScale, b: cb/255 * colorScale,
          a: alphaInit,
          size: baseSize * (0.75 + Math.random() * 0.15),
          decay: decay * 1.2, decayDelay: decayDelay * 0.65, kind: 'fill',
        });
      }
    }
  }

  // Spawn all layers simultaneously at burst — fill → main → accent
  _spawnAllLayers() {
    const { pathSegments, params } = this.show;
    const mainSegs      = pathSegments.filter(s => s.layer === 'main');
    const fillSegs      = pathSegments.filter(s => s.layer === 'fill');
    const accentSegs    = pathSegments.filter(s => s.layer === 'accent');
    const accentContour = accentSegs.filter(s => s.kind !== 'fill');
    const accentFill    = accentSegs.filter(s => s.kind === 'fill');

    const noLayerInfo = mainSegs.length === 0 && fillSegs.length === 0 && accentSegs.length === 0;
    if (noLayerInfo) {
      this._spawnContourSegs(pathSegments, params);
      return;
    }

    const contourSegs = mainSegs.length > 0 ? mainSegs
      : pathSegments.filter(s => s.layer !== 'accent' && s.layer !== 'fill');

    // 1. Body fill — very sparse/dim, excluded near face features
    if (fillSegs.length > 0) {
      this._spawnFillSegs(fillSegs, {
        ...params,
        nTotal:     Math.round(params.nTotal * 0.18),
        baseSize:   params.baseSize * 0.50,
        decayDelay: params.decayDelay * 0.65,
        alphaInit:  0.30,
        colorScale: 0.55,
      });
    }
    // 2. Main contour — primary silhouette
    if (contourSegs.length > 0) {
      this._spawnContourSegs(contourSegs, params);
    }
    // 3. Accent contour — eyes, cheeks, tail stripes, mouth outline
    if (accentContour.length > 0) {
      this._spawnContourSegs(accentContour, {
        ...params,
        nTotal:     Math.round(params.nTotal * 0.40),
        baseSize:   params.baseSize * 0.70,
        decayDelay: params.decayDelay * 0.80,
      });
    }
    // 4. Accent fill — mouth only, minimal particles, full brightness
    if (accentFill.length > 0) {
      this._spawnFillSegs(accentFill, {
        ...params,
        nTotal:     Math.round(params.nTotal * 0.12),
        baseSize:   params.baseSize * 0.60,
        decayDelay: params.decayDelay * 0.75,
        alphaInit:  0.75,
        colorScale: 1.0,
      });
    }
  }

  _addParticle(p) { p.vx = p.vx ?? 0; p.vy = p.vy ?? 0; this.particles.push(p); }

  _update(dt) {
    this._tickStars(dt);
    const show = this.show;
    if (!show) return;

    show.phaseT += dt;
    const { timings } = show;

    if (show.phase === 'rocket') {
      const r = this.rocket;
      r.elapsed += dt; r.trailTimer += dt;
      const t = Math.min(r.elapsed / timings.rocket, 1);
      r.x = lerp(0, r.tx, easeOutCubic(t));
      r.y = lerp(-7, r.ty, easeOutCubic(t));
      if (r.trailTimer > 0.04) {
        r.trailTimer = 0;
        this._addParticle({ x: r.x+(Math.random()-0.5)*0.08, y: r.y-0.05, vx:(Math.random()-0.5)*0.015, vy:-(0.01+Math.random()*0.02), r:1, g:0.75, b:0.3, a:0.9, size:3.5, decay:0.07, kind:'trail' });
      }
      if (t >= 1) {
        show.phase = 'burst'; show.phaseT = 0;
        if (this._debugEl) this._debugEl.textContent = 'phase=burst';
        this._burstFlash();
        this._spawnAllLayers();
      }
    } else if (show.phase === 'burst') {
      if (this._debugEl) this._debugEl.textContent = `phase=burst  t=${show.phaseT.toFixed(2)}`;
      const alive = this.particles.some(p => (p.kind === 'outline' || p.kind === 'fill') && p.a > 0.02);
      if (!alive || show.phaseT >= timings.fall) {
        this.show = null; this.particles = [];
        if (this._debugEl) this._debugEl.textContent = 'phase=idle';
        this.onComplete?.();
      }
    }

    this._updateParticles(dt);
    this._syncBuffers();
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p.kind === 'trail' || p.kind === 'burst') {
        p.x += p.vx; p.y += p.vy;
        p.vy -= 0.0015; p.vx *= 0.97; p.vy *= 0.97;
        p.a -= p.decay;
        if (p.a < 0.01) this.particles.splice(i, 1);
        continue;
      }
      if (p.kind === 'outline' || p.kind === 'fill') {
        const isFill = p.kind === 'fill';
        p.age += dt;
        const age = p.age;
        const BURST_DUR = 0.55, LERP_END = BURST_DUR * 0.70;
        if (age <= LERP_END) {
          const tNorm = age / BURST_DUR;
          p.x = lerp(p.cx0, p.tx, easeOutCubic(tNorm));
          p.y = lerp(p.cy0, p.ty, easeOutCubic(tNorm));
          const dv = 3 * (1-tNorm) * (1-tNorm) * dt / BURST_DUR;
          p.vx = (p.tx - p.cx0) * dv;
          p.vy = (p.ty - p.cy0) * dv;
        } else {
          const drag = Math.min(
            lerp(0.955, 0.985, smoothstep(0.55, 1.4, age)),
            lerp(0.985, 0.976, smoothstep(1.00, 2.5, age))
          );
          p.vy -= isFill ? 0.0008 : 0.0013;
          if (p.vy < -0.022) p.vy = -0.022;
          p.vx *= drag; p.vy *= drag;
          p.x += p.vx; p.y += p.vy;
          const noiseT = smoothstep(0.55, 2.2, age);
          p.vx += (Math.random()-0.5) * (isFill ? 0.0003 : 0.0006) * noiseT;
          p.vy += (Math.random()-0.5) * (isFill ? 0.0002 : 0.0004) * noiseT;
        }
        if (p.decayDelay > 0) { p.decayDelay -= dt; }
        else { p.a -= lerp(0.004, 0.018, smoothstep(0.8, 2.2, age)); }
        if (p.a < 0.01) this.particles.splice(i, 1);
      }
    }
  }

  _tickStars(dt) {
    this._starTime += dt;
    const alph = this._starAlph;
    for (let i = 0; i < alph.length; i++) {
      alph[i] = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(this._starTime * 1.5 + i * 2.3));
    }
    this.starField.geometry.attributes.aAlpha.needsUpdate = true;
  }

  _syncBuffers() {
    let n = 0;
    const write = (x, y, z, r, g, b, a, sz) => {
      if (n >= this.MAX) return;
      const i3 = n * 3;
      this.bufPos[i3] = x; this.bufPos[i3+1] = y; this.bufPos[i3+2] = z;
      this.bufCol[i3] = r; this.bufCol[i3+1] = g; this.bufCol[i3+2] = b;
      this.bufAlph[n] = Math.max(0, Math.min(1, a));
      this.bufSize[n] = sz;
      n++;
    };
    if (this.show?.phase === 'rocket' && this.rocket) write(this.rocket.x, this.rocket.y, 0, 1, 0.95, 0.7, 1, 10);
    const BURST_DUR = 0.55;
    for (const p of this.particles) {
      const ss = ((p.kind === 'outline' || p.kind === 'fill') && p.age < BURST_DUR) ? easeOutCubic(p.age / BURST_DUR) : 1.0;
      write(p.x, p.y, 0, p.r, p.g, p.b, p.a, p.size * ss);
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate   = true;
    this.geo.attributes.aAlpha.needsUpdate   = true;
    this.geo.attributes.aSize.needsUpdate    = true;
  }

  _loop() {
    let last = performance.now();
    const tick = (now) => {
      requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this._update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(tick);
  }
}
