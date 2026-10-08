// Element addressing, page outline, structured edit operations, undo stack.
// Elements are addressed by ephemeral ids stamped as data-pa attributes;
// these never survive a save (the serializer strips them).

export const ID_ATTR = 'data-pa';
export const EPHEMERAL_ATTR = 'data-pa-ephemeral';
export const EDITOR_SCRIPT_ATTR = 'data-pa-editor';
export const MANAGED_SCRIPT_ATTR = 'data-pa-script';
export const CONFIG_ID = 'pa-config';
export const STYLES_ID = 'page-styles';
export const OVERLAY_HOST_ID = 'pa-overlay-host';

let idCounter = 0;

export interface OpResult {
  ok: boolean;
  error?: string;
  warning?: string;
  /** ids of elements touched, for highlighting */
  changed?: string[];
}

export interface UndoEntry {
  label: string;
  undo(): void;
}

const undoStack: UndoEntry[] = [];
const MAX_UNDO = 200;
let dirtyListeners: Array<() => void> = [];

export function onMutation(fn: () => void): void {
  dirtyListeners.push(fn);
}

function notifyMutation(): void {
  for (const fn of dirtyListeners) fn();
}

export function pushUndo(entry: UndoEntry): void {
  undoStack.push(entry);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  notifyMutation();
}

export function undoDepth(): number {
  return undoStack.length;
}

export function undo(n = 1): number {
  let done = 0;
  while (n-- > 0) {
    const entry = undoStack.pop();
    if (!entry) break;
    try { entry.undo(); } catch { /* element may be gone; skip */ }
    done++;
  }
  if (done) notifyMutation();
  return done;
}

export function clearUndo(): void {
  undoStack.length = 0;
}

// ---------------------------------------------------------------------------
// Id tagging

export function isOverlayNode(el: Element): boolean {
  return el.id === OVERLAY_HOST_ID || !!el.closest(`#${OVERLAY_HOST_ID}`);
}

/** Stamp data-pa ids on every element in body + managed head items that lack one. */
export function tagPage(): void {
  tagTree(document.body);
}

export function tagTree(root: Element): void {
  if (isOverlayNode(root)) return;
  if (!root.hasAttribute(ID_ATTR)) root.setAttribute(ID_ATTR, `e${++idCounter}`);
  for (const el of Array.from(root.children)) tagTree(el);
}

export function getElement(id: string): Element | null {
  const el = document.querySelector(`[${ID_ATTR}="${CSS.escape(id)}"]`);
  return el && !isOverlayNode(el) ? el : null;
}

export function idOf(el: Element): string | null {
  return el.getAttribute(ID_ATTR);
}

// ---------------------------------------------------------------------------
// Outline

export interface OutlineOptions {
  maxDepth?: number;
  maxChildren?: number;
}

/** Token-lean, human-readable tree of the page for the model. */
export function pageOutline(opts: OutlineOptions = {}): string {
  tagPage();
  const { maxDepth = 6, maxChildren = 24 } = opts;
  const lines: string[] = [];
  walkOutline(document.body, 0, maxDepth, maxChildren, lines);
  return lines.join('\n');
}

export function elementOutline(el: Element, opts: OutlineOptions = {}): string {
  tagPage();
  const { maxDepth = 6, maxChildren = 40 } = opts;
  const lines: string[] = [];
  walkOutline(el, 0, maxDepth, maxChildren, lines);
  return lines.join('\n');
}

function walkOutline(el: Element, depth: number, maxDepth: number, maxChildren: number, out: string[]): void {
  if (isOverlayNode(el)) return;
  const indent = '  '.repeat(depth);
  out.push(indent + describeElement(el));
  if (depth >= maxDepth) {
    if (el.children.length) out.push(`${indent}  … (${el.children.length} children, use read_element to expand)`);
    return;
  }
  const kids = Array.from(el.children).filter((c) => !isOverlayNode(c));
  kids.slice(0, maxChildren).forEach((c) => walkOutline(c, depth + 1, maxDepth, maxChildren, out));
  if (kids.length > maxChildren) out.push(`${indent}  … ${kids.length - maxChildren} more children`);
}

export function describeElement(el: Element): string {
  const id = el.getAttribute(ID_ATTR) ?? '?';
  let desc = `[${id}] <${el.tagName.toLowerCase()}`;
  if (el.id) desc += ` id="${el.id}"`;
  const cls = el.getAttribute('class');
  if (cls) desc += ` class="${cls}"`;
  desc += '>';
  const text = ownText(el);
  if (text) desc += ` "${text.length > 60 ? text.slice(0, 60) + '…' : text}"`;
  return desc;
}

function ownText(el: Element): string {
  let t = '';
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) t += n.textContent ?? '';
  }
  t = t.replace(/\s+/g, ' ').trim();
  if (!t && el.children.length === 0) t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return t;
}

// ---------------------------------------------------------------------------
// Protected elements

export function isProtected(el: Element): string | null {
  if (el.id === CONFIG_ID) return 'the page config block';
  if (el.hasAttribute(EDITOR_SCRIPT_ATTR)) return 'the editor script tag';
  if (el.id === OVERLAY_HOST_ID) return 'the editor overlay';
  if (el === document.body) return '<body> itself (edit its children instead)';
  if (el === document.documentElement || el === document.head) return 'the document root';
  return null;
}

function containsProtected(el: Element): string | null {
  const p = isProtected(el);
  if (p) return p;
  for (const child of Array.from(el.querySelectorAll('script, style'))) {
    const cp = isProtected(child);
    if (cp) return cp;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fragment parsing

export function parseFragment(html: string): DocumentFragment {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content;
}

// ---------------------------------------------------------------------------
// Edit operations (each validates target, records undo, flashes)

export function replaceElement(id: string, html: string): OpResult {
  const el = getElement(id);
  if (!el) return { ok: false, error: `No element with id "${id}". Call get_page_overview for current ids.` };
  const prot = containsProtected(el);
  if (prot) return { ok: false, error: `Refusing to replace ${prot}.` };
  const frag = parseFragment(html);
  const newNodes = Array.from(frag.childNodes);
  const parent = el.parentNode!;
  const anchor = el.nextSibling;
  parent.insertBefore(frag, el);
  el.remove();
  pushUndo({
    label: `replace ${id}`,
    undo() {
      parent.insertBefore(el, newNodes[0] ?? anchor);
      newNodes.forEach((n) => (n as ChildNode).remove());
    },
  });
  tagPage();
  const changed = newNodes.filter((n): n is Element => n.nodeType === 1).map((n) => idOf(n)!).filter(Boolean);
  flash(changed);
  return { ok: true, changed };
}

export type InsertPosition = 'before' | 'after' | 'prepend' | 'append';

export function insertHtml(targetId: string, position: InsertPosition, html: string): OpResult {
  const el = getElement(targetId);
  if (!el) return { ok: false, error: `No element with id "${targetId}".` };
  if ((position === 'before' || position === 'after') && isProtected(el) === '<body> itself (edit its children instead)') {
    return { ok: false, error: 'Cannot insert siblings of <body>; use prepend/append on body instead.' };
  }
  const frag = parseFragment(html);
  const newNodes = Array.from(frag.childNodes);
  if (!newNodes.length) return { ok: false, error: 'Empty HTML fragment.' };
  switch (position) {
    case 'before': el.before(frag); break;
    case 'after': el.after(frag); break;
    case 'prepend': el.prepend(frag); break;
    case 'append': el.append(frag); break;
    default: return { ok: false, error: `Bad position "${position}" (use before|after|prepend|append).` };
  }
  pushUndo({
    label: `insert near ${targetId}`,
    undo() { newNodes.forEach((n) => (n as ChildNode).remove()); },
  });
  tagPage();
  const changed = newNodes.filter((n): n is Element => n.nodeType === 1).map((n) => idOf(n)!).filter(Boolean);
  flash(changed);
  return { ok: true, changed };
}

export function removeElement(id: string): OpResult {
  const el = getElement(id);
  if (!el) return { ok: false, error: `No element with id "${id}".` };
  const prot = containsProtected(el);
  if (prot) return { ok: false, error: `Refusing to remove ${prot}.` };
  const parent = el.parentNode!;
  const anchor = el.nextSibling;
  el.remove();
  pushUndo({
    label: `remove ${id}`,
    undo() { parent.insertBefore(el, anchor); },
  });
  return { ok: true, changed: [] };
}

export function setAttributes(id: string, attrs: Record<string, string | null>): OpResult {
  const el = getElement(id);
  if (!el) return { ok: false, error: `No element with id "${id}".` };
  if (isProtected(el)) return { ok: false, error: `Refusing to modify ${isProtected(el)}.` };
  const prev: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (/^data-pa/.test(k)) return { ok: false, error: `Attribute "${k}" is reserved for the editor.` };
    prev[k] = el.getAttribute(k);
    if (v === null) el.removeAttribute(k);
    else el.setAttribute(k, v);
  }
  pushUndo({
    label: `attrs ${id}`,
    undo() {
      for (const [k, v] of Object.entries(prev)) {
        if (v === null) el.removeAttribute(k);
        else el.setAttribute(k, v);
      }
    },
  });
  flash([id]);
  return { ok: true, changed: [id] };
}

export function setText(id: string, text: string): OpResult {
  const el = getElement(id);
  if (!el) return { ok: false, error: `No element with id "${id}".` };
  if (isProtected(el)) return { ok: false, error: `Refusing to modify ${isProtected(el)}.` };
  const prevNodes = Array.from(el.childNodes);
  el.textContent = text;
  pushUndo({
    label: `text ${id}`,
    undo() {
      el.textContent = '';
      prevNodes.forEach((n) => el.appendChild(n));
    },
  });
  flash([id]);
  return { ok: true, changed: [id] };
}

// ---------------------------------------------------------------------------
// Managed stylesheet + scripts

export function getStylesEl(): HTMLStyleElement {
  let el = document.getElementById(STYLES_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLES_ID;
    document.head.appendChild(el);
  }
  return el;
}

export function readStyles(): string {
  return getStylesEl().textContent ?? '';
}

export function setStyles(css: string, append = false): OpResult {
  const el = getStylesEl();
  const prev = el.textContent ?? '';
  el.textContent = append ? prev + '\n' + css : css;
  pushUndo({ label: 'styles', undo() { el.textContent = prev; } });
  return { ok: true, changed: [] };
}

export function listManagedScripts(): Array<{ name: string; length: number }> {
  return Array.from(document.querySelectorAll(`script[${MANAGED_SCRIPT_ATTR}]`)).map((s) => ({
    name: s.getAttribute(MANAGED_SCRIPT_ATTR) ?? '',
    length: (s.textContent ?? '').length,
  }));
}

export function readManagedScript(name: string): string | null {
  const s = document.querySelector(`script[${MANAGED_SCRIPT_ATTR}="${CSS.escape(name)}"]`);
  return s ? s.textContent ?? '' : null;
}

/**
 * Create or update a managed script block. The code is stored in the page and
 * will run on next load; we also execute it now (fresh page loads behave the
 * same way) unless `deferExecution` is set.
 */
export function upsertScript(name: string, code: string): OpResult {
  if (!/^[\w-]+$/.test(name)) return { ok: false, error: 'Script name must be alphanumeric/dash/underscore.' };
  let s = document.querySelector(`script[${MANAGED_SCRIPT_ATTR}="${CSS.escape(name)}"]`);
  const prev = s ? s.textContent ?? '' : null;
  let warning: string | undefined;
  if (!s) {
    // New block: inserting it executes it (module, async) — exactly once.
    s = document.createElement('script');
    s.setAttribute(MANAGED_SCRIPT_ATTR, name);
    s.setAttribute('type', 'module');
    s.textContent = code;
    document.body.appendChild(s);
  } else {
    // Updating an already-started script never re-executes it, so run the
    // new code via a throwaway runner. It must stay in the DOM until module
    // evaluation happens; it's marked ephemeral so saves never include it.
    s.textContent = code;
    try {
      const runner = document.createElement('script');
      runner.type = 'module';
      runner.setAttribute(EPHEMERAL_ATTR, '1');
      runner.textContent = code;
      document.body.appendChild(runner);
      setTimeout(() => runner.remove(), 2000);
    } catch (e) {
      warning = `Script stored but failed to execute now: ${String(e)}`;
    }
  }
  const el = s;
  pushUndo({
    label: `script ${name}`,
    undo() {
      if (prev === null) el.remove();
      else el.textContent = prev;
    },
  });
  return { ok: true, warning, changed: [] };
}

export function removeManagedScript(name: string): OpResult {
  const s = document.querySelector(`script[${MANAGED_SCRIPT_ATTR}="${CSS.escape(name)}"]`);
  if (!s) return { ok: false, error: `No managed script named "${name}".` };
  const parent = s.parentNode!;
  const anchor = s.nextSibling;
  s.remove();
  pushUndo({ label: `rm script ${name}`, undo() { parent.insertBefore(s, anchor); } });
  return { ok: true, warning: 'Removed from the page; code it already ran this session is still in effect until reload.', changed: [] };
}

// ---------------------------------------------------------------------------
// Highlight flash

export function flash(ids: string[]): void {
  for (const id of ids) {
    const el = getElement(id);
    if (!(el instanceof HTMLElement)) continue;
    try {
      el.animate(
        [
          { boxShadow: '0 0 0 3px rgba(94, 161, 255, 0.9)', offset: 0 },
          { boxShadow: '0 0 0 3px rgba(94, 161, 255, 0)', offset: 1 },
        ],
        { duration: 1200, easing: 'ease-out' },
      );
    } catch { /* non-animatable */ }
  }
}

export function scrollToElement(id: string): void {
  const el = getElement(id);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
