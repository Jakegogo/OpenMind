import { App, Editor, ItemView, MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf, requestUrl } from 'obsidian';

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
  private plugin: MindmapPlugin;
  private file: TFile | null = null;
  private containerElDiv: HTMLDivElement | null = null;
  private jm: any | null = null;
  private headingsCache: HeadingNode[] = [];
  private suppressSync: boolean = false;
  private lastSyncedNodeId: string | null = null;
  private editorSyncIntervalId: number | null = null;
  private suppressEditorSyncUntil: number = 0;
  private prevViewport: { nodesTransform: string | null; canvasTransform: string | null } | null = null;
  private allowCenterRoot: boolean = false;
  private centerRootWrapped: boolean = false;

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
    const toolbar = this.contentEl.createDiv({ cls: 'mm-toolbar' });
    const addChildBtn = toolbar.createEl('button', { text: 'Add Child' });
    const renameBtn = toolbar.createEl('button', { text: 'Rename' });
    const deleteBtn = toolbar.createEl('button', { text: 'Delete' });
    const refreshBtn = toolbar.createEl('button', { text: 'Refresh' });

    const container = this.contentEl.createDiv();
    container.id = 'jsmind_container';
    container.style.width = '100%';
    container.style.flex = '1 1 auto';
    container.style.height = '100%';
    container.style.minHeight = '400px';
    this.containerElDiv = container;

    addChildBtn.addEventListener('click', () => this.handleAddChild());
    renameBtn.addEventListener('click', () => this.handleRename());
    deleteBtn.addEventListener('click', () => this.handleDelete());
    refreshBtn.addEventListener('click', () => this.refresh());

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
    await this.refresh();

    // Observe size changes for reliable canvas resizing
    try {
      const ro = new ResizeObserver(() => {
        if (this.jm) {
          try { this.jm.resize && this.jm.resize(); } catch {}
        }
      });
      if (this.containerElDiv) ro.observe(this.containerElDiv);
      this.register(() => ro.disconnect());
    } catch {}

    // Attach editor -> mindmap selection sync
    this.attachEditorSync();

    this.registerEvent(this.app.vault.on('modify', async (file) => {
      if (this.file && file.path === this.file.path) {
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
          }
        }
      } catch {}
    }));
  }

  async setFile(file: TFile) {
    this.file = file;
    this.lastSyncedNodeId = null;
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
    // Capture viewport (transform) and selection before rebuild
    const prevSelectedId = (() => {
      try { return this.jm?.get_selected_node?.()?.id ?? null; } catch { return null; }
    })();
    this.prevViewport = this.captureViewport();

    const content = await this.app.vault.read(this.file);
    this.headingsCache = computeHeadingSections(content);
    const mind = buildJsMindTreeFromHeadings(this.headingsCache, this.file.name);
    if (!this.containerElDiv || !window.jsMind) return;
    this.containerElDiv.empty();
    this.containerElDiv.id = 'jsmind_container';
    const options = { container: 'jsmind_container', theme: 'primary', editable: true };
    // Ensure root node style matches themed nodes instead of white
    try {
      const overrideId = 'jsmind-theme-override';
      if (!document.getElementById(overrideId)) {
        const style = document.createElement('style');
        style.id = overrideId;
        style.textContent = `
/* Make root node adopt theme colors instead of white */
.theme-primary jmnode.root { background: #e8f2ff !important; border-color: #90c2ff !important; color: #0b3d91 !important; }
`;
        document.head.appendChild(style);
      }
    } catch {}
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
    try { this.jm.resize && this.jm.resize(); } catch {}

    // Sync: click/select a node -> reveal and select heading in markdown editor
    try {
      const attachSelectionSync = () => {
        if (this.jm && typeof this.jm.add_event_listener === 'function') {
          this.jm.add_event_listener((type: string, data: any) => {
            if (type === 'select_node' && data?.node?.id) {
              if (this.suppressSync) return;
              // Manual click: only reveal editor, do NOT auto-center mindmap
              this.lastSyncedNodeId = data.node.id;
              this.suppressEditorSyncUntil = Date.now() + 600;
              this.revealHeadingById(data.node.id);
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
              this.lastSyncedNodeId = nodeId;
              this.suppressEditorSyncUntil = Date.now() + 600;
              this.revealHeadingById(nodeId);
            }
          };
          nodesContainer.addEventListener('click', handler);
          this.register(() => nodesContainer && nodesContainer.removeEventListener('click', handler));
        }
      };
      attachSelectionSync();
    } catch {}
  }

  private async softSyncFromDisk() {
    if (!this.file || !this.jm) {
      await this.refresh();
      return;
    }
    try {
      const content = await this.app.vault.read(this.file);
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

    // Remove nodes that no longer exist
    for (const oldH of prev) {
      if (!nextMap.has(oldH.id)) {
        try { this.jm.remove_node(oldH.id); } catch {}
      }
    }

    // Add or update nodes
    for (const newH of next) {
      const existed = prevMap.get(newH.id);
      if (!existed) {
        // add under its computed parent
        const parentKey = newH.parentId ?? (firstNextH1 ? firstNextH1.id : rootId);
        try { this.jm.add_node(parentKey, newH.id, newH.title || ''); } catch {}
        continue;
      }
      // update title if changed
      if (existed.title !== newH.title) {
        try { this.jm.update_node(newH.id, newH.title || ''); } catch {}
      }
      // reparent if parent changed
      const oldParent = existed.parentId ?? (firstPrevH1 ? firstPrevH1.id : rootId);
      const newParent = newH.parentId ?? (firstNextH1 ? firstNextH1.id : rootId);
      if (oldParent !== newParent) {
        try {
          this.jm.remove_node(newH.id);
          this.jm.add_node(newParent, newH.id, newH.title || '');
        } catch {}
      }
    }

    // Reselect previously selected node without centering
    try {
      const sel = this.jm.get_selected_node?.();
      const selId = sel?.id;
      if (selId && nextMap.has(selId)) {
        this.suppressSync = true;
        try { this.jm.select_node(selId); } finally { setTimeout(() => { this.suppressSync = false; }, 0); }
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

  private attachEditorSync() {
    const trySync = async () => {
      if (!this.file) return;
      if (Date.now() < this.suppressEditorSyncUntil) return;
      const activeMd = this.app.workspace.getActiveViewOfType(MarkdownView);
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
        this.selectMindmapNodeById(current.id, center);
      }
    };

    // Editor content change -> sync
    this.registerEvent(this.app.workspace.on('editor-change', (editor: Editor, mdView?: MarkdownView) => {
      if (!this.file) return;
      if (mdView?.file?.path === this.file.path) {
        trySync();
      }
    }));

    // Poll cursor movement (covers pure cursor move without change)
    const id = window.setInterval(() => { trySync(); }, 400);
    this.editorSyncIntervalId = id as unknown as number;
    this.registerInterval(id as unknown as number);
  }

  private getSelectedHeading(): HeadingNode | null {
    if (!this.jm) return null;
    const node = this.jm.get_selected_node();
    if (!node) return null;
    const id = node.id as string;
    return this.headingsCache.find(h => h.id === id) ?? null;
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

  private async handleAddChild() {
    if (!this.file) return;
    const selected = this.getSelectedHeading();
    const content = await this.app.vault.read(this.file);
    const headings = computeHeadingSections(content);
    let parent: HeadingNode | null = selected;
    if (!parent) {
      const firstH1 = headings.find(h => h.level === 1) ?? null;
      parent = firstH1;
    }
    let levelToInsert = 1;
    let insertPos = content.length;
    if (parent) {
      levelToInsert = Math.min(parent.level + 1, 6);
      insertPos = parent.end + 1;
    }
    const title = window.prompt('New node title');
    if (!title) return;
    const headingPrefix = '#'.repeat(levelToInsert);
    const prefix = content.endsWith('\n') ? '' : '\n';
    const insertText = `${prefix}${headingPrefix} ${title}\n`;
    const updated = content.slice(0, insertPos) + insertText + content.slice(insertPos);
    await this.app.vault.modify(this.file, updated);
    new Notice('Child node added');
  }

  private async handleRename() {
    if (!this.file) return;
    const selected = this.getSelectedHeading();
    if (!selected) {
      new Notice('Select a node to rename');
      return;
    }
    const content = await this.app.vault.read(this.file);
    const headings = computeHeadingSections(content);
    const target = headings.find(h => h.id === selected.id);
    if (!target) return;
    const newTitle = window.prompt('New title', target.title);
    if (!newTitle) return;
    const headingLine = content.substring(target.start, target.headingTextEnd);
    const replacedLine = headingLine.replace(/^(#{1,6})\s+.*$/, `$1 ${newTitle}`);
    const updated = content.slice(0, target.start) + replacedLine + content.slice(target.headingTextEnd);
    await this.app.vault.modify(this.file, updated);
    new Notice('Node renamed');
  }

  private async handleDelete() {
    if (!this.file) return;
    const selected = this.getSelectedHeading();
    if (!selected) {
      new Notice('Select a node to delete');
      return;
    }
    if (!confirm('Delete this node and its content?')) return;
    const content = await this.app.vault.read(this.file);
    const headings = computeHeadingSections(content);
    const target = headings.find(h => h.id === selected.id);
    if (!target) return;
    const start = target.start;
    const end = Math.min(target.end + 1, content.length);
    const updated = content.slice(0, start) + content.slice(end);
    await this.app.vault.modify(this.file, updated);
    new Notice('Node deleted');
  }
}

export default class MindmapPlugin extends Plugin {
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
  }

  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP).forEach(leaf => leaf.detach());
  }
}


