// The overlay shell: shadow-DOM host, floating button, drawer with tabs,
// save bar, toasts, confirm modal, inspector wiring.

import { h, clear } from './h';
import { overlayCss } from './styles';
import { OVERLAY_HOST_ID } from '../core/dom';
import type { Saver } from '../core/save';
import type { AgentLoop } from '../agent/loop';
import type { PluginApi } from '../plugins/registry';
import { pluginCommands } from '../plugins/registry';
import type { UIContext } from './context';
import { createInspector } from './inspector';
import { buildChatPanel } from './chat';
import { buildPagePanel } from './page-panel';
import { buildSettingsPanel } from './settings';

export function mountOverlay(deps: {
  saver: Saver;
  loop: AgentLoop;
  pluginApi: PluginApi;
}): UIContext {
  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(h('style', null, overlayCss));

  // ---- selection state ----
  let selection: Element | null = null;
  const selectionListeners: Array<(el: Element | null) => void> = [];

  // ---- toasts ----
  const toasts = h('div', { className: 'toasts' });
  function notify(message: string): void {
    const t = h('div', { className: 'toast' }, message);
    toasts.append(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ---- confirm modal ----
  function confirmDialog(title: string, body: string, code?: string): Promise<boolean> {
    return new Promise((resolve) => {
      const back = h('div', { className: 'modal-back' });
      const close = (v: boolean) => { back.remove(); resolve(v); };
      back.append(h('div', { className: 'modal' },
        h('h3', null, title),
        h('div', null, body),
        code ? h('pre', null, code.length > 2000 ? code.slice(0, 2000) + '…' : code) : null,
        h('div', { className: 'actions' },
          h('button', { className: 'btn', onclick: () => close(false) }, 'Cancel'),
          h('button', { className: 'btn primary', onclick: () => close(true) }, 'OK'),
        ),
      ));
      shadow.append(back);
    });
  }

  // ---- ui context (panels get this) ----
  const ui: UIContext = {
    shadow,
    saver: deps.saver,
    loop: deps.loop,
    pluginApi: deps.pluginApi,
    notify,
    confirm: confirmDialog,
    getSelection: () => selection,
    setSelection(el) {
      selection = el;
      inspector.updatePin();
      selectionListeners.forEach((fn) => fn(el));
    },
    onSelectionChange(fn) { selectionListeners.push(fn); },
    setInspecting(on) { inspector.setActive(on); inspectBtn.classList.toggle('active', on); },
    openDrawer,
    refreshPagePanel: () => pagePanel.refresh(),
  };

  // ---- inspector ----
  const inspector = createInspector(shadow, (el) => {
    ui.setSelection(el);
    ui.setInspecting(false);
    openDrawer('page');
  }, () => selection);

  // ---- drawer ----
  const inspectBtn = h('button', {
    className: 'iconbtn', title: 'Select an element on the page (Esc to cancel)',
    onclick: () => ui.setInspecting(!inspectBtn.classList.contains('active')),
  }, '⌖');

  const helpBtn = h('button', {
    className: 'iconbtn', title: 'How to use this editor',
    onclick: () => showHelp(),
  }, '?');

  function showHelp(): void {
    const back = h('div', { className: 'modal-back', onclick: (e: MouseEvent) => { if (e.target === back) back.remove(); } });
    const sec = (title: string, ...lines: string[]) =>
      h('div', null, h('h4', null, title), ...lines.map((l) => h('p', { className: 'helpline' }, l)));
    back.append(h('div', { className: 'modal help' },
      h('h3', null, 'How this editor works'),
      h('p', { className: 'helpline' },
        'This page edits itself. Everything — content, styling, the agent’s configuration — lives in this one HTML file. Changes happen live; nothing touches the file until you press Save.'),
      sec('Chat',
        'Describe any change in plain words: “make the header dark blue”, “add an about section”. The agent edits the page in front of you.',
        'Each edit shows up as a small expandable row — open it to see the exact HTML that was written. A good way to learn how the page is built.'),
      sec('Selecting elements',
        '⌖ (title bar): hover highlights elements on the page; click one to select it. Esc cancels.',
        'Or click any line in the Page tab’s Structure tree. Click the same line again to deselect.',
        'A selected element is attached to your next chat message (“make this bigger”), and the Page tab shows its HTML with quick actions: edit text in place, delete, deselect.',
        'To unselect: the ✕ on the chip above the chat box, the ✕ Deselect button in the Page tab, or press Esc.'),
      sec('Page tab',
        'The Structure tree is the live page; ids like [e12] are the handles the agent uses.',
        'Edit the page’s CSS directly in the Stylesheet box — Apply is undoable, like every edit. Undo rolls back one edit at a time.'),
      sec('Saving',
        'Save writes this HTML file back: silently via a save server, through a one-time browser file permission (Chrome), or as a download elsewhere. The ● dot on the ✎ button means unsaved edits.',
        'The saved file is yours to share — mail it, host it, copy it. It stays editable anywhere because the editor script tag travels with it.'),
      sec('Settings & privacy',
        'Your model API key is stored only in this browser, never written into the HTML file. The page talks directly to your model provider — there is no middleman server.'),
      h('div', { className: 'actions' },
        h('button', { className: 'btn primary', onclick: () => back.remove() }, 'Got it'),
      ),
    ));
    shadow.append(back);
  }

  // Esc clears the selection when not in inspect mode (inspect mode's own
  // Esc handler exits inspecting first).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selection && !inspectBtn.classList.contains('active')) {
      ui.setSelection(null);
    }
  });

  const drawer = h('div', { className: 'drawer' });
  const fab = h('button', { className: 'fab', title: 'Edit this page', onclick: () => toggleDrawer() },
    '✎', h('span', { className: 'dot' }));

  const tabNames: Array<[string, string]> = [['chat', 'Chat'], ['page', 'Page'], ['settings', '⚙ Settings']];
  const tabBar = h('div', { className: 'tabs' });
  const panels: Record<string, HTMLElement> = {};

  function selectTab(name: string): void {
    tabBar.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', (t as HTMLElement).dataset.tab === name));
    Object.entries(panels).forEach(([k, p]) => p.classList.toggle('active', k === name));
  }

  tabNames.forEach(([key, label]) => {
    tabBar.append(h('button', { className: 'tab', dataset: { tab: key }, onclick: () => selectTab(key) }, label));
  });

  const chatPanel = buildChatPanel(ui);
  const pagePanel = buildPagePanel(ui);
  const settingsPanel = buildSettingsPanel(ui);
  panels.chat = chatPanel;
  panels.page = pagePanel.el;
  panels.settings = settingsPanel;

  // ---- save bar ----
  const saveState = h('span', { className: 'state' });
  const saveBtn = h('button', { className: 'btn primary', onclick: () => doSave(false) }, 'Save');
  const saveAsBtn = h('button', { className: 'btn', title: 'Save to a new file', onclick: () => doSave(true) }, 'Save as…');
  const savebar = h('div', { className: 'savebar' }, saveState, saveAsBtn, saveBtn);

  async function doSave(as: boolean): Promise<void> {
    const r = as ? await deps.saver.saveAs() : await deps.saver.save();
    notify(r.message);
  }

  function renderSaveState(): void {
    const st = deps.saver.state;
    clear(saveState);
    saveState.append(
      st.dirty ? h('span', { className: 'dirty' }, '● unsaved edits') : h('span', null, 'no unsaved edits'),
      h('span', null, ` · via ${{ 'http-put': 'server', fsa: 'local file', download: 'download' }[st.backend]}`),
    );
    fab.classList.toggle('dirty', st.dirty);
  }
  deps.saver.onChange(renderSaveState);
  renderSaveState();

  // ---- plugin commands row (populated on refresh) ----
  const commandsRow = h('div');
  function renderCommands(): void {
    clear(commandsRow);
    const cmds = pluginCommands();
    if (!cmds.length) return;
    const row = h('div', { className: 'rowline', style: 'padding: 8px 14px 0;' });
    cmds.forEach(({ command }) => {
      row.append(h('button', { className: 'btn', onclick: () => void command.run(deps.pluginApi) }, command.label));
    });
    commandsRow.append(row);
  }

  drawer.append(
    h('div', { className: 'titlebar' },
      h('span', { className: 'name' }, 'Page Agent'),
      h('span', { className: 'spacer' }),
      helpBtn,
      inspectBtn,
      h('button', { className: 'iconbtn', title: 'Close', onclick: () => toggleDrawer(false) }, '✕'),
    ),
    tabBar,
    commandsRow,
    chatPanel,
    pagePanel.el,
    settingsPanel,
    savebar,
  );

  shadow.append(fab, drawer, toasts);

  let open = false;
  function toggleDrawer(force?: boolean): void {
    open = force ?? !open;
    drawer.classList.toggle('open', open);
    if (open) { pagePanel.refresh(); renderCommands(); }
  }
  function openDrawer(tab?: string): void {
    toggleDrawer(true);
    if (tab) selectTab(tab);
  }

  selectTab('chat');
  return ui;
}
