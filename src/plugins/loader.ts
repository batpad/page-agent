// Load plugins declared in the portable config.
//
//   src: "inline"   → source travels in <script type="text/plain"
//                     data-plugin="name"> blocks inside the HTML file
//                     (inert to the browser; we import via a Blob URL)
//   src: <url>      → dynamic import of a remote ES module
//
// Plugins are code, so every new or changed plugin needs a one-time user
// consent, recorded (as a content hash) in machine-local settings only.

import { getConfig, getSettings, updateSettings, type PluginRef } from '../core/config';
import { registerPlugin, type Plugin, type PluginApi } from './registry';

// Dodge the bundler so dynamic import stays native.
const nativeImport = new Function('u', 'return import(u)') as (u: string) => Promise<{ default?: Plugin }>;

export type ConsentPrompt = (pluginName: string, detail: string, source: string) => Promise<boolean>;

export async function loadConfiguredPlugins(api: PluginApi, askConsent: ConsentPrompt): Promise<void> {
  const cfg = getConfig();
  for (const ref of cfg.plugins) {
    if (ref.enabled === false) continue;
    try {
      await loadPlugin(ref, api, askConsent);
    } catch (e) {
      api.notify(`Plugin "${ref.name}" failed to load: ${String((e as Error)?.message ?? e)}`);
    }
  }
}

export async function loadPlugin(ref: PluginRef, api: PluginApi, askConsent: ConsentPrompt): Promise<boolean> {
  let source: string;
  let detail: string;
  if (ref.src === 'inline') {
    const el = document.querySelector(`script[type="text/plain"][data-plugin="${CSS.escape(ref.name)}"]`);
    if (!el) throw new Error('no inline <script data-plugin> block found');
    source = el.textContent ?? '';
    detail = `inline plugin, ${source.length} chars of code stored in this file`;
  } else {
    source = ref.src; // consent on the URL; code is whatever it serves
    detail = `remote plugin loaded from ${ref.src}`;
  }

  const hash = await sha256(ref.src === 'inline' ? source : ref.src);
  const consent = getSettings().pluginConsent ?? {};
  if (consent[ref.name] !== hash) {
    const ok = await askConsent(ref.name, detail, ref.src === 'inline' ? source : ref.src);
    if (!ok) return false;
    updateSettings({ pluginConsent: { ...consent, [ref.name]: hash } });
  }

  let mod: { default?: Plugin };
  if (ref.src === 'inline') {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      mod = await nativeImport(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    mod = await nativeImport(ref.src);
  }

  const plugin = mod.default;
  if (!plugin) throw new Error('module has no default export');
  const err = registerPlugin(plugin, api);
  if (err) throw new Error(err);
  return true;
}

async function sha256(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'len:' + text.length; // crypto.subtle unavailable — weak fallback
  }
}
