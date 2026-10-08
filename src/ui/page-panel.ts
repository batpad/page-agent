// Page panel: selection card, outline tree, raw CSS editor, managed scripts,
// plugin manager. Manual editing is first-class here — the agent is optional.

import { h, clear } from './h';
import type { UIContext } from './context';
import {
  describeElement, idOf, isOverlayNode, listManagedScripts,
  pushUndo, readStyles, removeElement, scrollToElement, setStyles, tagPage, undo, undoDepth,
} from '../core/dom';
import { getConfig, updateConfig, syncConfigElement } from '../core/config';
import { listPlugins, unregisterPlugin } from '../plugins/registry';
import { loadPlugin } from '../plugins/loader';
import { breadcrumb } from './inspector';

export interface PagePanel {
  el: HTMLElement;
  refresh(): void;
}

export function buildPagePanel(ui: UIContext): PagePanel {
  const selHolder = h('div');
  const tree = h('div', { className: 'tree' });
  const cssBox = h('textarea', { className: 'cssbox', spellcheck: false }) as HTMLTextAreaElement;
  const scriptsHolder = h('div');
  const pluginsHolder = h('div');
  const undoInfo = h('span', { className: 'hint' });

  const el = h('div', { className: 'panel' },
    h('div', { className: 'section' }, selHolder),
    h('div', { className: 'section' },
      h('h3', null, 'Structure'),
      h('p', { className: 'hint' }, 'The live element tree. Click to select; ids like [e12] are what the agent uses.'),
      tree,
      h('div', { className: 'rowline' },
        h('button', {
          className: 'btn',
          onclick: () => { const n = undo(1); ui.notify(n ? 'Undid 1 edit.' : 'Nothing to undo.'); refresh(); ui.setSelection(null); },
        }, '⌫ Undo edit'),
        undoInfo,
      ),
    ),
    h('div', { className: 'section' },
      h('h3', null, 'Stylesheet'),
      h('p', { className: 'hint' }, 'The page’s managed CSS (#page-styles). Edit and apply — changes are undoable.'),
      cssBox,
      h('div', { className: 'rowline' },
        h('button', {
          className: 'btn primary',
          onclick: () => {
            setStyles(cssBox.value);
            ui.pluginApi.markDirty();
            ui.notify('Stylesheet applied.');
          },
        }, 'Apply CSS'),
        h('button', { className: 'btn', onclick: () => { cssBox.value = readStyles(); } }, 'Reload'),
      ),
    ),
    h('div', { className: 'section' },
      h('h3', null, 'Scripts'),
      scriptsHolder,
    ),
    h('div', { className: 'section' },
      h('h3', null, 'Plugins'),
      h('p', { className: 'hint' }, 'Plugins add tools and instructions to the agent. Inline plugins travel inside this HTML file.'),
      pluginsHolder,
      h('div', { className: 'rowline' },
        h('button', { className: 'btn', onclick: () => addInlinePlugin(ui).then(refresh) }, '+ Add inline plugin'),
        h('button', { className: 'btn', onclick: () => addRemotePlugin(ui).then(refresh) }, '+ Add from URL'),
      ),
    ),
  );

  function renderSelection(): void {
    clear(selHolder);
    const sel = ui.getSelection();
    if (!sel || !sel.isConnected) {
      selHolder.append(
        h('h3', null, 'Selection'),
        h('p', { className: 'hint' }, 'Nothing selected. Use the ⌖ button in the title bar, then click any element on the page.'),
      );
      return;
    }
    const id = idOf(sel) ?? '?';
    const crumbs = h('div', { className: 'crumbs' });
    breadcrumb(sel).forEach((a, i, arr) => {
      const s = h('span', { onclick: () => ui.setSelection(a) }, a.tagName.toLowerCase() + (a.id ? `#${a.id}` : ''));
      if (a === sel) s.style.color = 'var(--accent)';
      crumbs.append(s);
      if (i < arr.length - 1) crumbs.append(' › ');
    });
    const htmlPre = h('pre', null, truncate(sel.outerHTML, 1800));
    selHolder.append(
      h('h3', null, 'Selection'),
      h('div', { className: 'selcard' },
        crumbs,
        h('div', null, describeElement(sel)),
        htmlPre,
        h('div', { className: 'rowline' },
          h('button', { className: 'btn', onclick: () => editTextInline(sel, ui) }, '✎ Edit text'),
          h('button', {
            className: 'btn danger',
            onclick: () => {
              const r = removeElement(id);
              if (r.ok) { ui.pluginApi.markDirty(); ui.setSelection(null); refresh(); }
              else ui.notify(r.error ?? 'Could not remove.');
            },
          }, '🗑 Delete'),
          h('button', {
            className: 'btn',
            onclick: () => { ui.openDrawer('chat'); ui.notify('Selection attached — describe what to do with it.'); },
          }, '💬 Ask agent'),
          h('button', { className: 'btn', onclick: () => ui.setSelection(null) }, '✕ Deselect'),
        ),
      ),
    );
  }

  function renderTree(): void {
    tagPage();
    clear(tree);
    const sel = ui.getSelection();
    const walk = (node: Element, depth: number): void => {
      if (isOverlayNode(node)) return;
      const id = idOf(node);
      const line = h('div', {
        className: 'node' + (node === sel ? ' selected' : ''),
        title: node === sel ? 'Click again to deselect' : 'Click to select',
        onclick: () => {
          if (node === ui.getSelection()) { ui.setSelection(null); return; }
          ui.setSelection(node);
          if (id) scrollToElement(id);
        },
      }, '  '.repeat(depth) + describeElement(node));
      tree.append(line);
      if (depth < 7) Array.from(node.children).forEach((c) => walk(c, depth + 1));
    };
    Array.from(document.body.children).forEach((c) => walk(c, 0));
    undoInfo.textContent = undoDepth() ? `${undoDepth()} edit(s) on the undo stack` : '';
  }

  function renderScripts(): void {
    clear(scriptsHolder);
    const scripts = listManagedScripts();
    if (!scripts.length) {
      scriptsHolder.append(h('p', { className: 'hint' }, 'No managed scripts yet. The agent creates them with upsert_script.'));
      return;
    }
    scripts.forEach((s) => {
      scriptsHolder.append(h('div', { className: 'rowline' },
        h('span', { className: 'pill' }, s.name),
        h('span', { className: 'hint' }, `${s.length} chars`),
      ));
    });
  }

  function renderPlugins(): void {
    clear(pluginsHolder);
    const cfg = getConfig();
    const loaded = new Set(listPlugins().map((p) => p.name));
    if (!cfg.plugins.length) {
      pluginsHolder.append(h('p', { className: 'hint' }, 'No plugins configured.'));
      return;
    }
    cfg.plugins.forEach((ref) => {
      pluginsHolder.append(h('div', { className: 'rowline' },
        h('span', { className: 'pill' }, ref.name),
        h('span', { className: 'hint' }, ref.src === 'inline' ? 'inline' : ref.src),
        h('span', { className: 'hint' }, loaded.has(ref.name) ? '● loaded' : '○ not loaded'),
        h('button', {
          className: 'btn danger',
          onclick: async () => {
            if (!(await ui.confirm('Remove plugin', `Remove "${ref.name}" from this page?`))) return;
            updateConfig({ plugins: cfg.plugins.filter((p) => p !== ref) });
            document.querySelector(`script[type="text/plain"][data-plugin="${CSS.escape(ref.name)}"]`)?.remove();
            unregisterPlugin(ref.name);
            ui.pluginApi.markDirty();
            refresh();
          },
        }, 'remove'),
      ));
    });
  }

  function refresh(): void {
    renderSelection();
    renderTree();
    renderScripts();
    renderPlugins();
    if (document.activeElement !== cssBox) cssBox.value = readStyles();
  }

  ui.onSelectionChange(() => { renderSelection(); renderTree(); });

  refresh();
  return { el, refresh };
}

function editTextInline(el: Element, ui: UIContext): void {
  if (!(el instanceof HTMLElement)) return;
  const prev = el.innerHTML;
  el.contentEditable = 'true';
  el.focus();
  ui.notify('Editing text in place — click elsewhere or press Escape to finish.');
  const finish = (): void => {
    el.contentEditable = 'false';
    el.removeEventListener('blur', finish);
    el.removeEventListener('keydown', onKey);
    if (el.innerHTML !== prev) {
      pushUndo({ label: 'inline text edit', undo: () => { el.innerHTML = prev; } });
      ui.pluginApi.markDirty();
    }
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); el.blur(); }
  };
  el.addEventListener('blur', finish);
  el.addEventListener('keydown', onKey);
}

async function addInlinePlugin(ui: UIContext): Promise<void> {
  const name = prompt('Plugin name (letters/dashes):')?.trim();
  if (!name || !/^[\w-]+$/.test(name)) return;
  const source = prompt('Paste the plugin module source (export default {...}):');
  if (!source) return;
  const holder = document.createElement('script');
  holder.setAttribute('type', 'text/plain');
  holder.setAttribute('data-plugin', name);
  holder.textContent = '\n' + source + '\n';
  document.body.appendChild(holder);
  const cfg = getConfig();
  updateConfig({ plugins: [...cfg.plugins, { name, src: 'inline' }] });
  syncConfigElement();
  ui.pluginApi.markDirty();
  try {
    await loadPlugin({ name, src: 'inline' }, ui.pluginApi, (n, d, src) => ui.confirm(`Load plugin "${n}"?`, d, src));
    ui.notify(`Plugin "${name}" added and loaded.`);
  } catch (e) {
    ui.notify(`Plugin stored but failed to load: ${e}`);
  }
}

async function addRemotePlugin(ui: UIContext): Promise<void> {
  const url = prompt('Plugin module URL (must be an ES module with a default export):')?.trim();
  if (!url) return;
  const name = prompt('Plugin name:')?.trim() || url.split('/').pop() || 'plugin';
  const cfg = getConfig();
  updateConfig({ plugins: [...cfg.plugins, { name, src: url }] });
  syncConfigElement();
  ui.pluginApi.markDirty();
  try {
    await loadPlugin({ name, src: url }, ui.pluginApi, (n, d, src) => ui.confirm(`Load plugin "${n}"?`, d, src));
    ui.notify(`Plugin "${name}" added and loaded.`);
  } catch (e) {
    ui.notify(`Plugin stored but failed to load: ${e}`);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
