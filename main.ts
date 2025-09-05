import { App, Editor, ItemView, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, requestUrl, MarkdownRenderer } from 'obsidian';

declare global {
  interface Window {
    jsMind?: any;
  }
}

const VIEW_TYPE_MINDMAP = 'obsidian-jsmind-mindmap-view';

type HeadingNode = {
  id: string;
  level: number;
  title: string;
  start: number;
  end: number;
  lineStart: number;
  headingTextEnd: number;
  parentId: string | null;
  children: HeadingNode[];
  style: 'atx' | 'setext';
};

function computeHeadingSections(markdownText: string): HeadingNode[] {
  const lines = markdownText.split(/\n/);
  const headingRegex = /^(#{1,6})\s+(.*)$/;
  const headingsTemp: Array<Omit<HeadingNode, 'end' | 'headingTextEnd' | 'children' | 'parentId'> & { raw: string; style: 'atx' | 'setext' }> = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(headingRegex);
    if (match) {
      const hashes = match[1];
      const title = match[2].trim();
      const start = offset;
      const headingTextEnd = start + line.length; // end of heading line
      headingsTemp.push({
        id: `h_${i}_${start}`,
        level: hashes.length,
        title,
        start,
        lineStart: i,
        raw: line,
        style: 'atx',
      });
    } else if (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (/^=+\s*$/.test(next)) {
        const start = offset;
        const title = line.trim();
        const headingTextEnd = start + line.length; // only first line text
        headingsTemp.push({
          id: `h_${i}_${start}`,
          level: 1,
          title,
          start,
          lineStart: i,
          raw: line + '\n' + next,
          style: 'setext',
        });
      } else if (/^-+\s*$/.test(next)) {
        const start = offset;
        const title = line.trim();
        const headingTextEnd = start + line.length;
        headingsTemp.push({
          id: `h_${i}_${start}`,
          level: 2,
          title,
          start,
          lineStart: i,
          raw: line + '\n' + next,
          style: 'setext',
        });
      }
    }
    offset += line.length + 1; // +1 for split removed newline
  }
  const headings: HeadingNode[] = headingsTemp.map((h, idx) => ({
    id: h.id,
    level: h.level,
    title: h.title,
    start: h.start,
    end: markdownText.length,
    lineStart: h.lineStart,
    headingTextEnd: h.start + (lines[h.lineStart]?.length ?? 0),
    parentId: null,
    children: [],
    style: h.style,
  }));
  for (let i = 0; i < headings.length; i++) {
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= headings[i].level) {
        headings[i].end = headings[j].start - 1; // up to the char before next heading
        break;
      }
    }
  }
  const stack: HeadingNode[] = [];
  for (const h of headings) {
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    h.parentId = stack.length ? stack[stack.length - 1].id : null;
    if (stack.length) {
      stack[stack.length - 1].children.push(h);
    }
    stack.push(h);
  }
  return headings;
}

function buildJsMindTreeFromHeadings(headings: HeadingNode[], fileName: string) {
  const firstH1 = headings.find(h => h.level === 1);
  let rootId: string;
  let rootTopic: string;
  if (firstH1) {
    rootId = firstH1.id;
    rootTopic = firstH1.title || fileName;
  } else {
    rootId = `virtual_root_${fileName}`;
    rootTopic = fileName.replace(/\.md$/i, '');
  }
  const byId = new Map<string, any>();
  const root: any = { id: rootId, topic: rootTopic, children: [] };
  byId.set(rootId, root);
  for (const h of headings) {
    if (firstH1 && h.id === firstH1.id) continue;
    const node: any = { id: h.id, topic: h.title, children: [] };
    byId.set(h.id, node);
  }
  for (const h of headings) {
    if (firstH1 && h.id === firstH1.id) continue;
    const parentKey = h.parentId ?? (firstH1 ? firstH1.id : rootId);
    const parent = byId.get(parentKey) ?? root;
    parent.children.push(byId.get(h.id));
  }
  return { meta: { name: fileName }, format: 'node_tree', data: root };
}

class MindmapView extends ItemView {
  // References to Obsidian/plugin and jsMind host
  private plugin: MindmapPlugin;                      // owning plugin (for settings/persistence)
  private file: TFile | null = null;                  // current markdown file shown in this view
  private containerElDiv: HTMLDivElement | null = null; // mindmap container element
  private jm: any | null = null;                      // jsMind instance

  // Parsed markdown cache (structure used to build/update mindmap)
  private headingsCache: HeadingNode[] = [];

  // Selection and sync state (mindmap <-> markdown)
  private suppressSync: boolean = false;              // guard to avoid feedback loops while selecting in jm
  private lastSyncedNodeId: string | null = null;     // last node id driven into selection to dedupe work
  private editorSyncIntervalId: number | null = null; // polling timer id for cursor-only movements
  private suppressEditorSyncUntil: number = 0;        // timestamp to pause editor-driven sync briefly

  // Viewport/centering management
  private prevViewport: { nodesTransform: string | null; canvasTransform: string | null } | null = null; // saved transforms across re-render
  private allowCenterRoot: boolean = false;           // only allow jm to center root when explicitly enabled
  private centerRootWrapped: boolean = false;         // ensure we wrap jsMind center methods only once

  // UI elements: quick actions (+ / −) and related timers
  private addButtonEl: HTMLButtonElement | null = null; // floating + button element
  private addButtonForNodeId: string | null = null;   // which node the buttons are currently attached to
  private addButtonRAF: number | null = null;         // raf token for following node position
  private revealTimeoutId: number | null = null;      // debounce for click-to-reveal in editor
  private lastDblClickAtMs: number = 0;               // last dblclick to differentiate from single click
  private deleteButtonEl: HTMLButtonElement | null = null; // floating − button element

  // Visibility/suspension controls (skip heavy work when hidden/offscreen)
  private isSuspended: boolean = false;               // whether view is currently suspended
  private pendingDirty: boolean = false;              // if changes occurred while suspended, refresh on resume

  // Inline editing sizer helpers (for adaptive jmnode width while editing)
  private editingSizerRAF: number | null = null;
  private editingSizerNodeEl: HTMLElement | null = null;

  // Hover popup (node body preview)
  private hoverPopupEl: HTMLDivElement | null = null; // popup element for showing immediate body text
  private hoverPopupForNodeId: string | null = null;  // node id the popup is currently for
  private hoverPopupRAF: number | null = null;        // raf token to follow transforms
  private hoverHideTimeoutId: number | null = null;   // scheduled hide when crossing gap between node and popup

  // Stable id mapping (parent chain + sibling index)
  private idToStableKey: Map<string, string> = new Map(); // runtime id -> stable key
  private stableKeyToId: Map<string, string> = new Map(); // stable key -> runtime id

  // Arbitration windows between drivers (cursor vs scroll vs click)
  private suppressRevealUntilMs: number = 0;          // after jm-driven selection, suppress reveal back to editor
  private suppressCursorSyncUntilMs2: number = 0;     // suppress cursor-driven sync after scroll-driven
  private suppressScrollSyncUntilMs: number = 0;      // suppress scroll-driven sync after cursor-driven
  private currentSelectionDriver: 'scroll' | 'cursor' | null = null; // last active driver
  private driverHoldUntilMs: number = 0;              // hold time to keep current driver in control

  // Scroll sync (follow markdown scrolling)
  private scrollSyncEl: HTMLElement | null = null;    // current scroller we listen to
  private scrollSyncHandler: ((e: Event) => void) | null = null; // bound scroll handler
  private scrollSyncLastRunMs: number = 0;            // throttle timestamp (ms) for scroll-driven sync
  private scrollSyncPendingTimeoutId: number | null = null; // pending trailing call id

  // Cached raw file text (for popup extraction and incremental diffs)
  private lastFileContent: string = '';
  private getJsMindEventName(type: any, data: any): string {
    try {
      if (typeof type === 'string') return type;
      if (data && typeof data.evt === 'string') return data.evt;
    } catch {}
    return '';
  }
  private getEventNodeId(data: any): string {
    try {
      if (!data) return '';
      if (typeof data.node === 'string') return data.node as string;
      if (data.node && typeof data.node.id === 'string') return data.node.id as string;
      if (Array.isArray(data.data) && typeof data.data[0] === 'string') return data.data[0] as string;
      if (typeof data.id === 'string') return data.id as string;
    } catch {}
    return '';
  }
  private getEventNodeTopic(data: any): string {
    try {
      if (!data) return '';
      if (typeof data.topic === 'string') return data.topic as string;
      if (data.node && typeof (data.node as any).topic === 'string') return (data.node as any).topic as string;
      if (Array.isArray(data.data) && typeof data.data[1] === 'string') return data.data[1] as string;
    } catch {}
    return '';
  }
  private isMindmapEditingActive(): boolean {
    try {
      if (!this.containerElDiv) return false;
      const root = this.containerElDiv.querySelector('.jsmind-inner') || this.containerElDiv;
      if (!root) return false;
      return !!(root.querySelector('input, textarea, [contenteditable="true"]'));
    } catch { return false; }
  }

  private isViewVisible(): boolean {
    try {
      if (!this.containerElDiv) return false;
      if (!document.body.contains(this.containerElDiv)) return false;
      const cs = getComputedStyle(this.containerElDiv);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (this.containerElDiv.offsetWidth === 0 || this.containerElDiv.offsetHeight === 0) return false;
      const rects = this.containerElDiv.getClientRects();
      return rects.length > 0;
    } catch { return true; }
  }

  private setSuspended(suspend: boolean) {
    if (this.isSuspended === suspend) return;
    this.isSuspended = suspend;
    if (suspend) {
      this.hideAddButton();
    } else {
      // When resuming, refresh if there were changes while hidden
      if (this.pendingDirty || !this.jm) {
        this.pendingDirty = false;
        this.refresh().catch(() => {});
      } else {
        try { this.jm && this.jm.resize && this.jm.resize(); } catch {}
        this.updateAddButtonPosition();
      }
    }
  }

  constructor(leaf: WorkspaceLeaf, plugin: MindmapPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MINDMAP;
  }

  getDisplayText(): string {
    return 'Mindmap Preview';
  }

  async onOpen() {
    this.contentEl.empty();
    // Ensure the view takes available height for canvas/SVG rendering
    this.contentEl.style.display = 'flex';
    this.contentEl.style.flexDirection = 'column';
    this.contentEl.style.height = '100%';
    ;(this.containerEl as HTMLElement).style.height = '100%';
    // Inject minimal toolbar styles once
    try {
      const styleId = 'obsidian-jsmind-toolbar-style';
      if (!document.getElementById(styleId)) {
        const st = document.createElement('style');
        st.id = styleId;
        st.textContent = `
          .mm-toolbar { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
          .mm-toolbar button {
            appearance: none; border: 1px solid var(--background-modifier-border);
            background: var(--interactive-normal); color: var(--text-normal);
            padding: 2px 8px; border-radius: 5px; font-size: 12px; line-height: 1.2; cursor: pointer;
          }
          .mm-toolbar button:hover { background: var(--interactive-hover); }
        `;
        document.head.appendChild(st);
      }
      const popupCssId = 'obsidian-jsmind-popup-style';
      if (!document.getElementById(popupCssId)) {
        const st2 = document.createElement('style');
        st2.id = popupCssId;
        st2.textContent = `
          .mm-popup { padding: 4px 6px; user-select: text; -webkit-user-select: text; }
          .mm-popup * { user-select: text; -webkit-user-select: text; }
          .mm-popup.markdown-rendered { line-height: 1.4; }
          .mm-popup.markdown-rendered p,
          .mm-popup.markdown-rendered ul,
          .mm-popup.markdown-rendered ol,
          .mm-popup.markdown-rendered pre,
          .mm-popup.markdown-rendered blockquote,
          .mm-popup.markdown-rendered table,
          .mm-popup.markdown-rendered h1,
          .mm-popup.markdown-rendered h2,
          .mm-popup.markdown-rendered h3,
          .mm-popup.markdown-rendered h4,
          .mm-popup.markdown-rendered h5,
          .mm-popup.markdown-rendered h6 { margin: 0.25em 0; }
          .mm-popup.markdown-rendered ul,
          .mm-popup.markdown-rendered ol { padding-left: 1.1em; }
          .mm-popup.markdown-rendered pre { padding: 4px 6px; }
        `;
        document.head.appendChild(st2);
      }
    } catch {}
    const toolbar = this.contentEl.createDiv({ cls: 'mm-toolbar' });
    const refreshBtn = toolbar.createEl('button', { text: 'Refresh' });
    const followBtn = toolbar.createEl('button', { text: 'Follow Scroll' });

    const container = this.contentEl.createDiv();
    container.id = 'jsmind_container';
    container.style.width = '100%';
    container.style.flex = '1 1 auto';
    container.style.height = '100%';
    container.style.minHeight = '400px';
    container.style.position = 'relative';
    this.containerElDiv = container;
    refreshBtn.addEventListener('click', () => this.refresh());
    followBtn.addEventListener('click', () => {
      // Re-enable scroll-driven follow immediately
      this.currentSelectionDriver = 'scroll';
      this.driverHoldUntilMs = Date.now() + 800;
      this.suppressCursorSyncUntilMs2 = 0;
      this.suppressScrollSyncUntilMs = 0;
    });

    try {
      await this.ensureJsMindLoaded();
    } catch (e) {
      new Notice('Failed to load jsMind. Check network/CSP. Retrying with fallback...');
      // Try fallback once more
      try {
        await this.ensureJsMindLoaded(true);
      } catch (err) {
        new Notice('jsMind could not be loaded. Mindmap disabled.');
        return;
      }
    }
    // Default selection driver to scroll on initial open
    this.currentSelectionDriver = 'scroll';
    this.driverHoldUntilMs = Date.now() + 800;
    this.suppressCursorSyncUntilMs2 = 0;
    this.suppressScrollSyncUntilMs = 0;
    await this.refresh();

    // Observe size changes for reliable canvas resizing
    try {
      const ro = new ResizeObserver(() => {
        if (this.jm) {
          try { this.jm.resize && this.jm.resize(); } catch {}
        }
        this.updateAddButtonPosition();
      });
      if (this.containerElDiv) ro.observe(this.containerElDiv);
      this.register(() => ro.disconnect());
    } catch {}

    // Observe visibility to suspend/resume rendering work
    try {
      if (this.containerElDiv) {
        const iv = new IntersectionObserver((entries) => {
          const ent = entries[0];
          if (!ent) return;
          const visible = ent.isIntersecting && ent.intersectionRatio > 0;
          this.setSuspended(!visible);
        }, { root: this.containerElDiv.parentElement || undefined });
        iv.observe(this.containerElDiv);
        this.register(() => iv.disconnect());
      }
      // Also listen to layout changes as a fallback
      this.registerEvent(this.app.workspace.on('layout-change', () => {
        const visible = this.isViewVisible();
        this.setSuspended(!visible);
      }));
    } catch {}

    // Attach editor -> mindmap selection sync
    this.attachEditorSync();

    this.registerEvent(this.app.vault.on('modify', async (file) => {
      if (this.file && file.path === this.file.path) {
        if (this.isSuspended || !this.isViewVisible()) {
          this.pendingDirty = true;
          return;
        }
        await this.softSyncFromDisk();
      }
    }));

    // Follow markdown file changes (any leaf switching to a markdown file)
    this.registerEvent(this.app.workspace.on('file-open', async (file) => {
      if (!file) return;
      try {
        // Only react to markdown files and only if different from current
        // @ts-ignore
        const ext = (file as any).extension || (file.name?.split('.').pop() ?? '');
        if (ext.toLowerCase() === 'md' && file.path !== this.file?.path) {
          await this.setFile(file);
          // reattach scroll sync on file switch
          try { this.attachEditorSync(); } catch {}
        }
      } catch {}
    }));

    // Also follow active leaf change to catch focus changes between panes
    this.registerEvent(this.app.workspace.on('active-leaf-change', async (leaf) => {
      try {
        const mv = leaf?.view as MarkdownView | undefined;
        if (mv?.file) {
          // @ts-ignore
          const ext = (mv.file as any).extension || (mv.file.name?.split('.').pop() ?? '');
          if (ext.toLowerCase() === 'md' && mv.file.path !== this.file?.path) {
            await this.setFile(mv.file);
            // reattach scroll sync on leaf change
            try { this.attachEditorSync(); } catch {}
          }
        }
      } catch {}
    }));
  }

  async setFile(file: TFile) {
    this.file = file;
    this.lastSyncedNodeId = null;
    // Reset driver to scroll on file switch
    this.currentSelectionDriver = 'scroll';
    this.driverHoldUntilMs = Date.now() + 800;
    this.suppressCursorSyncUntilMs2 = 0;
    this.suppressScrollSyncUntilMs = 0;
    if (this.containerElDiv) await this.refresh();
  }

  async onClose() {
    this.jm = null;
    this.containerElDiv = null;
  }

  private async ensureJsMindLoaded(useFallback: boolean = false): Promise<void> {
    if (window.jsMind) return;
    const pluginBase = `${this.app.vault.configDir}/plugins/obsidian-mindmap-jsmind`;
    const localCssVaultPath = `${pluginBase}/vendor/jsmind/style/jsmind.css`;
    const localJsVaultPath = `${pluginBase}/vendor/jsmind/es6/jsmind.js`;
    const localCssUrl = this.app.vault.adapter.getResourcePath(localCssVaultPath);
    const localJsUrl = this.app.vault.adapter.getResourcePath(localJsVaultPath);

    const cssId = 'jsmind-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = localCssUrl;
      document.head.appendChild(link);
    }

    // Attempt to inline the FULL official jsMind CSS for complete styling (prefer local)
    const fullCssId = 'jsmind-css-inline-full';
    if (!document.getElementById(fullCssId)) {
      const cssSources = [
        this.app.vault.adapter.getResourcePath(localCssVaultPath),
      ];
      for (const cssUrl of cssSources) {
        try {
          const res = await fetch(cssUrl);
          const text = await res.text();
          if (text && text.length > 1000) {
            const style = document.createElement('style');
            style.id = fullCssId;
            style.textContent = text;
            document.head.appendChild(style);
            break;
          }
        } catch {}
      }
    }

    const tryInject = (url: string) => new Promise<void>((resolve, reject) => {
      const scriptId = `jsmind-js-${btoa(url).replace(/=/g, '')}`;
      if (document.getElementById(scriptId)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load ' + url));
      document.head.appendChild(script);
    });

    // Prefer local vendored JS
    const localSrc = localJsUrl;
    try {
      await tryInject(localSrc);
      if (window.jsMind) return;
    } catch {}

    // Last-resort: try reading local JS text and eval if inject failed
    try {
      const jsRes = await fetch(localJsUrl);
      const jsText = await jsRes.text();
      const script = document.createElement('script');
      script.text = jsText;
      document.head.appendChild(script);
      if (window.jsMind) return;
    } catch {}
    throw new Error('Unable to load jsMind');
  }

  private async refresh() {
    if (!this.file) {
      const active = this.app.workspace.getActiveFile();
      if (!active) return;
      this.file = active;
    }
    if (this.isSuspended || !this.isViewVisible()) {
      this.pendingDirty = true;
      return;
    }
    // Stop and clear floating buttons before rebuilding DOM
    this.hideAddButton();
    this.addButtonEl = null;
    this.deleteButtonEl = null;
    // Capture viewport (transform) and selection before rebuild
    const prevSelectedId = (() => {
      try { return this.jm?.get_selected_node?.()?.id ?? null; } catch { return null; }
    })();
    this.prevViewport = this.captureViewport();

    const content = await this.app.vault.read(this.file);
    this.lastFileContent = content;
    this.headingsCache = computeHeadingSections(content);
    this.rebuildStableKeyIndex();
    const mind = buildJsMindTreeFromHeadings(this.headingsCache, this.file.name);
    if (!this.containerElDiv || !window.jsMind) return;
    this.containerElDiv.empty();
    this.containerElDiv.id = 'jsmind_container';
    const options = { container: 'jsmind_container', theme: 'info', editable: true, mode: 'side', view: { engine: 'svg' ,expander_style: 'number', draggable: false }};

    this.jm = new window.jsMind(options);
    // Wrap center_root so plugin can decide whether to allow auto-centering root
    this.wrapCenterRootIfNeeded();
    // By default,禁止居中根节点（例如首次 show 或 refresh 时）
    this.allowCenterRoot = false;
    this.jm.show(mind);
    // Restore previous viewport transform and reselect without centering
    this.restoreViewport(this.prevViewport);
    if (prevSelectedId) {
      try {
        this.suppressSync = true;
        this.jm.select_node(prevSelectedId);
      } finally {
        setTimeout(() => { this.suppressSync = false; }, 0);
      }
    }
    try { this.jm.expand_all && this.jm.expand_all(); } catch {}
    // Apply persisted collapsed states for current file after expand_all
    try {
      const path = this.file?.path ?? '';
      const collapsedSet = (this.plugin as any).getCollapsedSet?.(path) as Set<string> | undefined;
      if (collapsedSet && collapsedSet.size > 0) {
        for (const key of collapsedSet) {
          const id = this.stableKeyToId.get(key);
          if (!id) continue;
          try { this.jm.collapse_node && this.jm.collapse_node(id); } catch {}
        }
      }
    } catch {}
    try { this.jm.resize && this.jm.resize(); } catch {}

    // Sync: click/select a node -> reveal and select heading in markdown editor
    try {
      const attachSelectionSync = () => {
        if (this.jm && typeof this.jm.add_event_listener === 'function') {
          this.jm.add_event_listener((type: any, data: any) => {
            const evt = this.getJsMindEventName(type, data);
            const nodeIdFromEvent = this.getEventNodeId(data);
            if (evt === 'select_node' && nodeIdFromEvent) {
              if (Date.now() < this.suppressRevealUntilMs) return;
              if (this.isMindmapEditingActive()) return;
              if (this.suppressSync) return;
              // Debounce single-click to not block double-click editing in jsMind
              if (Date.now() - this.lastDblClickAtMs < 350) return;
              if (this.revealTimeoutId != null) window.clearTimeout(this.revealTimeoutId);
              const nodeId = nodeIdFromEvent;
              this.revealTimeoutId = window.setTimeout(() => {
                this.lastSyncedNodeId = nodeId;
                this.suppressEditorSyncUntil = Date.now() + 600;
                this.revealHeadingById(nodeId);
                this.showAddButton(nodeId);
                this.revealTimeoutId = null;
              }, 200);
            }
            // Some builds of jsMind emit 'edit' on inline rename; also try 'update_node' as fallback
            if ((evt === 'edit' || evt === 'update_node' || evt === 'nodechanged' || evt === 'topic_change' || evt === 'textedit') && nodeIdFromEvent) {
              // Only treat as a rename when inline editing is active inside jsMind
              if (!this.isMindmapEditingActive()) return;
              const nodeId = nodeIdFromEvent;
              const newTitle: string = this.getEventNodeTopic(data).toString();
              this.renameHeadingInFile(nodeId, newTitle).catch(() => {});
            }
            if (evt === 'select_clear') {
              this.hideAddButton();
            }
            // Persist collapse / expand state per file using stable key
            if (nodeIdFromEvent) {
              const key = this.idToStableKey.get(nodeIdFromEvent);
              if (key) {
                if (evt === 'collapse_node' || evt === 'collapse') {
                  try { (this.plugin as any).markCollapsed?.(this.file?.path ?? '', key); } catch {}
                }
                if (evt === 'expand_node' || evt === 'expand') {
                  try { (this.plugin as any).unmarkCollapsed?.(this.file?.path ?? '', key); } catch {}
                }
              }
            }
          });
        }
        if (this.containerElDiv) {
          const nodesContainer = this.containerElDiv.querySelector('jmnodes') || this.containerElDiv;
          const handler = (ev: Event) => {
            const t = ev.target as HTMLElement;
            const nodeEl = t && (t.closest ? t.closest('jmnode') : null);
            const nodeId = nodeEl?.getAttribute('nodeid') || '';
            if (nodeId) {
              if (this.isMindmapEditingActive()) return;
              // Debounce click similarly to not interfere double-click
              if (this.revealTimeoutId != null) window.clearTimeout(this.revealTimeoutId);
              this.revealTimeoutId = window.setTimeout(() => {
                // if a dblclick just happened, skip
                if (Date.now() - this.lastDblClickAtMs < 350) return;
                this.lastSyncedNodeId = nodeId;
                this.suppressEditorSyncUntil = Date.now() + 600;
                this.revealHeadingById(nodeId);
                this.showAddButton(nodeId);
                this.revealTimeoutId = null;
              }, 200);
            }
          };
          // Hover popup: show immediate body on jmnode hover
          const overHandler = (ev: MouseEvent) => {
            const t = ev.target as HTMLElement;
            const nodeEl = t && (t.closest ? t.closest('jmnode') : null);
            const nodeId = nodeEl?.getAttribute('nodeid') || '';
            if (!nodeId) return;
            if (this.isMindmapEditingActive()) return;
            // Cancel pending hide when entering another node quickly
            if (this.hoverHideTimeoutId != null) { try { window.clearTimeout(this.hoverHideTimeoutId); } catch {} this.hoverHideTimeoutId = null; }
            this.showHoverPopup(nodeId);
          };
          const outHandler = (ev: MouseEvent) => {
            const t = ev.target as HTMLElement;
            const nodeEl = t && (t.closest ? t.closest('jmnode') : null);
            if (!nodeEl) return;
            const rel = ev.relatedTarget as HTMLElement | null;
            // If moving into the popup, do not hide
            if (rel && this.hoverPopupEl && (rel === this.hoverPopupEl || this.hoverPopupEl.contains(rel))) return;
            if (rel && (rel === nodeEl || nodeEl.contains(rel))) return;
            // Gap tolerance: delay hide to allow cursor to cross gap into popup or next node
            if (this.hoverHideTimeoutId != null) { try { window.clearTimeout(this.hoverHideTimeoutId); } catch {} }
            this.hoverHideTimeoutId = window.setTimeout(() => {
              this.hoverHideTimeoutId = null;
              // If mouse is now over popup, keep it
              if (this.hoverPopupEl && this.hoverPopupEl.matches(':hover')) return;
              this.hideHoverPopup();
            }, 180);
          };
          nodesContainer.addEventListener('click', handler);
          nodesContainer.addEventListener('mouseover', overHandler as any);
          nodesContainer.addEventListener('mouseout', outHandler as any);
          const dblHandler = (_ev: Event) => {
            this.lastDblClickAtMs = Date.now();
            if (this.revealTimeoutId != null) {
              window.clearTimeout(this.revealTimeoutId);
              this.revealTimeoutId = null;
            }
            // Allow jsMind to enter edit mode without stealing focus to editor
          };
          nodesContainer.addEventListener('dblclick', dblHandler);
          this.register(() => nodesContainer && nodesContainer.removeEventListener('click', handler));
          this.register(() => nodesContainer && nodesContainer.removeEventListener('mouseover', overHandler as any));
          this.register(() => nodesContainer && nodesContainer.removeEventListener('mouseout', outHandler as any));
          this.register(() => nodesContainer && nodesContainer.removeEventListener('dblclick', dblHandler));
        }
      };
      attachSelectionSync();
    } catch {}
  }

  private async softSyncFromDisk() {
    if (this.isSuspended || !this.isViewVisible()) {
      this.pendingDirty = true;
      return;
    }
    if (!this.file || !this.jm) {
      await this.refresh();
      return;
    }
    try {
      const content = await this.app.vault.read(this.file);
      this.lastFileContent = content;
      const nextHeadings = computeHeadingSections(content);
      await this.applyHeadingsDiff(this.headingsCache, nextHeadings);
      this.headingsCache = nextHeadings;
    } catch {
      await this.refresh();
    }
  }

  private async applyHeadingsDiff(prev: HeadingNode[], next: HeadingNode[]) {
    if (!this.jm) return;
    const prevMap = new Map(prev.map(h => [h.id, h] as const));
    const nextMap = new Map(next.map(h => [h.id, h] as const));

    // Determine root id used by current jm
    const firstPrevH1 = prev.find(h => h.level === 1) ?? null;
    const firstNextH1 = next.find(h => h.level === 1) ?? null;
    const rootId = firstPrevH1 ? firstPrevH1.id : `virtual_root_${this.file?.name}`;

    const getPrevDepth = (h: HeadingNode): number => {
      let depth = 0;
      let cur: HeadingNode | undefined = h;
      while (cur && cur.parentId) {
        depth += 1;
        cur = prevMap.get(cur.parentId);
      }
      return depth;
    };
    // Remove nodes that no longer exist (deepest first) and only if present in jm
    const toRemove = prev.filter(h => !nextMap.has(h.id)).sort((a, b) => getPrevDepth(b) - getPrevDepth(a));
    for (const oldH of toRemove) {
      try {
        const exists = this.jm.get_node ? this.jm.get_node(oldH.id) : null;
        if (exists) { try { this.jm.remove_node(oldH.id); } catch {} }
      } catch {}
    }

    const getNextDepth = (h: HeadingNode): number => {
      let depth = 0;
      let cur: HeadingNode | undefined = h;
      while (cur && cur.parentId) {
        depth += 1;
        cur = nextMap.get(cur.parentId);
      }
      return depth;
    };
    const resolveExistingParentId = (h: HeadingNode): string => {
      // Ascend using next-map relations until finding an ancestor existing in jm
      // If none found or parent is null (e.g., first H1), fall back to current jm rootId
      let ancestorId: string | null = h.parentId ?? null;
      let guard = 0;
      while (ancestorId && guard++ < 100) {
        try {
          const exists = this.jm.get_node ? this.jm.get_node(ancestorId) : null;
          if (exists) return ancestorId;
        } catch {}
        const ancestor = nextMap.get(ancestorId);
        if (!ancestor) break;
        ancestorId = ancestor.parentId ?? null;
      }
      return rootId;
    };

    // Add nodes (parents before children)
    const toAdd = next.filter(h => !prevMap.has(h.id)).sort((a, b) => getNextDepth(a) - getNextDepth(b));
    for (const newH of toAdd) {
      const parentKey = resolveExistingParentId(newH);
      try { this.jm.add_node(parentKey, newH.id, (newH.title && newH.title.trim()) ? newH.title : '新标题'); } catch {}
    }

    // Update titles and reparent existing nodes
    for (const newH of next) {
      const existed = prevMap.get(newH.id);
      if (!existed) continue;
      if (existed.title !== newH.title) {
        try { this.jm.update_node(newH.id, (newH.title && newH.title.trim()) ? newH.title : '新标题'); } catch {}
      }
      const oldParent = existed.parentId ?? (firstPrevH1 ? firstPrevH1.id : rootId);
      const newParentDesired = newH.parentId ?? (firstNextH1 ? firstNextH1.id : rootId);
      if (oldParent !== newParentDesired) {
        const parentKey = resolveExistingParentId(newH);
        try {
          const exists = this.jm.get_node ? this.jm.get_node(newH.id) : null;
          if (exists) { try { this.jm.remove_node(newH.id); } catch {} }
          try { this.jm.add_node(parentKey, newH.id, (newH.title && newH.title.trim()) ? newH.title : '新标题'); } catch {}
        } catch {}
      }
    }

    // Reselect previously selected node without centering
    try {
      const sel = this.jm.get_selected_node?.();
      const selId = sel?.id;
      if (selId && nextMap.has(selId)) {
        try { this.jm.select_node(selId); } catch {}
      }
    } catch {}
  }

  private wrapCenterRootIfNeeded() {
    try {
      if (this.centerRootWrapped || !this.jm?.view) return;
      const view: any = this.jm.view;
      const originalCenterRoot = view.center_root?.bind(view);
      const originalCenterNode = view.center_node?.bind(view);
      if (!originalCenterRoot || !originalCenterNode) return;
      const self = this;
      view.center_root = function (...args: any[]) {
        if (self.allowCenterRoot) {
          try { return originalCenterRoot(...args); } catch {}
        }
        // otherwise no-op to preserve current viewport
        return undefined;
      };
      view.center_node = function (node: any, ...rest: any[]) {
        try {
          const root = self.jm?.get_root?.();
          const isRoot = root && node && node.id === root.id;
          if (isRoot && !self.allowCenterRoot) {
            return undefined;
          }
          return originalCenterNode(node, ...rest);
        } catch {}
        return undefined;
      };
      this.centerRootWrapped = true;
    } catch {}
  }

  private captureViewport(): { nodesTransform: string | null; canvasTransform: string | null } | null {
    try {
      if (!this.containerElDiv) return null;
      const nodes = this.containerElDiv.querySelector('jmnodes') as HTMLElement | null;
      const canvas = this.containerElDiv.querySelector('canvas.jsmind') as HTMLElement | null;
      const nodesTransform = nodes ? getComputedStyle(nodes).transform : null;
      const canvasTransform = canvas ? getComputedStyle(canvas).transform : null;
      return { nodesTransform, canvasTransform };
    } catch {
      return null;
    }
  }

  private restoreViewport(prev: { nodesTransform: string | null; canvasTransform: string | null } | null) {
    try {
      if (!prev || !this.containerElDiv) return;
      const nodes = this.containerElDiv.querySelector('jmnodes') as HTMLElement | null;
      const canvas = this.containerElDiv.querySelector('canvas.jsmind') as HTMLElement | null;
      if (nodes && prev.nodesTransform && prev.nodesTransform !== 'none') {
        (nodes.style as any).transform = prev.nodesTransform;
      }
      if (canvas && prev.canvasTransform && prev.canvasTransform !== 'none') {
        (canvas.style as any).transform = prev.canvasTransform as string;
      }
    } catch {}
  }

  private rebuildStableKeyIndex() {
    try {
      this.idToStableKey.clear();
      this.stableKeyToId.clear();
      // Build parent chain and sibling index per heading
      const byId = new Map(this.headingsCache.map(h => [h.id, h] as const));
      const childrenByParent = new Map<string | null, HeadingNode[]>();
      for (const h of this.headingsCache) {
        const p = h.parentId ?? null;
        if (!childrenByParent.has(p)) childrenByParent.set(p, []);
        childrenByParent.get(p)!.push(h);
      }
      // ensure siblings order is the original order in headingsCache
      for (const [p, arr] of childrenByParent) {
        arr.sort((a, b) => a.start - b.start);
      }
      const computeKey = (h: HeadingNode): string => {
        const chain: number[] = [];
        let cur: HeadingNode | null = h;
        while (cur) {
          const parent = cur.parentId ? byId.get(cur.parentId) ?? null : null;
          const siblings = childrenByParent.get(cur.parentId ?? null) ?? [];
          const idx = Math.max(0, siblings.findIndex(x => x.id === cur!.id));
          chain.push(idx);
        	cur = parent;
        }
        chain.reverse();
        return chain.join('.') || '0';
      };
      for (const h of this.headingsCache) {
        const key = computeKey(h);
        this.idToStableKey.set(h.id, key);
        this.stableKeyToId.set(key, h.id);
      }
    } catch {}
  }

  private async revealHeadingById(nodeId: string) {
    if (!this.file) return;
    try {
      const content = await this.app.vault.read(this.file);
      const headings = computeHeadingSections(content);
      const target = headings.find(h => h.id === nodeId);
      if (!target) return;
      const lines = content.split('\n');
      const lineText = lines[target.lineStart] ?? '';
      let chStart = 0;
      if (target.style === 'atx') {
        const m = lineText.match(/^(#{1,6})\s+/);
        chStart = m ? m[0].length : 0;
      } else {
        chStart = 0;
      }
      const chEnd = lineText.length;

      // Prefer active markdown view if it matches the file
      const activeMd = this.app.workspace.getActiveViewOfType(MarkdownView);
      const from = { line: target.lineStart, ch: chStart } as any;
      const to = { line: target.lineStart, ch: chEnd } as any;
      if (activeMd?.file?.path === this.file.path) {
        const editor = activeMd.editor;
        try { this.app.workspace.revealLeaf(activeMd.leaf); } catch {}
        try { (editor as any).focus?.(); } catch {}
        try { editor.setSelection(from, to); } catch {}
        try { (editor as any).scrollIntoView({ from, to }, true); } catch {}
        return;
      }
      // Otherwise, find the leaf that has this file
      const mdLeaves = this.app.workspace.getLeavesOfType('markdown');
      for (const leaf of mdLeaves) {
        const v = leaf.view as any;
        if (v?.file?.path === this.file.path) {
          const mdView = v as MarkdownView;
          const editor = mdView.editor;
          try { this.app.workspace.setActiveLeaf(leaf, { focus: true }); } catch {}
          try { this.app.workspace.revealLeaf(leaf); } catch {}
          try { (editor as any).focus?.(); } catch {}
          try { editor.setSelection(from, to); } catch {}
          try { (editor as any).scrollIntoView({ from, to }, true); } catch {}
          return;
        }
      }
    } catch {}
  }

  private selectMindmapNodeById(nodeId: string, center: boolean) {
    if (!this.jm) return;
    try {
      const node = this.jm.get_node ? this.jm.get_node(nodeId) : null;
      this.suppressSync = true;
      try {
        if (this.jm.select_node) this.jm.select_node(nodeId);
        if (center && node) {
          // Defer centering until selection/layout settles
          this.allowCenterRoot = true;
          window.setTimeout(() => {
            try { this.jm.center_node && this.jm.center_node(node); } catch {}
            try { this.jm.view && this.jm.view.center_node && this.jm.view.center_node(node); } catch {}
            try { this.jm.resize && this.jm.resize(); } catch {}
            // reset permission to avoid unintended future root centering
            this.allowCenterRoot = false;
          }, 30);
        }
      } finally {
        setTimeout(() => { this.suppressSync = false; }, 0);
      }
    } catch {}
  }

  private ensureMindmapNodeVisible(nodeId: string) {
    try {
      if (!this.jm || !this.containerElDiv) return;
      const node = this.jm.get_node ? this.jm.get_node(nodeId) : null;
      if (!node) return;
      const nodeEl = this.containerElDiv.querySelector(`jmnode[nodeid="${nodeId}"]`) as HTMLElement | null;
      if (!nodeEl) return;
      const hostRect = this.containerElDiv.getBoundingClientRect();
      const rect = nodeEl.getBoundingClientRect();
      const margin = 8;
      const fullyOffLeft = rect.right < hostRect.left + margin;
      const fullyOffRight = rect.left > hostRect.right - margin;
      const fullyOffTop = rect.bottom < hostRect.top + margin;
      const fullyOffBottom = rect.top > hostRect.bottom - margin;
      const fullyOffscreen = fullyOffLeft || fullyOffRight || fullyOffTop || fullyOffBottom;

      // Gentle horizontal nudge if only partially clipped
      let nudged = false;
      const clippedLeft = rect.left < hostRect.left + margin;
      const clippedRight = rect.right > hostRect.right - margin;
      if (!fullyOffscreen && (clippedLeft || clippedRight)) {
        const overflowLeft = clippedLeft ? (hostRect.left + margin - rect.left) : 0;
        const overflowRight = clippedRight ? (rect.right - (hostRect.right - margin)) : 0;
        const maxNudge = 60; // px
        let deltaX = 0;
        if (overflowRight > 0) deltaX += Math.min(overflowRight, maxNudge); // scroll right
        if (overflowLeft > 0) deltaX -= Math.min(overflowLeft, maxNudge);   // scroll left
        const el: any = this.containerElDiv;
        if (typeof el.scrollLeft === 'number' && deltaX !== 0) {
          try { el.scrollLeft += deltaX; nudged = true; } catch {}
        }
      }

      if (!nudged && fullyOffscreen) {
        this.allowCenterRoot = true;
        try { this.jm.center_node && this.jm.center_node(node); } catch {}
        try { this.jm.view && this.jm.view.center_node && this.jm.view.center_node(node); } catch {}
        try { this.jm.resize && this.jm.resize(); } catch {}
        this.allowCenterRoot = false;
      }
    } catch {}
  }

  private attachEditorSync() {
    const trySync = async () => {
      if (!this.file) return;
      if (Date.now() < this.suppressCursorSyncUntilMs2) return;
      if (Date.now() < this.suppressEditorSyncUntil) return;
      const activeMd = this.app.workspace.getActiveViewOfType(MarkdownView);
      const editorFocused = !!(activeMd && this.isMarkdownEditorFocused(activeMd));
      if (this.currentSelectionDriver === 'scroll' && Date.now() < this.driverHoldUntilMs && !editorFocused) return;
      if (!activeMd || activeMd.file?.path !== this.file.path) return;
      const editor = activeMd.editor;
      const cursor = editor.getCursor();
      const content = editor.getValue();
      const headings = computeHeadingSections(content);
      if (headings.length === 0) return;
      const currentLine = cursor.line;
      let current: HeadingNode | null = null;
      for (let i = 0; i < headings.length; i++) {
        const h = headings[i];
        const next = headings[i + 1];
        const endLine = next ? next.lineStart - 1 : content.split('\n').length - 1;
        if (currentLine >= h.lineStart && currentLine <= endLine) {
          current = h;
        }
      }
      if (current && current.id !== this.lastSyncedNodeId) {
        this.lastSyncedNodeId = current.id;
        const center = this.isMarkdownEditorFocused(activeMd);
        this.suppressRevealUntilMs = Date.now() + 600;
        this.suppressScrollSyncUntilMs = Date.now() + 400;
        this.selectMindmapNodeById(current.id, center);
        // From markdown-driven selection: hide +/− to avoid accidental ops
        this.hideAddButton();
        this.currentSelectionDriver = 'cursor';
        this.driverHoldUntilMs = Date.now() + 500;
      }
    };

    // Editor content change -> sync
    this.registerEvent(this.app.workspace.on('editor-change', (editor: Editor, mdView?: MarkdownView) => {
      if (!this.file) return;
      if (mdView?.file?.path === this.file.path) {
        trySync();
      }
    }));

    // Reposition + button on container scroll (when scrollbars visible)
    if (this.containerElDiv) {
      const scrollHandler = () => this.updateAddButtonPosition();
      this.containerElDiv.addEventListener('scroll', scrollHandler);
      this.register(() => this.containerElDiv && this.containerElDiv.removeEventListener('scroll', scrollHandler));
    }

    // Poll cursor movement (covers pure cursor move without change)
    const id = window.setInterval(() => { trySync(); }, 400);
    this.editorSyncIntervalId = id as unknown as number;
    this.registerInterval(id as unknown as number);

    // Scroll-based top heading sync when enabled
    const attachScrollSync = () => {
      // Detach previous
      try {
        if (this.scrollSyncEl && this.scrollSyncHandler) {
          this.scrollSyncEl.removeEventListener('scroll', this.scrollSyncHandler);
        }
      } catch {}
      const activeMd = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeMd) return;
      const scroller = (activeMd as any).contentEl?.querySelector?.('.cm-scroller');
      if (!scroller) return;
      const scheduleRun = () => {
        const run = () => {
          try {
            if (!this.isAutoFollowEnabled()) return;
            if (!this.file || activeMd.file?.path !== this.file.path) return;
            if (this.currentSelectionDriver === 'cursor') return;
            const editor = activeMd.editor as any;
            const content = editor.getValue();
            const headings = computeHeadingSections(content);
            if (headings.length === 0) return;
            let best: HeadingNode | null = null;
            const cmAny = editor?.cm;
            const scRect = (scroller as HTMLElement).getBoundingClientRect();
            // Prefer CM6 EditorView directly when available
            if (cmAny) {
              let posRes: any = null;
              if (typeof cmAny.posAtCoords === 'function') {
                posRes = cmAny.posAtCoords({ x: scRect.left + 16, y: scRect.top + 1 });
              } else if (cmAny.view && typeof cmAny.view.posAtCoords === 'function') {
                posRes = cmAny.view.posAtCoords({ x: scRect.left + 16, y: scRect.top + 1 });
              }
              const pos = typeof posRes === 'number' ? posRes : (posRes && typeof posRes.pos === 'number' ? posRes.pos : null);
              const doc = cmAny?.state?.doc ?? cmAny?.view?.state?.doc;
              if (pos != null && doc?.lineAt) {
                try {
                  const lineNo = doc.lineAt(pos).number - 1;
                  for (const h of headings) { if (h.lineStart >= lineNo) { best = h; break; } }
                } catch {}
              }
            }
            if (!best) {
              const cm5 = cmAny;
              if (cm5?.coordsChar) {
                const p = cm5.coordsChar({ left: scRect.left + 16, top: scRect.top + 1 }, 'window');
                if (p && typeof p.line === 'number') {
                  for (const h of headings) { if (h.lineStart >= p.line) { best = h; break; } }
                }
              }
            }
            if (best && best.id !== this.lastSyncedNodeId) {
              this.lastSyncedNodeId = best.id;
              this.hideAddButton();
              const center = false;
              this.suppressRevealUntilMs = Date.now() + 600;
              this.selectMindmapNodeById(best.id, center);
              this.ensureMindmapNodeVisible(best.id);
              this.currentSelectionDriver = 'scroll';
              this.driverHoldUntilMs = Date.now() + 700;
            }
          } catch {}
        };
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(run);
        } else {
          setTimeout(run, 16);
        }
      };
      const onScroll = () => {
        if (!this.isAutoFollowEnabled()) return;
        if (!this.file || activeMd.file?.path !== this.file.path) return;
        if (this.currentSelectionDriver === 'cursor') return;
        const now = Date.now();
        const elapsed = now - this.scrollSyncLastRunMs;
        const threshold = 200;
        if (elapsed >= threshold) {
          this.scrollSyncLastRunMs = now;
          scheduleRun();
        } else {
          if (this.scrollSyncPendingTimeoutId == null) {
            const delay = threshold - elapsed;
            this.scrollSyncPendingTimeoutId = window.setTimeout(() => {
              this.scrollSyncPendingTimeoutId = null;
              this.scrollSyncLastRunMs = Date.now();
              scheduleRun();
            }, delay);
            // Ensure timer is cleared on detach
            this.register(() => {
              if (this.scrollSyncPendingTimeoutId != null) {
                try { window.clearTimeout(this.scrollSyncPendingTimeoutId); } catch {}
                this.scrollSyncPendingTimeoutId = null;
              }
            });
          }
        }
      };
      scroller.addEventListener('scroll', onScroll);
      this.scrollSyncEl = scroller as HTMLElement;
      this.scrollSyncHandler = onScroll;
      this.register(() => scroller && scroller.removeEventListener('scroll', onScroll));
    };
    attachScrollSync();
  }

  private showAddButton(nodeId: string) {
    try {
      if (!this.jm || !this.containerElDiv) return;
      if (this.isMindmapEditingActive()) return;
      const node = this.jm.get_node?.(nodeId);
      if (!node) {
        this.hideAddButton();
        return;
      }
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
        this.containerElDiv.appendChild(btn);
        this.addButtonEl = btn;
      }
      // If element exists but was removed due to refresh, re-append
      if (this.addButtonEl && this.addButtonEl.parentElement !== this.containerElDiv) {
        this.containerElDiv.appendChild(this.addButtonEl);
      }
      // Always bind to current nodeId (overwrite previous handler)
      this.addButtonEl!.onclick = (e) => { e.stopPropagation(); this.addChildUnder(nodeId); };
      // create delete button alongside (hidden for root)
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
        this.containerElDiv.appendChild(del);
        this.deleteButtonEl = del;
      }
      if (this.deleteButtonEl && this.deleteButtonEl.parentElement !== this.containerElDiv) {
        this.containerElDiv.appendChild(this.deleteButtonEl);
      }
      // Always bind to current nodeId
      this.deleteButtonEl!.onclick = (e) => { e.stopPropagation(); this.deleteHeadingById(nodeId); };
      this.addButtonForNodeId = nodeId;
      this.updateAddButtonPosition();
      // start RAF loop to follow transforms while visible
      if (this.addButtonRAF == null) {
        const tick = () => {
          this.updateAddButtonPosition();
          if (this.addButtonEl && this.addButtonEl.style.display !== 'none') {
            this.addButtonRAF = window.requestAnimationFrame(tick);
          } else {
            if (this.addButtonRAF != null) {
              window.cancelAnimationFrame(this.addButtonRAF);
              this.addButtonRAF = null;
            }
          }
        };
        this.addButtonRAF = window.requestAnimationFrame(tick);
      }
      // Root node: show only add, hide delete for safety
      if (node.isroot && this.deleteButtonEl) {
        this.deleteButtonEl.style.display = 'none';
      }
    } catch {}
  }

  private hideAddButton() {
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
  }

  private async addChildUnder(nodeId: string) {
    if (!this.file) return;
    const content = await this.app.vault.read(this.file);
    const headings = computeHeadingSections(content);
    const parent = headings.find(h => h.id === nodeId) ?? null;
    let levelToInsert = 1;
    let insertPos = content.length;
    if (parent) {
      levelToInsert = Math.min(parent.level + 1, 6);
      // Always append at the end of the parent's section (after its entire content block)
      insertPos = Math.min(parent.end + 1, content.length);
    }
    const headingPrefix = '#'.repeat(levelToInsert);
    const needLeadingNewline = insertPos > 0 && content.charAt(insertPos - 1) !== '\n';
    // Use placeholder title to satisfy jsMind's non-empty topic requirement
    const placeholder = '新标题';
    const insertText = `${needLeadingNewline ? '\n' : ''}${headingPrefix} ${placeholder}\n`;
    const updated = content.slice(0, insertPos) + insertText + content.slice(insertPos);
    await this.app.vault.modify(this.file, updated);
    new Notice('Child heading inserted');
    // Immediately focus editor to the inserted placeholder title
    const newHeadingStart = insertPos + (needLeadingNewline ? 1 : 0);
    const before = updated.slice(0, newHeadingStart);
    const newLineIndex = (before.match(/\n/g)?.length ?? 0);
    const chStart = headingPrefix.length + 1;
    const chEnd = chStart + placeholder.length;
    this.focusEditorToRange(newLineIndex, chStart, chEnd);
    // re-show buttons for current node after document mutation
    this.showAddButton(nodeId);
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

  private updateAddButtonPosition() {
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
      const gapBase = 8; // base gap from node/expander
      let xAdd = isLeft ? rect.left - hostRect.left - (buttonSize + gapBase + 6) : rect.right - hostRect.left + gapBase + 6;
      // If expander exists, place button beyond it to avoid overlap
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
      const centerY = Math.round(centerYRaw) - 3; // nudge up 1px for visual centering
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
      this.updateHoverPopupPosition();
    } catch {}
  }

  private updateHoverPopupPosition() {
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
      // Measure popup size safely (ensure measurable)
      if (!popupEl.offsetWidth || !popupEl.offsetHeight || popupEl.style.display === 'none') {
        popupEl.style.visibility = 'hidden';
        popupEl.style.display = 'block';
      }
      const popupW = popupEl.offsetWidth || 220;
      const popupH = popupEl.offsetHeight || 180;
      // Horizontal placement (left/right of node), with overflow handling
      let x = isLeft ? (rect.left - hostRect.left) - (popupW + gap) : (rect.right - hostRect.left) + gap;
      if (!isLeft && (x + popupW > hostRect.width - margin)) {
        x = (rect.left - hostRect.left) - (popupW + gap);
      }
      if (x < margin) x = margin;
      // Check if popup would horizontally overlap the node (squeezed)
      const nodeLeft = rect.left - hostRect.left;
      const nodeRight = rect.right - hostRect.left;
      const popupLeft = x;
      const popupRight = x + popupW;
      const overlapsHorizontally = !(popupRight <= nodeLeft - gap || popupLeft >= nodeRight + gap);
      // Default vertical alignment: align with node top
      let y: number = rect.top - hostRect.top;
      // If horizontally overlapping (squeezed), reposition vertically to avoid covering the node
      if (overlapsHorizontally) {
        const spaceBelow = hostRect.bottom - rect.bottom - margin;
        const spaceAbove = rect.top - hostRect.top - margin;
        if (spaceBelow >= popupH + gap || spaceBelow >= spaceAbove) {
          y = rect.bottom - hostRect.top + gap; // place below node
        } else {
          y = rect.top - hostRect.top - popupH - gap; // place above node
          if (y < margin) y = margin;
        }
      }
      popupEl.style.left = `${x}px`;
      popupEl.style.top = `${Math.max(0, y)}px`;
      popupEl.style.display = 'block';
      popupEl.style.visibility = 'visible';
    } catch {}
  }

  private extractNodeImmediateBody(nodeId: string): string {
    try {
      const content = this.lastFileContent || '';
      if (!content) return '';
      const headings = this.headingsCache && this.headingsCache.length ? this.headingsCache : computeHeadingSections(content);
      const idx = headings.findIndex(h => h.id === nodeId);
      if (idx === -1) return '';
      const h = headings[idx];
      const startBody = Math.min(content.length, Math.max(0, h.headingTextEnd + 1));
      const next = headings[idx + 1];
      const endBody = next ? Math.max(startBody, next.start - 1) : Math.max(startBody, content.length);
      const raw = content.slice(startBody, endBody);
      // Trim leading blank lines and trailing spaces
      return raw.replace(/^\s*\n/, '').trimEnd();
    } catch { return ''; }
  }

  private showHoverPopup(nodeId: string) {
    try {
      if (!this.containerElDiv) return;
      if (this.isMindmapEditingActive()) return;
      const body = this.extractNodeImmediateBody(nodeId);
      if (!body || body.trim().length === 0) { this.hideHoverPopup(); return; }
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
        // Theme-aware frosted glass styles (initial)
        {
          const isDark = document.body.classList.contains('theme-dark');
          el.style.border = isDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)';
          el.style.background = isDark ? 'rgba(30,30,30,0.68)' : 'rgba(255,255,255,0.85)';
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
        this.containerElDiv.appendChild(el);
        this.hoverPopupEl = el;
      }
      // Re-apply theme-aware background/border each time we show (handles theme switch)
      try {
        const isDarkNow = document.body.classList.contains('theme-dark');
        this.hoverPopupEl!.style.border = isDarkNow ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)';
        this.hoverPopupEl!.style.background = isDarkNow ? 'rgba(30,30,30,0.68)' : 'rgba(255,255,255,0.85)';
      } catch {}
      // Keep popup visible when mouse enters the popup area; hide on leave only if not entering a node
      try {
        const popup = this.hoverPopupEl!;
        if (!(popup as any).__mm_popup_bound) {
          popup.addEventListener('mouseleave', (ev: MouseEvent) => {
            const rel = ev.relatedTarget as HTMLElement | null;
            const intoNode = rel && (rel.closest ? rel.closest('jmnode') : null);
            if (intoNode) return;
            // Delay slightly to tolerate small gaps leaving popup into another node
            if (this.hoverHideTimeoutId != null) { try { window.clearTimeout(this.hoverHideTimeoutId); } catch {} }
            this.hoverHideTimeoutId = window.setTimeout(() => {
              this.hoverHideTimeoutId = null;
              this.hideHoverPopup();
            }, 150);
          });
          (popup as any).__mm_popup_bound = true;
        }
      } catch {}
      // Re-append if lost on refresh
      if (this.hoverPopupEl && this.hoverPopupEl.parentElement !== this.containerElDiv) {
        this.containerElDiv.appendChild(this.hoverPopupEl);
      }
      // Cancel any pending hide when (re)showing the popup
      if (this.hoverHideTimeoutId != null) { try { window.clearTimeout(this.hoverHideTimeoutId); } catch {} this.hoverHideTimeoutId = null; }
      this.hoverPopupForNodeId = nodeId;
      // Render markdown preview into popup
      const popup = this.hoverPopupEl!;
      try { popup.classList.add('markdown-rendered'); } catch {}
      popup.style.whiteSpace = 'normal';
      popup.innerHTML = '';
      try {
        // Use Obsidian's renderer to get theme-consistent preview
        MarkdownRenderer.renderMarkdown(body.trim(), popup, this.file?.path ?? '', this.plugin);
      } catch {
        // Fallback to plain text if rendering fails
        popup.textContent = body.trim();
      }
      this.updateHoverPopupPosition();
      // Follow transforms while visible
      if (this.hoverPopupRAF == null) {
        const tick = () => {
          this.updateHoverPopupPosition();
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

  private hideHoverPopup() {
    try {
      if (this.hoverPopupEl) this.hoverPopupEl.style.display = 'none';
      this.hoverPopupForNodeId = null;
      if (this.hoverPopupRAF != null) { try { window.cancelAnimationFrame(this.hoverPopupRAF); } catch {}; this.hoverPopupRAF = null; }
    } catch {}
  }

  private async deleteHeadingById(nodeId: string) {
    if (!this.file) return;
    try {
      const content = await this.app.vault.read(this.file);
      const headings = computeHeadingSections(content);
      const target = headings.find(h => h.id === nodeId);
      if (!target) return;
      const start = target.start;
      const end = Math.min(target.end + 1, content.length);
      const updated = content.slice(0, start) + content.slice(end);
      await this.app.vault.modify(this.file, updated);
      new Notice('Node deleted');
      // After deletion, try to show buttons on parent if exists
      const newHeadings = computeHeadingSections(updated);
      const parentId = target.parentId;
      if (parentId && newHeadings.find(h => h.id === parentId)) {
        this.showAddButton(parentId);
      } else {
        this.hideAddButton();
      }
    } catch {}
  }

  private async renameHeadingInFile(nodeId: string, nextTitleRaw: string) {
    if (!this.file) return;
    const safeTitle = (nextTitleRaw && nextTitleRaw.trim()) ? nextTitleRaw.trim() : '新标题';
    try {
      const content = await this.app.vault.read(this.file);
      const lines = content.split('\n');
      const headings = computeHeadingSections(content);
      const target = headings.find(h => h.id === nodeId);
      if (!target) return;
      const lineIdx = target.lineStart;
      if (lineIdx < 0 || lineIdx >= lines.length) return;
      let nextLine = lines[lineIdx];
      if (target.style === 'atx') {
        const original = lines[lineIdx] ?? '';
        // Preserve leading hashes, whitespace, and any trailing spaces/closing #s
        const m = original.match(/^(#{1,6})([ \t]+)(.*?)([ \t#]*)$/);
        if (m) {
          const leading = m[1] + m[2];
          const trailing = m[4] ?? '';
          nextLine = `${leading}${safeTitle}${trailing}`;
        } else {
          // Fallback: rebuild minimally
          const hashes = '#'.repeat(Math.min(Math.max(target.level, 1), 6));
          nextLine = `${hashes} ${safeTitle}`;
        }
      } else {
        // setext: change only the title line; underline remains
        nextLine = safeTitle;
      }
      // Skip write if no change
      if (lines[lineIdx] === nextLine) return;
      lines[lineIdx] = nextLine;
      const updated = lines.join('\n');
      await this.app.vault.modify(this.file, updated);
      // ensure jsMind node shows placeholder if needed
      if (this.jm && nextTitleRaw.trim().length === 0) {
        try { this.jm.update_node(nodeId, safeTitle); } catch {}
      }
    } catch {
      // ignore
    }
  }


  private isMarkdownEditorFocused(mdView: MarkdownView): boolean {
    try {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return false;
      const cmEl = (mdView as any).contentEl?.querySelector?.('.cm-editor');
      if (!cmEl) return false;
      return !!(active === cmEl || active.closest?.('.cm-editor') === cmEl);
    } catch {}
    return false;
  }

  private isAutoFollowEnabled(): boolean {
    try {
      return (this.plugin as any).settings?.autoFollow === true;
    } catch {}
    return false;
  }


}

export default class MindmapPlugin extends Plugin {
  private collapsedByFile: Record<string, string[]> = {};
  public settings: { autoFollow: boolean } = { autoFollow: true };

  async onload() {
    // Minimal logic change (Option B): sanitize class tokens with whitespace
    // to avoid InvalidCharacterError when other plugins add class names with spaces.
    try {
      const g: any = window as any;
      if (!g.__jsmindMindmapPatchedClassListAdd) {
        const proto: any = (DOMTokenList as any).prototype;
        const originalAdd = proto.add;
        proto.add = function (...tokens: any[]) {
          const sanitized = tokens.map((token: any) =>
            typeof token === 'string' ? token.replace(/\s+/g, '-') : token
          );
          return originalAdd.apply(this, sanitized);
        };
        g.__jsmindMindmapPatchedClassListAdd = true;
      }
    } catch (e) {
      // noop
    }

    // Load settings and persisted collapsed map
    try {
      const data = (await this.loadData()) as any;
      if (data && typeof data === 'object') {
        if (typeof data.autoFollow === 'boolean') this.settings.autoFollow = data.autoFollow;
      }
      if (data && typeof data === 'object' && data.collapsedByFile) {
        const raw = data.collapsedByFile as Record<string, string[]>;
        const cleaned: Record<string, string[]> = {};
        for (const [fp, arr] of Object.entries(raw)) {
          if (Array.isArray(arr)) {
            const uniq = Array.from(new Set(arr.filter(v => typeof v === 'string' && v.length > 0)));
            if (uniq.length > 0) cleaned[fp] = uniq;
          }
        }
        this.collapsedByFile = cleaned;
      }
    } catch {}

    this.registerView(
      VIEW_TYPE_MINDMAP,
      (leaf) => new MindmapView(leaf, this)
    );

    this.addCommand({
      id: 'open-jsmind-preview',
      name: 'Preview current markdown as mindmap',
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice('No active file');
          return;
        }
        const leaf = this.app.workspace.getRightLeaf(false);
        await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
        const view = leaf.view as MindmapView;
        await view.setFile(file);
        this.app.workspace.revealLeaf(leaf);
      },
    });

    // Resize handling
    this.registerDomEvent(window, 'resize', () => {
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
      for (const leaf of leaves) {
        const view = leaf.view as MindmapView;
        (view as any).jm && (view as any).jm.resize && (view as any).jm.resize();
      }
    });

    // Settings tab
    this.addSettingTab(new MindmapSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP).forEach(leaf => leaf.detach());
  }

  getCollapsedSet(filePath: string): Set<string> {
    const arr = this.collapsedByFile[filePath] || [];
    return new Set(arr);
  }

  async markCollapsed(filePath: string, nodeId: string) {
    const set = this.getCollapsedSet(filePath);
    set.add(nodeId);
    if (set.size > 0) {
      this.collapsedByFile[filePath] = Array.from(set);
    } else {
      delete this.collapsedByFile[filePath];
    }
    await this.saveData({ collapsedByFile: this.collapsedByFile, autoFollow: this.settings.autoFollow });
  }

  async unmarkCollapsed(filePath: string, nodeId: string) {
    const set = this.getCollapsedSet(filePath);
    set.delete(nodeId);
    if (set.size > 0) {
      this.collapsedByFile[filePath] = Array.from(set);
    } else {
      delete this.collapsedByFile[filePath];
    }
    await this.saveData({ collapsedByFile: this.collapsedByFile, autoFollow: this.settings.autoFollow });
  }
}

class MindmapSettingTab extends PluginSettingTab {
  plugin: MindmapPlugin;
  constructor(app: App, plugin: MindmapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h3', { text: 'Mindmap (jsMind) Settings' });
    new Setting(containerEl)
      .setName('Auto follow editor scroll')
      .setDesc('When scrolling markdown, select the top heading in mindmap')
      .addToggle(t => t
        .setValue(this.plugin.settings.autoFollow)
        .onChange(async (v) => {
          this.plugin.settings.autoFollow = v;
          await this.plugin.saveData({ collapsedByFile: this.plugin.collapsedByFile, autoFollow: this.plugin.settings.autoFollow });
        }));
  }
}


