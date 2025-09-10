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
var import_obsidian2 = require("obsidian");

// tools.ts
var import_obsidian = require("obsidian");
var PopupController = class {
  constructor() {
    this.containerElDiv = null;
    this.jm = null;
    this.file = null;
    this.shouldMindmapDriveMarkdown = () => false;
    this.isMindmapEditingActive = () => false;
    this.hoverPopupEl = null;
    this.hoverPopupForNodeId = null;
    this.hoverPopupRAF = null;
    this.hoverHideTimeoutId = null;
    this.lastFileContent = "";
    this.computeHeadingSections = () => [];
  }
  show(nodeId) {
    try {
      if (!this.plugin?.settings?.enablePopup) {
        this.hide();
        return;
      }
      if (!this.containerElDiv) return;
      if (this.isMindmapEditingActive()) return;
      const body = this.extractNodeImmediateBody(nodeId);
      if (!body || body.trim().length === 0) {
        this.hide();
        return;
      }
      let el = this.hoverPopupEl;
      if (!el) {
        el = document.createElement("div");
        try {
          el.classList.add("mm-popup");
        } catch {
        }
        el.style.position = "absolute";
        el.style.zIndex = "6";
        el.style.minWidth = "220px";
        el.style.maxWidth = "420px";
        el.style.maxHeight = "240px";
        el.style.overflow = "auto";
        el.style.padding = "4px 6px";
        el.style.borderRadius = "6px";
        el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
        {
          const isDark = document.body.classList.contains("theme-dark");
          el.style.setProperty("border", isDark ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(0,0,0,0.12)", "important");
          el.style.setProperty("background", isDark ? "rgba(30,30,30,0.68)" : "rgba(255,255,255,0.85)", "important");
        }
        el.style.backdropFilter = "blur(15px)";
        el.style.webkitBackdropFilter = "blur(15px)";
        el.style.backgroundClip = "padding-box";
        el.style.color = "var(--text-normal)";
        el.style.whiteSpace = "pre-wrap";
        el.style.pointerEvents = "auto";
        ;
        el.style.userSelect = "text";
        ;
        el.style.webkitUserSelect = "text";
        try {
          const stop = (ev) => ev.stopPropagation();
          el.addEventListener("mousedown", stop);
          el.addEventListener("mouseup", stop);
          el.addEventListener("click", stop);
          el.addEventListener("dblclick", stop);
        } catch {
        }
        this.containerElDiv.appendChild(el);
        this.hoverPopupEl = el;
      }
      try {
        const isDarkNow = document.body.classList.contains("theme-dark");
        this.hoverPopupEl.style.setProperty("border", isDarkNow ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(0,0,0,0.12)", "important");
        this.hoverPopupEl.style.setProperty("background", isDarkNow ? "rgba(30,30,30,0.68)" : "rgba(255,255,255,0.85)", "important");
      } catch {
      }
      try {
        const popup2 = this.hoverPopupEl;
        if (!popup2.__mm_popup_bound) {
          popup2.addEventListener("mouseleave", (ev) => {
            const rel = ev.relatedTarget;
            const intoNode = rel && (rel.closest ? rel.closest("jmnode") : null);
            if (intoNode) return;
            if (this.hoverHideTimeoutId != null) {
              try {
                window.clearTimeout(this.hoverHideTimeoutId);
              } catch {
              }
            }
            this.hoverHideTimeoutId = window.setTimeout(() => {
              this.hoverHideTimeoutId = null;
              this.hide();
            }, 150);
          });
          popup2.__mm_popup_bound = true;
        }
      } catch {
      }
      if (this.hoverPopupEl && this.hoverPopupEl.parentElement !== this.containerElDiv) {
        this.containerElDiv.appendChild(this.hoverPopupEl);
      }
      if (this.hoverHideTimeoutId != null) {
        try {
          window.clearTimeout(this.hoverHideTimeoutId);
        } catch {
        }
        this.hoverHideTimeoutId = null;
      }
      this.hoverPopupForNodeId = nodeId;
      const popup = this.hoverPopupEl;
      try {
        popup.classList.add("markdown-rendered");
      } catch {
      }
      popup.style.whiteSpace = "normal";
      popup.innerHTML = "";
      try {
        import_obsidian.MarkdownRenderer.renderMarkdown(body.trim(), popup, this.file?.path ?? "", this.plugin);
      } catch {
        const fallback = document.createElement("div");
        fallback.textContent = body.trim();
        popup.appendChild(fallback);
      }
      this.updatePosition();
      if (this.hoverPopupRAF == null) {
        const tick = () => {
          this.updatePosition();
          if (this.hoverPopupEl && this.hoverPopupEl.style.display !== "none") {
            this.hoverPopupRAF = window.requestAnimationFrame(tick);
          } else {
            if (this.hoverPopupRAF != null) {
              try {
                window.cancelAnimationFrame(this.hoverPopupRAF);
              } catch {
              }
              ;
              this.hoverPopupRAF = null;
            }
          }
        };
        this.hoverPopupRAF = window.requestAnimationFrame(tick);
      }
    } catch {
    }
  }
  hide() {
    try {
      if (this.hoverPopupEl) this.hoverPopupEl.style.display = "none";
      this.hoverPopupForNodeId = null;
      if (this.hoverPopupRAF != null) {
        try {
          window.cancelAnimationFrame(this.hoverPopupRAF);
        } catch {
        }
        ;
        this.hoverPopupRAF = null;
      }
    } catch {
    }
  }
  updatePosition() {
    try {
      if (!this.hoverPopupEl || !this.containerElDiv || !this.hoverPopupForNodeId) return;
      const nodeEl = this.containerElDiv.querySelector(`jmnode[nodeid="${this.hoverPopupForNodeId}"]`);
      if (!nodeEl) return;
      const rect = nodeEl.getBoundingClientRect();
      const hostRect = this.containerElDiv.getBoundingClientRect();
      const node = this.jm?.get_node?.(this.hoverPopupForNodeId);
      const isLeft = node && node.direction === (window.jsMind?.direction?.left ?? "left");
      const gap = 8;
      const margin = 6;
      const popupEl = this.hoverPopupEl;
      if (!popupEl.offsetWidth || !popupEl.offsetHeight || popupEl.style.display === "none") {
        popupEl.style.visibility = "hidden";
        popupEl.style.display = "block";
      }
      const popupW = popupEl.offsetWidth || 220;
      const popupH = popupEl.offsetHeight || 180;
      let x = isLeft ? rect.left - hostRect.left - (popupW + gap) : rect.right - hostRect.left + gap;
      if (!isLeft && x + popupW > hostRect.width - margin) {
        x = rect.left - hostRect.left - (popupW + gap);
      }
      if (x < margin) x = margin;
      const nodeLeft = rect.left - hostRect.left;
      const nodeRight = rect.right - hostRect.left;
      const popupLeft = x;
      const popupRight = x + popupW;
      const overlapsHorizontally = !(popupRight <= nodeLeft - gap || popupLeft >= nodeRight + gap);
      let y = rect.top - hostRect.top;
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
      popupEl.style.display = "block";
      popupEl.style.visibility = "visible";
    } catch {
    }
  }
  extractNodeImmediateBody(nodeId) {
    try {
      const content = this.lastFileContent || "";
      if (!content) return "";
      const headings = this.headingsCache && this.headingsCache.length ? this.headingsCache : this.computeHeadingSections(content);
      const idx = headings.findIndex((h2) => h2.id === nodeId);
      if (idx === -1) return "";
      const h = headings[idx];
      const startBody = Math.min(content.length, Math.max(0, h.headingTextEnd + 1));
      const next = headings[idx + 1];
      const endBody = next ? Math.max(startBody, next.start - 1) : Math.max(startBody, content.length);
      const raw = content.slice(startBody, endBody);
      return raw.replace(/^\s*\n/, "").trimEnd();
    } catch {
      return "";
    }
  }
};
var ButtonController = class {
  constructor() {
    this.containerElDiv = null;
    this.jm = null;
    this.file = null;
    this.shouldMindmapDriveMarkdown = () => false;
    this.isMindmapEditingActive = () => false;
    this.addButtonEl = null;
    this.deleteButtonEl = null;
    this.addButtonForNodeId = null;
    this.addButtonRAF = null;
    this.deleteHeadingById = () => {
    };
    this.computeHeadingSections = () => [];
  }
  show(nodeId) {
    try {
      if (!this.jm || !this.containerElDiv) return;
      if (!this.shouldMindmapDriveMarkdown()) return;
      if (this.isMindmapEditingActive()) return;
      const node = this.jm.get_node?.(nodeId);
      if (!node) {
        this.hide();
        return;
      }
      let btn = this.addButtonEl;
      if (!btn) {
        btn = document.createElement("button");
        btn.textContent = "+";
        btn.title = "Add child";
        btn.style.position = "absolute";
        btn.style.zIndex = "5";
        btn.style.width = "22px";
        btn.style.height = "22px";
        btn.style.lineHeight = "22px";
        btn.style.padding = "0";
        btn.style.textAlign = "center";
        btn.style.boxSizing = "border-box";
        btn.style.borderRadius = "11px";
        btn.style.border = "1px solid #90c2ff";
        btn.style.background = "#e8f2ff";
        btn.style.color = "#0b3d91";
        btn.style.cursor = "pointer";
        this.containerElDiv.appendChild(btn);
        this.addButtonEl = btn;
      }
      if (this.addButtonEl && this.addButtonEl.parentElement !== this.containerElDiv) {
        this.containerElDiv.appendChild(this.addButtonEl);
      }
      this.addButtonEl.onclick = (e) => {
        e.stopPropagation();
        this.addChildUnder(nodeId);
      };
      if (!this.deleteButtonEl) {
        const del = document.createElement("button");
        del.textContent = "\u2212";
        del.title = "Delete node";
        del.style.position = "absolute";
        del.style.zIndex = "5";
        del.style.width = "22px";
        del.style.height = "22px";
        del.style.lineHeight = "22px";
        del.style.padding = "0";
        del.style.textAlign = "center";
        del.style.boxSizing = "border-box";
        del.style.borderRadius = "11px";
        del.style.border = "1px solid #ff9aa2";
        del.style.background = "#ffecef";
        del.style.color = "#cc0033";
        del.style.cursor = "pointer";
        this.containerElDiv.appendChild(del);
        this.deleteButtonEl = del;
      }
      if (this.deleteButtonEl && this.deleteButtonEl.parentElement !== this.containerElDiv) {
        this.containerElDiv.appendChild(this.deleteButtonEl);
      }
      this.deleteButtonEl.onclick = (e) => {
        e.stopPropagation();
        this.deleteHeadingById(nodeId);
      };
      this.addButtonForNodeId = nodeId;
      this.updatePosition();
      if (this.addButtonRAF == null) {
        const tick = () => {
          this.updatePosition();
          if (this.addButtonEl && this.addButtonEl.style.display !== "none") {
            this.addButtonRAF = window.requestAnimationFrame(tick);
          } else {
            if (this.addButtonRAF != null) {
              try {
                window.cancelAnimationFrame(this.addButtonRAF);
              } catch {
              }
              ;
              this.addButtonRAF = null;
            }
          }
        };
        this.addButtonRAF = window.requestAnimationFrame(tick);
      }
      if (node.isroot && this.deleteButtonEl) {
        this.deleteButtonEl.style.display = "none";
      }
    } catch {
    }
  }
  hide() {
    try {
      if (this.addButtonEl) {
        this.addButtonEl.style.display = "none";
        this.addButtonForNodeId = null;
        if (this.addButtonRAF != null) {
          try {
            window.cancelAnimationFrame(this.addButtonRAF);
          } catch {
          }
          this.addButtonRAF = null;
        }
      }
      if (this.deleteButtonEl) {
        this.deleteButtonEl.style.display = "none";
      }
    } catch {
    }
  }
  updatePosition() {
    try {
      if (!this.addButtonEl || !this.containerElDiv || !this.addButtonForNodeId) return;
      const nodeEl = this.containerElDiv.querySelector(`jmnode[nodeid="${this.addButtonForNodeId}"]`);
      if (!nodeEl) return;
      const node = this.jm?.get_node?.(this.addButtonForNodeId);
      const expanderEl = this.containerElDiv.querySelector(`jmexpander[nodeid="${this.addButtonForNodeId}"]`);
      const rect = nodeEl.getBoundingClientRect();
      const hostRect = this.containerElDiv.getBoundingClientRect();
      const isLeft = node && node.direction === (window.jsMind?.direction?.left ?? "left");
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
      const btnH = this.addButtonEl?.offsetHeight || 22;
      const centerYRaw = rect.top - hostRect.top + (rect.height - btnH) / 2;
      const centerY = Math.round(centerYRaw) - 3;
      this.addButtonEl.style.left = `${xAdd}px`;
      this.addButtonEl.style.top = `${centerY}px`;
      this.addButtonEl.style.transform = "";
      this.addButtonEl.style.display = "block";
      if (this.deleteButtonEl) {
        const gap = 4;
        const xDel = isLeft ? xAdd - (buttonSize + gap) : xAdd + (buttonSize + gap);
        this.deleteButtonEl.style.left = `${xDel}px`;
        this.deleteButtonEl.style.top = `${centerY}px`;
        this.deleteButtonEl.style.transform = "";
        this.deleteButtonEl.style.display = "block";
      }
    } catch {
    }
  }
  focusEditorToRange(line, chStart, chEnd) {
    try {
      const mdLeaves = this.app.workspace.getLeavesOfType("markdown");
      for (const leaf of mdLeaves) {
        const v = leaf.view;
        if (v?.file?.path === this.file?.path) {
          const mdView = v;
          const editor = mdView.editor;
          const from = { line, ch: chStart };
          const to = { line, ch: chEnd };
          setTimeout(() => {
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
          }, 0);
          break;
        }
      }
    } catch {
    }
  }
  async addChildUnder(nodeId) {
    if (!this.file) return;
    const content = await this.app.vault.read(this.file);
    const headings = this.computeHeadingSections(content);
    const parent = headings.find((h) => h.id === nodeId) ?? null;
    let levelToInsert = 1;
    let insertPos = content.length;
    if (parent) {
      levelToInsert = Math.min(parent.level + 1, 6);
      insertPos = Math.min(parent.end + 1, content.length);
    }
    const headingPrefix = "#".repeat(levelToInsert);
    const needLeadingNewline = insertPos > 0 && content.charAt(insertPos - 1) !== "\n";
    const placeholder = "\u65B0\u6807\u9898";
    const insertText = `${needLeadingNewline ? "\n" : ""}${headingPrefix} ${placeholder}
`;
    const updated = content.slice(0, insertPos) + insertText + content.slice(insertPos);
    await this.app.vault.modify(this.file, updated);
    new import_obsidian.Notice("Child heading inserted");
    const newHeadingStart = insertPos + (needLeadingNewline ? 1 : 0);
    const before = updated.slice(0, newHeadingStart);
    const newLineIndex = before.match(/\n/g)?.length ?? 0;
    const chStart = headingPrefix.length + 1;
    const chEnd = chStart + placeholder.length;
    this.focusEditorToRange(newLineIndex, chStart, chEnd);
    this.show(nodeId);
  }
};

// themes.ts
var THEME_OPTIONS = [
  { key: "default", label: "\u9ED8\u8BA4" },
  { key: "fresh", label: "\u6E05\u65B0" },
  { key: "business", label: "\u5546\u52A1" },
  { key: "nature", label: "\u81EA\u7136" },
  { key: "elegant", label: "\u4F18\u96C5" },
  { key: "fashion", label: "\u65F6\u5C1A" },
  { key: "minimal", label: "\u6781\u7B80" }
];
function getJsMindThemeNameFromSetting(theme) {
  if (theme === "default") return "obsidian";
  return theme;
}
function ensureThemeCssInjected(doc) {
  const id = "obsidian-jsmind-themes";
  const existing = doc.getElementById(id);
  if (existing) {
    existing.textContent = buildThemesCss();
    try {
      existing.parentElement?.removeChild(existing);
    } catch {
    }
    doc.head.appendChild(existing);
    return;
  }
  const st = doc.createElement("style");
  st.id = id;
  st.textContent = buildThemesCss();
  doc.head.appendChild(st);
}
function buildThemesCss() {
  const css = [];
  const push = (s) => css.push(s);
  push(`
    body:not(.theme-dark) jmnodes.theme-obsidian jmnode { background: rgb(225, 235, 255) !important; background-color: rgb(225, 235, 255) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-obsidian jmnode { background: rgb(50, 70, 120) !important; background-color: rgb(50, 70, 120) !important; background-image: none !important; }
    body jmnodes.theme-obsidian jmnode.root { background: var(--interactive-accent) !important; background-color: var(--interactive-accent) !important; background-image: none !important; }
    body jmnodes.theme-obsidian jmnode.selected { background: var(--interactive-accent) !important; background-color: var(--interactive-accent) !important; background-image: none !important; }
  `);
  push(`
    body:not(.theme-dark) jmnodes.theme-fresh jmnode { background: rgb(210, 246, 235) !important; background-color: rgb(210, 246, 235) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-fresh jmnode { background: rgb(30, 90, 75) !important; background-color: rgb(30, 90, 75) !important; background-image: none !important; }
    body jmnodes.theme-fresh jmnode.root { background: rgb(56, 217, 169) !important; background-color: rgb(56, 217, 169) !important; background-image: none !important; }
    body jmnodes.theme-fresh jmnode.selected { background: rgb(56, 217, 169) !important; background-color: rgb(56, 217, 169) !important; background-image: none !important; }
  `);
  push(`
    body:not(.theme-dark) jmnodes.theme-business jmnode { background: rgb(226, 235, 255) !important; background-color: rgb(226, 235, 255) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-business jmnode { background: rgb(35, 55, 100) !important; background-color: rgb(35, 55, 100) !important; background-image: none !important; }
    body jmnodes.theme-business jmnode.root { background: rgb(33, 99, 255) !important; background-color: rgb(33, 99, 255) !important; background-image: none !important; }
    body jmnodes.theme-business jmnode.selected { background: rgb(33, 99, 255) !important; background-color: rgb(33, 99, 255) !important; background-image: none !important; }
  `);
  push(`
    body:not(.theme-dark) jmnodes.theme-nature jmnode { background: rgb(226, 239, 223) !important; background-color: rgb(226, 239, 223) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-nature jmnode { background: rgb(40, 70, 40) !important; background-color: rgb(40, 70, 40) !important; background-image: none !important; }
    body jmnodes.theme-nature jmnode.root { background: rgb(97, 165, 90) !important; background-color: rgb(97, 165, 90) !important; background-image: none !important; }
    body jmnodes.theme-nature jmnode.selected { background: rgb(97, 165, 90) !important; background-color: rgb(97, 165, 90) !important; background-image: none !important; }
  `);
  push(`
    body:not(.theme-dark) jmnodes.theme-elegant jmnode { background: rgb(236, 226, 250) !important; background-color: rgb(236, 226, 250) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-elegant jmnode { background: rgb(60, 45, 85) !important; background-color: rgb(60, 45, 85) !important; background-image: none !important; }
    body jmnodes.theme-elegant jmnode.root { background: rgb(142, 84, 233) !important; background-color: rgb(142, 84, 233) !important; background-image: none !important; }
    body jmnodes.theme-elegant jmnode.selected { background: rgb(142, 84, 233) !important; background-color: rgb(142, 84, 233) !important; background-image: none !important; }
  `);
  push(`
    body:not(.theme-dark) jmnodes.theme-fashion jmnode { background: rgb(255, 230, 238) !important; background-color: rgb(255, 230, 238) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-fashion jmnode { background: rgb(90, 35, 50) !important; background-color: rgb(90, 35, 50) !important; background-image: none !important; }
    body jmnodes.theme-fashion jmnode.root { background: rgb(255, 99, 132) !important; background-color: rgb(255, 99, 132) !important; background-image: none !important; }
    body jmnodes.theme-fashion jmnode.selected { background: rgb(255, 99, 132) !important; background-color: rgb(255, 99, 132) !important; background-image: none !important; }
  `);
  push(`
    body:not(.theme-dark) jmnodes.theme-minimal jmnode { background: rgb(238, 238, 238) !important; background-color: rgb(238, 238, 238) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-minimal jmnode { background: rgb(48, 48, 48) !important; background-color: rgb(48, 48, 48) !important; background-image: none !important; }
    body jmnodes.theme-minimal jmnode.root { background: var(--interactive-accent) !important; background-color: var(--interactive-accent) !important; background-image: none !important; }
    body jmnodes.theme-minimal jmnode.selected { background: var(--interactive-accent) !important; background-color: var(--interactive-accent) !important; background-image: none !important; }
  `);
  push(`
    body.theme-dark jmnodes.theme-obsidian jmnode,
    body.theme-dark jmnodes.theme-obsidian jmnode .topic,
    body.theme-dark jmnodes.theme-obsidian jmnode .topicbody,
    body.theme-dark jmnodes.theme-fresh jmnode,
    body.theme-dark jmnodes.theme-fresh jmnode .topic,
    body.theme-dark jmnodes.theme-fresh jmnode .topicbody,
    body.theme-dark jmnodes.theme-business jmnode,
    body.theme-dark jmnodes.theme-business jmnode .topic,
    body.theme-dark jmnodes.theme-business jmnode .topicbody,
    body.theme-dark jmnodes.theme-nature jmnode,
    body.theme-dark jmnodes.theme-nature jmnode .topic,
    body.theme-dark jmnodes.theme-nature jmnode .topicbody,
    body.theme-dark jmnodes.theme-elegant jmnode,
    body.theme-dark jmnodes.theme-elegant jmnode .topic,
    body.theme-dark jmnodes.theme-elegant jmnode .topicbody,
    body.theme-dark jmnodes.theme-fashion jmnode,
    body.theme-dark jmnodes.theme-fashion jmnode .topic,
    body.theme-dark jmnodes.theme-fashion jmnode .topicbody,
    body.theme-dark jmnodes.theme-minimal jmnode,
    body.theme-dark jmnodes.theme-minimal jmnode .topic,
    body.theme-dark jmnodes.theme-minimal jmnode .topicbody { color: #ffffff !important; }
  `);
  return css.join("\n");
}

// main.ts
var VIEW_TYPE_MINDMAP = "obsidian-jsmind-mindmap-view";
var __mm_lastHeadingsText = null;
var __mm_lastHeadingsRes = null;
var __mm_lastHeadingsTs = 0;
function extractContentTree(markdownText, start, end) {
  try {
    const lines = markdownText.split("\n");
    let acc = 0, startLine = 0, endLine = lines.length - 1;
    for (let i = 0; i < lines.length; i++) {
      const len = lines[i].length + 1;
      if (acc <= start && start < acc + len) startLine = i;
      if (acc <= end && end <= acc + len) {
        endLine = Math.max(i, startLine);
        break;
      }
      acc += len;
    }
    const atxHeadingRe = /^(#{1,6})\s+.*$/;
    const setextH1Re = /^=+\s*$/;
    const setextH2Re = /^-+\s*$/;
    const isHrTripleDash = (s) => /^\s*---\s*$/.test(s);
    let stopAt = endLine;
    {
      let inCode2 = false;
      for (let i = startLine; i <= endLine && i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*```/.test(line)) {
          inCode2 = !inCode2;
          continue;
        }
        if (inCode2) continue;
        if (atxHeadingRe.test(line)) {
          stopAt = i - 1;
          break;
        }
        const next = i + 1 <= endLine ? lines[i + 1] : void 0;
        if (next && (setextH1Re.test(next) || setextH2Re.test(next) && !isHrTripleDash(next))) {
          stopAt = i - 1;
          break;
        }
      }
    }
    endLine = Math.max(startLine, Math.min(endLine, stopAt));
    const root = [];
    const stack = [{ depth: -1, items: root }];
    let inCode = false;
    const BULLET = "[-*+\u2013\u2014\u2022]";
    const RE_LIST_ITEM = new RegExp(`^(\\s*)(?:${BULLET}\\s+|\\d+\\.\\s+)(.+)$`);
    const RE_INLINE_BOLD = /\*\*(.+?)\*\*/;
    const RE_BOLD_LINE = /^(\s*)\*\*(.+?)\*\*[：:]?.*$/;
    const RE_NUM_BOLD = /^(\s*)\d+\.\s*\*\*(.+?)\*\*[：:]?.*$/;
    const RE_TASK_UNCHECKED = new RegExp(`^(\\s*)${BULLET}\\s*\\[\\s\\]\\s*(.+)$`);
    const RE_TASK_CHECKED = new RegExp(`^(\\s*)${BULLET}\\s*\\[(?:x|X)\\]\\s*(.+)$`);
    let structuralDepthBase = 0;
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      const raw = lines[i];
      if (/^\s*$/.test(raw)) {
        structuralDepthBase = 0;
        continue;
      }
      if (/^\s*```/.test(raw)) {
        inCode = !inCode;
        continue;
      }
      if (inCode) continue;
      let label = null;
      let depthSpaces = 0;
      {
        const m = raw.match(RE_NUM_BOLD);
        if (m) {
          depthSpaces = m[1].length;
          label = (m[2] || "").trim();
        }
      }
      if (!label) {
        const m = raw.match(RE_BOLD_LINE);
        if (m) {
          depthSpaces = 0;
          label = (m[2] || "").trim();
        }
      }
      if (!label) {
        let m = raw.match(RE_TASK_UNCHECKED);
        if (!m) m = raw.match(RE_TASK_CHECKED);
        if (m) {
          depthSpaces = m[1].length;
          const taskText = (m[2] || "").trim();
          const b = taskText.match(RE_INLINE_BOLD);
          label = (b ? b[1] : taskText).trim();
        }
      }
      if (!label) {
        const m = raw.match(RE_LIST_ITEM);
        if (m) {
          depthSpaces = m[1].length;
          const liText = (m[2] || "").trim();
          const b = liText.match(RE_INLINE_BOLD);
          label = b ? (b[1] || "").trim() : liText;
        }
      }
      if (!label) {
        const bold = raw.match(/^\s*\*\*(.+?)\*\*\s*$/);
        const italic = raw.match(/^\s*\*(.+?)\*\s*$/) || raw.match(/^\s*_(.+?)_\s*$/);
        if (bold) {
          label = bold[1].trim();
          depthSpaces = 0;
        } else if (italic) {
          label = italic[1].trim();
          depthSpaces = 2;
        }
      }
      if (!label) continue;
      let depth = Math.floor(depthSpaces / 2);
      if (/^\s*\*\*(.+?)\*\*\s*$/.test(raw)) {
        depth = 0;
        structuralDepthBase = 1;
      } else if (/^\s*(?:\*.+?\*|_.+?_)\s*$/.test(raw)) {
        depth = Math.max(structuralDepthBase, 1);
        structuralDepthBase = depth + 1;
      } else {
        depth = Math.max(depth, structuralDepthBase);
      }
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      const container = stack[stack.length - 1].items;
      const node = { label, children: [] };
      container.push(node);
      stack.push({ depth, items: node.children });
    }
    return root;
  } catch {
    return [];
  }
}
function computeHeadingSections(markdownText) {
  try {
    const now = Date.now();
    if (__mm_lastHeadingsRes && now - __mm_lastHeadingsTs <= 3e3) {
      if (__mm_lastHeadingsText != null && __mm_lastHeadingsText.length === markdownText.length) {
        return __mm_lastHeadingsRes;
      }
    }
  } catch {
  }
  const lines = markdownText.split(/\n/);
  const headingRegex = /^(#{1,6})\s+(.*)$/;
  const slugify = (s) => {
    try {
      const base = s.trim().toLowerCase();
      const collapsed = base.replace(/\s+/g, "-");
      const cleaned = collapsed.replace(/[^a-z0-9\-\u4e00-\u9fa5]+/gi, "");
      const trimmed = cleaned.replace(/^-+|-+$/g, "");
      return trimmed || "untitled";
    } catch {
      return "untitled";
    }
  };
  const slugCounts = /* @__PURE__ */ new Map();
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
      const slug = slugify(title);
      const cnt = (slugCounts.get(slug) || 0) + 1;
      slugCounts.set(slug, cnt);
      const hid = cnt === 1 ? `h_${slug}` : `h_${slug}_${cnt}`;
      headingsTemp.push({
        id: hid,
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
        const slug = slugify(title);
        const cnt = (slugCounts.get(slug) || 0) + 1;
        slugCounts.set(slug, cnt);
        const hid = cnt === 1 ? `h_${slug}` : `h_${slug}_${cnt}`;
        headingsTemp.push({
          id: hid,
          level: 1,
          title,
          start,
          lineStart: i,
          raw: line + "\n" + next,
          style: "setext"
        });
      } else if (/^-+\s*$/.test(next) && !/^\s*---\s*$/.test(next)) {
        const start = offset;
        const title = line.trim();
        const headingTextEnd = start + line.length;
        const slug = slugify(title);
        const cnt = (slugCounts.get(slug) || 0) + 1;
        slugCounts.set(slug, cnt);
        const hid = cnt === 1 ? `h_${slug}` : `h_${slug}_${cnt}`;
        headingsTemp.push({
          id: hid,
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
  try {
    __mm_lastHeadingsText = markdownText;
    __mm_lastHeadingsRes = headings;
    __mm_lastHeadingsTs = Date.now();
  } catch {
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
function buildJsMindTreeWithContent(headings, fileName, markdownText, includeContent) {
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
  const contentParentMap = /* @__PURE__ */ new Map();
  if (includeContent && headings.length === 0) {
    const itemsTree = extractContentTree(markdownText, 0, markdownText.length);
    let seq = 0;
    const addChildren = (host, children) => {
      for (const child of children) {
        seq += 1;
        const cid = `c_${rootId}_${seq}`;
        const cnode = { id: cid, topic: child.label, children: [] };
        host.children.push(cnode);
        contentParentMap.set(cid, rootId);
        if (Array.isArray(child.children) && child.children.length > 0) {
          addChildren(cnode, child.children);
        }
      }
    };
    addChildren(root, itemsTree);
    return { mind: { meta: { name: fileName }, format: "node_tree", data: root }, contentParentMap };
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
      const addChildren = (host, children) => {
        for (const child of children) {
          seq += 1;
          const cid = `c_${h.id}_${seq}`;
          const cnode = { id: cid, topic: child.label, children: [] };
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
  return { mind: { meta: { name: fileName }, format: "node_tree", data: root }, contentParentMap };
}
var MindmapView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    // owning plugin (for settings/persistence)
    this.file = null;
    // current markdown file shown in this view
    this.containerElDiv = null;
    // mindmap container element
    this.jm = null;
    // jsMind instance
    // Parsed markdown cache (structure used to build/update mindmap)
    this.headingsCache = [];
    // Selection and sync state (mindmap <-> markdown)
    this.lastSyncedNodeId = null;
    // last node id driven into selection to dedupe work
    // removed: private editorSyncIntervalId: number | null = null;
    // Viewport/centering management
    this.prevViewport = null;
    // saved transforms across re-render
    this.allowCenterRoot = false;
    // only allow jm to center root when explicitly enabled
    this.centerRootWrapped = false;
    // ensure we wrap jsMind center methods only once
    // UI interaction timing
    this.revealTimeoutId = null;
    // debounce for click-to-reveal in editor
    this.lastDblClickAtMs = 0;
    // last dblclick to differentiate from single click
    // Visibility/suspension controls (skip heavy work when hidden/offscreen)
    this.isSuspended = false;
    // whether view is currently suspended
    this.pendingDirty = false;
    // if changes occurred while suspended, refresh on resume
    // Hover popup handled by controller
    // Stable id mapping (parent chain + sibling index)
    this.idToStableKey = /* @__PURE__ */ new Map();
    // runtime id -> stable key
    this.stableKeyToId = /* @__PURE__ */ new Map();
    // stable key -> runtime id
    // Content nodes mapping (content-id -> parent heading-id)
    this.contentParentMap = /* @__PURE__ */ new Map();
    // FSM for sync control
    this.syncState = "scroll";
    // Controllers (OOP) for UI helpers
    this.popup = new PopupController();
    this.buttons = new ButtonController();
    // Scroll sync (follow markdown scrolling)
    this.scrollSyncEl = null;
    // current scroller we listen to
    this.scrollSyncHandler = null;
    // bound scroll handler
    this.scrollSyncLastRunMs = 0;
    // throttle timestamp (ms) for scroll-driven sync
    this.scrollSyncPendingTimeoutId = null;
    // pending trailing call id
    // Cached raw file text (for popup extraction and incremental diffs)
    this.lastFileContent = "";
    this.plugin = plugin;
    this.popup.app = this.app;
    this.popup.plugin = this.plugin;
    this.popup.shouldMindmapDriveMarkdown = () => this.shouldMindmapDriveMarkdown();
    this.popup.isMindmapEditingActive = () => this.isMindmapEditingActive();
    this.popup.computeHeadingSections = (text) => computeHeadingSections(text);
    this.buttons.app = this.app;
    this.buttons.plugin = this.plugin;
    this.buttons.shouldMindmapDriveMarkdown = () => this.shouldMindmapDriveMarkdown();
    this.buttons.isMindmapEditingActive = () => this.isMindmapEditingActive();
    this.buttons.computeHeadingSections = (text) => computeHeadingSections(text);
    this.buttons.deleteHeadingById = (id) => this.deleteHeadingById(id);
  }
  enterScroll() {
    if (this.syncState === "preview") return;
    if (this.syncState === "edit") return;
    if (this.syncState === "scroll") return;
    this.syncState = "scroll";
    this.hideAddButton();
  }
  forceEnterScroll() {
    this.syncState = "scroll";
    this.hideAddButton();
  }
  enterEdit() {
    this.syncState = "edit";
    this.hideAddButton();
  }
  enterPreview() {
    this.syncState = "preview";
  }
  shouldFollowScroll() {
    return this.syncState === "scroll";
  }
  shouldMindmapDriveMarkdown() {
    return this.syncState === "preview";
  }
  shouldCenterOnMarkdownSelection() {
    return this.syncState === "edit";
  }
  getJsMindEventName(type, data) {
    try {
      if (typeof type === "string") return type;
      if (data && typeof data.evt === "string") return data.evt;
    } catch {
    }
    return "";
  }
  getEventNodeId(data) {
    try {
      if (!data) return "";
      if (typeof data.node === "string") return data.node;
      if (data.node && typeof data.node.id === "string") return data.node.id;
      if (Array.isArray(data.data) && typeof data.data[0] === "string") return data.data[0];
      if (typeof data.id === "string") return data.id;
    } catch {
    }
    return "";
  }
  getEventNodeTopic(data) {
    try {
      if (!data) return "";
      if (typeof data.topic === "string") return data.topic;
      if (data.node && typeof data.node.topic === "string") return data.node.topic;
      if (Array.isArray(data.data) && typeof data.data[1] === "string") return data.data[1];
    } catch {
    }
    return "";
  }
  isContentNode(id) {
    return typeof id === "string" && id.startsWith("c_");
  }
  resolveHeadingId(id) {
    if (!id) return null;
    if (this.isContentNode(id)) {
      const parent = this.contentParentMap.get(id);
      return parent || null;
    }
    return id;
  }
  isMindmapEditingActive() {
    try {
      if (!this.containerElDiv) return false;
      const root = this.containerElDiv.querySelector(".jsmind-inner") || this.containerElDiv;
      if (!root) return false;
      return !!root.querySelector('input, textarea, [contenteditable="true"]');
    } catch {
      return false;
    }
  }
  isViewVisible() {
    try {
      if (!this.containerElDiv) return false;
      if (!document.body.contains(this.containerElDiv)) return false;
      const cs = getComputedStyle(this.containerElDiv);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (this.containerElDiv.offsetWidth === 0 || this.containerElDiv.offsetHeight === 0) return false;
      const rects = this.containerElDiv.getClientRects();
      return rects.length > 0;
    } catch {
      return true;
    }
  }
  setSuspended(suspend) {
    if (this.isSuspended === suspend) return;
    this.isSuspended = suspend;
    if (suspend) {
      this.hideAddButton();
    } else {
      if (this.pendingDirty || !this.jm) {
        this.pendingDirty = false;
        this.refresh().catch(() => {
        });
      } else {
        try {
          this.jm && this.jm.resize && this.jm.resize();
        } catch {
        }
        this.buttons.updatePosition();
      }
    }
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
    try {
      const styleId = "obsidian-jsmind-toolbar-style";
      if (!document.getElementById(styleId)) {
        const st = document.createElement("style");
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
      const popupCssId = "obsidian-jsmind-popup-style";
      if (!document.getElementById(popupCssId)) {
        const st2 = document.createElement("style");
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
      const smoothId = "obsidian-jsmind-smooth-scroll-style";
      if (!document.getElementById(smoothId)) {
        const st3 = document.createElement("style");
        st3.id = smoothId;
        st3.textContent = `
          /* Enable smooth programmatic scrolling */
          #jsmind_container { scroll-behavior: smooth; }
          .jsmind-inner { scroll-behavior: smooth; }
          /* Content node visuals: no box, only a bottom line */
          jmnode.mm-content-node { background: transparent !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; padding: 0 2px 2px 2px; }
          jmnode.mm-content-node { border-bottom: 1px solid var(--background-modifier-border); }
        `;
        document.head.appendChild(st3);
      }
      ensureThemeCssInjected(document);
      this.injectContentNodeOverrideCss();
    } catch {
    }
    const toolbar = this.contentEl.createDiv({ cls: "mm-toolbar" });
    const refreshBtn = toolbar.createEl("button", { text: "Refresh" });
    const followBtn = toolbar.createEl("button", { text: "Follow Scroll" });
    const includeWrap = toolbar.createEl("label");
    includeWrap.style.display = "flex";
    includeWrap.style.alignItems = "center";
    includeWrap.style.gap = "6px";
    const includeCb = includeWrap.createEl("input", { type: "checkbox" });
    includeCb.checked = !!this.plugin.settings?.includeContent;
    includeWrap.createSpan({ text: "Include content (ul/ol)" });
    const container = this.contentEl.createDiv();
    container.id = "jsmind_container";
    container.style.width = "100%";
    container.style.flex = "1 1 auto";
    container.style.height = "100%";
    container.style.minHeight = "400px";
    container.style.position = "relative";
    this.containerElDiv = container;
    this.popup.containerElDiv = this.containerElDiv;
    this.buttons.containerElDiv = this.containerElDiv;
    refreshBtn.addEventListener("click", () => this.refresh());
    followBtn.addEventListener("click", () => {
      this.forceEnterScroll();
    });
    includeCb.addEventListener("change", async () => {
      try {
        this.plugin.settings.includeContent = !!includeCb.checked;
        await this.plugin.saveData({ collapsedByFile: this.plugin.collapsedByFile, autoFollow: this.plugin.settings.autoFollow, theme: this.plugin.settings.theme, enablePopup: this.plugin.settings.enablePopup, includeContent: this.plugin.settings.includeContent });
        await this.refresh();
      } catch {
      }
    });
    try {
      await this.ensureJsMindLoaded();
    } catch (e) {
      new import_obsidian2.Notice("Failed to load jsMind. Check network/CSP. Retrying with fallback...");
      try {
        await this.ensureJsMindLoaded(true);
      } catch (err) {
        new import_obsidian2.Notice("jsMind could not be loaded. Mindmap disabled.");
        return;
      }
    }
    await this.refresh();
    this.popup.jm = this.jm;
    this.buttons.jm = this.jm;
    try {
      const ro = new ResizeObserver(() => {
        if (this.jm) {
          try {
            this.jm.resize && this.jm.resize();
          } catch {
          }
        }
        this.buttons.updatePosition();
      });
      if (this.containerElDiv) ro.observe(this.containerElDiv);
      this.register(() => ro.disconnect());
    } catch {
    }
    try {
      if (this.containerElDiv) {
        const iv = new IntersectionObserver((entries) => {
          const ent = entries[0];
          if (!ent) return;
          const visible = ent.isIntersecting && ent.intersectionRatio > 0;
          this.setSuspended(!visible);
        }, { root: this.containerElDiv.parentElement || void 0 });
        iv.observe(this.containerElDiv);
        this.register(() => iv.disconnect());
      }
      this.registerEvent(this.app.workspace.on("layout-change", () => {
        const visible = this.isViewVisible();
        this.setSuspended(!visible);
      }));
    } catch {
    }
    this.attachEditorSync();
    this.registerEvent(this.app.vault.on("modify", async (file) => {
      if (this.file && file.path === this.file.path) {
        if (this.isSuspended || !this.isViewVisible()) {
          this.pendingDirty = true;
          return;
        }
        await this.softSyncFromDisk();
      }
    }));
    this.registerEvent(this.app.workspace.on("file-open", async (file) => {
      if (!file) return;
      try {
        const ext = file.extension || (file.name?.split(".").pop() ?? "");
        if (ext.toLowerCase() === "md" && file.path !== this.file?.path) {
          await this.setFile(file);
          try {
            this.attachEditorSync();
          } catch {
          }
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
            try {
              this.attachEditorSync();
            } catch {
            }
          }
        }
      } catch {
      }
    }));
  }
  async setFile(file) {
    this.file = file;
    this.lastSyncedNodeId = null;
    this.forceEnterScroll();
    if (this.containerElDiv) await this.refresh();
    this.popup.file = this.file;
    this.buttons.file = this.file;
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
    if (this.isSuspended || !this.isViewVisible()) {
      this.pendingDirty = true;
      return;
    }
    this.hideAddButton();
    const prevSelectedId = (() => {
      try {
        return this.jm?.get_selected_node?.()?.id ?? null;
      } catch {
        return null;
      }
    })();
    this.prevViewport = this.captureViewport();
    const content = await this.app.vault.read(this.file);
    this.lastFileContent = content;
    this.popup.lastFileContent = this.lastFileContent;
    this.headingsCache = computeHeadingSections(content);
    this.popup.headingsCache = this.headingsCache;
    this.rebuildStableKeyIndex();
    const includeContent = !!this.plugin.settings?.includeContent;
    let mind;
    if (includeContent) {
      const built = buildJsMindTreeWithContent(this.headingsCache, this.file.name, content, true);
      mind = built.mind;
      this.contentParentMap = built.contentParentMap;
    } else {
      mind = buildJsMindTreeFromHeadings(this.headingsCache, this.file.name);
      this.contentParentMap = /* @__PURE__ */ new Map();
    }
    if (!this.containerElDiv || !window.jsMind) return;
    this.containerElDiv.empty();
    this.containerElDiv.id = "jsmind_container";
    const themeKey = this.plugin.settings?.theme || "default";
    const options = { container: "jsmind_container", theme: getJsMindThemeNameFromSetting(themeKey), editable: true, mode: "side", view: { engine: "svg", expander_style: "number", draggable: false, line_width: 1 } };
    options.view.custom_node_render = (jm, ele, node) => {
      try {
        const id = String(node?.id ?? "");
        if (id.startsWith("c_")) {
          ele.textContent = String(node?.topic ?? "");
          ele.classList.add("mm-content-node");
          return true;
        }
      } catch {
      }
      return false;
    };
    this.jm = new window.jsMind(options);
    this.wrapCenterRootIfNeeded();
    this.allowCenterRoot = false;
    this.jm.show(mind);
    try {
      ensureThemeCssInjected(document);
    } catch {
    }
    try {
      this.injectContentNodeOverrideCss();
    } catch {
    }
    this.restoreViewport(this.prevViewport);
    if (prevSelectedId) {
      try {
        this.jm.select_node(prevSelectedId);
      } finally {
      }
    }
    try {
      this.jm.expand_all && this.jm.expand_all();
    } catch {
    }
    try {
      const path = this.file?.path ?? "";
      const collapsedSet = this.plugin.getCollapsedSet?.(path);
      if (collapsedSet && collapsedSet.size > 0) {
        for (const key of collapsedSet) {
          const id = this.stableKeyToId.get(key);
          if (!id) continue;
          try {
            this.jm.collapse_node && this.jm.collapse_node(id);
          } catch {
          }
        }
      }
    } catch {
    }
    try {
      this.jm.resize && this.jm.resize();
    } catch {
    }
    try {
      ensureThemeCssInjected(document);
    } catch {
    }
    try {
      this.injectContentNodeOverrideCss();
    } catch {
    }
    try {
      const attachSelectionSync = () => {
        if (this.jm && typeof this.jm.add_event_listener === "function") {
          this.jm.add_event_listener((type, data) => {
            const evt = this.getJsMindEventName(type, data);
            const nodeIdFromEvent = this.getEventNodeId(data);
            if (evt === "select_node" && nodeIdFromEvent) {
              return;
            }
            if ((evt === "edit" || evt === "update_node" || evt === "nodechanged" || evt === "topic_change" || evt === "textedit") && nodeIdFromEvent) {
              if (this.isContentNode(nodeIdFromEvent)) return;
              if (!this.isActiveLeafMindmapView()) return;
              if (!this.isMindmapEditingActive()) return;
              const nodeId = nodeIdFromEvent;
              const newTitle = this.getEventNodeTopic(data).toString();
              this.renameHeadingInFile(nodeId, newTitle).catch(() => {
              });
            }
            if (evt === "select_clear") {
              this.enterScroll();
              this.hideAddButton();
            }
            if (nodeIdFromEvent) {
              if (this.isContentNode(nodeIdFromEvent)) return;
              const key = this.idToStableKey.get(nodeIdFromEvent);
              if (key) {
                if (evt === "collapse_node" || evt === "collapse") {
                  try {
                    this.plugin.markCollapsed?.(this.file?.path ?? "", key);
                  } catch {
                  }
                }
                if (evt === "expand_node" || evt === "expand") {
                  try {
                    this.plugin.unmarkCollapsed?.(this.file?.path ?? "", key);
                  } catch {
                  }
                }
              }
            }
          });
        }
        if (this.containerElDiv) {
          const nodesContainer = this.containerElDiv.querySelector("jmnodes") || this.containerElDiv;
          const handler = (ev) => {
            if (!this.isActiveLeafMindmapView()) return;
            const t = ev.target;
            const nodeEl = t && (t.closest ? t.closest("jmnode") : null);
            const nodeId = nodeEl?.getAttribute("nodeid") || "";
            if (nodeId) {
              if (this.isMindmapEditingActive()) return;
              this.enterPreview();
              if (this.revealTimeoutId != null) window.clearTimeout(this.revealTimeoutId);
              this.revealTimeoutId = window.setTimeout(() => {
                if (Date.now() - this.lastDblClickAtMs < 350) return;
                if (this.isContentNode(nodeId)) {
                  this.hideAddButton();
                } else {
                  const targetId = this.resolveHeadingId(nodeId);
                  if (targetId) {
                    this.revealHeadingById(targetId, { focusEditor: true, activateLeaf: true });
                    if (targetId === nodeId) this.showAddButton(targetId);
                    else this.hideAddButton();
                    this.lastSyncedNodeId = targetId;
                  }
                }
                this.revealTimeoutId = null;
              }, 200);
            }
          };
          const overHandler = (ev) => {
            if (!this.plugin.settings?.enablePopup) return;
            const t = ev.target;
            const nodeEl = t && (t.closest ? t.closest("jmnode") : null);
            const nodeId = nodeEl?.getAttribute("nodeid") || "";
            if (!nodeId) return;
            if (this.isMindmapEditingActive()) return;
            if (this.popup.hoverHideTimeoutId != null) {
              try {
                window.clearTimeout(this.popup.hoverHideTimeoutId);
              } catch {
              }
              this.popup.hoverHideTimeoutId = null;
            }
            this.showHoverPopup(nodeId);
          };
          const outHandler = (ev) => {
            if (!this.plugin.settings?.enablePopup) return;
            const t = ev.target;
            const nodeEl = t && (t.closest ? t.closest("jmnode") : null);
            if (!nodeEl) return;
            const rel = ev.relatedTarget;
            if (rel && this.popup.hoverPopupEl && (rel === this.popup.hoverPopupEl || this.popup.hoverPopupEl.contains(rel))) return;
            if (rel && (rel === nodeEl || nodeEl.contains(rel))) return;
            if (this.popup.hoverHideTimeoutId != null) {
              try {
                window.clearTimeout(this.popup.hoverHideTimeoutId);
              } catch {
              }
            }
            this.popup.hoverHideTimeoutId = window.setTimeout(() => {
              this.popup.hoverHideTimeoutId = null;
              if (this.popup.hoverPopupEl && this.popup.hoverPopupEl.matches(":hover")) return;
              this.hideHoverPopup();
            }, 180);
          };
          nodesContainer.addEventListener("click", handler);
          const blankHandler = (ev) => {
            const t = ev.target;
            const isNode = !!(t && (t.closest ? t.closest("jmnode") : null));
            if (!isNode) this.forceEnterScroll();
          };
          nodesContainer.addEventListener("mousedown", blankHandler, true);
          if (this.plugin.settings?.enablePopup) {
            nodesContainer.addEventListener("mouseover", overHandler);
            nodesContainer.addEventListener("mouseout", outHandler);
          }
          const dblHandler = (_ev) => {
            this.lastDblClickAtMs = Date.now();
            if (this.revealTimeoutId != null) {
              window.clearTimeout(this.revealTimeoutId);
              this.revealTimeoutId = null;
            }
          };
          nodesContainer.addEventListener("dblclick", dblHandler);
          this.register(() => nodesContainer && nodesContainer.removeEventListener("click", handler));
          if (this.plugin.settings?.enablePopup) {
            this.register(() => nodesContainer && nodesContainer.removeEventListener("mouseover", overHandler));
            this.register(() => nodesContainer && nodesContainer.removeEventListener("mouseout", outHandler));
          }
          this.register(() => nodesContainer && nodesContainer.removeEventListener("dblclick", dblHandler));
        }
      };
      attachSelectionSync();
    } catch {
    }
  }
  async softSyncFromDisk() {
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
  async applyHeadingsDiff(prev, next) {
    if (!this.jm) return;
    const prevMap = new Map(prev.map((h) => [h.id, h]));
    const nextMap = new Map(next.map((h) => [h.id, h]));
    const firstPrevH1 = prev.find((h) => h.level === 1) ?? null;
    const firstNextH1 = next.find((h) => h.level === 1) ?? null;
    const rootId = firstPrevH1 ? firstPrevH1.id : `virtual_root_${this.file?.name}`;
    const getPrevDepth = (h) => {
      let depth = 0;
      let cur = h;
      while (cur && cur.parentId) {
        depth += 1;
        cur = prevMap.get(cur.parentId);
      }
      return depth;
    };
    const toRemove = prev.filter((h) => !nextMap.has(h.id)).sort((a, b) => getPrevDepth(b) - getPrevDepth(a));
    for (const oldH of toRemove) {
      try {
        const exists = this.jm.get_node ? this.jm.get_node(oldH.id) : null;
        if (exists) {
          try {
            this.jm.remove_node(oldH.id);
          } catch {
          }
        }
      } catch {
      }
    }
    const getNextDepth = (h) => {
      let depth = 0;
      let cur = h;
      while (cur && cur.parentId) {
        depth += 1;
        cur = nextMap.get(cur.parentId);
      }
      return depth;
    };
    const resolveExistingParentId = (h) => {
      let ancestorId = h.parentId ?? null;
      let guard = 0;
      while (ancestorId && guard++ < 100) {
        try {
          const exists = this.jm.get_node ? this.jm.get_node(ancestorId) : null;
          if (exists) return ancestorId;
        } catch {
        }
        const ancestor = nextMap.get(ancestorId);
        if (!ancestor) break;
        ancestorId = ancestor.parentId ?? null;
      }
      return rootId;
    };
    const toAdd = next.filter((h) => !prevMap.has(h.id)).sort((a, b) => getNextDepth(a) - getNextDepth(b));
    for (const newH of toAdd) {
      const parentKey = resolveExistingParentId(newH);
      try {
        this.jm.add_node(parentKey, newH.id, newH.title && newH.title.trim() ? newH.title : "\u65B0\u6807\u9898");
      } catch {
      }
    }
    for (const newH of next) {
      const existed = prevMap.get(newH.id);
      if (!existed) continue;
      if (existed.title !== newH.title) {
        try {
          this.jm.update_node(newH.id, newH.title && newH.title.trim() ? newH.title : "\u65B0\u6807\u9898");
        } catch {
        }
      }
      const oldParent = existed.parentId ?? (firstPrevH1 ? firstPrevH1.id : rootId);
      const newParentDesired = newH.parentId ?? (firstNextH1 ? firstNextH1.id : rootId);
      if (oldParent !== newParentDesired) {
        const parentKey = resolveExistingParentId(newH);
        try {
          const exists = this.jm.get_node ? this.jm.get_node(newH.id) : null;
          if (exists) {
            try {
              this.jm.remove_node(newH.id);
            } catch {
            }
          }
          try {
            this.jm.add_node(parentKey, newH.id, newH.title && newH.title.trim() ? newH.title : "\u65B0\u6807\u9898");
          } catch {
          }
        } catch {
        }
      }
    }
    try {
      const sel = this.jm.get_selected_node?.();
      const selId = sel?.id;
      if (selId && nextMap.has(selId)) {
        try {
          this.jm.select_node(selId);
        } catch {
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
  rebuildStableKeyIndex() {
    try {
      this.idToStableKey.clear();
      this.stableKeyToId.clear();
      const byId = new Map(this.headingsCache.map((h) => [h.id, h]));
      const childrenByParent = /* @__PURE__ */ new Map();
      for (const h of this.headingsCache) {
        const p = h.parentId ?? null;
        if (!childrenByParent.has(p)) childrenByParent.set(p, []);
        childrenByParent.get(p).push(h);
      }
      for (const [p, arr] of childrenByParent) {
        arr.sort((a, b) => a.start - b.start);
      }
      const computeKey = (h) => {
        const chain = [];
        let cur = h;
        while (cur) {
          const parent = cur.parentId ? byId.get(cur.parentId) ?? null : null;
          const siblings = childrenByParent.get(cur.parentId ?? null) ?? [];
          const idx = Math.max(0, siblings.findIndex((x) => x.id === cur.id));
          chain.push(idx);
          cur = parent;
        }
        chain.reverse();
        return chain.join(".") || "0";
      };
      for (const h of this.headingsCache) {
        const key = computeKey(h);
        this.idToStableKey.set(h.id, key);
        this.stableKeyToId.set(key, h.id);
      }
    } catch {
    }
  }
  async revealHeadingById(nodeId, opts) {
    if (!this.file) return;
    try {
      const focusEditor = opts?.focusEditor !== false;
      const activateLeaf = opts?.activateLeaf !== false;
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
      const activeMd = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
      const from = { line: target.lineStart, ch: chStart };
      const to = { line: target.lineStart, ch: chEnd };
      if (activeMd?.file?.path === this.file.path) {
        const editor = activeMd.editor;
        try {
          if (activateLeaf) this.app.workspace.revealLeaf(activeMd.leaf);
        } catch {
        }
        try {
          if (focusEditor) editor.focus?.();
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
            if (activateLeaf) this.app.workspace.setActiveLeaf(leaf, { focus: !!focusEditor });
          } catch {
          }
          try {
            if (activateLeaf) this.app.workspace.revealLeaf(leaf);
          } catch {
          }
          try {
            if (focusEditor) editor.focus?.();
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
      const targetId = this.resolveHeadingId(nodeId) || nodeId;
      const node = this.jm.get_node ? this.jm.get_node(targetId) : null;
      if (this.jm.select_node) this.jm.select_node(targetId);
      const allowCenter = !!(center && node && this.shouldCenterOnMarkdownSelection());
      if (allowCenter) {
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
          this.allowCenterRoot = false;
        }, 30);
      }
    } catch {
    }
  }
  ensureMindmapNodeVisible(nodeId) {
    try {
      if (!this.jm || !this.containerElDiv) return;
      const node = this.jm.get_node ? this.jm.get_node(this.resolveHeadingId(nodeId) || nodeId) : null;
      if (!node) return;
      const actualId = this.resolveHeadingId(nodeId) || nodeId;
      const nodeEl = this.containerElDiv.querySelector(`jmnode[nodeid="${actualId}"]`);
      if (!nodeEl) return;
      const hostRect = this.containerElDiv.getBoundingClientRect();
      const rect = nodeEl.getBoundingClientRect();
      const margin = 8;
      const fullyOffLeft = rect.right < hostRect.left + margin;
      const fullyOffRight = rect.left > hostRect.right - margin;
      const fullyOffTop = rect.bottom < hostRect.top + margin;
      const fullyOffBottom = rect.top > hostRect.bottom - margin;
      const fullyOffscreen = fullyOffLeft || fullyOffRight || fullyOffTop || fullyOffBottom;
      let nudged = false;
      const clippedLeft = rect.left < hostRect.left + margin;
      const clippedRight = rect.right > hostRect.right - margin;
      if (!fullyOffscreen && (clippedLeft || clippedRight)) {
        const overflowLeft = clippedLeft ? hostRect.left + margin - rect.left : 0;
        const overflowRight = clippedRight ? rect.right - (hostRect.right - margin) : 0;
        const maxNudge = 60;
        let deltaX = 0;
        if (overflowRight > 0) deltaX += Math.min(overflowRight, maxNudge);
        if (overflowLeft > 0) deltaX -= Math.min(overflowLeft, maxNudge);
        const el = this.containerElDiv;
        if (typeof el.scrollLeft === "number" && deltaX !== 0) {
          try {
            el.scrollLeft += deltaX;
            nudged = true;
          } catch {
          }
        }
      }
      if (!nudged && fullyOffscreen) {
        this.allowCenterRoot = true;
        try {
          this.jm.center_node && this.jm.center_node(node);
        } catch {
        }
        try {
          this.jm.view && this.jm.view.center_node && this.jm.view.center_node(node);
        } catch {
        }
        this.allowCenterRoot = false;
      }
    } catch {
    }
  }
  attachEditorSync() {
    const trySync = async () => {
      if (!this.file) return;
      if (!this.isActiveMarkdownForThisFile()) return;
      const activeMd = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
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
        const center = this.shouldCenterOnMarkdownSelection();
        const shouldSelectMindmap = this.shouldFollowScroll() || this.shouldCenterOnMarkdownSelection();
        if (shouldSelectMindmap) {
          this.selectMindmapNodeById(current.id, center);
          this.lastSyncedNodeId = current.id;
        }
        if (this.shouldFollowScroll()) this.ensureMindmapNodeVisible(current.id);
        this.hideAddButton();
      }
    };
    this.registerEvent(this.app.workspace.on("editor-change", (editor, mdView) => {
      if (!this.file) return;
      if (!this.isActiveMarkdownForThisFile()) return;
      if (mdView?.file?.path === this.file.path) {
        trySync();
      }
    }));
    if (this.containerElDiv) {
      const scrollHandler = () => this.buttons.updatePosition();
      this.containerElDiv.addEventListener("scroll", scrollHandler);
      this.register(() => this.containerElDiv && this.containerElDiv.removeEventListener("scroll", scrollHandler));
    }
    const attachScrollSync = () => {
      try {
        if (this.scrollSyncEl && this.scrollSyncHandler) {
          this.scrollSyncEl.removeEventListener("scroll", this.scrollSyncHandler);
        }
      } catch {
      }
      const activeMd = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
      if (!this.isActiveMarkdownForThisFile()) return;
      if (!activeMd) return;
      const scroller = activeMd.contentEl?.querySelector?.(".cm-scroller");
      if (!scroller) return;
      try {
        const cmRoot = activeMd.contentEl?.querySelector?.(".cm-editor");
        if (cmRoot) {
          const onEditMouseDown = () => {
            this.enterEdit();
          };
          const onEditMouseUp = () => {
            const run = () => {
              try {
                trySync();
              } catch {
              }
            };
            if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
            else setTimeout(run, 0);
          };
          cmRoot.addEventListener("mousedown", onEditMouseDown, true);
          cmRoot.addEventListener("mouseup", onEditMouseUp, true);
          this.register(() => {
            try {
              cmRoot.removeEventListener("mousedown", onEditMouseDown, true);
            } catch {
            }
            try {
              cmRoot.removeEventListener("mouseup", onEditMouseUp, true);
            } catch {
            }
          });
        }
      } catch {
      }
      const scheduleRun = () => {
        const run = () => {
          try {
            if (!this.isAutoFollowEnabled()) return;
            if (!this.file || activeMd.file?.path !== this.file.path) return;
            const editor = activeMd.editor;
            const content = editor.getValue();
            const headings = computeHeadingSections(content);
            if (headings.length === 0) return;
            let best = null;
            const cmAny = editor?.cm;
            const scRect = scroller.getBoundingClientRect();
            if (cmAny) {
              let posRes = null;
              if (typeof cmAny.posAtCoords === "function") {
                posRes = cmAny.posAtCoords({ x: scRect.left + 16, y: scRect.top + 1 });
              } else if (cmAny.view && typeof cmAny.view.posAtCoords === "function") {
                posRes = cmAny.view.posAtCoords({ x: scRect.left + 16, y: scRect.top + 1 });
              }
              const pos = typeof posRes === "number" ? posRes : posRes && typeof posRes.pos === "number" ? posRes.pos : null;
              const doc = cmAny?.state?.doc ?? cmAny?.view?.state?.doc;
              if (pos != null && doc?.lineAt) {
                try {
                  const lineNo = doc.lineAt(pos).number - 1;
                  for (const h of headings) {
                    if (h.lineStart >= lineNo) {
                      best = h;
                      break;
                    }
                  }
                } catch {
                }
              }
            }
            if (!best) {
              const cm5 = cmAny;
              if (cm5?.coordsChar) {
                const p = cm5.coordsChar({ left: scRect.left + 16, top: scRect.top + 1 }, "window");
                if (p && typeof p.line === "number") {
                  for (const h of headings) {
                    if (h.lineStart >= p.line) {
                      best = h;
                      break;
                    }
                  }
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
          } catch {
          }
        };
        if (typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(run);
        } else {
          setTimeout(run, 50);
        }
      };
      const onScroll = () => {
        if (!this.isAutoFollowEnabled()) return;
        if (!this.file || activeMd.file?.path !== this.file.path) return;
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
            this.register(() => {
              if (this.scrollSyncPendingTimeoutId != null) {
                try {
                  window.clearTimeout(this.scrollSyncPendingTimeoutId);
                } catch {
                }
                this.scrollSyncPendingTimeoutId = null;
              }
            });
          }
        }
      };
      scroller.addEventListener("scroll", onScroll);
      this.scrollSyncEl = scroller;
      this.scrollSyncHandler = onScroll;
      this.register(() => scroller && scroller.removeEventListener("scroll", onScroll));
    };
    attachScrollSync();
  }
  showAddButton(nodeId) {
    this.buttons.show(nodeId);
  }
  hideAddButton() {
    this.buttons.hide();
  }
  async addChildUnder(nodeId) {
    await this.buttons.addChildUnder(nodeId);
  }
  // moved into tools
  // moved into tools
  // moved into tools
  // moved into tools
  showHoverPopup(nodeId) {
    this.popup.show(nodeId);
  }
  hideHoverPopup() {
    this.popup.hide();
  }
  async deleteHeadingById(nodeId) {
    if (!this.file) return;
    try {
      const content = await this.app.vault.read(this.file);
      const headings = computeHeadingSections(content);
      const target = headings.find((h) => h.id === nodeId);
      if (!target) return;
      const start = target.start;
      const end = Math.min(target.end + 1, content.length);
      const updated = content.slice(0, start) + content.slice(end);
      await this.app.vault.modify(this.file, updated);
      new import_obsidian2.Notice("Node deleted");
      const newHeadings = computeHeadingSections(updated);
      const parentId = target.parentId;
      if (parentId && newHeadings.find((h) => h.id === parentId)) {
        this.showAddButton(parentId);
      } else {
        this.hideAddButton();
      }
    } catch {
    }
  }
  async renameHeadingInFile(nodeId, nextTitleRaw) {
    if (!this.file) return;
    const safeTitle = nextTitleRaw && nextTitleRaw.trim() ? nextTitleRaw.trim() : "\u65B0\u6807\u9898";
    try {
      const content = await this.app.vault.read(this.file);
      const lines = content.split("\n");
      const headings = computeHeadingSections(content);
      const target = headings.find((h) => h.id === nodeId);
      if (!target) return;
      const lineIdx = target.lineStart;
      if (lineIdx < 0 || lineIdx >= lines.length) return;
      let nextLine = lines[lineIdx];
      if (target.style === "atx") {
        const original = lines[lineIdx] ?? "";
        const m = original.match(/^(#{1,6})([ \t]+)(.*?)([ \t#]*)$/);
        if (m) {
          const leading = m[1] + m[2];
          const trailing = m[4] ?? "";
          nextLine = `${leading}${safeTitle}${trailing}`;
        } else {
          const hashes = "#".repeat(Math.min(Math.max(target.level, 1), 6));
          nextLine = `${hashes} ${safeTitle}`;
        }
      } else {
        nextLine = safeTitle;
      }
      if (lines[lineIdx] === nextLine) return;
      lines[lineIdx] = nextLine;
      const updated = lines.join("\n");
      await this.app.vault.modify(this.file, updated);
      if (this.jm && nextTitleRaw.trim().length === 0) {
        try {
          this.jm.update_node(nodeId, safeTitle);
        } catch {
        }
      }
    } catch {
    }
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
  isActiveLeafMindmapView() {
    try {
      const activeLeaf = this.app.workspace.activeLeaf;
      return !!(activeLeaf && activeLeaf.view === this);
    } catch {
    }
    return false;
  }
  isActiveMarkdownForThisFile() {
    try {
      const mv = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
      if (!mv) return false;
      return !!(mv.file && this.file && mv.file.path === this.file.path);
    } catch {
    }
    return false;
  }
  isAutoFollowEnabled() {
    try {
      return this.plugin.settings?.autoFollow === true;
    } catch {
    }
    return false;
  }
  injectContentNodeOverrideCss() {
    try {
      const id = "obsidian-jsmind-content-node-override";
      let el = document.getElementById(id);
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
        }
      `;
      if (!el) {
        el = document.createElement("style");
        el.id = id;
        el.textContent = css;
        document.head.appendChild(el);
      } else {
        el.textContent = css;
      }
    } catch {
    }
  }
};
var MindmapPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.collapsedByFile = {};
    this.settings = { autoFollow: true, theme: "default", enablePopup: true, includeContent: false };
  }
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
    try {
      const data = await this.loadData();
      if (data && typeof data === "object") {
        if (typeof data.autoFollow === "boolean") this.settings.autoFollow = data.autoFollow;
        if (data.theme) this.settings.theme = data.theme;
        if (typeof data.enablePopup === "boolean") this.settings.enablePopup = data.enablePopup;
        if (typeof data.includeContent === "boolean") this.settings.includeContent = data.includeContent;
      }
      if (data && typeof data === "object" && data.collapsedByFile) {
        const raw = data.collapsedByFile;
        const cleaned = {};
        for (const [fp, arr] of Object.entries(raw)) {
          if (Array.isArray(arr)) {
            const uniq = Array.from(new Set(arr.filter((v) => typeof v === "string" && v.length > 0)));
            if (uniq.length > 0) cleaned[fp] = uniq;
          }
        }
        this.collapsedByFile = cleaned;
      }
    } catch {
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
          new import_obsidian2.Notice("No active file");
          return;
        }
        const leaf = this.app.workspace.getRightLeaf(false);
        if (!leaf) return;
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
    this.addSettingTab(new MindmapSettingTab(this.app, this));
  }
  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP).forEach((leaf) => leaf.detach());
  }
  getCollapsedSet(filePath) {
    const arr = this.collapsedByFile[filePath] || [];
    return new Set(arr);
  }
  async markCollapsed(filePath, nodeId) {
    const set = this.getCollapsedSet(filePath);
    set.add(nodeId);
    if (set.size > 0) {
      this.collapsedByFile[filePath] = Array.from(set);
    } else {
      delete this.collapsedByFile[filePath];
    }
    await this.saveData({ collapsedByFile: this.collapsedByFile, autoFollow: this.settings.autoFollow });
  }
  async unmarkCollapsed(filePath, nodeId) {
    const set = this.getCollapsedSet(filePath);
    set.delete(nodeId);
    if (set.size > 0) {
      this.collapsedByFile[filePath] = Array.from(set);
    } else {
      delete this.collapsedByFile[filePath];
    }
    await this.saveData({ collapsedByFile: this.collapsedByFile, autoFollow: this.settings.autoFollow });
  }
};
var MindmapSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "Mindmap (jsMind) Settings" });
    new import_obsidian2.Setting(containerEl).setName("Auto follow editor scroll").setDesc("When scrolling markdown, select the top heading in mindmap").addToggle((t) => t.setValue(this.plugin.settings.autoFollow).onChange(async (v) => {
      this.plugin.settings.autoFollow = v;
      await this.plugin.saveData({ collapsedByFile: this.plugin.collapsedByFile, autoFollow: this.plugin.settings.autoFollow, theme: this.plugin.settings.theme, enablePopup: this.plugin.settings.enablePopup });
    }));
    new import_obsidian2.Setting(containerEl).setName("Theme").setDesc("Choose node background theme (supports light/dark)").addDropdown((dd) => {
      for (const opt of THEME_OPTIONS) {
        dd.addOption(opt.key, opt.label);
      }
      dd.setValue(this.plugin.settings.theme);
      dd.onChange(async (val) => {
        this.plugin.settings.theme = val;
        await this.plugin.saveData({ collapsedByFile: this.plugin.collapsedByFile, autoFollow: this.plugin.settings.autoFollow, theme: this.plugin.settings.theme, enablePopup: this.plugin.settings.enablePopup });
        try {
          const leaves = this.app.workspace.getLeavesOfType("obsidian-jsmind-mindmap-view");
          for (const leaf of leaves) {
            const view = leaf.view;
            await view.refresh?.();
          }
        } catch {
        }
      });
    });
    new import_obsidian2.Setting(containerEl).setName("Show hover popup").setDesc("Show a Markdown preview popup when hovering a mindmap node").addToggle((t) => t.setValue(this.plugin.settings.enablePopup).onChange(async (v) => {
      this.plugin.settings.enablePopup = v;
      await this.plugin.saveData({ collapsedByFile: this.plugin.collapsedByFile, autoFollow: this.plugin.settings.autoFollow, theme: this.plugin.settings.theme, enablePopup: this.plugin.settings.enablePopup, includeContent: this.plugin.settings.includeContent });
      try {
        const leaves = this.app.workspace.getLeavesOfType("obsidian-jsmind-mindmap-view");
        for (const leaf of leaves) {
          const view = leaf.view;
          view.hideHoverPopup?.();
          await view.refresh?.();
        }
      } catch {
      }
    }));
    new import_obsidian2.Setting(containerEl).setName("Include content lists").setDesc("Add ul/ol list items as content nodes under headings").addToggle((t) => t.setValue(!!this.plugin.settings.includeContent).onChange(async (v) => {
      this.plugin.settings.includeContent = v;
      await this.plugin.saveData({ collapsedByFile: this.plugin.collapsedByFile, autoFollow: this.plugin.settings.autoFollow, theme: this.plugin.settings.theme, enablePopup: this.plugin.settings.enablePopup, includeContent: this.plugin.settings.includeContent });
      try {
        const leaves = this.app.workspace.getLeavesOfType("obsidian-jsmind-mindmap-view");
        for (const leaf of leaves) {
          const view = leaf.view;
          await view.refresh?.();
        }
      } catch {
      }
    }));
  }
};
//# sourceMappingURL=main.js.map
