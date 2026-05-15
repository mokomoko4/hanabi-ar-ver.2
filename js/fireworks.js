// fireworks.js — outline-based fireworks engine (explosion-physics build)
import * as THREE from 'three';

const VERT = `
  attribute vec3  aColor;
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;
  varying vec3  vCol;
  void main() {
    vAlpha = aAlpha;
    vCol   = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float sz = aSize * (280.0 / -mv.z);
    gl_PointSize = clamp(sz, 2.0, 80.0);
    gl_Position  = projectionMatrix * mv;
  }
`;

const FRAG = `
  uniform float uBrightness;
  varying float vAlpha;
  varying vec3  vCol;
  void main() {
    vec2  uv   = gl_PointCoord - 0.5;
    float d    = length(uv);
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0,  0.22, d);
    float glow = 1.0 - smoothstep(0.22, 0.5,  d);
    float a    = (core * 0.85 + glow * 0.35) * vAlpha;
    vec3  col  = vCol * uBrightness + vec3(core * 0.25);
    gl_FragColor = vec4(col, a);
  }
`;

// ── helpers ────────────────────────────────────────────────────────────────

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutExpo(t)  { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
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

// ── FireworksEngine ────────────────────────────────────────────────────────

export class FireworksEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.particles = [];
    this.show = null;
    this.rocket = null;
    this.onComplete = null;
    this.brightnessMode = 'normal';
    this._init();
    this._loop();
  }

  // ── setup ────────────────────────────────────────────────────────────────

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

    this.uniforms = { uBrightness: { value: 1.0 } };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
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
      const bright = 0.5 + Math.random() * 0.5;
      col[i*3] = bright; col[i*3+1] = bright; col[i*3+2] = bright;
      alph[i] = 0.3 + Math.random() * 0.5;
      sz[i]   = 1 + Math.random() * 1.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos,  3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(col,  3));
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alph, 1));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sz,   1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uBrightness: { value: 1.0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.starField = new THREE.Points(geo, mat);
    this.scene.add(this.starField);
    this._starAlph = alph;
    this._starTime = 0;
  }

  // ── public API ────────────────────────────────────────────────────────────

  /**
   * @param {Array<{points:[number,number][], color:[number,number,number], isClosed:boolean}>} pathSegments
   * @param {'normal'|'finale'} mode
   */
  launch(pathSegments, mode = 'normal') {
    this.particles = [];
    this.show = {
      pathSegments,
      mode,
      phase: 'rocket',
      phaseT: 0,
      timings: mode === 'finale'
        ? { rocket: 0.7, fall: 2.0 }
        : { rocket: 1.1, fall: 4.5 },
    };
    this.uniforms.uBrightness.value = this.brightnessMode === 'high' ? 1.5 : 1.0;
    this.center = new THREE.Vector3(0, 0.8, 0);
    this._launchRocket();
  }

  setBrightness(mode) {
    this.brightnessMode = mode;
    this.uniforms.uBrightness.value = mode === 'high' ? 1.5 : 1.0;
  }

  // ── internal phases ───────────────────────────────────────────────────────

  _launchRocket() {
    this.rocket = {
      x: 0, y: -7, z: 0,
      tx: this.center.x, ty: this.center.y,
      elapsed: 0,
      trailTimer: 0,
    };
  }

  _burstFlash() {
    const { x, y } = this.center;
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 0.04 + Math.random() * 0.12;
      this._addParticle({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        r: 1, g: 0.95, b: 0.8,
        a: 1.0,
        size: 9,
        decay: 0.035,
        kind: 'burst',
      });
    }
  }

  _spawnShapeParticles() {
    const { pathSegments, mode } = this.show;
    const { x: cx, y: cy } = this.center;

    const totalPts = pathSegments.reduce((s, seg) => s + seg.points.length, 0);
    const N_TOTAL  = mode === 'finale' ? 600 : 1800;
    const SCALE    = 3.2;

    // speed proportional to distance → all particles arrive at shape at same time
    // higher SPEED_SCALE = faster "ドンッ" burst opening
    const SPEED_SCALE  = 0.085;
    const JITTER       = 0.010;
    const UPWARD_BIAS  = 0.0035;

    for (const seg of pathSegments) {
      const n        = Math.max(20, Math.round(N_TOTAL * seg.points.length / Math.max(totalPts, 1)));
      const sampled  = samplePathEvenly(seg.points, n);
      const [cr, cg, cb] = seg.color;
      const baseSize   = mode === 'finale' ? 3.5 : 5.0;
      const decay      = mode === 'finale' ? 0.008 : 0.005;
      const decayDelay = mode === 'finale' ? 0.25  : 0.45;

      for (const [nx, ny] of sampled) {
        // shape point in world space
        const tx = cx + (nx - 0.5) * SCALE * 2;
        const ty = cy - (ny - 0.5) * SCALE * 2;

        // direction and distance from burst center
        const lx  = tx - cx;
        const ly  = ty - cy;
        const len = Math.sqrt(lx * lx + ly * ly) || 1;
        const dx  = lx / len;
        const dy  = ly / len;

        // initial velocity: outward in shape direction, magnitude ∝ distance
        const speed = len * SPEED_SCALE;

        this._addParticle({
          x: cx, y: cy,
          dirX: dx, dirY: dy,
          vx: dx * speed + (Math.random() - 0.5) * JITTER,
          vy: dy * speed + UPWARD_BIAS + (Math.random() - 0.5) * JITTER,
          age: 0,
          r: cr / 255, g: cg / 255, b: cb / 255,
          a: 1.0,
          size: baseSize * (0.85 + Math.random() * 0.3),
          decay,
          decayDelay,
          kind: 'outline',
        });
      }
    }
  }

  _addParticle(p) {
    p.vx = p.vx ?? 0;
    p.vy = p.vy ?? 0;
    this.particles.push(p);
  }

  // ── update loop ───────────────────────────────────────────────────────────

  _update(dt) {
    this._tickStars(dt);

    const show = this.show;
    if (!show) return;

    show.phaseT += dt;
    const { timings } = show;

    if (show.phase === 'rocket') {
      const r = this.rocket;
      r.elapsed += dt;
      r.trailTimer += dt;
      const t = Math.min(r.elapsed / timings.rocket, 1);
      r.x = lerp(0,  r.tx, easeOutCubic(t));
      r.y = lerp(-7, r.ty, easeOutCubic(t));

      if (r.trailTimer > 0.04) {
        r.trailTimer = 0;
        this._addParticle({
          x: r.x + (Math.random() - 0.5) * 0.08,
          y: r.y - 0.05,
          vx: (Math.random() - 0.5) * 0.015,
          vy: -(0.01 + Math.random() * 0.02),
          r: 1, g: 0.75, b: 0.3,
          a: 0.9, size: 3.5, decay: 0.07,
          kind: 'trail',
        });
      }
      if (t >= 1) {
        show.phase = 'burst'; show.phaseT = 0;
        if (this._debugEl) this._debugEl.textContent = 'phase=burst';
        this._burstFlash();
        this._spawnShapeParticles();
      }
    }

    else if (show.phase === 'burst') {
      if (this._debugEl) {
        this._debugEl.textContent = `phase=burst  t=${show.phaseT.toFixed(2)}`;
      }
      const alive = this.particles.some(p => p.kind === 'outline' && p.a > 0.02);
      if (!alive || show.phaseT >= timings.fall) {
        this.show = null;
        this.particles = [];
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
        p.x  += p.vx; p.y += p.vy;
        p.vy -= 0.0015;
        p.vx *= 0.97; p.vy *= 0.97;
        p.a  -= p.decay;
        if (p.a < 0.01) { this.particles.splice(i, 1); }
        continue;
      }

      if (p.kind === 'outline') {
        p.age += dt;
        const age = p.age;

        // drag: punchy deceleration right after burst, smooth transition to float
        const earlyDrag = 0.930;
        const lateDrag  = 0.988;
        const drag = lerp(earlyDrag, lateDrag, smoothstep(0.30, 0.85, age));

        // outward drift: minimal so burst speed does the opening, not drift
        const drift = 0.00024 * Math.exp(-age * 4.2);
        p.vx += p.dirX * drift;
        p.vy += p.dirY * drift;

        // brief upward lift → "ふわっと開く" feeling right after burst
        p.vy += 0.0010 * Math.exp(-age * 6.0);

        // gravity delayed: outward speed fades first, then gravity pulls down
        const gravity = lerp(0.00020, 0.0020, smoothstep(0.40, 1.8, age));
        p.vy -= gravity;

        p.vx *= drag;
        p.vy *= drag;
        p.x  += p.vx;
        p.y  += p.vy;

        // noise grows over time: shape holds early, breaks up organically later
        const noiseT = smoothstep(0.4, 2.0, age);
        p.vx += (Math.random() - 0.5) * 0.0006 * noiseT;
        p.vy += (Math.random() - 0.5) * 0.0004 * noiseT;

        if (p.decayDelay > 0) {
          p.decayDelay -= dt;
        } else {
          p.a -= p.decay;
        }
        if (p.a < 0.01) { this.particles.splice(i, 1); }
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
      this.bufPos[i3]  = x; this.bufPos[i3+1]  = y; this.bufPos[i3+2]  = z;
      this.bufCol[i3]  = r; this.bufCol[i3+1]  = g; this.bufCol[i3+2]  = b;
      this.bufAlph[n]  = Math.max(0, Math.min(1, a));
      this.bufSize[n]  = sz;
      n++;
    };

    if (this.show?.phase === 'rocket' && this.rocket) {
      write(this.rocket.x, this.rocket.y, 0, 1, 0.95, 0.7, 1, 10);
    }

    const BURST_DUR = 0.20;
    for (const p of this.particles) {
      const sizeScale = (p.kind === 'outline' && p.age < BURST_DUR)
        ? easeOutExpo(p.age / BURST_DUR)
        : 1.0;
      write(p.x, p.y, 0, p.r, p.g, p.b, p.a, p.size * sizeScale);
    }

    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate   = true;
    this.geo.attributes.aAlpha.needsUpdate   = true;
    this.geo.attributes.aSize.needsUpdate    = true;
  }

  // ── render loop ───────────────────────────────────────────────────────────

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
