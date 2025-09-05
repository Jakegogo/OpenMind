export type ThemeName = 'default' | 'fresh' | 'business' | 'nature' | 'elegant' | 'fashion' | 'minimal';

export const THEME_OPTIONS: Array<{ key: ThemeName; label: string }> = [
  { key: 'default', label: '默认' },
  { key: 'fresh', label: '清新' },
  { key: 'business', label: '商务' },
  { key: 'nature', label: '自然' },
  { key: 'elegant', label: '优雅' },
  { key: 'fashion', label: '时尚' },
  { key: 'minimal', label: '极简' },
];

export function getJsMindThemeNameFromSetting(theme: ThemeName): string {
  // Avoid colliding with jsMind's built-in 'default' semantics by mapping to a custom name
  if (theme === 'default') return 'obsidian';
  return theme;
}

export function ensureThemeCssInjected(doc: Document) {
  const id = 'obsidian-jsmind-themes';
  const existing = doc.getElementById(id) as HTMLStyleElement | null;
  if (existing) {
    existing.textContent = buildThemesCss();
    try { existing.parentElement?.removeChild(existing); } catch {}
    doc.head.appendChild(existing);
    return;
  }
  const st = doc.createElement('style');
  st.id = id;
  st.textContent = buildThemesCss();
  doc.head.appendChild(st);
}

function buildThemesCss(): string {
  // Background-only themes, light/dark aware. We do not touch text color or borders.
  // Each theme defines jmnode backgrounds for normal/root/selected states.
  const css: string[] = [];
  const push = (s: string) => css.push(s);

  // Default (映射为 theme-obsidian): 蓝色强调、纯色背景
  push(`
    body:not(.theme-dark) jmnodes.theme-obsidian jmnode { background: rgb(225, 235, 255) !important; background-color: rgb(225, 235, 255) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-obsidian jmnode { background: rgb(50, 70, 120) !important; background-color: rgb(50, 70, 120) !important; background-image: none !important; }
    body jmnodes.theme-obsidian jmnode.root { background: var(--interactive-accent) !important; background-color: var(--interactive-accent) !important; background-image: none !important; }
    body jmnodes.theme-obsidian jmnode.selected { background: var(--interactive-accent) !important; background-color: var(--interactive-accent) !important; background-image: none !important; }
  `);

  // Fresh (清新): teal/green
  push(`
    body:not(.theme-dark) jmnodes.theme-fresh jmnode { background: rgb(210, 246, 235) !important; background-color: rgb(210, 246, 235) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-fresh jmnode { background: rgb(30, 90, 75) !important; background-color: rgb(30, 90, 75) !important; background-image: none !important; }
    body jmnodes.theme-fresh jmnode.root { background: rgb(56, 217, 169) !important; background-color: rgb(56, 217, 169) !important; background-image: none !important; }
    body jmnodes.theme-fresh jmnode.selected { background: rgb(56, 217, 169) !important; background-color: rgb(56, 217, 169) !important; background-image: none !important; }
  `);

  // Business (商务): blue/gray
  push(`
    body:not(.theme-dark) jmnodes.theme-business jmnode { background: rgb(226, 235, 255) !important; background-color: rgb(226, 235, 255) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-business jmnode { background: rgb(35, 55, 100) !important; background-color: rgb(35, 55, 100) !important; background-image: none !important; }
    body jmnodes.theme-business jmnode.root { background: rgb(33, 99, 255) !important; background-color: rgb(33, 99, 255) !important; background-image: none !important; }
    body jmnodes.theme-business jmnode.selected { background: rgb(33, 99, 255) !important; background-color: rgb(33, 99, 255) !important; background-image: none !important; }
  `);

  // Nature (自然): green/olive
  push(`
    body:not(.theme-dark) jmnodes.theme-nature jmnode { background: rgb(226, 239, 223) !important; background-color: rgb(226, 239, 223) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-nature jmnode { background: rgb(40, 70, 40) !important; background-color: rgb(40, 70, 40) !important; background-image: none !important; }
    body jmnodes.theme-nature jmnode.root { background: rgb(97, 165, 90) !important; background-color: rgb(97, 165, 90) !important; background-image: none !important; }
    body jmnodes.theme-nature jmnode.selected { background: rgb(97, 165, 90) !important; background-color: rgb(97, 165, 90) !important; background-image: none !important; }
  `);

  // Elegant (优雅): purple
  push(`
    body:not(.theme-dark) jmnodes.theme-elegant jmnode { background: rgb(236, 226, 250) !important; background-color: rgb(236, 226, 250) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-elegant jmnode { background: rgb(60, 45, 85) !important; background-color: rgb(60, 45, 85) !important; background-image: none !important; }
    body jmnodes.theme-elegant jmnode.root { background: rgb(142, 84, 233) !important; background-color: rgb(142, 84, 233) !important; background-image: none !important; }
    body jmnodes.theme-elegant jmnode.selected { background: rgb(142, 84, 233) !important; background-color: rgb(142, 84, 233) !important; background-image: none !important; }
  `);

  // Fashion (时尚): pink/coral
  push(`
    body:not(.theme-dark) jmnodes.theme-fashion jmnode { background: rgb(255, 230, 238) !important; background-color: rgb(255, 230, 238) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-fashion jmnode { background: rgb(90, 35, 50) !important; background-color: rgb(90, 35, 50) !important; background-image: none !important; }
    body jmnodes.theme-fashion jmnode.root { background: rgb(255, 99, 132) !important; background-color: rgb(255, 99, 132) !important; background-image: none !important; }
    body jmnodes.theme-fashion jmnode.selected { background: rgb(255, 99, 132) !important; background-color: rgb(255, 99, 132) !important; background-image: none !important; }
  `);

  // Minimal (极简): neutral
  push(`
    body:not(.theme-dark) jmnodes.theme-minimal jmnode { background: rgb(238, 238, 238) !important; background-color: rgb(238, 238, 238) !important; background-image: none !important; }
    body.theme-dark jmnodes.theme-minimal jmnode { background: rgb(48, 48, 48) !important; background-color: rgb(48, 48, 48) !important; background-image: none !important; }
    body jmnodes.theme-minimal jmnode.root { background: var(--interactive-accent) !important; background-color: var(--interactive-accent) !important; background-image: none !important; }
    body jmnodes.theme-minimal jmnode.selected { background: var(--interactive-accent) !important; background-color: var(--interactive-accent) !important; background-image: none !important; }
  `);

  // Dark mode text color: force white for readability across all themes
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

  return css.join('\n');
}


