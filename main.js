"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MindmapPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE_MINDMAP = "obsidian-jsmind-mindmap-view";
function computeHeadingSections(markdownText) {
  const lines = markdownText.split(/\n/);
  const headingRegex = /^(#{1,6})\s+(.*)$/;
  const headingsTemp = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(headingRegex);
    if (match) {
      const hashes = match[1];
      const title = match[2].trim();
      const start = offset;
      const headingTextEnd = start + line.length;
      headingsTemp.push({
        id: `h_${i}_${start}`,
        level: hashes.length,
        title,
        start,
        lineStart: i,
        raw: line,
        style: "atx"
      });
    } else if (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (/^=+\s*$/.test(next)) {
        const start = offset;
        const title = line.trim();
        const headingTextEnd = start + line.length;
        headingsTemp.push({
          id: `h_${i}_${start}`,
          level: 1,
          title,
          start,
          lineStart: i,
          raw: line + "\n" + next,
          style: "setext"
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
          raw: line + "\n" + next,
          style: "setext"
        });
      }
    }
    offset += line.length + 1;
  }
  const headings = headingsTemp.map((h, idx) => ({
    id: h.id,
    level: h.level,
    title: h.title,
    start: h.start,
    end: markdownText.length,
    lineStart: h.lineStart,
    headingTextEnd: h.start + (lines[h.lineStart]?.length ?? 0),
    parentId: null,
    children: [],
    style: h.style
  }));
  for (let i = 0; i < headings.length; i++) {
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= headings[i].level) {
        headings[i].end = headings[j].start - 1;
        break;
      }
    }
  }
  const stack = [];
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
function buildJsMindTreeFromHeadings(headings, fileName) {
  const firstH1 = headings.find((h) => h.level === 1);
  let rootId;
  let rootTopic;
  if (firstH1) {
    rootId = firstH1.id;
    rootTopic = firstH1.title || fileName;
  } else {
    rootId = `virtual_root_${fileName}`;
    rootTopic = fileName.replace(/\.md$/i, "");
  }
  const byId = /* @__PURE__ */ new Map();
  const root = { id: rootId, topic: rootTopic, children: [] };
  byId.set(rootId, root);
  for (const h of headings) {
    if (firstH1 && h.id === firstH1.id) continue;
    const node = { id: h.id, topic: h.title, children: [] };
    byId.set(h.id, node);
  }
  for (const h of headings) {
    if (firstH1 && h.id === firstH1.id) continue;
    const parentKey = h.parentId ?? (firstH1 ? firstH1.id : rootId);
    const parent = byId.get(parentKey) ?? root;
    parent.children.push(byId.get(h.id));
  }
  return { meta: { name: fileName }, format: "node_tree", data: root };
}
var MindmapView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.file = null;
    this.containerElDiv = null;
    this.jm = null;
    this.headingsCache = [];
    this.suppressSync = false;
    this.lastSyncedNodeId = null;
    this.editorSyncIntervalId = null;
    this.suppressEditorSyncUntil = 0;
    this.prevViewport = null;
    this.allowCenterRoot = false;
    this.centerRootWrapped = false;
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_MINDMAP;
  }
  getDisplayText() {
    return "Mindmap Preview";
  }
  async onOpen() {
    this.contentEl.empty();
    this.contentEl.style.display = "flex";
    this.contentEl.style.flexDirection = "column";
    this.contentEl.style.height = "100%";
    ;
    this.containerEl.style.height = "100%";
    const toolbar = this.contentEl.createDiv({ cls: "mm-toolbar" });
    const addChildBtn = toolbar.createEl("button", { text: "Add Child" });
    const renameBtn = toolbar.createEl("button", { text: "Rename" });
    const deleteBtn = toolbar.createEl("button", { text: "Delete" });
    const refreshBtn = toolbar.createEl("button", { text: "Refresh" });
    const container = this.contentEl.createDiv();
    container.id = "jsmind_container";
    container.style.width = "100%";
    container.style.flex = "1 1 auto";
    container.style.height = "100%";
    container.style.minHeight = "400px";
    this.containerElDiv = container;
    addChildBtn.addEventListener("click", () => this.handleAddChild());
    renameBtn.addEventListener("click", () => this.handleRename());
    deleteBtn.addEventListener("click", () => this.handleDelete());
    refreshBtn.addEventListener("click", () => this.refresh());
    try {
      await this.ensureJsMindLoaded();
    } catch (e) {
      new import_obsidian.Notice("Failed to load jsMind. Check network/CSP. Retrying with fallback...");
      try {
        await this.ensureJsMindLoaded(true);
      } catch (err) {
        new import_obsidian.Notice("jsMind could not be loaded. Mindmap disabled.");
        return;
      }
    }
    await this.refresh();
    try {
      const ro = new ResizeObserver(() => {
        if (this.jm) {
          try {
            this.jm.resize && this.jm.resize();
          } catch {
          }
        }
      });
      if (this.containerElDiv) ro.observe(this.containerElDiv);
      this.register(() => ro.disconnect());
    } catch {
    }
    this.attachEditorSync();
    this.registerEvent(this.app.vault.on("modify", async (file) => {
      if (this.file && file.path === this.file.path) {
        await this.softSyncFromDisk();
      }
    }));
    this.registerEvent(this.app.workspace.on("file-open", async (file) => {
      if (!file) return;
      try {
        const ext = file.extension || (file.name?.split(".").pop() ?? "");
        if (ext.toLowerCase() === "md" && file.path !== this.file?.path) {
          await this.setFile(file);
        }
      } catch {
      }
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", async (leaf) => {
      try {
        const mv = leaf?.view;
        if (mv?.file) {
          const ext = mv.file.extension || (mv.file.name?.split(".").pop() ?? "");
          if (ext.toLowerCase() === "md" && mv.file.path !== this.file?.path) {
            await this.setFile(mv.file);
          }
        }
      } catch {
      }
    }));
  }
  async setFile(file) {
    this.file = file;
    this.lastSyncedNodeId = null;
    if (this.containerElDiv) await this.refresh();
  }
  async onClose() {
    this.jm = null;
    this.containerElDiv = null;
  }
  async ensureJsMindLoaded(useFallback = false) {
    if (window.jsMind) return;
    const pluginBase = `${this.app.vault.configDir}/plugins/obsidian-mindmap-jsmind`;
    const localCssVaultPath = `${pluginBase}/vendor/jsmind/style/jsmind.css`;
    const localJsVaultPath = `${pluginBase}/vendor/jsmind/es6/jsmind.js`;
    const localCssUrl = this.app.vault.adapter.getResourcePath(localCssVaultPath);
    const localJsUrl = this.app.vault.adapter.getResourcePath(localJsVaultPath);
    const cssId = "jsmind-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.type = "text/css";
      link.href = localCssUrl;
      document.head.appendChild(link);
    }
    const fullCssId = "jsmind-css-inline-full";
    if (!document.getElementById(fullCssId)) {
      const cssSources = [
        this.app.vault.adapter.getResourcePath(localCssVaultPath)
      ];
      for (const cssUrl of cssSources) {
        try {
          const res = await fetch(cssUrl);
          const text = await res.text();
          if (text && text.length > 1e3) {
            const style = document.createElement("style");
            style.id = fullCssId;
            style.textContent = text;
            document.head.appendChild(style);
            break;
          }
        } catch {
        }
      }
    }
    const tryInject = (url) => new Promise((resolve, reject) => {
      const scriptId = `jsmind-js-${btoa(url).replace(/=/g, "")}`;
      if (document.getElementById(scriptId)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load " + url));
      document.head.appendChild(script);
    });
    const localSrc = localJsUrl;
    try {
      await tryInject(localSrc);
      if (window.jsMind) return;
    } catch {
    }
    try {
      const jsRes = await fetch(localJsUrl);
      const jsText = await jsRes.text();
      const script = document.createElement("script");
      script.text = jsText;
      document.head.appendChild(script);
      if (window.jsMind) return;
    } catch {
    }
    throw new Error("Unable to load jsMind");
  }
  async refresh() {
    if (!this.file) {
      const active = this.app.workspace.getActiveFile();
      if (!active) return;
      this.file = active;
    }
    const prevSelectedId = (() => {
      try {
        return this.jm?.get_selected_node?.()?.id ?? null;
      } catch {
        return null;
      }
    })();
    this.prevViewport = this.captureViewport();
    const content = await this.app.vault.read(this.file);
    this.headingsCache = computeHeadingSections(content);
    const mind = buildJsMindTreeFromHeadings(this.headingsCache, this.file.name);
    if (!this.containerElDiv || !window.jsMind) return;
    this.containerElDiv.empty();
    this.containerElDiv.id = "jsmind_container";
    const options = { container: "jsmind_container", theme: "primary", editable: true };
    try {
      const overrideId = "jsmind-theme-override";
      if (!document.getElementById(overrideId)) {
        const style = document.createElement("style");
        style.id = overrideId;
        style.textContent = `
/* Make root node adopt theme colors instead of white */
.theme-primary jmnode.root { background: #e8f2ff !important; border-color: #90c2ff !important; color: #0b3d91 !important; }
`;
        document.head.appendChild(style);
      }
    } catch {
    }
    this.jm = new window.jsMind(options);
    this.wrapCenterRootIfNeeded();
    this.allowCenterRoot = false;
    this.jm.show(mind);
    this.restoreViewport(this.prevViewport);
    if (prevSelectedId) {
      try {
        this.suppressSync = true;
        this.jm.select_node(prevSelectedId);
      } finally {
        setTimeout(() => {
          this.suppressSync = false;
        }, 0);
      }
    }
    try {
      this.jm.expand_all && this.jm.expand_all();
    } catch {
    }
    try {
      this.jm.resize && this.jm.resize();
    } catch {
    }
    try {
      const attachSelectionSync = () => {
        if (this.jm && typeof this.jm.add_event_listener === "function") {
          this.jm.add_event_listener((type, data) => {
            if (type === "select_node" && data?.node?.id) {
              if (this.suppressSync) return;
              this.lastSyncedNodeId = data.node.id;
              this.suppressEditorSyncUntil = Date.now() + 600;
              this.revealHeadingById(data.node.id);
            }
          });
        }
        if (this.containerElDiv) {
          const nodesContainer = this.containerElDiv.querySelector("jmnodes") || this.containerElDiv;
          const handler = (ev) => {
            const t = ev.target;
            const nodeEl = t && (t.closest ? t.closest("jmnode") : null);
            const nodeId = nodeEl?.getAttribute("nodeid") || "";
            if (nodeId) {
              this.lastSyncedNodeId = nodeId;
              this.suppressEditorSyncUntil = Date.now() + 600;
              this.revealHeadingById(nodeId);
            }
          };
          nodesContainer.addEventListener("click", handler);
          this.register(() => nodesContainer && nodesContainer.removeEventListener("click", handler));
        }
      };
      attachSelectionSync();
    } catch {
    }
  }
  async softSyncFromDisk() {
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
  async applyHeadingsDiff(prev, next) {
    if (!this.jm) return;
    const prevMap = new Map(prev.map((h) => [h.id, h]));
    const nextMap = new Map(next.map((h) => [h.id, h]));
    const firstPrevH1 = prev.find((h) => h.level === 1) ?? null;
    const firstNextH1 = next.find((h) => h.level === 1) ?? null;
    const rootId = firstPrevH1 ? firstPrevH1.id : `virtual_root_${this.file?.name}`;
    for (const oldH of prev) {
      if (!nextMap.has(oldH.id)) {
        try {
          this.jm.remove_node(oldH.id);
        } catch {
        }
      }
    }
    for (const newH of next) {
      const existed = prevMap.get(newH.id);
      if (!existed) {
        const parentKey = newH.parentId ?? (firstNextH1 ? firstNextH1.id : rootId);
        try {
          this.jm.add_node(parentKey, newH.id, newH.title || "");
        } catch {
        }
        continue;
      }
      if (existed.title !== newH.title) {
        try {
          this.jm.update_node(newH.id, newH.title || "");
        } catch {
        }
      }
      const oldParent = existed.parentId ?? (firstPrevH1 ? firstPrevH1.id : rootId);
      const newParent = newH.parentId ?? (firstNextH1 ? firstNextH1.id : rootId);
      if (oldParent !== newParent) {
        try {
          this.jm.remove_node(newH.id);
          this.jm.add_node(newParent, newH.id, newH.title || "");
        } catch {
        }
      }
    }
    try {
      const sel = this.jm.get_selected_node?.();
      const selId = sel?.id;
      if (selId && nextMap.has(selId)) {
        this.suppressSync = true;
        try {
          this.jm.select_node(selId);
        } finally {
          setTimeout(() => {
            this.suppressSync = false;
          }, 0);
        }
      }
    } catch {
    }
  }
  wrapCenterRootIfNeeded() {
    try {
      if (this.centerRootWrapped || !this.jm?.view) return;
      const view = this.jm.view;
      const originalCenterRoot = view.center_root?.bind(view);
      const originalCenterNode = view.center_node?.bind(view);
      if (!originalCenterRoot || !originalCenterNode) return;
      const self = this;
      view.center_root = function(...args) {
        if (self.allowCenterRoot) {
          try {
            return originalCenterRoot(...args);
          } catch {
          }
        }
        return void 0;
      };
      view.center_node = function(node, ...rest) {
        try {
          const root = self.jm?.get_root?.();
          const isRoot = root && node && node.id === root.id;
          if (isRoot && !self.allowCenterRoot) {
            return void 0;
          }
          return originalCenterNode(node, ...rest);
        } catch {
        }
        return void 0;
      };
      this.centerRootWrapped = true;
    } catch {
    }
  }
  captureViewport() {
    try {
      if (!this.containerElDiv) return null;
      const nodes = this.containerElDiv.querySelector("jmnodes");
      const canvas = this.containerElDiv.querySelector("canvas.jsmind");
      const nodesTransform = nodes ? getComputedStyle(nodes).transform : null;
      const canvasTransform = canvas ? getComputedStyle(canvas).transform : null;
      return { nodesTransform, canvasTransform };
    } catch {
      return null;
    }
  }
  restoreViewport(prev) {
    try {
      if (!prev || !this.containerElDiv) return;
      const nodes = this.containerElDiv.querySelector("jmnodes");
      const canvas = this.containerElDiv.querySelector("canvas.jsmind");
      if (nodes && prev.nodesTransform && prev.nodesTransform !== "none") {
        nodes.style.transform = prev.nodesTransform;
      }
      if (canvas && prev.canvasTransform && prev.canvasTransform !== "none") {
        canvas.style.transform = prev.canvasTransform;
      }
    } catch {
    }
  }
  async revealHeadingById(nodeId) {
    if (!this.file) return;
    try {
      const content = await this.app.vault.read(this.file);
      const headings = computeHeadingSections(content);
      const target = headings.find((h) => h.id === nodeId);
      if (!target) return;
      const lines = content.split("\n");
      const lineText = lines[target.lineStart] ?? "";
      let chStart = 0;
      if (target.style === "atx") {
        const m = lineText.match(/^(#{1,6})\s+/);
        chStart = m ? m[0].length : 0;
      } else {
        chStart = 0;
      }
      const chEnd = lineText.length;
      const activeMd = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      const from = { line: target.lineStart, ch: chStart };
      const to = { line: target.lineStart, ch: chEnd };
      if (activeMd?.file?.path === this.file.path) {
        const editor = activeMd.editor;
        try {
          this.app.workspace.revealLeaf(activeMd.leaf);
        } catch {
        }
        try {
          editor.focus?.();
        } catch {
        }
        try {
          editor.setSelection(from, to);
        } catch {
        }
        try {
          editor.scrollIntoView({ from, to }, true);
        } catch {
        }
        return;
      }
      const mdLeaves = this.app.workspace.getLeavesOfType("markdown");
      for (const leaf of mdLeaves) {
        const v = leaf.view;
        if (v?.file?.path === this.file.path) {
          const mdView = v;
          const editor = mdView.editor;
          try {
            this.app.workspace.setActiveLeaf(leaf, { focus: true });
          } catch {
          }
          try {
            this.app.workspace.revealLeaf(leaf);
          } catch {
          }
          try {
            editor.focus?.();
          } catch {
          }
          try {
            editor.setSelection(from, to);
          } catch {
          }
          try {
            editor.scrollIntoView({ from, to }, true);
          } catch {
          }
          return;
        }
      }
    } catch {
    }
  }
  selectMindmapNodeById(nodeId, center) {
    if (!this.jm) return;
    try {
      const node = this.jm.get_node ? this.jm.get_node(nodeId) : null;
      this.suppressSync = true;
      try {
        if (this.jm.select_node) this.jm.select_node(nodeId);
        if (center && node) {
          this.allowCenterRoot = true;
          window.setTimeout(() => {
            try {
              this.jm.center_node && this.jm.center_node(node);
            } catch {
            }
            try {
              this.jm.view && this.jm.view.center_node && this.jm.view.center_node(node);
            } catch {
            }
            try {
              this.jm.resize && this.jm.resize();
            } catch {
            }
            this.allowCenterRoot = false;
          }, 30);
        }
      } finally {
        setTimeout(() => {
          this.suppressSync = false;
        }, 0);
      }
    } catch {
    }
  }
  attachEditorSync() {
    const trySync = async () => {
      if (!this.file) return;
      if (Date.now() < this.suppressEditorSyncUntil) return;
      const activeMd = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (!activeMd || activeMd.file?.path !== this.file.path) return;
      const editor = activeMd.editor;
      const cursor = editor.getCursor();
      const content = editor.getValue();
      const headings = computeHeadingSections(content);
      if (headings.length === 0) return;
      const currentLine = cursor.line;
      let current = null;
      for (let i = 0; i < headings.length; i++) {
        const h = headings[i];
        const next = headings[i + 1];
        const endLine = next ? next.lineStart - 1 : content.split("\n").length - 1;
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
    this.registerEvent(this.app.workspace.on("editor-change", (editor, mdView) => {
      if (!this.file) return;
      if (mdView?.file?.path === this.file.path) {
        trySync();
      }
    }));
    const id = window.setInterval(() => {
      trySync();
    }, 400);
    this.editorSyncIntervalId = id;
    this.registerInterval(id);
  }
  getSelectedHeading() {
    if (!this.jm) return null;
    const node = this.jm.get_selected_node();
    if (!node) return null;
    const id = node.id;
    return this.headingsCache.find((h) => h.id === id) ?? null;
  }
  isMarkdownEditorFocused(mdView) {
    try {
      const active = document.activeElement;
      if (!active) return false;
      const cmEl = mdView.contentEl?.querySelector?.(".cm-editor");
      if (!cmEl) return false;
      return !!(active === cmEl || active.closest?.(".cm-editor") === cmEl);
    } catch {
    }
    return false;
  }
  async handleAddChild() {
    if (!this.file) return;
    const selected = this.getSelectedHeading();
    const content = await this.app.vault.read(this.file);
    const headings = computeHeadingSections(content);
    let parent = selected;
    if (!parent) {
      const firstH1 = headings.find((h) => h.level === 1) ?? null;
      parent = firstH1;
    }
    let levelToInsert = 1;
    let insertPos = content.length;
    if (parent) {
      levelToInsert = Math.min(parent.level + 1, 6);
      insertPos = parent.end + 1;
    }
    const title = window.prompt("New node title");
    if (!title) return;
    const headingPrefix = "#".repeat(levelToInsert);
    const prefix = content.endsWith("\n") ? "" : "\n";
    const insertText = `${prefix}${headingPrefix} ${title}
`;
    const updated = content.slice(0, insertPos) + insertText + content.slice(insertPos);
    await this.app.vault.modify(this.file, updated);
    new import_obsidian.Notice("Child node added");
  }
  async handleRename() {
    if (!this.file) return;
    const selected = this.getSelectedHeading();
    if (!selected) {
      new import_obsidian.Notice("Select a node to rename");
      return;
    }
    const content = await this.app.vault.read(this.file);
    const headings = computeHeadingSections(content);
    const target = headings.find((h) => h.id === selected.id);
    if (!target) return;
    const newTitle = window.prompt("New title", target.title);
    if (!newTitle) return;
    const headingLine = content.substring(target.start, target.headingTextEnd);
    const replacedLine = headingLine.replace(/^(#{1,6})\s+.*$/, `$1 ${newTitle}`);
    const updated = content.slice(0, target.start) + replacedLine + content.slice(target.headingTextEnd);
    await this.app.vault.modify(this.file, updated);
    new import_obsidian.Notice("Node renamed");
  }
  async handleDelete() {
    if (!this.file) return;
    const selected = this.getSelectedHeading();
    if (!selected) {
      new import_obsidian.Notice("Select a node to delete");
      return;
    }
    if (!confirm("Delete this node and its content?")) return;
    const content = await this.app.vault.read(this.file);
    const headings = computeHeadingSections(content);
    const target = headings.find((h) => h.id === selected.id);
    if (!target) return;
    const start = target.start;
    const end = Math.min(target.end + 1, content.length);
    const updated = content.slice(0, start) + content.slice(end);
    await this.app.vault.modify(this.file, updated);
    new import_obsidian.Notice("Node deleted");
  }
};
var MindmapPlugin = class extends import_obsidian.Plugin {
  async onload() {
    try {
      const g = window;
      if (!g.__jsmindMindmapPatchedClassListAdd) {
        const proto = DOMTokenList.prototype;
        const originalAdd = proto.add;
        proto.add = function(...tokens) {
          const sanitized = tokens.map(
            (token) => typeof token === "string" ? token.replace(/\s+/g, "-") : token
          );
          return originalAdd.apply(this, sanitized);
        };
        g.__jsmindMindmapPatchedClassListAdd = true;
      }
    } catch (e) {
    }
    this.registerView(
      VIEW_TYPE_MINDMAP,
      (leaf) => new MindmapView(leaf, this)
    );
    this.addCommand({
      id: "open-jsmind-preview",
      name: "Preview current markdown as mindmap",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new import_obsidian.Notice("No active file");
          return;
        }
        const leaf = this.app.workspace.getRightLeaf(false);
        await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
        const view = leaf.view;
        await view.setFile(file);
        this.app.workspace.revealLeaf(leaf);
      }
    });
    this.registerDomEvent(window, "resize", () => {
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
      for (const leaf of leaves) {
        const view = leaf.view;
        view.jm && view.jm.resize && view.jm.resize();
      }
    });
  }
  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP).forEach((leaf) => leaf.detach());
  }
};
//# sourceMappingURL=main.js.map
