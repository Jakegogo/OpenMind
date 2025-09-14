import { MarkdownRenderer, MarkdownView, Notice, TFile } from 'obsidian';

export class PopupController {
  containerElDiv: HTMLDivElement | null = null;
  jm: any | null = null;
  app: any;
  plugin: any;
  file: TFile | null = null;
  shouldMindmapDriveMarkdown: () => boolean = () => false;
  isMindmapEditingActive: () => boolean = () => false;
  hoverPopupEl: HTMLDivElement | null = null;
  hoverPopupForNodeId: string | null = null;
  hoverPopupRAF: number | null = null;
  hoverHideTimeoutId: number | null = null;
  lastFileContent: string = '';
  headingsCache?: any[];
  computeHeadingSections: (text: string) => any[] = () => [];

  show(nodeId: string) {
    try {
      if (!(this.plugin as any)?.settings?.enablePopup) { this.hide(); return; }
      if (!this.containerElDiv) return;
      if (this.isMindmapEditingActive()) return;
      const body = this.extractNodeImmediateBody(nodeId);
      if (!body || body.trim().length === 0) { this.hide(); return; }
      let el = this.hoverPopupEl;
      if (!el) {
        el = document.createElement('div');
        try { el.classList.add('mm-popup'); } catch {}
        el.style.position = 'absolute';
        el.style.zIndex = '6';
        el.style.minWidth = '220px';
        el.style.maxWidth = '420px';
        el.style.maxHeight = '240px';
        el.style.overflow = 'auto';
        el.style.padding = '4px 6px';
        el.style.borderRadius = '6px';
        el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
        {
          const isDark = document.body.classList.contains('theme-dark');
          el.style.setProperty('border', isDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)', 'important');
          el.style.setProperty('background', isDark ? 'rgba(30,30,30,0.68)' : 'rgba(255,255,255,0.85)', 'important');
        }
        (el.style as any).backdropFilter = 'blur(15px)';
        (el.style as any).webkitBackdropFilter = 'blur(15px)';
        el.style.backgroundClip = 'padding-box';
        el.style.color = 'var(--text-normal)';
        el.style.whiteSpace = 'pre-wrap';
        el.style.pointerEvents = 'auto';
        ;(el.style as any).userSelect = 'text';
        ;(el.style as any).webkitUserSelect = 'text';
        try {
          const stop = (ev: Event) => ev.stopPropagation();
          el.addEventListener('mousedown', stop);
          el.addEventListener('mouseup', stop);
          el.addEventListener('click', stop);
          el.addEventListener('dblclick', stop);
        } catch {}
        this.containerElDiv!.appendChild(el);
        this.hoverPopupEl = el;
      }
      try {
        const isDarkNow = document.body.classList.contains('theme-dark');
        this.hoverPopupEl!.style.setProperty('border', isDarkNow ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)', 'important');
        this.hoverPopupEl!.style.setProperty('background', isDarkNow ? 'rgba(30,30,30,0.68)' : 'rgba(255,255,255,0.85)', 'important');
      } catch {}
      try {
        const popup = this.hoverPopupEl!;
        if (!(popup as any).__mm_popup_bound) {
          popup.addEventListener('mouseleave', (ev: MouseEvent) => {
            const rel = ev.relatedTarget as HTMLElement | null;
            const intoNode = rel && (rel.closest ? rel.closest('jmnode') : null);
            if (intoNode) return;
            if (this.hoverHideTimeoutId != null) { try { window.clearTimeout(this.hoverHideTimeoutId); } catch {} }
            this.hoverHideTimeoutId = window.setTimeout(() => {
              this.hoverHideTimeoutId = null;
              this.hide();
            }, 150);
          });
          (popup as any).__mm_popup_bound = true;
        }
      } catch {}
      if (this.hoverPopupEl && this.hoverPopupEl.parentElement !== this.containerElDiv) {
        this.containerElDiv!.appendChild(this.hoverPopupEl);
      }
      if (this.hoverHideTimeoutId != null) { try { window.clearTimeout(this.hoverHideTimeoutId); } catch {} this.hoverHideTimeoutId = null; }
      this.hoverPopupForNodeId = nodeId;
      const popup = this.hoverPopupEl!;
      try { popup.classList.add('markdown-rendered'); } catch {}
      popup.style.whiteSpace = 'normal';
      popup.innerHTML = '';
      try {
        MarkdownRenderer.renderMarkdown(body.trim(), popup, this.file?.path ?? '', this.plugin);
      } catch {
        const fallback = document.createElement('div');
        fallback.textContent = body.trim();
        popup.appendChild(fallback);
      }
      this.updatePosition();
      if (this.hoverPopupRAF == null) {
        const tick = () => {
          this.updatePosition();
          if (this.hoverPopupEl && this.hoverPopupEl.style.display !== 'none') {
            this.hoverPopupRAF = window.requestAnimationFrame(tick);
          } else {
            if (this.hoverPopupRAF != null) { try { window.cancelAnimationFrame(this.hoverPopupRAF); } catch {}; this.hoverPopupRAF = null; }
          }
        };
        this.hoverPopupRAF = window.requestAnimationFrame(tick);
      }
    } catch {}
  }

  hide() {
    try {
      if (this.hoverPopupEl) this.hoverPopupEl.style.display = 'none';
      this.hoverPopupForNodeId = null;
      if (this.hoverPopupRAF != null) { try { window.cancelAnimationFrame(this.hoverPopupRAF); } catch {}; this.hoverPopupRAF = null; }
    } catch {}
  }

  updatePosition() {
    try {
      if (!this.hoverPopupEl || !this.containerElDiv || !this.hoverPopupForNodeId) return;
      const nodeEl = this.containerElDiv.querySelector(`jmnode[nodeid="${this.hoverPopupForNodeId}"]`) as HTMLElement | null;
      if (!nodeEl) return;
      const rect = nodeEl.getBoundingClientRect();
      const hostRect = this.containerElDiv.getBoundingClientRect();
      const node = this.jm?.get_node?.(this.hoverPopupForNodeId);
      const isLeft = node && (node.direction === (window.jsMind?.direction?.left ?? 'left'));
      const gap = 8;
      const margin = 6;
      const popupEl = this.hoverPopupEl as HTMLDivElement;
      if (!popupEl.offsetWidth || !popupEl.offsetHeight || popupEl.style.display === 'none') {
        popupEl.style.visibility = 'hidden';
        popupEl.style.display = 'block';
      }
      const popupW = popupEl.offsetWidth || 220;
      const popupH = popupEl.offsetHeight || 180;
      let x = isLeft ? (rect.left - hostRect.left) - (popupW + gap) : (rect.right - hostRect.left) + gap;
      if (!isLeft && (x + popupW > hostRect.width - margin)) {
        x = (rect.left - hostRect.left) - (popupW + gap);
      }
      if (x < margin) x = margin;
      const nodeLeft = rect.left - hostRect.left;
      const nodeRight = rect.right - hostRect.left;
      const popupLeft = x;
      const popupRight = x + popupW;
      const overlapsHorizontally = !(popupRight <= nodeLeft - gap || popupLeft >= nodeRight + gap);
      let y: number = rect.top - hostRect.top;
      if (overlapsHorizontally) {
        const spaceBelow = hostRect.bottom - rect.bottom - margin;
        const spaceAbove = rect.top - hostRect.top - margin;
        if (spaceBelow >= popupH + gap || spaceBelow >= spaceAbove) {
          y = rect.bottom - hostRect.top + gap;
        } else {
          y = rect.top - hostRect.top - popupH - gap;
          if (y < margin) y = margin;
        }
      }
      popupEl.style.left = `${x}px`;
      popupEl.style.top = `${Math.max(0, y)}px`;
      popupEl.style.display = 'block';
      popupEl.style.visibility = 'visible';
    } catch {}
  }

  extractNodeImmediateBody(nodeId: string): string {
    try {
      const content = this.lastFileContent || '';
      if (!content) return '';
      const headings = (this.headingsCache && (this.headingsCache as any[]).length) ? (this.headingsCache as any[]) : this.computeHeadingSections(content);
      const idx = headings.findIndex((h: any) => h.id === nodeId);
      if (idx === -1) return '';
      const h = headings[idx] as any;
      const startBody = Math.min(content.length, Math.max(0, h.headingTextEnd + 1));
      const next = headings[idx + 1] as any;
      const endBody = next ? Math.max(startBody, next.start - 1) : Math.max(startBody, content.length);
      const raw = content.slice(startBody, endBody);
      return raw.replace(/^\s*\n/, '').trimEnd();
    } catch { return ''; }
  }
}

export class ButtonController {
  containerElDiv: HTMLDivElement | null = null;
  jm: any | null = null;
  app: any;
  plugin: any;
  file: TFile | null = null;
  shouldMindmapDriveMarkdown: () => boolean = () => false;
  isMindmapEditingActive: () => boolean = () => false;
  addButtonEl: HTMLButtonElement | null = null;
  deleteButtonEl: HTMLButtonElement | null = null;
  addButtonForNodeId: string | null = null;
  addButtonRAF: number | null = null;
  deleteHeadingById: (id: string) => void = () => {};
  computeHeadingSections: (text: string) => any[] = () => [];

  show(nodeId: string) {
    try {
      if (!this.jm || !this.containerElDiv) return;
      if (!this.shouldMindmapDriveMarkdown()) return;
      if (this.isMindmapEditingActive()) return;
      const node = this.jm.get_node?.(nodeId);
      if (!node) { this.hide(); return; }
      let btn = this.addButtonEl;
      if (!btn) {
        btn = document.createElement('button');
        btn.textContent = '+';
        btn.title = 'Add child';
        btn.style.position = 'absolute';
        btn.style.zIndex = '5';
        btn.style.width = '22px';
        btn.style.height = '22px';
        btn.style.lineHeight = '22px';
        btn.style.padding = '0';
        btn.style.textAlign = 'center';
        btn.style.boxSizing = 'border-box';
        btn.style.borderRadius = '11px';
        btn.style.border = '1px solid #90c2ff';
        btn.style.background = '#e8f2ff';
        btn.style.color = '#0b3d91';
        btn.style.cursor = 'pointer';
        this.containerElDiv!.appendChild(btn);
        this.addButtonEl = btn;
      }
      if (this.addButtonEl && this.addButtonEl.parentElement !== this.containerElDiv) {
        this.containerElDiv!.appendChild(this.addButtonEl);
      }
      this.addButtonEl!.onclick = (e) => { e.stopPropagation(); this.addChildUnder(nodeId); };
      if (!this.deleteButtonEl) {
        const del = document.createElement('button');
        del.textContent = '−';
        del.title = 'Delete node';
        del.style.position = 'absolute';
        del.style.zIndex = '5';
        del.style.width = '22px';
        del.style.height = '22px';
        del.style.lineHeight = '22px';
        del.style.padding = '0';
        del.style.textAlign = 'center';
        del.style.boxSizing = 'border-box';
        del.style.borderRadius = '11px';
        del.style.border = '1px solid #ff9aa2';
        del.style.background = '#ffecef';
        del.style.color = '#cc0033';
        del.style.cursor = 'pointer';
        this.containerElDiv!.appendChild(del);
        this.deleteButtonEl = del;
      }
      if (this.deleteButtonEl && this.deleteButtonEl.parentElement !== this.containerElDiv) {
        this.containerElDiv!.appendChild(this.deleteButtonEl);
      }
      this.deleteButtonEl!.onclick = (e) => { e.stopPropagation(); this.deleteHeadingById(nodeId); };
      this.addButtonForNodeId = nodeId;
      this.updatePosition();
      if (this.addButtonRAF == null) {
        const tick = () => {
          this.updatePosition();
          if (this.addButtonEl && this.addButtonEl.style.display !== 'none') {
            this.addButtonRAF = window.requestAnimationFrame(tick);
          } else {
            if (this.addButtonRAF != null) { try { window.cancelAnimationFrame(this.addButtonRAF); } catch {}; this.addButtonRAF = null; }
          }
        };
        this.addButtonRAF = window.requestAnimationFrame(tick);
      }
      if (node.isroot && this.deleteButtonEl) {
        this.deleteButtonEl.style.display = 'none';
      }
    } catch {}
  }

  hide() {
    try {
      if (this.addButtonEl) {
        this.addButtonEl.style.display = 'none';
        this.addButtonForNodeId = null;
        if (this.addButtonRAF != null) {
          try { window.cancelAnimationFrame(this.addButtonRAF); } catch {}
          this.addButtonRAF = null;
        }
      }
      if (this.deleteButtonEl) {
        this.deleteButtonEl.style.display = 'none';
      }
    } catch {}
  }

  updatePosition() {
    try {
      if (!this.addButtonEl || !this.containerElDiv || !this.addButtonForNodeId) return;
      const nodeEl = this.containerElDiv.querySelector(`jmnode[nodeid="${this.addButtonForNodeId}"]`) as HTMLElement | null;
      if (!nodeEl) return;
      const node = this.jm?.get_node?.(this.addButtonForNodeId);
      const expanderEl = this.containerElDiv.querySelector(`jmexpander[nodeid="${this.addButtonForNodeId}"]`) as HTMLElement | null;
      const rect = nodeEl.getBoundingClientRect();
      const hostRect = this.containerElDiv.getBoundingClientRect();
      const isLeft = node && (node.direction === (window.jsMind?.direction?.left ?? 'left'));
      const buttonSize = 22;
      const gapBase = 8;
      let xAdd = isLeft ? rect.left - hostRect.left - (buttonSize + gapBase + 6) : rect.right - hostRect.left + gapBase + 6;
      if (expanderEl) {
        const expRect = expanderEl.getBoundingClientRect();
        if (!isLeft) {
          const minLeft = expRect.right - hostRect.left + gapBase;
          if (xAdd < minLeft) xAdd = minLeft;
        } else {
          const maxLeft = expRect.left - hostRect.left - (buttonSize + gapBase);
          if (xAdd > maxLeft) xAdd = maxLeft;
        }
      }
      const btnH = (this.addButtonEl?.offsetHeight || 22);
      const centerYRaw = rect.top - hostRect.top + (rect.height - btnH) / 2;
      const centerY = Math.round(centerYRaw) - 3;
      this.addButtonEl.style.left = `${xAdd}px`;
      this.addButtonEl.style.top = `${centerY}px`;
      this.addButtonEl.style.transform = '';
      this.addButtonEl.style.display = 'block';
      if (this.deleteButtonEl) {
        const gap = 4;
        const xDel = isLeft ? xAdd - (buttonSize + gap) : xAdd + (buttonSize + gap);
        this.deleteButtonEl.style.left = `${xDel}px`;
        this.deleteButtonEl.style.top = `${centerY}px`;
        this.deleteButtonEl.style.transform = '';
        this.deleteButtonEl.style.display = 'block';
      }
    } catch {}
  }

  private focusEditorToRange(line: number, chStart: number, chEnd: number) {
    try {
      const mdLeaves = this.app.workspace.getLeavesOfType('markdown');
      for (const leaf of mdLeaves) {
        const v = leaf.view as any;
        if (v?.file?.path === this.file?.path) {
          const mdView = v as MarkdownView;
          const editor = mdView.editor;
          const from = { line, ch: chStart } as any;
          const to = { line, ch: chEnd } as any;
          setTimeout(() => {
            try { this.app.workspace.setActiveLeaf(leaf, { focus: true }); } catch {}
            try { this.app.workspace.revealLeaf(leaf); } catch {}
            try { (editor as any).focus?.(); } catch {}
            try { editor.setSelection(from, to); } catch {}
            try { (editor as any).scrollIntoView({ from, to }, true); } catch {}
          }, 0);
          break;
        }
      }
    } catch {}
  }

  async addChildUnder(nodeId: string) {
    if (!this.file) return;
    const content = await this.app.vault.read(this.file);
    const headings = this.computeHeadingSections(content);
    const parent = headings.find((h: any) => h.id === nodeId) ?? null;
    let levelToInsert = 1;
    let insertPos = content.length;
    if (parent) {
      levelToInsert = Math.min(parent.level + 1, 6);
      insertPos = Math.min(parent.end + 1, content.length);
    }
    const headingPrefix = '#'.repeat(levelToInsert);
    const needLeadingNewline = insertPos > 0 && content.charAt(insertPos - 1) !== '\n';
    const placeholder = '新标题';
    const insertText = `${needLeadingNewline ? '\n' : ''}${headingPrefix} ${placeholder}\n`;
    const updated = content.slice(0, insertPos) + insertText + content.slice(insertPos);
    await this.app.vault.modify(this.file, updated);
    new Notice('Child heading inserted');
    const newHeadingStart = insertPos + (needLeadingNewline ? 1 : 0);
    const before = updated.slice(0, newHeadingStart);
    const newLineIndex = (before.match(/\n/g)?.length ?? 0);
    const chStart = headingPrefix.length + 1;
    const chEnd = chStart + placeholder.length;
    this.focusEditorToRange(newLineIndex, chStart, chEnd);
    this.show(nodeId);
  }
}


export class ExportController {
  containerElDiv: HTMLDivElement | null = null;
  toolbarEl: HTMLElement | null = null;
  jm: any | null = null;
  app: any;
  plugin: any;
  file: TFile | null = null;
  buttonEl: HTMLButtonElement | null = null;
  menuEl: HTMLDivElement | null = null;

  mount(toolbarEl: HTMLElement) {
    try {
      this.toolbarEl = toolbarEl;
      if (!this.buttonEl) {
        const btn = document.createElement('button');
        btn.textContent = 'Export';
        btn.title = 'Export as PNG or SVG';
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMenu(btn); });
        toolbarEl.appendChild(btn);
        this.buttonEl = btn;
      }
      // Global click to close
      const closeOnClick = (ev: MouseEvent) => {
        const t = ev.target as HTMLElement;
        if (this.menuEl && this.menuEl.style.display !== 'none') {
          if (!this.menuEl.contains(t) && t !== this.buttonEl) this.hideMenu();
        }
      };
      if (!(document as any).__mm_export_close_bound) {
        document.addEventListener('click', closeOnClick);
        (document as any).__mm_export_close_bound = true;
      }
    } catch {}
  }

  private toggleMenu(anchor: HTMLElement) {
    if (this.menuEl && this.menuEl.style.display !== 'none') { this.hideMenu(); return; }
    this.showMenu(anchor);
  }

  private showMenu(anchor: HTMLElement) {
    try {
      let menu = this.menuEl;
      if (!menu) {
        menu = document.createElement('div');
        menu.style.position = 'absolute';
        menu.style.zIndex = '6';
        menu.style.minWidth = '140px';
        menu.style.padding = '6px';
        menu.style.borderRadius = '6px';
        menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
        const isDark = document.body.classList.contains('theme-dark');
        menu.style.setProperty('border', isDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)', 'important');
        menu.style.setProperty('background', isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.98)', 'important');
        const mkBtn = (label: string) => {
          const b = document.createElement('button');
          b.textContent = label;
          b.style.display = 'block';
          b.style.width = '100%';
          b.style.textAlign = 'left';
          b.style.margin = '4px 0';
          b.style.padding = '4px 8px';
          b.addEventListener('click', (e) => e.stopPropagation());
          return b;
        };
        const png1xBtn = mkBtn('Export PNG (1x)');
        const png2xBtn = mkBtn('Export PNG (2x)');
        const svgBtn = mkBtn('Export SVG');
        png1xBtn.onclick = async () => { this.hideMenu(); await this.exportPNG(1); };
        png2xBtn.onclick = async () => { this.hideMenu(); await this.exportPNG(2); };
        svgBtn.onclick = async () => { this.hideMenu(); await this.exportSVG(); };
        menu.appendChild(png1xBtn);
        menu.appendChild(png2xBtn);
        menu.appendChild(svgBtn);
        (this.toolbarEl || document.body).appendChild(menu);
        this.menuEl = menu;
      }
      const ar = anchor.getBoundingClientRect();
      const root = (this.toolbarEl || document.body);
      const hostRect = root.getBoundingClientRect ? root.getBoundingClientRect() : { left: 0, bottom: 0 } as any;
      menu.style.left = `${ar.left - hostRect.left}px`;
      menu.style.top = `${ar.bottom - hostRect.top + 4}px`;
      menu.style.display = 'block';
    } catch {}
  }

  private hideMenu() {
    try { if (this.menuEl) this.menuEl.style.display = 'none'; } catch {}
  }

  private getDefaultFilename(ext: string): string {
    try {
      const base = (this.jm?.mind?.name) || (this.file?.basename) || 'mindmap';
      const safe = String(base).replace(/[/\\:*?"<>|]+/g, '_');
      return `${safe}.${ext}`;
    } catch { return `mindmap.${ext}`; }
  }

  private downloadDataUrl(dataUrl: string, filename: string) {
    try {
      const a = document.createElement('a');
      a.href = dataUrl;
      (a as any).download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
  }

  private downloadText(text: string, mime: string, filename: string) {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      this.downloadDataUrl(url, filename);
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 0);
    } catch {}
  }

  async exportPNG(scale: number = 1) {
    try {
      const jm = this.jm;
      if (!jm) { new Notice('Mindmap not ready'); return; }
      // Prefer built-in screenshot plugin
      const filename = this.getDefaultFilename('png');
      if (jm.screenshot && typeof jm.screenshot.shoot === 'function') {
        try { if (jm.screenshot.options) jm.screenshot.options.filename = filename.replace(/\.png$/i, ''); } catch {}
        const prevDpr = jm.screenshot.dpr ?? jm.view?.device_pixel_ratio ?? (window.devicePixelRatio || 1);
        const s = Math.min(2, Math.max(1, scale || 1));
        try { jm.screenshot.dpr = Math.max(1, prevDpr * s); } catch {}
        try { jm.screenshot.shoot(); } finally {
          // restore dpr shortly after
          setTimeout(() => { try { jm.screenshot.dpr = prevDpr; } catch {} }, 500);
        }
        return;
      }
      // Fallback via dom-to-image on the whole panel
      const dti = (window as any).domtoimage;
      if (dti && jm.view?.e_panel) {
        const node = jm.view.e_panel as HTMLElement;
        const w = node.clientWidth;
        const h = node.clientHeight;
        const s = Math.min(2, Math.max(1, scale || 1));
        const dataUrl = await dti.toPng(node, {
          width: Math.round(w * s),
          height: Math.round(h * s),
          style: {
            transform: `scale(${s})`,
            transformOrigin: 'top left',
            width: `${w}px`,
            height: `${h}px`
          }
        });
        this.downloadDataUrl(dataUrl, filename);
        return;
      }
      new Notice('PNG export not available (screenshot plugin missing)');
    } catch {}
  }

  async exportSVG() {
    try {
      const jm = this.jm;
      if (!jm) { new Notice('Mindmap not ready'); return; }
      const w = jm.view?.size?.w || this.containerElDiv?.clientWidth || 800;
      const h = jm.view?.size?.h || this.containerElDiv?.clientHeight || 600;

      // 1) Serialize graph (edges) as pure SVG
      let graphSvg = '';
      try {
        const eSvg = jm.view.graph?.e_svg as SVGSVGElement | undefined;
        if (eSvg) {
          // Clone to avoid mutating DOM, then serialize
          const clone = eSvg.cloneNode(true) as SVGSVGElement;
          // Remove width/height on inner to let outer control layout
          clone.removeAttribute('width');
          clone.removeAttribute('height');
          graphSvg = new XMLSerializer().serializeToString(clone);
        }
      } catch {}

      // 2) Serialize nodes as pure SVG text (no foreignObject, no raster)
      const nodesContainer = jm.view?.e_nodes as HTMLElement | undefined;
      const escAttr = (s: string) => s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      let nodesTransform = '';
      let nodesGroup = '';
      if (nodesContainer) {
        try {
          const cs = getComputedStyle(nodesContainer);
          const t = cs.transform && cs.transform !== 'none' ? cs.transform : '';
          if (t) nodesTransform = t;
        } catch {}
        const parts: string[] = [];
        // Prepare a canvas context for text measurement
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');
        const escapeXml = (s: string) => s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const escapeXmlAttr = (s: string) => s
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const parsePx = (v: string, fallback: number): number => {
          const n = parseFloat(v || '');
          return Number.isFinite(n) ? n : fallback;
        };
        const computeLineHeightPx = (csNode: CSSStyleDeclaration, fontSizePx: number): number => {
          const lh = csNode.lineHeight;
          if (!lh || lh === 'normal') return Math.round(fontSizePx * 1.2);
          if (lh.endsWith('px')) return parsePx(lh, Math.round(fontSizePx * 1.2));
          const num = parseFloat(lh);
          if (Number.isFinite(num)) return Math.round(fontSizePx * num);
          return Math.round(fontSizePx * 1.2);
        };
        const buildFontForMeasure = (csNode: CSSStyleDeclaration): { font: string; fontSizePx: number; fontWeight: string; fontStyle: string; fontFamily: string } => {
          const fontStyle = csNode.fontStyle || 'normal';
          const fontVariant = csNode.fontVariant || 'normal';
          const fontWeight = csNode.fontWeight || '400';
          const fontSize = csNode.fontSize || '16px';
          const fontFamilyRaw = csNode.fontFamily || 'sans-serif';
          const fontFamily = fontFamilyRaw.replace(/["']/g, ''); // remove quotes for XML attr safety
          const font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize} ${fontFamily}`;
          const fontSizePx = parsePx(fontSize, 16);
          return { font, fontSizePx, fontWeight, fontStyle, fontFamily };
        };
        const measureWrappedLines = (text: string, maxWidth: number, ctx: CanvasRenderingContext2D, csNode: CSSStyleDeclaration) => {
          ctx.save();
          const { font } = buildFontForMeasure(csNode);
          ctx.font = font;
          // Break on explicit newlines first
          const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
          const lines: string[] = [];
          const hasWhitespace = (s: string) => /\s/.test(s);
          const takeFittingPrefix = (base: string, token: string): { fitted: string; rest: string } => {
            let fitted = '';
            for (const ch of token) {
              const w = ctx.measureText(base + fitted + ch).width;
              if (w <= maxWidth || (base.length === 0 && fitted.length === 0)) {
                fitted += ch;
              } else {
                break;
              }
            }
            return { fitted, rest: token.slice(fitted.length) };
          };
          for (const raw of rawLines) {
            const words = raw.split(/(\s+)/); // keep spaces tokens
            let current = '';
            for (const token of words) {
              const tentative = current + token;
              const width = ctx.measureText(tentative).width;
              if (width <= maxWidth || current.length === 0) {
                current = tentative;
                continue;
              }
              // If token itself is too long (no spaces case), fallback to character wrap
              if (!hasWhitespace(token)) {
                // Prefer to fill the remaining space of current line with part of this long token
                const { fitted, rest } = takeFittingPrefix(current, token);
                if (fitted.length > 0) {
                  lines.push((current + fitted).trimEnd());
                  // Now wrap the rest by characters across subsequent lines
                  let remaining = rest;
                  current = '';
                  while (remaining.length > 0) {
                    const { fitted: part, rest: next } = takeFittingPrefix('', remaining);
                    if (part.length === 0) break;
                    if (ctx.measureText(part).width <= maxWidth) {
                      // If this is the last small part, keep it in current for next tokens
                      remaining = next;
                      if (remaining.length === 0) {
                        current = part;
                        break;
                      }
                      lines.push(part);
                    } else {
                      lines.push(part);
                      remaining = next;
                    }
                  }
                } else {
                  // Cannot fit any part with current; push current and start wrapping token
                  lines.push(current.trimEnd());
                  let remaining = token;
                  current = '';
                  while (remaining.length > 0) {
                    const { fitted: part, rest: next } = takeFittingPrefix('', remaining);
                    if (part.length === 0) break;
                    if (ctx.measureText(part).width <= maxWidth && next.length === 0) {
                      current = part;
                      remaining = next;
                      break;
                    } else {
                      lines.push(part);
                      remaining = next;
                    }
                  }
                }
              } else {
                lines.push(current.trimEnd());
                current = token.trimStart();
              }
            }
            if (current) lines.push(current.trimEnd());
          }
          // Final safety pass: ensure no line width exceeds maxWidth due to rounding
          const safeMax = Math.max(1, maxWidth - 2); // 2px safety to avoid overflow
          const hardWrapped: string[] = [];
          for (const ln of lines) {
            let current = '';
            for (const ch of ln) {
              const w = ctx.measureText(current + ch).width;
              if (w <= safeMax || current.length === 0) {
                current += ch;
              } else {
                hardWrapped.push(current.trimEnd());
                current = ch.trimStart();
              }
            }
            if (current) hardWrapped.push(current.trimEnd());
          }
          ctx.restore();
          return hardWrapped;
        };
        const nodeList = Array.from(nodesContainer.querySelectorAll('jmnode')) as HTMLElement[];
        for (const nodeEl of nodeList) {
          try {
            const x = nodeEl.offsetLeft;
            const y = nodeEl.offsetTop;
            const width = Math.max(1, nodeEl.clientWidth);
            const height = Math.max(1, nodeEl.clientHeight);
            const csNode = getComputedStyle(nodeEl);
            const padL = parsePx(csNode.paddingLeft, 0);
            const padT = parsePx(csNode.paddingTop, 0);
            const padR = parsePx(csNode.paddingRight, 0);
            // Background rectangle if visible
            const bg = csNode.backgroundColor;
            const hasBg = bg && bg !== 'transparent' && !/rgba\(0,\s*0,\s*0,\s*0\)/i.test(bg);
            if (hasBg) {
              parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${bg}" rx="${parsePx(csNode.borderTopLeftRadius, 0)}" ry="${parsePx(csNode.borderTopLeftRadius, 0)}"/>`);
            }
            // Bottom border line for content nodes (mm-content-node)
            if (nodeEl.classList.contains('mm-content-node')) {
              const borderColor = (csNode.borderBottomColor && csNode.borderBottomStyle !== 'none') ? csNode.borderBottomColor : getComputedStyle(nodesContainer).getPropertyValue('--background-modifier-border') || '#ccc';
              const yLine = y + height - parsePx(csNode.borderBottomWidth, 1.5);
              parts.push(`<line x1="${x}" y1="${yLine}" x2="${x + width}" y2="${yLine}" stroke="${borderColor}" stroke-width="${Math.max(1, parsePx(csNode.borderBottomWidth, 1.5))}"/>`);
            }
            // Text rendering
            const textColor = csNode.color || '#000';
            const { fontSizePx, fontWeight, fontStyle, fontFamily } = buildFontForMeasure(csNode);
            const lineHeightPx = computeLineHeightPx(csNode, fontSizePx);
            // Prefer the actual content div width for wrapping to match on-screen rendering
            const mmContent = nodeEl.querySelector('.mm-content-text') as HTMLElement | null;
            let maxTextWidth = Math.max(1, width - padL - padR);
            let textX = x + padL;
            if (mmContent) {
              try {
                const mr = mmContent.getBoundingClientRect();
                const nr = nodeEl.getBoundingClientRect();
                maxTextWidth = Math.max(1, Math.floor(mr.width) - 2); // 2px safety margin
                textX = x + Math.max(0, Math.round(mr.left - nr.left));
              } catch {}
            }
            // Header nodes (non-content) should not wrap; use effectively unlimited width
            const isContent = nodeEl.classList.contains('mm-content-node');
            if (!isContent) {
              maxTextWidth = 600;
            }
            const content = mmContent ? (mmContent.innerText || '') : (nodeEl.innerText || '');
            const lines = (measureCtx ? measureWrappedLines(content, maxTextWidth, measureCtx, csNode) : content.split(/\r?\n/));
            const textYTop = y + padT;
            // Build <text> with tspans
            const tspans: string[] = [];
            let dy = 0;
            for (const line of lines) {
              const esc = escapeXml(line);
              // Use dy for subsequent lines; first line uses dominant-baseline hanging from top
              if (dy === 0) {
                tspans.push(`<tspan x="${textX}" dy="0">${esc}</tspan>`);
                dy += lineHeightPx;
              } else {
                tspans.push(`<tspan x="${textX}" dy="${lineHeightPx}">${esc}</tspan>`);
              }
            }
            const textEl = `<text x="${textX}" y="${textYTop}" fill="${escapeXmlAttr(textColor)}" font-family="${escapeXmlAttr(fontFamily)}" font-size="${fontSizePx}px" font-weight="${escapeXmlAttr(fontWeight)}" font-style="${escapeXmlAttr(fontStyle)}" dominant-baseline="hanging">${tspans.join('')}</text>`;
            parts.push(textEl);
          } catch {}
        }
        nodesGroup = parts.join('');
      }

      // 3) Compose final SVG without any embedded image data
      const svgOpen = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}">`;
      const svgClose = `</svg>`;
      const groupOpen = nodesTransform ? `<g transform="${escAttr(nodesTransform)}">` : `<g>`;
      const groupClose = `</g>`;
      const svg = [
        svgOpen,
        graphSvg,
        groupOpen,
        nodesGroup,
        groupClose,
        svgClose
      ].join('');

      const filename = this.getDefaultFilename('svg');
      this.downloadText(svg, 'image/svg+xml;charset=utf-8', filename);
    } catch {}
  }
}

