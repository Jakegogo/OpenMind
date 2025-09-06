import { MarkdownRenderer, MarkdownView, Notice, TFile } from 'obsidian';

export type CommonDeps = {
  containerElDiv: HTMLDivElement | null;
  jm: any | null;
  app: any;
  plugin: any;
  file: TFile | null;
  // State getters
  shouldMindmapDriveMarkdown: () => boolean;
  isMindmapEditingActive: () => boolean;
};

export type PopupState = CommonDeps & {
  // popup state
  hoverPopupEl: HTMLDivElement | null;
  hoverPopupForNodeId: string | null;
  hoverPopupRAF: number | null;
  hoverHideTimeoutId: number | null;
  // setters
  setHoverPopupEl: (el: HTMLDivElement | null) => void;
  setHoverPopupForNodeId: (id: string | null) => void;
  setHoverPopupRAF: (id: number | null) => void;
  setHoverHideTimeoutId: (id: number | null) => void;
  // helpers from main
  extractNodeImmediateBody: (nodeId: string) => string;
  updateHoverPopupPosition: () => void;
};

export function toolsShowHoverPopup(nodeId: string, deps: PopupState) {
  try {
    if (!(deps.plugin as any).settings?.enablePopup) { toolsHideHoverPopup(deps); return; }
    if (!deps.containerElDiv) return;
    if (deps.isMindmapEditingActive()) return;
    const body = deps.extractNodeImmediateBody(nodeId);
    if (!body || body.trim().length === 0) { toolsHideHoverPopup(deps); return; }
    let el = deps.hoverPopupEl;
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
      // Theme-aware frosted glass styles (initial)
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
      // Enable interactions so users can hover/scroll inside popup
      el.style.pointerEvents = 'auto';
      // Allow text selection even if parent has user-select: none
      ;(el.style as any).userSelect = 'text';
      ;(el.style as any).webkitUserSelect = 'text';
      try {
        // Prevent jsMind from hijacking mouse events while still allowing selection
        const stop = (ev: Event) => ev.stopPropagation();
        el.addEventListener('mousedown', stop);
        el.addEventListener('mouseup', stop);
        el.addEventListener('click', stop);
        el.addEventListener('dblclick', stop);
      } catch {}
      deps.containerElDiv.appendChild(el);
      deps.setHoverPopupEl(el);
    }
    // Re-apply theme-aware background/border each time we show (handles theme switch)
    try {
      const isDarkNow = document.body.classList.contains('theme-dark');
      deps.hoverPopupEl!.style.setProperty('border', isDarkNow ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)', 'important');
      deps.hoverPopupEl!.style.setProperty('background', isDarkNow ? 'rgba(30,30,30,0.68)' : 'rgba(255,255,255,0.85)', 'important');
    } catch {}
    // Keep popup visible when mouse enters the popup area; hide on leave only if not entering a node
    try {
      const popup = deps.hoverPopupEl!;
      if (!(popup as any).__mm_popup_bound) {
        popup.addEventListener('mouseleave', (ev: MouseEvent) => {
          const rel = ev.relatedTarget as HTMLElement | null;
          const intoNode = rel && (rel.closest ? rel.closest('jmnode') : null);
          if (intoNode) return;
          // Delay slightly to tolerate small gaps leaving popup into another node
          if (deps.hoverHideTimeoutId != null) { try { window.clearTimeout(deps.hoverHideTimeoutId); } catch {} }
          deps.setHoverHideTimeoutId(window.setTimeout(() => {
            deps.setHoverHideTimeoutId(null);
            toolsHideHoverPopup(deps);
          }, 150));
        });
        (popup as any).__mm_popup_bound = true;
      }
    } catch {}
    // Re-append if lost on refresh
    if (deps.hoverPopupEl && deps.hoverPopupEl.parentElement !== deps.containerElDiv) {
      deps.containerElDiv.appendChild(deps.hoverPopupEl);
    }
    // Cancel any pending hide when (re)showing the popup
    if (deps.hoverHideTimeoutId != null) { try { window.clearTimeout(deps.hoverHideTimeoutId); } catch {} deps.setHoverHideTimeoutId(null); }
    deps.setHoverPopupForNodeId(nodeId);
    // Render markdown preview into popup
    const popup = deps.hoverPopupEl!;
    try { popup.classList.add('markdown-rendered'); } catch {}
    popup.style.whiteSpace = 'normal';
    popup.innerHTML = '';
    // Add title line for the current node
    try {
      // title provided by main via DOM/jm/headings (keep simple)
    } catch {}
    try {
      // Use Obsidian's renderer to get theme-consistent preview
      MarkdownRenderer.renderMarkdown(body.trim(), popup, deps.file?.path ?? '', deps.plugin);
    } catch {
      // Fallback to plain text if rendering fails
      const fallback = document.createElement('div');
      fallback.textContent = body.trim();
      popup.appendChild(fallback);
    }
    deps.updateHoverPopupPosition();
    // Follow transforms while visible
    if (deps.hoverPopupRAF == null) {
      const tick = () => {
        deps.updateHoverPopupPosition();
        if (deps.hoverPopupEl && deps.hoverPopupEl.style.display !== 'none') {
          deps.setHoverPopupRAF(window.requestAnimationFrame(tick));
        } else {
          if (deps.hoverPopupRAF != null) { try { window.cancelAnimationFrame(deps.hoverPopupRAF); } catch {}; deps.setHoverPopupRAF(null); }
        }
      };
      deps.setHoverPopupRAF(window.requestAnimationFrame(tick));
    }
  } catch {}
}

export function toolsHideHoverPopup(deps: PopupState) {
  try {
    if (deps.hoverPopupEl) deps.hoverPopupEl.style.display = 'none';
    deps.setHoverPopupForNodeId(null);
    if (deps.hoverPopupRAF != null) { try { window.cancelAnimationFrame(deps.hoverPopupRAF); } catch {}; deps.setHoverPopupRAF(null); }
  } catch {}
}

export type ButtonState = CommonDeps & {
  addButtonEl: HTMLButtonElement | null;
  deleteButtonEl: HTMLButtonElement | null;
  addButtonForNodeId: string | null;
  setAddButtonEl: (el: HTMLButtonElement | null) => void;
  setDeleteButtonEl: (el: HTMLButtonElement | null) => void;
  setAddButtonForNodeId: (id: string | null) => void;
  updateAddButtonPosition: () => void;
  addChildUnder: (id: string) => void;
  deleteHeadingById: (id: string) => void;
  addButtonRAF: number | null;
  setAddButtonRAF: (id: number | null) => void;
};

export function toolsShowAddButton(nodeId: string, deps: ButtonState) {
  try {
    if (!deps.jm || !deps.containerElDiv) return;
    if (!deps.shouldMindmapDriveMarkdown()) return;
    if (deps.isMindmapEditingActive()) return;
    const node = deps.jm.get_node?.(nodeId);
    if (!node) { toolsHideAddButton(deps); return; }
    let btn = deps.addButtonEl;
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
      deps.containerElDiv.appendChild(btn);
      deps.setAddButtonEl(btn);
    }
    if (deps.addButtonEl && deps.addButtonEl.parentElement !== deps.containerElDiv) {
      deps.containerElDiv.appendChild(deps.addButtonEl);
    }
    deps.addButtonEl!.onclick = (e) => { e.stopPropagation(); deps.addChildUnder(nodeId); };
    if (!deps.deleteButtonEl) {
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
      deps.containerElDiv.appendChild(del);
      deps.setDeleteButtonEl(del);
    }
    if (deps.deleteButtonEl && deps.deleteButtonEl.parentElement !== deps.containerElDiv) {
      deps.containerElDiv.appendChild(deps.deleteButtonEl);
    }
    deps.deleteButtonEl!.onclick = (e) => { e.stopPropagation(); deps.deleteHeadingById(nodeId); };
    deps.setAddButtonForNodeId(nodeId);
    deps.updateAddButtonPosition();
    if (deps.addButtonRAF == null) {
      const tick = () => {
        deps.updateAddButtonPosition();
        if (deps.addButtonEl && deps.addButtonEl.style.display !== 'none') {
          deps.setAddButtonRAF(window.requestAnimationFrame(tick));
        } else {
          if (deps.addButtonRAF != null) { try { window.cancelAnimationFrame(deps.addButtonRAF); } catch {}; deps.setAddButtonRAF(null); }
        }
      };
      deps.setAddButtonRAF(window.requestAnimationFrame(tick));
    }
    if (node.isroot && deps.deleteButtonEl) {
      deps.deleteButtonEl.style.display = 'none';
    }
  } catch {}
}

export function toolsHideAddButton(deps: ButtonState) {
  if (deps.addButtonEl) {
    deps.addButtonEl.style.display = 'none';
    deps.setAddButtonForNodeId(null);
    if (deps.addButtonRAF != null) {
      try { window.cancelAnimationFrame(deps.addButtonRAF); } catch {}
      deps.setAddButtonRAF(null);
    }
  }
  if (deps.deleteButtonEl) {
    deps.deleteButtonEl.style.display = 'none';
  }
}


