// Module G: WebAR Renderer
// Sets up Three.js with an alpha canvas overlaid on a camera video feed.

import * as THREE from 'three';

export class ARRenderer {
  constructor(canvasEl, videoEl) {
    this.canvas = canvasEl;
    this.video  = videoEl;

    this.renderer = null;
    this.scene    = null;
    this.camera   = null;
    this._raf     = null;
    this._onRender = null;  // external callback(dt)
    this._last    = null;
    this.cameraActive = false;
  }

  async init() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha:  true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    window.addEventListener('resize', () => this._resize());
  }

  async startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();
      this.cameraActive = true;
    } catch (err) {
      console.warn('Camera not available:', err);
      // App works without camera (dark background)
    }
  }

  stopCamera() {
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
    }
    this.cameraActive = false;
  }

  startLoop(onRender) {
    this._onRender = onRender;
    this._last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt  = Math.min((now - this._last) / 1000, 0.05);
      this._last = now;
      if (this._onRender) this._onRender(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stopLoop() {
    if (this._raf != null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stopLoop();
    this.stopCamera();
    this.renderer.dispose();
  }
}
