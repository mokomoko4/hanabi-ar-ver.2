// Module H: Debug / Tuning Panel

export class DebugPanel {
  constructor(panelEl, contentEl) {
    this.panel   = panelEl;
    this.content = contentEl;
    this.data    = {};
  }

  update(info) {
    Object.assign(this.data, info);
    this._render();
  }

  show() { this.panel.style.display = 'block'; }
  hide() { this.panel.style.display = 'none'; }

  _render() {
    const d = this.data;
    let html = '';

    if (d.processingMs != null) {
      html += `<div class="debug-section"><h4>処理時間</h4>${d.processingMs.toFixed(1)} ms</div>`;
    }

    if (d.imageSize) {
      html += `<div class="debug-section"><h4>画像サイズ</h4>${d.imageSize.w} × ${d.imageSize.h} px</div>`;
    }

    if (d.edgeCount != null) {
      html += `<div class="debug-section"><h4>輪郭ピクセル数</h4>${d.edgeCount.toLocaleString()} px</div>`;
    }

    if (d.pathCount != null) {
      html += `<div class="debug-section"><h4>ベクターパス数</h4>${d.pathCount}</div>`;
    }

    if (d.particleCount != null) {
      html += `<div class="debug-section"><h4>粒子数</h4>${d.particleCount.toLocaleString()}</div>`;
    }

    if (d.canvasNoBg) {
      html += `<div class="debug-section"><h4>背景除去後</h4>${this._canvasTag(d.canvasNoBg)}</div>`;
    }

    if (d.canvasOutline) {
      html += `<div class="debug-section"><h4>輪郭抽出結果</h4>${this._canvasTag(d.canvasOutline)}</div>`;
    }

    if (d.canvasParticles) {
      html += `<div class="debug-section"><h4>粒子配置プレビュー</h4>${this._canvasTag(d.canvasParticles)}</div>`;
    }

    this.content.innerHTML = html;

    if (d.canvasNoBg)    this._injectCanvas('dbg-nobg',    d.canvasNoBg);
    if (d.canvasOutline) this._injectCanvas('dbg-outline',  d.canvasOutline);
    if (d.canvasParticles) this._injectCanvas('dbg-parts', d.canvasParticles);
  }

  _canvasTag(id) {
    return `<canvas id="${id}"></canvas>`;
  }

  _injectCanvas(id, srcCanvas) {
    const target = this.content.querySelector(`#${id}`);
    if (!target || !srcCanvas) return;
    target.width  = srcCanvas.width;
    target.height = srcCanvas.height;
    const ctx = target.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0);
  }
}
