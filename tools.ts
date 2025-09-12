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
      const dti = (window as any).domtoimage;
      if (!dti) { new Notice('SVG export requires dom-to-image'); return; }
      const w = jm.view?.size?.w || this.containerElDiv?.clientWidth || 800;
      const h = jm.view?.size?.h || this.containerElDiv?.clientHeight || 600;
      // Serialize graph SVG
      let graphSvg = '';
      try { graphSvg = new XMLSerializer().serializeToString(jm.view.graph?.e_svg); } catch {}
      const graphDataUrl = graphSvg ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(graphSvg)))}` : '';
      // Snapshot nodes to SVG data URL
      const nodesSvgUrl: string = await dti.toSvg(jm.view.e_nodes, { style: { zoom: 1 } });
      const svg = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}">`,
        graphDataUrl ? `<image x="0" y="0" width="${w}" height="${h}" xlink:href="${graphDataUrl}" />` : '',
        `<image x="0" y="0" width="${w}" height="${h}" xlink:href="${nodesSvgUrl}" />`,
        `</svg>`
      ].join('');
      const filename = this.getDefaultFilename('svg');
      this.downloadText(svg, 'image/svg+xml;charset=utf-8', filename);
    } catch {}
  }
}

