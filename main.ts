import { App, Editor, ItemView, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, requestUrl, MarkdownRenderer } from 'obsidian';
import { PopupController, ButtonController, ExportController } from './tools';
import { ensureThemeCssInjected, getJsMindThemeNameFromSetting, THEME_OPTIONS, ThemeName } from './themes';

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

// TODO 添加缓存
let __mm_lastHeadingsText: string | null = null;
let __mm_lastHeadingsRes: HeadingNode[] | null = null;
let __mm_lastHeadingsTs: number = 0;

// Normalize trailing colon (full/half width) from titles/labels
function cleanEndColon(s: string): string {
  try { return (s || '').replace(/[：:]\s*$/u, ''); } catch { return s || ''; }
}

// Extract top-level list items (ul/ol) within a range as simple content nodes (no nested structure for now)
function extractListItems(markdownText: string, start: number, end: number): string[] {
  try {
    const lines = markdownText.split('\n');
    // compute line numbers from char positions
    let acc: number = 0;
    let startLine = 0;
    let endLine = lines.length - 1;
    for (let i = 0; i < lines.length; i++) {
      const len = lines[i].length + 1;
      if (acc <= start && start < acc + len) startLine = i;
      if (acc <= end && end <= acc + len) { endLine = Math.max(i, startLine); break; }
      acc += len;
    }
    const items: string[] = [];
    const liRegex = /^\s{0,3}(?:[-*+]\s+|\d+\.\s+)(.+)$/;
    let inCode = false;
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
      if (inCode) continue;
      const m = line.match(liRegex);
      if (m) {
        const text = m[1].trim();
        if (text.length > 0) items.push(text);
      }
    }
    return items;
  } catch { return []; }
}

type ContentNode = { label: string; children: ContentNode[]; meta?: { task?: boolean; done?: boolean } };
function extractContentTree(markdownText: string, start: number, end: number): ContentNode[] {
  try {
    const lines = markdownText.split('\n');
    // compute line range
    let acc = 0, startLine = 0, endLine = lines.length - 1;
    for (let i = 0; i < lines.length; i++) {
      const len = lines[i].length + 1;
      if (acc <= start && start < acc + len) startLine = i;
      if (acc <= end && end <= acc + len) { endLine = Math.max(i, startLine); break; }
      acc += len;
    }
    // Limit to "immediate body before first sub-heading" within [start, end]
    const atxHeadingRe = /^(#{1,6})\s+.*$/;
    const setextH1Re = /^=+\s*$/;
    const setextH2Re = /^-{4,}\s*$/; // require 4+ dashes to avoid '- ' and '--' and '---'
    const isHrTripleDash = (s: string) => /^\s*---\s*$/.test(s);
    let stopAt = endLine;
    {
      let inCode = false;
      for (let i = startLine; i <= endLine && i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
        if (inCode) continue;
        // ATX heading starts a new section → stop before it
        if (atxHeadingRe.test(line)) { stopAt = i - 1; break; }
        // Setext heading: current line is title, next line is underline
        const next = (i + 1 <= endLine) ? lines[i + 1] : undefined;
        if (next && (setextH1Re.test(next) || (setextH2Re.test(next) && !isHrTripleDash(next)))) {
          stopAt = i - 1;
          break;
        }
      }
    }
    endLine = Math.max(startLine, Math.min(endLine, stopAt));
    // Parse with a simple stack by indent depth
    const root: ContentNode[] = [];
    type Frame = { depth: number; items: ContentNode[] };
    const stack: Frame[] = [{ depth: -1, items: root }];
    let inCode = false;
    // --- Regex classes (single-purpose, easier to maintain) ---
    const BULLET = "[-*+\u2013\u2014\u2022]"; // -, *, +, en dash, em dash, bullet
    const RE_UL_ITEM = new RegExp(`^(\\s*)${BULLET}\\s+(.+)$`); // unordered list item
    const RE_INLINE_BOLD = /\*\*(.+?)\*\*/; // inline bold anywhere
    const RE_BOLD_LINE = /^(\s*)\*\*(.+?)\*\*[：:]?.*$/; // '**Title**：...' full line
    const RE_NUM_BOLD = /^(\s*)(\d+)\.\s*\*\*(.+?)\*\*[：:]?.*$/; // '1.**Title**：...'
    const RE_TASK_UNCHECKED = new RegExp(`^(\\s*)${BULLET}\\s*\\[\\s\\]\\s*(.+)$`); // '- [ ] text'
    const RE_TASK_CHECKED = new RegExp(`^(\\s*)${BULLET}\\s*\\[(?:x|X)\\]\\s*(.+)$`); // '- [x] text'
    const RE_OL_ITEM = /^(\s*)(\d+)[\.\)．、]\s*(.+)$/; // ordered list: 1. 1) 1、 1．
    // ---------------------------------------------------------
    // 2.5) Title-with-colon lines (e.g., '业务流程梳理: ...')
    // Recognize as a parent content node only if followed by list items.
    const RE_TITLE_COLON_LINE = /^(\s*)([^-*#].{0,80}?)[：:]\s*(?:（.*?）|\(.*?\))?\s*$/;
    let structuralDepthBase = 0; // 0 for none, increases after bold/italic blocks
    let baseFloorAfterBold = 0;   // persist base >=1 after a standalone bold title
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      const raw = lines[i];
      if (/^\s*$/.test(raw)) { structuralDepthBase = Math.max(structuralDepthBase, baseFloorAfterBold); continue; }
      if (/^\s*```/.test(raw)) { inCode = !inCode; continue; }
      if (inCode) continue;
      let label: string | null = null;
      let fromTitleColon = false;
      let depthSpaces = 0;
      // 1) Numbered + bold (e.g., '1.**RAG**：')
      {
        const m = raw.match(RE_NUM_BOLD);
        if (m) {
          depthSpaces = m[1].length;
          const num = (m[2] || '').trim();
          const txt = (m[3] || '').trim();
          label = `${num}. ${txt}`;
        }
      }
      // 2) Bold-line start (e.g., '**预置配色方案**：...')
      if (!label) {
        const m = raw.match(RE_BOLD_LINE);
        if (m) {
          depthSpaces = 0;
          label = (m[2] || '').trim();
        }
      }
      // 3) Task list items '- [ ] text' / '- [x] text' (prefer bold inside if present)
      if (!label) {
        let m = raw.match(RE_TASK_UNCHECKED);
        if (!m) m = raw.match(RE_TASK_CHECKED);
        if (m) {
          depthSpaces = m[1].length;
          const taskText = (m[2] || '').trim();
          const b = taskText.match(RE_INLINE_BOLD);
          label = (b ? b[1] : taskText).trim();
          // stash meta for checkbox rendering
          // we will create the node immediately here to preserve meta,
          // then continue to the next line
          const depth = Math.max(Math.floor(depthSpaces / 2), structuralDepthBase);
          while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
          const container = stack[stack.length - 1].items;
          const cleanedLabel = cleanEndColon(label);
          const node: ContentNode = { label: cleanedLabel, children: [], meta: { task: true, done: !!raw.match(RE_TASK_CHECKED) } };
          container.push(node);
          stack.push({ depth, items: node.children });
          continue;
        }
      }
      // 3.5) Title-with-colon as parent when followed by list items
      if (!label) {
        const m = raw.match(RE_TITLE_COLON_LINE);
        if (m) {
          // Lookahead to ensure the next non-empty line is a list item
          let hasListAfter = false;
          for (let j = i + 1; j <= endLine && j < lines.length; j++) {
            const look = lines[j];
            if (/^\s*$/.test(look)) continue;
            if (RE_UL_ITEM.test(look) || RE_OL_ITEM.test(look) || RE_TASK_UNCHECKED.test(look) || RE_TASK_CHECKED.test(look)) {
              hasListAfter = true;
            }
            break;
          }
          if (hasListAfter) {
            depthSpaces = 0;
            label = (m[2] || '').trim();
            fromTitleColon = true;
          }
        }
      }
      // 4) List items
      if (!label) {
        // Ordered list
        const mol = raw.match(RE_OL_ITEM);
        if (mol) {
          depthSpaces = mol[1].length;
          const num = (mol[2] || '').trim();
          const liText = (mol[3] || '').trim();
          const b = liText.match(RE_INLINE_BOLD);
          const core = (b ? (b[1] || '').trim() : liText);
          label = `${num}. ${core}`;
        } else {
          // Unordered list
          const mul = raw.match(RE_UL_ITEM);
          if (mul) {
            depthSpaces = mul[1].length;
            const liText = (mul[2] || '').trim();
            const b = liText.match(RE_INLINE_BOLD);
            label = (b ? (b[1] || '').trim() : liText);
          }
        }
      }
      // 5) Standalone italic blocks (optional)
      if (!label) {
        const bold = raw.match(/^\s*\*\*(.+?)\*\*\s*$/);
        const italic = raw.match(/^\s*\*(.+?)\*\s*$/) || raw.match(/^\s*_(.+?)_\s*$/);
        if (bold) { label = bold[1].trim(); depthSpaces = 0; baseFloorAfterBold = 1; }
        else if (italic) { label = italic[1].trim(); depthSpaces = 2; }
      }
      if (!label) continue;
      let depth = Math.floor(depthSpaces / 2);
      // Apply structural base so that bold > italic > list hierarchy is preserved
      if (/^\s*\*\*(.+?)\*\*\s*$/.test(raw)) {
        depth = 0;
        structuralDepthBase = Math.max(1, baseFloorAfterBold); // next block goes under bold
      } else if (/^\s*(?:\*.+?\*|_.+?_)\s*$/.test(raw)) {
        depth = Math.max(structuralDepthBase, 1);
        structuralDepthBase = depth + 1; // lists will go under italic
      } else if (fromTitleColon) {
        // Place the title-with-colon at current structural base (under bold if present),
        // then advance base so following list items become its children.
        depth = Math.max(structuralDepthBase, 0);
        structuralDepthBase = depth + 1;
      } else {
        depth = Math.max(depth, structuralDepthBase);
      }
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      const container = stack[stack.length - 1].items;
      const cleanedLabel = cleanEndColon(label || '');
      const node: ContentNode = { label: cleanedLabel, children: [] };
      container.push(node);
      stack.push({ depth, items: node.children });
    }
    return root;
  } catch { return []; }
}

function computeHeadingSections(markdownText: string): HeadingNode[] {
  try {
    const now = Date.now();
    if (__mm_lastHeadingsRes && (now - __mm_lastHeadingsTs) <= 3000) {
      if (__mm_lastHeadingsText != null && __mm_lastHeadingsText.length === markdownText.length) {
        return __mm_lastHeadingsRes;
      }
    }
  } catch {}
  const lines = markdownText.split(/\n/);
  const headingRegex = /^(#{1,6})\s+(.*)$/;
  const slugify = (s: string) => {
    try {
      const base = s.trim().toLowerCase();
      const collapsed = base.replace(/\s+/g, '-');
      const cleaned = collapsed.replace(/[^a-z0-9\-\u4e00-\u9fa5]+/gi, '');
      const trimmed = cleaned.replace(/^-+|-+$/g, '');
      return trimmed || 'untitled';
    } catch { return 'untitled'; }
  };
  const slugCounts = new Map<string, number>();
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
      const slug = slugify(title);
      const cnt = (slugCounts.get(slug) || 0) + 1; slugCounts.set(slug, cnt);
      const hid = cnt === 1 ? `h_${slug}` : `h_${slug}_${cnt}`;
      headingsTemp.push({
        id: hid,
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
        const slug = slugify(title);
        const cnt = (slugCounts.get(slug) || 0) + 1; slugCounts.set(slug, cnt);
        const hid = cnt === 1 ? `h_${slug}` : `h_${slug}_${cnt}`;
        headingsTemp.push({
          id: hid,
          level: 1,
          title,
          start,
          lineStart: i,
          raw: line + '\n' + next,
          style: 'setext',
        });
      } else if (/^-{4,}\s*$/.test(next)) { // 4+ dashes only; '---' excluded implicitly
        const start = offset;
        const title = line.trim();
        const headingTextEnd = start + line.length;
        const slug = slugify(title);
        const cnt = (slugCounts.get(slug) || 0) + 1; slugCounts.set(slug, cnt);
        const hid = cnt === 1 ? `h_${slug}` : `h_${slug}_${cnt}`;
        headingsTemp.push({
          id: hid,
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
  try {
    __mm_lastHeadingsText = markdownText;
    __mm_lastHeadingsRes = headings;
    __mm_lastHeadingsTs = Date.now();
  } catch {}
  return headings;
}

function buildJsMindTreeFromHeadings(headings: HeadingNode[], fileName: string) {
  const firstH1 = headings.find(h => h.level === 1);
  let rootId: string;
  let rootTopic: string;
  if (firstH1) {
    rootId = firstH1.id;
    rootTopic = cleanEndColon(firstH1.title || fileName);
  } else {
    rootId = `virtual_root_${fileName}`;
    rootTopic = cleanEndColon(fileName.replace(/\.md$/i, ''));
  }
  const byId = new Map<string, any>();
  const root: any = { id: rootId, topic: rootTopic, children: [] };
  byId.set(rootId, root);
  for (const h of headings) {
    if (firstH1 && h.id === firstH1.id) continue;
    const node: any = { id: h.id, topic: cleanEndColon(h.title), children: [] };
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

function buildJsMindTreeWithContent(headings: HeadingNode[], fileName: string, markdownText: string, includeContent: boolean): { mind: any; contentParentMap: Map<string, string> } {
  const firstH1 = headings.find(h => h.level === 1);
  let rootId: string;
  let rootTopic: string;
  if (firstH1) {
    rootId = firstH1.id;
    rootTopic = cleanEndColon(firstH1.title || fileName);
  } else {
    rootId = `virtual_root_${fileName}`;
    rootTopic = cleanEndColon(fileName.replace(/\.md$/i, ''));
  }
  const byId = new Map<string, any>();
  const root: any = { id: rootId, topic: rootTopic, children: [] };
  byId.set(rootId, root);
  for (const h of headings) {
    if (firstH1 && h.id === firstH1.id) continue;
    const node: any = { id: h.id, topic: cleanEndColon(h.title), children: [] };
    byId.set(h.id, node);
  }
  const contentParentMap = new Map<string, string>();
  // Helper to add content tree under root once, for a given text range
  let rootContentSeq = 0;
  const addRootContentRange = (start: number, end: number) => {
    const tree = extractContentTree(markdownText, start, end);
    const addChildren = (host: any, children: any[]) => {
      for (const child of children) {
        rootContentSeq += 1;
        const cid = `c_${rootId}_${rootContentSeq}`;
        const cnode: any = { id: cid, topic: child.label, children: [] };
        if ((child as any).meta) { cnode.data = { meta: (child as any).meta }; }
        host.children.push(cnode);
        contentParentMap.set(cid, rootId);
        if (Array.isArray(child.children) && child.children.length > 0) {
          addChildren(cnode, child.children);
        }
      }
    };
    addChildren(root, tree);
  };

  if (includeContent) {
    if (headings.length === 0) {
      // Whole-file content as root content
      addRootContentRange(0, markdownText.length);
      return { mind: { meta: { name: fileName }, format: 'node_tree', data: root }, contentParentMap };
    } else {
      // Leading content before the first heading as root content
      try {
        const firstHeadingStart = Math.max(0, headings[0].start);
        if (firstHeadingStart > 0) {
          addRootContentRange(0, firstHeadingStart - 1);
        }
      } catch {}
    }
  }
  for (const h of headings) {
    if (firstH1 && h.id === firstH1.id) continue;
    const parentKey = h.parentId ?? (firstH1 ? firstH1.id : rootId);
    const parent = byId.get(parentKey) ?? root;
    const headingNode = byId.get(h.id);
    parent.children.push(headingNode);
    if (includeContent) {
      const itemsTree = extractContentTree(markdownText, h.headingTextEnd + 1, h.end);
      let seq = 0;
      const addChildren = (host: any, children: any[]) => {
        for (const child of children) {
          seq += 1;
          const cid = `c_${h.id}_${seq}`;
          const cnode: any = { id: cid, topic: child.label, children: [] };
          if ((child as any).meta) { cnode.data = { meta: (child as any).meta }; }
          host.children.push(cnode);
          contentParentMap.set(cid, h.id);
          if (Array.isArray(child.children) && child.children.length > 0) {
            addChildren(cnode, child.children);
          }
        }
      };
      addChildren(headingNode, itemsTree);
    }
  }
  return { mind: { meta: { name: fileName }, format: 'node_tree', data: root }, contentParentMap };
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
  private lastSyncedNodeId: string | null = null;     // last node id driven into selection to dedupe work
  // removed: private editorSyncIntervalId: number | null = null;

  // Viewport/centering management
  private prevViewport: { nodesTransform: string | null; canvasTransform: string | null } | null = null; // saved transforms across re-render
  private allowCenterRoot: boolean = false;           // only allow jm to center root when explicitly enabled
  private centerRootWrapped: boolean = false;         // ensure we wrap jsMind center methods only once

  // UI interaction timing
  private revealTimeoutId: number | null = null;      // debounce for click-to-reveal in editor
  private lastDblClickAtMs: number = 0;               // last dblclick to differentiate from single click

  // Visibility/suspension controls (skip heavy work when hidden/offscreen)
  private isSuspended: boolean = false;               // whether view is currently suspended
  private pendingDirty: boolean = false;              // if changes occurred while suspended, refresh on resume

  // Hover popup handled by controller

  // Stable id mapping (parent chain + sibling index)
  private idToStableKey: Map<string, string> = new Map(); // runtime id -> stable key
  private stableKeyToId: Map<string, string> = new Map(); // stable key -> runtime id
  // Content nodes mapping (content-id -> parent heading-id)
  private contentParentMap: Map<string, string> = new Map();

  // FSM for sync control
  private syncState: 'scroll' | 'edit' | 'preview' = 'scroll';
  // Controllers (OOP) for UI helpers
  private popup: PopupController = new PopupController();
  private buttons: ButtonController = new ButtonController();
  private exporter: ExportController = new ExportController();
  private enterScroll() { 
    if (this.syncState === 'preview') return;
    if (this.syncState === 'edit') return;
    if (this.syncState === 'scroll') return;
    this.syncState = 'scroll';
    this.hideAddButton();
  }
  private forceEnterScroll() { this.syncState = 'scroll'; this.hideAddButton(); }
  private enterEdit() { this.syncState = 'edit'; this.hideAddButton(); }
  private enterPreview() { this.syncState = 'preview'; }
  private shouldFollowScroll(): boolean { return this.syncState === 'scroll'; }
  private shouldMindmapDriveMarkdown(): boolean { return this.syncState === 'preview'; }
  private shouldCenterOnMarkdownSelection(): boolean { return this.syncState === 'edit'; }

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
  private isContentNode(id: string): boolean { return typeof id === 'string' && id.startsWith('c_'); }
  private resolveHeadingId(id: string): string | null {
    if (!id) return null;
    if (this.isContentNode(id)) {
      const parent = this.contentParentMap.get(id);
      return parent || null;
    }
    return id;
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

  // Apply scroll-behavior to jsMind's inner scrolling element when available
  private setJsMindScrollBehavior(mode: 'smooth' | 'auto'): void {
    try {
      if (!this.containerElDiv) return;
      const inner = this.containerElDiv.querySelector('.jsmind-inner') as HTMLElement | null;
      const target = (inner as HTMLElement | null) ?? this.containerElDiv;
      (target.style as any).scrollBehavior = mode;
    } catch {}
  }

  // Attach handlers to switch scroll-behavior to 'auto' while dragging and restore to 'smooth' on end
  private attachScrollBehaviorDragHandlers(nodesContainer: Element): void {
    const onNodeMouseDown = (ev: MouseEvent) => {
      let moved = false;
      const startX = ev.clientX;
      const startY = ev.clientY;
      const target: HTMLElement | null = (() => {
        try {
          if (!this.containerElDiv) return null;
          const inner = this.containerElDiv.querySelector('.jsmind-inner') as HTMLElement | null;
          return inner ?? this.containerElDiv;
        } catch { return null; }
      })();
      const onMove = (mvEv: MouseEvent) => {
        if (moved) return;
        const dx = Math.abs(mvEv.clientX - startX);
        const dy = Math.abs(mvEv.clientY - startY);
        if (dx + dy > 3) {
          moved = true;
          // Disable smoothness while dragging
          this.setJsMindScrollBehavior('auto');
          // Indicate dragging cursor
          try { if (target) target.style.cursor = 'grabbing'; } catch {}
        }
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove, true);
        window.removeEventListener('mouseup', onUp, true);
        // Restore smooth scrolling after drag ends
        this.setJsMindScrollBehavior('smooth');
        // Restore cursor
        try { if (target) target.style.cursor = ''; } catch {}
      };
      window.addEventListener('mousemove', onMove, true);
      window.addEventListener('mouseup', onUp, true);
    };
    nodesContainer.addEventListener('mousedown', onNodeMouseDown as any, true);
    const onNodeTouchStart = (ev: TouchEvent) => {
      const touch = ev.touches && ev.touches[0];
      if (!touch) return;
      let moved = false;
      const startX = touch.clientX;
      const startY = touch.clientY;
      const onTouchMove = (mvEv: TouchEvent) => {
        if (moved) return;
        const tt = mvEv.touches && mvEv.touches[0];
        if (!tt) return;
        const dx = Math.abs(tt.clientX - startX);
        const dy = Math.abs(tt.clientY - startY);
        if (dx + dy > 3) {
          moved = true;
          this.setJsMindScrollBehavior('auto');
        }
      };
      const onTouchEnd = () => {
        window.removeEventListener('touchmove', onTouchMove, true);
        window.removeEventListener('touchend', onTouchEnd, true);
        this.setJsMindScrollBehavior('smooth');
      };
      window.addEventListener('touchmove', onTouchMove, true);
      window.addEventListener('touchend', onTouchEnd, true);
    };
    nodesContainer.addEventListener('touchstart', onNodeTouchStart as any, true);
    this.register(() => nodesContainer && nodesContainer.removeEventListener('mousedown', onNodeMouseDown as any, true));
    this.register(() => nodesContainer && nodesContainer.removeEventListener('touchstart', onNodeTouchStart as any, true));
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
        this.buttons.updatePosition();
      }
    }
  }

  constructor(leaf: WorkspaceLeaf, plugin: MindmapPlugin) {
    super(leaf);
    this.plugin = plugin;
    // initialize controllers with stable deps where available
    this.popup.app = this.app;
    this.popup.plugin = this.plugin;
    this.popup.shouldMindmapDriveMarkdown = () => this.shouldMindmapDriveMarkdown();
    this.popup.isMindmapEditingActive = () => this.isMindmapEditingActive();
    this.popup.computeHeadingSections = (text: string) => computeHeadingSections(text);
    this.buttons.app = this.app;
    this.buttons.plugin = this.plugin;
    this.buttons.shouldMindmapDriveMarkdown = () => this.shouldMindmapDriveMarkdown();
    this.buttons.isMindmapEditingActive = () => this.isMindmapEditingActive();
    this.buttons.computeHeadingSections = (text: string) => computeHeadingSections(text);
    this.buttons.deleteHeadingById = (id: string) => this.deleteHeadingById(id);
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
          .mm-popup-title { font-weight: 600; margin: 0 0 0.25em 6px; font-size: 0.95em; }
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
      // Smooth scroll behavior for jsMind inner container and host container
      const smoothId = 'obsidian-jsmind-smooth-scroll-style';
      if (!document.getElementById(smoothId)) {
        const st3 = document.createElement('style');
        st3.id = smoothId;
        st3.textContent = `
          /* Enable smooth programmatic scrolling */
          .jsmind-inner { scroll-behavior: smooth; }
          /* Content node visuals: no box, only a bottom line */
          jmnode.mm-content-node { background: transparent !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; padding: 0 2px 2px 2px; }
          jmnode.mm-content-node { border-bottom: 1px solid var(--background-modifier-border); }
        `;
        document.head.appendChild(st3);
      }
      // Inject node themes CSS once
      ensureThemeCssInjected(document);
      // Inject strong override CSS for content nodes (ensure high specificity)
      this.injectContentNodeOverrideCss();
    } catch {}
    const toolbar = this.contentEl.createDiv({ cls: 'mm-toolbar' });
    const refreshBtn = toolbar.createEl('button', { text: 'Refresh' });
    const followBtn = toolbar.createEl('button', { text: 'Follow Scroll' });
    // Mount exporter before include toggle
    this.exporter.containerElDiv = this.containerElDiv;
    this.exporter.mount(toolbar);

    // Include content toggle (ul/ol as content nodes)
    const includeWrap = toolbar.createEl('label');
    includeWrap.style.display = 'flex';
    includeWrap.style.alignItems = 'center';
    includeWrap.style.gap = '6px';
    const includeCb = includeWrap.createEl('input', { type: 'checkbox' });
    includeCb.checked = !!((this.plugin as any).settings?.includeContent);
    includeWrap.createSpan({ text: 'Include content' });

    const container = this.contentEl.createDiv();
    container.id = 'jsmind_container';
    container.style.width = '100%';
    container.style.flex = '1 1 auto';
    container.style.height = '100%';
    container.style.minHeight = '400px';
    container.style.position = 'relative';
    this.containerElDiv = container;
    // wire DOM into controllers
    this.popup.containerElDiv = this.containerElDiv;
    this.buttons.containerElDiv = this.containerElDiv;
    // exporter already mounted above
    refreshBtn.addEventListener('click', () => this.refresh());
    followBtn.addEventListener('click', () => {
      // Follow is now purely based on active view + setting; nothing to toggle here
      this.forceEnterScroll();
    });
    includeCb.addEventListener('change', async () => {
      try {
        (this.plugin as any).settings.includeContent = !!includeCb.checked;
        await (this.plugin as any).saveData({ collapsedByFile: (this.plugin as any).collapsedByFile, autoFollow: (this.plugin as any).settings.autoFollow, theme: (this.plugin as any).settings.theme, enablePopup: (this.plugin as any).settings.enablePopup, includeContent: (this.plugin as any).settings.includeContent });
        await this.refresh();
      } catch {}
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
    // No driver arbitration: single-direction via active view only
    await this.refresh();
    // after refresh, jm exists; propagate instance
    this.popup.jm = this.jm;
    this.buttons.jm = this.jm;
    this.exporter.jm = this.jm;
    this.exporter.app = this.app;
    (this.exporter as any).plugin = this.plugin;
    this.exporter.file = this.file || null;

    // Observe size changes for reliable canvas resizing
    try {
      const ro = new ResizeObserver(() => {
        if (this.jm) {
          try { this.jm.resize && this.jm.resize(); } catch {}
        }
        this.buttons.updatePosition();
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
    this.forceEnterScroll();
    // No driver reset needed
    if (this.containerElDiv) await this.refresh();
    // propagate dynamic file into controllers
    this.popup.file = this.file;
    this.buttons.file = this.file;
  }

  async onClose() {
    this.jm = null;
    this.containerElDiv = null;
  }

  private async ensureJsMindLoaded(useFallback: boolean = false): Promise<void> {
    const pluginBase = `${this.app.vault.configDir}/plugins/obsidian-mindmap-jsmind`;
    const localCssVaultPath = `${pluginBase}/vendor/jsmind/style/jsmind.css`;
    const localJsVaultPath = `${pluginBase}/vendor/jsmind/es6/jsmind.js`;
    const legacyScreenshotVaultPath = `${pluginBase}/vendor/jsmind/es6/jsmind.screenshot.js`;
    const domToImageVaultPath = `${pluginBase}/vendor/dom-to-image/dom-to-image.min.js`;
    const localCssUrl = this.app.vault.adapter.getResourcePath(localCssVaultPath);
    const localJsUrl = this.app.vault.adapter.getResourcePath(localJsVaultPath);
    const domToImageUrl = this.app.vault.adapter.getResourcePath(domToImageVaultPath);
    const legacyScreenshotUrl = this.app.vault.adapter.getResourcePath(legacyScreenshotVaultPath);

    // Skip <link rel="stylesheet"> to avoid CSP style-src blocking external URLs.
    // We'll inline the full CSS content below into a <style> tag instead.

    // Inline the FULL official jsMind CSS for complete styling (prefer local), compliant with CSP
    const fullCssId = 'jsmind-css-inline-full';
    try {
      const existing = document.getElementById(fullCssId) as HTMLStyleElement | null;
      const cssUrl = this.app.vault.adapter.getResourcePath(localCssVaultPath);
      const res = await fetch(cssUrl);
      const text = await res.text();
      if (text && text.length > 0) {
        if (!existing) {
          const style = document.createElement('style');
          style.id = fullCssId;
          style.textContent = text;
          document.head.appendChild(style);
        } else {
          existing.textContent = text;
        }
      }
    } catch {}

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
      if (!window.jsMind) {
        await tryInject(localSrc);
      }
    } catch {}

    // Last-resort: try reading local JS text and eval if inject failed
    try {
      if (!window.jsMind) {
        const jsRes = await fetch(localJsUrl);
        const jsText = await jsRes.text();
        const script = document.createElement('script');
        script.text = jsText;
        document.head.appendChild(script);
      }
    } catch {}

    if (!window.jsMind) throw new Error('Unable to load jsMind');

    // Ensure dom-to-image is available before loading ES6 screenshot plugin.
    // Force global resolution by neutralizing CommonJS/AMD during evaluation if needed.
    if (!(window as any).domtoimage) {
      try {
        const res = await fetch(domToImageUrl);
        const txt = await res.text();
        const s = document.createElement('script');
        s.text = `;(function(g){ var module; var exports; var define; (function(){ ${txt}\n }).call(g); })(window);`;
        document.head.appendChild(s);
      } catch {
        try { await tryInject(domToImageUrl); } catch {}
      }
    }

    // Inject screenshot plugin (ES6 build requires dom-to-image)
    const pluginScriptId = 'jsmind-screenshot-plugin';
    if (!document.getElementById(pluginScriptId)) {
      try {
        await tryInject(legacyScreenshotUrl);
        const tag = document.getElementById(`jsmind-js-${btoa(legacyScreenshotUrl).replace(/=/g, '')}`);
        if (tag) tag.id = pluginScriptId;
      } catch {
        try {
          const res = await fetch(legacyScreenshotUrl);
          const txt = await res.text();
          const s = document.createElement('script');
          s.id = pluginScriptId;
          s.text = txt;
          document.head.appendChild(s);
        } catch {}
      }
    }
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
    // Capture viewport (transform) and selection before rebuild
    const prevSelectedId = (() => {
      try { return this.jm?.get_selected_node?.()?.id ?? null; } catch { return null; }
    })();
    this.prevViewport = this.captureViewport();

    const content = await this.app.vault.read(this.file);
    this.lastFileContent = content;
    // keep controllers updated with latest content & headings
    this.popup.lastFileContent = this.lastFileContent;
    this.headingsCache = computeHeadingSections(content);
    this.popup.headingsCache = this.headingsCache;
    this.rebuildStableKeyIndex();
    const includeContent = !!((this.plugin as any).settings?.includeContent);
    let mind: any;
    if (includeContent) {
      const built = buildJsMindTreeWithContent(this.headingsCache, this.file.name, content, true);
      mind = built.mind;
      this.contentParentMap = built.contentParentMap;
    } else {
      mind = buildJsMindTreeFromHeadings(this.headingsCache, this.file.name);
      this.contentParentMap = new Map();
    }
    if (!this.containerElDiv || !window.jsMind) return;
    this.containerElDiv.empty();
    this.containerElDiv.id = 'jsmind_container';
    const themeKey: ThemeName = (this.plugin as any).settings?.theme || 'default';
    const options: any = { container: 'jsmind_container', theme: getJsMindThemeNameFromSetting(themeKey), editable: true, mode: 'side', view: { engine: 'svg' ,expander_style: 'number', draggable: true, line_width: 1 }};
    options.view.custom_node_render = (jm: any, ele: HTMLElement, node: any) => {
      try {
        const id = String(node?.id ?? '');
        if (!id.startsWith('c_')) return false;
        while (ele.firstChild) ele.removeChild(ele.firstChild);
        ele.classList.add('mm-content-node');
        const div = document.createElement('div');
        div.className = 'mm-content-text';
        // Build content with optional checkbox prefix for task items
        const topicText = String(node?.topic ?? '');
        const metaAny = (node as any)?.data?.meta ?? (node as any)?.data?.data?.meta;
        const isTask = !!(metaAny && metaAny.task);
        const isDone = !!(metaAny && metaAny.done);
        if (isTask) {
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.disabled = true;
          box.checked = !!isDone;
          box.style.margin = '0 6px 0 0';
          ele.appendChild(box);
        }
        div.textContent = topicText;
        div.style.display = 'inline-block';
        (div.style as any).whiteSpace = 'normal';
        (div.style as any).wordBreak = 'break-word';
        (div.style as any).overflowWrap = 'anywhere';
        (div.style as any).textOverflow = 'clip';
        (div.style as any).overflow = 'visible';
        (div.style as any).boxSizing = 'border-box';
        (div.style as any).lineHeight = '1.5';
        (div.style as any).textAlign = 'left';
        (div.style as any).paddingLeft = '0px';
        (div.style as any).paddingRight = '0px';
        // Prefer content actual width; cap at 360px
        const MAX_W = 360;
        // Create a hidden measuring element to avoid 0-size before layout
        let measuredW = 0;
        try {
          const cs = window.getComputedStyle(ele);
          const meas = document.createElement('div');
          meas.textContent = div.textContent || '';
          meas.style.position = 'absolute';
          meas.style.left = '-10000px';
          meas.style.top = '-10000px';
          meas.style.visibility = 'hidden';
          meas.style.display = 'inline-block';
          (meas.style as any).whiteSpace = 'normal';
          (meas.style as any).wordBreak = 'break-word';
          (meas.style as any).overflowWrap = 'anywhere';
          (meas.style as any).textOverflow = 'clip';
          (meas.style as any).overflow = 'visible';
          (meas.style as any).boxSizing = 'border-box';
          (meas.style as any).textAlign = 'left';
          
          // inherit font to match actual render width
          (meas.style as any).font = cs.font || "300 1em/1.5 'PingFang SC', 'Lantinghei SC', 'Microsoft Yahei', 'Hiragino Sans GB', 'Microsoft Sans Serif', 'WenQuanYi Micro Hei', 'sans'";
          (meas.style as any).fontSize = cs.fontSize || '16px';
          document.body.appendChild(meas);
          (meas.style as any).lineHeight = (div.style as any).lineHeight || cs.lineHeight || '1.5';
          
          (meas.style as any).fontWeight = (div.style as any).fontWeight || cs.fontWeight || 'normal' ;
          (meas.style as any).paddingLeft = (div.style as any).paddingLeft || cs.paddingLeft || '3px';
          (meas.style as any).paddingRight = (div.style as any).paddingRight || cs.paddingRight || '3px';
          (meas.style as any).marginLeft = (div.style as any).marginLeft || cs.marginLeft;
          (meas.style as any).marginRight = (div.style as any).marginRight || cs.marginRight;
          measuredW = Math.ceil(meas.scrollWidth);
          try { document.body.removeChild(meas); } catch {}
        } catch {}
        // Append first, then set final width/height based on measured width
        ele.appendChild(div);
        try {
          // Add a small bias to account for subpixel/font rounding and checkbox
          let bias = 6; // px
          if (isTask) {
            bias += 20;
          }
          const finalW = Math.min(Math.max(measuredW + bias, 10), MAX_W);
          (div.style as any).width = `${finalW}px`;
          const measuredH = Math.ceil(div.scrollHeight);
          (div.style as any).height = `${measuredH}px`;
        } catch {}
        return true;
      } catch {}
      return false;
    };

    this.jm = new window.jsMind(options);
    // Wrap center_root so plugin can decide whether to allow auto-centering root
    this.wrapCenterRootIfNeeded();
    // By default,禁止居中根节点（例如首次 show 或 refresh 时）
    this.allowCenterRoot = false;
    this.jm.show(mind);
    // Rebind controllers to the current jsMind instance and file after rebuild
    try {
      this.popup.jm = this.jm;
      this.buttons.jm = this.jm;
      this.exporter.jm = this.jm;
      this.popup.file = this.file;
      this.buttons.file = this.file;
      this.exporter.file = this.file;
    } catch {}
    // Re-inject themes CSS after render to ensure it is last in head
    try { ensureThemeCssInjected(document); } catch {}
    // Inject override CSS again so it stays after theme CSS
    try { this.injectContentNodeOverrideCss(); } catch {}
    // Restore previous viewport transform and reselect without centering
    this.restoreViewport(this.prevViewport);
    if (prevSelectedId) {
      try {
        this.jm.select_node(prevSelectedId);
      } finally {}
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
    // Ensure screenshot plugin options carry correct filename base after file switch
    try {
      if ((this.jm as any).screenshot && (this.jm as any).screenshot.options && this.file?.name) {
        const base = (this.file.name || '').replace(/\.[^.]+$/,'');
        (this.jm as any).screenshot.options.filename = base;
      }
    } catch {}
    try { ensureThemeCssInjected(document); } catch {}
    try { this.injectContentNodeOverrideCss(); } catch {}

    // Sync: click/select a node -> reveal and select heading in markdown editor
    try {
      const attachSelectionSync = () => {
        if (this.jm && typeof this.jm.add_event_listener === 'function') {
          this.jm.add_event_listener((type: any, data: any) => {
            const evt = this.getJsMindEventName(type, data);
            const nodeIdFromEvent = this.getEventNodeId(data);
            if (evt === 'select_node' && nodeIdFromEvent) {
              // Ignore programmatic select_node; only explicit mouse clicks (below) enter preview and reveal
              return;
            }
            // Some builds of jsMind emit 'edit' on inline rename; also try 'update_node' as fallback
            if ((evt === 'edit' || evt === 'update_node' || evt === 'nodechanged' || evt === 'topic_change' || evt === 'textedit') && nodeIdFromEvent) {
              if (this.isContentNode(nodeIdFromEvent)) return;
              // Only allow mindmap->markdown rename when mindmap is the active leaf
              if (!this.isActiveLeafMindmapView()) return;
              // Only treat as a rename when inline editing is active inside jsMind
              if (!this.isMindmapEditingActive()) return;
              const nodeId = nodeIdFromEvent;
              const newTitle: string = this.getEventNodeTopic(data).toString();
              this.renameHeadingInFile(nodeId, newTitle).catch(() => {});
            }
            if (evt === 'select_clear') {
              this.enterScroll();
              this.hideAddButton();
            }
            // Persist collapse / expand state per file using stable key
            if (nodeIdFromEvent) {
              if (this.isContentNode(nodeIdFromEvent)) return;
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
            // Only allow mindmap->markdown click reveal when this view is active
            if (!this.isActiveLeafMindmapView()) return;
            const t = ev.target as HTMLElement;
            const nodeEl = t && (t.closest ? t.closest('jmnode') : null);
            const nodeId = nodeEl?.getAttribute('nodeid') || '';
            if (nodeId) {
              // Ensure smooth scrolling for programmatic scrolls on click
              this.setJsMindScrollBehavior('smooth');
              if (this.isMindmapEditingActive()) return;
              this.enterPreview();
              // Debounce click similarly to not interfere double-click
              if (this.revealTimeoutId != null) window.clearTimeout(this.revealTimeoutId);
              this.revealTimeoutId = window.setTimeout(() => {
                // if a dblclick just happened, skip
                if (Date.now() - this.lastDblClickAtMs < 350) return;
                // In preview, reveal and focus editor to show selection, but FSM stays in 'preview'
                // If it's a content node, do not reveal markdown selection
                if (this.isContentNode(nodeId)) {
                  this.hideAddButton();
                } else {
                  const targetId = this.resolveHeadingId(nodeId);
                  if (targetId) {
                    this.revealHeadingById(targetId, { focusEditor: true, activateLeaf: true });
                    if (targetId === nodeId) this.showAddButton(targetId); else this.hideAddButton();
                    this.lastSyncedNodeId = targetId;
                  }
                }
                this.revealTimeoutId = null;
              }, 200);
            }
          };
          // Hover popup: show immediate body on jmnode hover
          const overHandler = (ev: MouseEvent) => {
            if (!(this.plugin as any).settings?.enablePopup) return;
            const t = ev.target as HTMLElement;
            const nodeEl = t && (t.closest ? t.closest('jmnode') : null);
            const nodeId = nodeEl?.getAttribute('nodeid') || '';
            if (!nodeId) return;
            if (this.isMindmapEditingActive()) return;
            // Cancel pending hide when entering another node quickly
            if (this.popup.hoverHideTimeoutId != null) {
              try { window.clearTimeout(this.popup.hoverHideTimeoutId); } catch {}
              this.popup.hoverHideTimeoutId = null;
            }
            this.showHoverPopup(nodeId);
          };
          const outHandler = (ev: MouseEvent) => {
            if (!(this.plugin as any).settings?.enablePopup) return;
            const t = ev.target as HTMLElement;
            const nodeEl = t && (t.closest ? t.closest('jmnode') : null);
            if (!nodeEl) return;
            const rel = ev.relatedTarget as HTMLElement | null;
            // If moving into the popup, do not hide
            if (rel && this.popup.hoverPopupEl && (rel === this.popup.hoverPopupEl || this.popup.hoverPopupEl.contains(rel))) return;
            if (rel && (rel === nodeEl || nodeEl.contains(rel))) return;
            // Gap tolerance: delay hide to allow cursor to cross gap into popup or next node
            if (this.popup.hoverHideTimeoutId != null) { try { window.clearTimeout(this.popup.hoverHideTimeoutId); } catch {} }
            this.popup.hoverHideTimeoutId = window.setTimeout(() => {
              this.popup.hoverHideTimeoutId = null;
              // If mouse is now over popup, keep it
              if (this.popup.hoverPopupEl && this.popup.hoverPopupEl.matches(':hover')) return;
              this.hideHoverPopup();
            }, 180);
          };
          nodesContainer.addEventListener('click', handler);
          // Click on blank area -> scroll state
          const blankHandler = (ev: MouseEvent) => {
            const t = ev.target as HTMLElement;
            const isNode = !!(t && (t.closest ? t.closest('jmnode') : null));
            if (!isNode) this.forceEnterScroll();
          };
          nodesContainer.addEventListener('mousedown', blankHandler as any, true);
          // Toggle scroll-behavior during drag vs click on nodes
          this.attachScrollBehaviorDragHandlers(nodesContainer);
          if ((this.plugin as any).settings?.enablePopup) {
            nodesContainer.addEventListener('mouseover', overHandler as any);
            nodesContainer.addEventListener('mouseout', outHandler as any);
          }
          const dblHandler = (_ev: Event) => {
            this.lastDblClickAtMs = Date.now();
            if (this.revealTimeoutId != null) {
              window.clearTimeout(this.revealTimeoutId);
              this.revealTimeoutId = null;
            }
            // Allow jsMind to enter edit mode without stealing focus to editor
          };
          nodesContainer.addEventListener('dblclick', dblHandler);
          this.register(() => nodesContainer && nodesContainer.removeEventListener('click', handler as any));
          if ((this.plugin as any).settings?.enablePopup) {
            this.register(() => nodesContainer && nodesContainer.removeEventListener('mouseover', overHandler as any));
            this.register(() => nodesContainer && nodesContainer.removeEventListener('mouseout', outHandler as any));
          }
          this.register(() => nodesContainer && nodesContainer.removeEventListener('dblclick', dblHandler as any));
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
      this.popup.lastFileContent = this.lastFileContent;
      const nextHeadings = computeHeadingSections(content);
      this.popup.headingsCache = nextHeadings;
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
          const parent: HeadingNode | null = cur.parentId ? (byId.get(cur.parentId) as HeadingNode | undefined) ?? null : null;
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

  private async revealHeadingById(nodeId: string, opts?: { focusEditor?: boolean; activateLeaf?: boolean }) {
    if (!this.file) return;
    try {
      const focusEditor = opts?.focusEditor !== false;
      const activateLeaf = opts?.activateLeaf !== false;
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
        try { if (activateLeaf) this.app.workspace.revealLeaf(activeMd.leaf); } catch {}
        try { if (focusEditor) (editor as any).focus?.(); } catch {}
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
          try { if (activateLeaf) this.app.workspace.setActiveLeaf(leaf, { focus: !!focusEditor }); } catch {}
          try { if (activateLeaf) this.app.workspace.revealLeaf(leaf); } catch {}
          try { if (focusEditor) (editor as any).focus?.(); } catch {}
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
      const targetId = this.resolveHeadingId(nodeId) || nodeId;
      const node = this.jm.get_node ? this.jm.get_node(targetId) : null;
      if (this.jm.select_node) this.jm.select_node(targetId);
      // Only center in edit mode per FSM rule
      const allowCenter = !!(center && node && this.shouldCenterOnMarkdownSelection());
      if (allowCenter) {
        // Defer centering until selection/layout settles
        this.allowCenterRoot = true;
        window.setTimeout(() => {
          try { this.jm.center_node && this.jm.center_node(node); } catch {}
          try { this.jm.view && this.jm.view.center_node && this.jm.view.center_node(node); } catch {}
          // try { this.jm.resize && this.jm.resize(); } catch {}
          // reset permission to avoid unintended future root centering
          this.allowCenterRoot = false;
        }, 30);
      }
    } catch {}
  }

  private ensureMindmapNodeVisible(nodeId: string) {
    try {
      if (!this.jm || !this.containerElDiv) return;
      const node = this.jm.get_node ? this.jm.get_node(this.resolveHeadingId(nodeId) || nodeId) : null;
      if (!node) return;
      const actualId = this.resolveHeadingId(nodeId) || nodeId;
      const nodeEl = this.containerElDiv.querySelector(`jmnode[nodeid="${actualId}"]`) as HTMLElement | null;
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

      // If fully offscreen, center the node to ensure visibility (original behavior)
      if (!nudged && fullyOffscreen) {
        this.allowCenterRoot = true;
        try { this.jm.center_node && this.jm.center_node(node); } catch {}
        try { this.jm.view && this.jm.view.center_node && this.jm.view.center_node(node); } catch {}
        // try { this.jm.resize && this.jm.resize(); } catch {}
        this.allowCenterRoot = false;
      }
    } catch {}
  }

  private attachEditorSync() {
    const trySync = async () => {
      if (!this.file) return;
      // Only allow markdown->mindmap when active view is this file's markdown
      if (!this.isActiveMarkdownForThisFile()) return;
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
        // Always record latest id to avoid repeated attempts
        const center = this.shouldCenterOnMarkdownSelection();
        const shouldSelectMindmap = this.shouldFollowScroll() || this.shouldCenterOnMarkdownSelection();
        if (shouldSelectMindmap) {
          this.selectMindmapNodeById(current.id, center);
          this.lastSyncedNodeId = current.id;
        }
        if (this.shouldFollowScroll()) this.ensureMindmapNodeVisible(current.id);
        // Do not show buttons when markdown drives selection
        this.hideAddButton();
      }
    };

    // Editor content change -> sync
    this.registerEvent((this.app.workspace as any).on('editor-change', (editor: Editor, mdView?: MarkdownView) => {
      if (!this.file) return;
      // Only run when this file's markdown is the active view
      if (!this.isActiveMarkdownForThisFile()) return;
      if (mdView?.file?.path === this.file.path) {
        trySync();
      }
    }));

    // Reposition + button on container scroll (when scrollbars visible)
    if (this.containerElDiv) {
      const scrollHandler = () => this.buttons.updatePosition();
      this.containerElDiv.addEventListener('scroll', scrollHandler);
      this.register(() => this.containerElDiv && this.containerElDiv.removeEventListener('scroll', scrollHandler as any));
    }

    // Removed cursor-only polling to rely on scroll and explicit interactions

    // Scroll-based top heading sync when enabled
    const attachScrollSync = () => {
      // Detach previous
      try {
        if (this.scrollSyncEl && this.scrollSyncHandler) {
          this.scrollSyncEl.removeEventListener('scroll', this.scrollSyncHandler);
        }
      } catch {}
      const activeMd = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!this.isActiveMarkdownForThisFile()) return;
      if (!activeMd) return;
      const scroller = (activeMd as any).contentEl?.querySelector?.('.cm-scroller');
      if (!scroller) return;
      // Enter edit when the user clicks inside the editor area, and sync selection after click
      try {
        const cmRoot = (activeMd as any).contentEl?.querySelector?.('.cm-editor');
        if (cmRoot) {
          const onEditMouseDown = () => {
            this.enterEdit();
          };
          const onEditMouseUp = () => {
            const run = () => { try { /* sync mindmap to current cursor */ (trySync as any)(); } catch {} };
            if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run); else setTimeout(run, 0);
          };
          cmRoot.addEventListener('mousedown', onEditMouseDown as any, true);
          cmRoot.addEventListener('mouseup', onEditMouseUp as any, true);
          this.register(() => {
            try { cmRoot.removeEventListener('mousedown', onEditMouseDown, true); } catch {}
            try { cmRoot.removeEventListener('mouseup', onEditMouseUp, true); } catch {}
          });
        }
      } catch {}
      const scheduleRun = () => {
        const run = () => {
          try {
            if (!this.isAutoFollowEnabled()) return;
            if (!this.file || activeMd.file?.path !== this.file.path) return;
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
              const center = false;
              if (this.shouldFollowScroll()) {
                this.selectMindmapNodeById(best.id, center);
                this.ensureMindmapNodeVisible(best.id);
                this.lastSyncedNodeId = best.id;
              }
            }
          } catch {}
        };
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(run);
        } else {
          setTimeout(run, 50);
        }
      };
      const onScroll = () => {
        // if (!this.isActiveMarkdownForThisFile()) return;
        if (!this.isAutoFollowEnabled()) return;
        if (!this.file || activeMd.file?.path !== this.file.path) return;
        // Enter scroll mode on user scroll
        this.enterScroll();
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
      this.register(() => scroller && scroller.removeEventListener('scroll', onScroll as any));
    };
    attachScrollSync();
  }

  private showAddButton(nodeId: string) {
    this.buttons.show(nodeId);
  }

  private hideAddButton() {
    this.buttons.hide();
  }

  private async addChildUnder(nodeId: string) {
    await this.buttons.addChildUnder(nodeId);
  }

  // moved into tools

  // moved into tools

  // moved into tools

  // moved into tools

  private showHoverPopup(nodeId: string) {
    this.popup.show(nodeId);
  }

  private hideHoverPopup() {
    this.popup.hide();
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

  private isActiveLeafMindmapView(): boolean {
    try {
      const activeLeaf = (this.app.workspace as any).activeLeaf;
      return !!(activeLeaf && activeLeaf.view === this);
    } catch {}
    return false;
  }

  private isActiveMarkdownForThisFile(): boolean {
    try {
      const mv = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!mv) return false;
      return !!(mv.file && this.file && mv.file.path === this.file.path);
    } catch {}
    return false;
  }

  private isAutoFollowEnabled(): boolean {
    try {
      return (this.plugin as any).settings?.autoFollow === true;
    } catch {}
    return false;
  }

  private injectContentNodeOverrideCss() {
    try {
      const id = 'obsidian-jsmind-content-node-override';
      let el = document.getElementById(id) as HTMLStyleElement | null;
      const css = `
        /* Increase specificity over: body:not(.theme-dark) jmnodes.theme-obsidian jmnode */
        body:not(.theme-dark) jmnodes.theme-obsidian jmnode.mm-content-node,
        body.theme-dark jmnodes.theme-obsidian jmnode.mm-content-node,
        jmnodes.theme-obsidian jmnode.mm-content-node {
          background: transparent !important;
          background-color: transparent !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          padding-bottom: 1.5px !important;
          border-bottom: 1.5px solid var(--background-modifier-border) !important;
          /* Multiline wrapping while keeping layout stable */
          white-space: normal !important;
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
          text-overflow: clip !important;
          overflow: visible !important;
          display: inline-block !important;
          box-sizing: border-box !important;
          /* do not constrain outer node width to characters; inner div controls width */
          line-height: 1.5 !important;
          text-align: left !important;
          font: 300 1em/1.5 'PingFang SC', 'Lantinghei SC', 'Microsoft Yahei', 'Hiragino Sans GB', 'Microsoft Sans Serif', 'WenQuanYi Micro Hei', 'sans';
        }
        /* Override overflow-hidden mode to still wrap content nodes */
        .jmnode-overflow-hidden jmnode.mm-content-node {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          font: 300 1em/1.5 'PingFang SC', 'Lantinghei SC', 'Microsoft Yahei', 'Hiragino Sans GB', 'Microsoft Sans Serif', 'WenQuanYi Micro Hei', 'sans';
        }
        /* Preserve selected background for content nodes */
        body:not(.theme-dark) jmnodes.theme-obsidian jmnode.mm-content-node.selected,
        body.theme-dark jmnodes.theme-obsidian jmnode.mm-content-node.selected,
        jmnodes.theme-obsidian jmnode.mm-content-node.selected {
          background: var(--interactive-accent) !important;
          background-color: var(--interactive-accent) !important;
          color: var(--text-on-accent) !important;
          font: 300 1em/1.5 'PingFang SC', 'Lantinghei SC', 'Microsoft Yahei', 'Hiragino Sans GB', 'Microsoft Sans Serif', 'WenQuanYi Micro Hei', 'sans';
        }
        jmnode.mm-content-node textarea {
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
          margin-left: -2px !important;
          margin-right: -2px !important;
          line-height: 1.5 !important;
          text-align: left !important;
          min-height: 1.5em !important;
          display: block !important;
          box-sizing: border-box !important;
          font: 300 1em/1.5 'PingFang SC', 'Lantinghei SC', 'Microsoft Yahei', 'Hiragino Sans GB', 'Microsoft Sans Serif', 'WenQuanYi Micro Hei', 'sans';
        }
      `;
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        el.textContent = css;
        document.head.appendChild(el);
      } else {
        el.textContent = css;
      }
    } catch {}
  }

  


}

export default class MindmapPlugin extends Plugin {
  public collapsedByFile: Record<string, string[]> = {};
  public settings: { autoFollow: boolean; theme: ThemeName; enablePopup: boolean; includeContent?: boolean } = { autoFollow: true, theme: 'default', enablePopup: true, includeContent: false };

  private async openMindmapForFile(file: TFile | null): Promise<void> {
    const targetFile = file ?? this.app.workspace.getActiveFile();
    if (!targetFile) {
      new Notice('No active file');
      return;
    }
    const ws: any = this.app.workspace as any;
    let leaf = (ws.getLeavesOfType?.(VIEW_TYPE_MINDMAP)?.[0] as any) || null;
    if (!leaf) {
      // Create a right leaf if needed (closing the tab may remove the whole right pane)
      leaf = this.app.workspace.getRightLeaf(true);
    }
    if (!leaf && ws.getLeaf) {
      // Fallback for older/newer API shapes
      leaf = ws.getLeaf('split', 'vertical') ?? ws.getLeaf(false);
    }
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
    const view = leaf.view as MindmapView;
    await view.setFile(targetFile);
    this.app.workspace.revealLeaf(leaf);
  }

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
        if (data.theme) (this.settings as any).theme = data.theme as ThemeName;
        if (typeof data.enablePopup === 'boolean') (this.settings as any).enablePopup = data.enablePopup;
        if (typeof data.includeContent === 'boolean') (this.settings as any).includeContent = data.includeContent;
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

    // Left ribbon entry to reopen/focus the mindmap view even after its tab was closed
    this.addRibbonIcon('brain', 'Open Mindmap (jsMind)', async () => {
      await this.openMindmapForFile(this.app.workspace.getActiveFile());
    });

    this.addCommand({
      id: 'open-jsmind-preview',
      name: 'Preview current markdown as mindmap',
      callback: async () => {
        await this.openMindmapForFile(this.app.workspace.getActiveFile());
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
          await this.plugin.saveData({ collapsedByFile: this.plugin.collapsedByFile, autoFollow: this.plugin.settings.autoFollow, theme: this.plugin.settings.theme, enablePopup: this.plugin.settings.enablePopup });
        }));

    // Theme selector
    new Setting(containerEl)
      .setName('Theme')
      .setDesc('Choose node background theme (supports light/dark)')
      .addDropdown((dd) => {
        for (const opt of THEME_OPTIONS) {
          dd.addOption(opt.key, opt.label);
        }
        dd.setValue(this.plugin.settings.theme);
        dd.onChange(async (val) => {
          this.plugin.settings.theme = (val as any);
          await this.plugin.saveData({ collapsedByFile: this.plugin.collapsedByFile, autoFollow: this.plugin.settings.autoFollow, theme: this.plugin.settings.theme, enablePopup: this.plugin.settings.enablePopup });
          try {
            // Refresh all open mindmap views to apply theme immediately
            const leaves = this.app.workspace.getLeavesOfType('obsidian-jsmind-mindmap-view');
            for (const leaf of leaves) {
              const view = leaf.view as any;
              await view.refresh?.();
            }
          } catch {}
        });
      });

    // Hover popup toggle
    new Setting(containerEl)
      .setName('Show hover popup')
      .setDesc('Show a Markdown preview popup when hovering a mindmap node')
      .addToggle(t => t
        .setValue(this.plugin.settings.enablePopup)
        .onChange(async (v) => {
          this.plugin.settings.enablePopup = v;
          await this.plugin.saveData({ collapsedByFile: this.plugin.collapsedByFile, autoFollow: this.plugin.settings.autoFollow, theme: this.plugin.settings.theme, enablePopup: this.plugin.settings.enablePopup, includeContent: this.plugin.settings.includeContent });
          try {
            // Hide popup immediately if turned off and rebind listeners via refresh
            const leaves = this.app.workspace.getLeavesOfType('obsidian-jsmind-mindmap-view');
            for (const leaf of leaves) {
              const view = leaf.view as any;
              view.hideHoverPopup?.();
              await view.refresh?.();
            }
          } catch {}
        }));

    // Include content toggle (settings)
    new Setting(containerEl)
      .setName('Include content lists')
      .setDesc('Add ul/ol list items as content nodes under headings')
      .addToggle(t => t
        .setValue(!!this.plugin.settings.includeContent)
        .onChange(async (v) => {
          this.plugin.settings.includeContent = v;
          await this.plugin.saveData({ collapsedByFile: this.plugin.collapsedByFile, autoFollow: this.plugin.settings.autoFollow, theme: this.plugin.settings.theme, enablePopup: this.plugin.settings.enablePopup, includeContent: this.plugin.settings.includeContent });
          try {
            const leaves = this.app.workspace.getLeavesOfType('obsidian-jsmind-mindmap-view');
            for (const leaf of leaves) {
              const view = leaf.view as any;
              await view.refresh?.();
            }
          } catch {}
        }));
  }
}



