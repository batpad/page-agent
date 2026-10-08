// Boot: identify our own script tag, wire core + agent + plugins + overlay,
// expose window.PageAgent for plugins and power users.

import {
  EDITOR_SCRIPT_ATTR, onMutation, tagPage,
} from './core/dom';
import * as dom from './core/dom';
import * as validate from './core/validate';
import * as config from './core/config';
import { serializePage } from './core/serialize';
import { Saver, type BackendId } from './core/save';
import { getSettings, configJson, getConfig, syncConfigElement } from './core/config';
import { AgentLoop } from './agent/loop';
import { builtinTools, type ToolDef } from './agent/tools';
import type { Provider } from './agent/providers/types';
import { OpenAICompatProvider } from './agent/providers/openai-compat';
import { openRouterProvider } from './agent/providers/openrouter';
import { MockProvider } from './agent/providers/mock';
import {
  pluginPrompts, pluginTools, registerPlugin, runBeforeSaveHooks, type Plugin, type PluginApi,
} from './plugins/registry';
import { loadConfiguredPlugins } from './plugins/loader';
import { mountOverlay } from './ui/overlay';

declare const __VERSION__: string;

function boot(): void {
  if (document.getElementById(dom.OVERLAY_HOST_ID)) return; // double-include guard

  // Remember which script tag is us, so the serializer can keep/repair it.
  const self =
    (document.currentScript as HTMLScriptElement | null) ??
    (document.querySelector(`script[${EDITOR_SCRIPT_ATTR}]`) as HTMLScriptElement | null) ??
    (document.querySelector('script[src*="page-agent"]') as HTMLScriptElement | null);
  const editorSrc = self?.getAttribute('src') ?? 'page-agent.js';
  self?.setAttribute(EDITOR_SCRIPT_ATTR, '1');

  tagPage();
  getConfig();

  // ---- saver ----
  const saver = new Saver(() => {
    syncConfigElement();
    return serializePage(editorSrc, configJson(), (root) => runBeforeSaveHooks(root, pluginApi));
  });

  // ---- plugin api ----
  const pluginApi: PluginApi = {
    dom, validate, config,
    markDirty: () => saver.markDirty(),
    notify: (m) => ui.notify(m),
  };

  // ---- provider from settings ----
  function currentProvider(): Provider | null {
    const p = getSettings().provider;
    if (!p) return null;
    if (p.provider === 'mock') return new MockProvider();
    if (p.provider === 'openrouter') {
      if (!p.apiKey || !p.model) return null;
      return openRouterProvider(p.apiKey, p.model);
    }
    if (!p.baseUrl || !p.model) return null;
    return new OpenAICompatProvider({ baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model });
  }

  // ---- agent loop ----
  const allTools = (): ToolDef[] => [...builtinTools, ...pluginTools(pluginApi)];
  const loop = new AgentLoop(currentProvider, allTools, pluginPrompts, pluginApi);

  // ---- overlay ----
  const ui = mountOverlay({ saver, loop, pluginApi });

  onMutation(() => saver.markDirty());

  void saver.init((getSettings().saveBackend ?? null) as BackendId | null);

  void loadConfiguredPlugins(pluginApi, (name, detail, source) =>
    ui.confirm(`Load plugin "${name}"?`, `${detail}. Plugins run code with full access to this page.`, source),
  );

  // ---- public api ----
  const api = {
    version: __VERSION__,
    register: (p: Plugin) => {
      const err = registerPlugin(p, pluginApi);
      if (err) throw new Error(err);
    },
    serialize: () => serializePage(editorSrc, configJson()),
    save: () => saver.save(),
    ctx: pluginApi,
    ui,
    _debug: { saver, loop, runBeforeSaveHooks },
  };
  (window as unknown as Record<string, unknown>).PageAgent = api;
  document.dispatchEvent(new CustomEvent('page-agent-ready', { detail: api }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
