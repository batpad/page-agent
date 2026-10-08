// Two kinds of configuration:
//
//  Portable config — travels inside the HTML file in <script type="application/json"
//  id="pa-config">. Plugins, preferred model name, page metadata. Never secrets.
//
//  Local settings — this browser only (localStorage, in-memory fallback).
//  API keys, save-backend override, plugin consent hashes.

import { CONFIG_ID } from './dom';

export interface PluginRef {
  name: string;
  /** "inline" means source lives in a <script type="text/plain" data-plugin=name> block */
  src: 'inline' | string;
  enabled?: boolean;
}

export interface PortableConfig {
  version: number;
  /** model the page author recommends; the key always comes from local settings */
  model?: { provider?: string; model?: string };
  plugins: PluginRef[];
  meta?: Record<string, unknown>;
}

const DEFAULT_CONFIG: PortableConfig = { version: 1, plugins: [] };

let config: PortableConfig | null = null;

export function getConfig(): PortableConfig {
  if (!config) {
    const el = document.getElementById(CONFIG_ID);
    try {
      config = { ...DEFAULT_CONFIG, ...(el?.textContent ? JSON.parse(el.textContent) : {}) };
    } catch {
      config = { ...DEFAULT_CONFIG };
    }
    config!.plugins ??= [];
  }
  return config!;
}

export function updateConfig(patch: Partial<PortableConfig>): PortableConfig {
  const c = getConfig();
  Object.assign(c, patch);
  syncConfigElement();
  return c;
}

export function configJson(): string {
  return JSON.stringify(getConfig(), null, 2);
}

/** Keep the live DOM's config block current so manual saves/copies stay correct. */
export function syncConfigElement(): void {
  const el = document.getElementById(CONFIG_ID);
  if (el) el.textContent = '\n' + configJson() + '\n';
}

// ---------------------------------------------------------------------------
// Local settings

export interface ProviderSettings {
  provider: 'openrouter' | 'custom' | 'mock';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface LocalSettings {
  provider?: ProviderSettings;
  saveBackend?: string | null;
  pluginConsent?: Record<string, string>; // plugin name -> approved content hash
}

const LS_KEY = 'page-agent:settings';
let memoryFallback: LocalSettings = {};
let storageOk: boolean | null = null;

function storageAvailable(): boolean {
  if (storageOk !== null) return storageOk;
  try {
    localStorage.setItem('__pa_t', '1');
    localStorage.removeItem('__pa_t');
    storageOk = true;
  } catch {
    storageOk = false;
  }
  return storageOk;
}

export function getSettings(): LocalSettings {
  if (!storageAvailable()) return memoryFallback;
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function updateSettings(patch: Partial<LocalSettings>): LocalSettings {
  const s = { ...getSettings(), ...patch };
  if (storageAvailable()) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { memoryFallback = s; }
  } else {
    memoryFallback = s;
  }
  return s;
}

export function settingsPersist(): boolean {
  return storageAvailable();
}
