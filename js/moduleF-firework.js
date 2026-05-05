// Module F: Firework Animation
// Manages a THREE.js particle system that animates through:
//   LAUNCH → BURST → HOLD → EXPAND → FALL → DONE

import * as THREE from 'three';

const VERT = `
uniform float uPixelRatio;
attribute float aSize;
attribute float aAlpha;
attribute vec3  aColor;
varying float   vAlpha;
varying vec3    vColor;

void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * 5.0 / -mvPos.z;
  gl_Position  = projectionMatrix * mvPos;
}
`;

const FRAG = `
varying float vAlpha;
varying vec3  vColor;

void main() {
  vec2  c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float a    = vAlpha * max(0.0, 1.0 - r);
  float core = max(0.0, 1.0 - r * 4.0);
  vec3 col   = mix(vColor, vec3(1.0, 0.97, 0.88), core * 0.75);
  gl_FragColor = vec4(col, a);
}
`;

// Phase durations (seconds)
const T_LAUNCH = 0.75;
const T_BURST  = 0.35;
const T_HOLD   = 0.65;
const T_EXPAND = 0.85;
const T_FALL   = 2.4;

// World-space firework settings
const SCALE    = 3.2;   // image → world unit scale
const CY       = 0.8;   // firework centre Y offset (above origin)
const LAUNCH_Y = -3.2;  // rocket start Y

export class FireworkSystem {
  constructor(scene) {
    this.scene = scene;
    this.points = null;
    this.geometry = null;
    this.phase = 'idle';
    this.phaseTime = 0;

    // per-particle arrays (set when .load() is called)
    this.N = 0;
    this.targetPos  = null;
    this.currentPos = null;
    this.velocity   = null;
    this.colorsArr  = null;
    this.sizesArr   = null;
    this.alphasArr  = null;

    // Three.js buffer attributes (ref kept for needsUpdate)
    this._posAttr   = null;
    this._alphaAttr = null;
  }

  // particleData: [{nx, ny, r, g, b, size}, ...]
  load(particleData) {
    this.dispose();

    this.N = particleData.length;
    if (this.N === 0) return;

    this.targetPos  = new Float32Array(this.N * 3);
    this.currentPos = new Float32Array(this.N * 3);
    this.velocity   = new Float32Array(this.N * 3);
    this.colorsArr  = new Float32Array(this.N * 3);
    this.sizesArr   = new Float32Array(this.N);
    this.alphasArr  = new Float32Array(this.N);

    for (let i = 0; i < this.N; i++) {
      const p = particleData[i];
      const wx = p.nx * SCALE;
      const wy = p.ny * SCALE + CY;
      this.targetPos[i * 3]     = wx;
      this.targetPos[i * 3 + 1] = wy;
      this.targetPos[i * 3 + 2] = 0;

      this.colorsArr[i * 3]     = p.r;
      this.colorsArr[i * 3 + 1] = p.g;
      this.colorsArr[i * 3 + 2] = p.b;
      this.sizesArr[i]           = p.size;

      // Start at launch position
      this.currentPos[i * 3]     = (Math.random() - 0.5) * 0.12;
      this.currentPos[i * 3 + 1] = LAUNCH_Y;
      this.currentPos[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
      this.alphasArr[i]           = 0;
    }

    const geo = new THREE.BufferGeometry();
    this._posAttr   = new THREE.BufferAttribute(this.currentPos, 3);
    this._alphaAttr = new THREE.BufferAttribute(this.alphasArr, 1);

    geo.setAttribute('position', this._posAttr);
    geo.setAttribute('aColor',   new THREE.BufferAttribute(this.colorsArr, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(this.sizesArr, 1));
    geo.setAttribute('aAlpha',   this._alphaAttr);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: window.devicePixelRatio || 1 } },
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    });

    this.geometry = geo;
    this.points   = new THREE.Points(geo, mat);
    this.scene.add(this.points);
  }

  launch() {
    if (this.N === 0) return;
    this.phase     = 'launch';
    this.phaseTime = 0;
  }

  update(dt) {
    if (this.phase === 'idle' || this.phase === 'done' || this.N === 0) return;

    this.phaseTime += dt;

    switch (this.phase) {
      case 'launch':  this._updateLaunch(dt);  break;
      case 'burst':   this._updateBurst(dt);   break;
      case 'hold':    this._updateHold(dt);    break;
      case 'expand':  this._updateExpand(dt);  break;
      case 'fall':    this._updateFall(dt);    break;
    }

    this._posAttr.needsUpdate   = true;
    this._alphaAttr.needsUpdate = true;
  }

  isRunning() {
    return this.phase !== 'idle' && this.phase !== 'done';
  }

  dispose() {
    if (this.points) {
      this.scene.remove(this.points);
      this.geometry.dispose();
      this.points.material.dispose();
      this.points   = null;
      this.geometry = null;
    }
    this.phase = 'idle';
  }

  // ─── Phase implementations ───────────────────────────────────────

  _updateLaunch() {
    const t     = Math.min(1, this.phaseTime / T_LAUNCH);
    const rocketY = LAUNCH_Y + (CY - LAUNCH_Y) * this._easeIn(t);
    const spread  = 0.08;
    const glow    = 0.7 + Math.sin(this.phaseTime * 30) * 0.2;

    for (let i = 0; i < this.N; i++) {
      this.currentPos[i * 3]     = (Math.random() - 0.5) * spread;
      this.currentPos[i * 3 + 1] = rocketY + (Math.random() - 0.5) * spread * 0.5;
      this.currentPos[i * 3 + 2] = (Math.random() - 0.5) * spread;
      this.alphasArr[i]           = Math.min(1, t * 2) * glow;
    }

    if (this.phaseTime >= T_LAUNCH) this._nextPhase('burst');
  }

  _updateBurst() {
    const t    = Math.min(1, this.phaseTime / T_BURST);
    const ease = this._easeOut(t);

    for (let i = 0; i < this.N; i++) {
      this.currentPos[i * 3]     = this.targetPos[i * 3]     * ease;
      this.currentPos[i * 3 + 1] = this.targetPos[i * 3 + 1] * ease
                                    + CY * (1 - ease);
      this.currentPos[i * 3 + 2] = this.targetPos[i * 3 + 2] * ease;
      this.alphasArr[i]           = ease;
    }

    if (this.phaseTime >= T_BURST) {
      // Initialise expand velocities ahead of time
      for (let i = 0; i < this.N; i++) {
        const tx = this.targetPos[i * 3];
        const ty = this.targetPos[i * 3 + 1] - CY;
        const d  = Math.hypot(tx, ty) || 1;
        const speed = 0.5 + Math.random() * 0.6;
        this.velocity[i * 3]     = (tx / d) * speed;
        this.velocity[i * 3 + 1] = (ty / d) * speed + Math.random() * 0.2;
        this.velocity[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      }
      this._nextPhase('hold');
    }
  }

  _updateHold() {
    const jitter = 0.012;
    for (let i = 0; i < this.N; i++) {
      this.currentPos[i * 3]     = this.targetPos[i * 3]     + (Math.random() - 0.5) * jitter;
      this.currentPos[i * 3 + 1] = this.targetPos[i * 3 + 1] + (Math.random() - 0.5) * jitter;
      this.currentPos[i * 3 + 2] = this.targetPos[i * 3 + 2];
      this.alphasArr[i]           = 1.0;
    }
    if (this.phaseTime >= T_HOLD) this._nextPhase('expand');
  }

  _updateExpand(dt) {
    const t = Math.min(1, this.phaseTime / T_EXPAND);
    for (let i = 0; i < this.N; i++) {
      this.currentPos[i * 3]     += this.velocity[i * 3]     * dt;
      this.currentPos[i * 3 + 1] += this.velocity[i * 3 + 1] * dt;
      this.currentPos[i * 3 + 2] += this.velocity[i * 3 + 2] * dt;
      this.alphasArr[i]            = 1.0 - t * 0.35;
    }
    if (this.phaseTime >= T_EXPAND) this._nextPhase('fall');
  }

  _updateFall(dt) {
    const t       = Math.min(1, this.phaseTime / T_FALL);
    const gravity = -1.8;

    for (let i = 0; i < this.N; i++) {
      this.velocity[i * 3 + 1] += gravity * dt;
      this.currentPos[i * 3]     += this.velocity[i * 3]     * dt;
      this.currentPos[i * 3 + 1] += this.velocity[i * 3 + 1] * dt;
      this.currentPos[i * 3 + 2] += this.velocity[i * 3 + 2] * dt;
      this.alphasArr[i]            = Math.max(0, 0.65 - t * 0.65);
    }

    if (this.phaseTime >= T_FALL) this.phase = 'done';
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  _nextPhase(name) {
    this.phase     = name;
    this.phaseTime = 0;
  }

  _easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  _easeIn(t)  { return t * t * t; }
}
