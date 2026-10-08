// Plugin registry. A plugin extends the agent (tools, prompt), hooks the
// save pipeline, and can add commands to the drawer — without touching this
// library. Tool parameters use JSON Schema (same function-calling format as
// OpenAI/MCP), so definitions are portable.

import type { ToolDef, ToolContext } from '../agent/tools';

export interface PluginCommand {
  label: string;
  run(ctx: PluginApi): void | Promise<void>;
}

export interface PluginTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx: PluginApi): Promise<string> | string;
}

export interface Plugin {
  name: string;
  version?: string;
  systemPrompt?: string;
  tools?: PluginTool[];
  commands?: PluginCommand[];
  onLoad?(ctx: PluginApi): void | Promise<void>;
  onBeforeSave?(doc: HTMLElement, ctx: PluginApi): void;
}

/** The stable surface plugins program against. */
export interface PluginApi extends ToolContext {
  dom: typeof import('../core/dom');
  validate: typeof import('../core/validate');
  config: typeof import('../core/config');
  notify(message: string): void;
}

const plugins: Plugin[] = [];

export function registerPlugin(p: Plugin, api: PluginApi): string | null {
  if (!p || typeof p !== 'object' || !p.name) return 'Plugin must be an object with a name.';
  if (plugins.some((x) => x.name === p.name)) return `Plugin "${p.name}" is already registered.`;
  for (const t of p.tools ?? []) {
    if (!t.name || !t.description || typeof t.execute !== 'function') {
      return `Plugin "${p.name}": every tool needs name, description, parameters, execute.`;
    }
  }
  plugins.push(p);
  try { p.onLoad?.(api); } catch (e) { api.notify(`Plugin "${p.name}" onLoad failed: ${e}`); }
  return null;
}

export function unregisterPlugin(name: string): void {
  const i = plugins.findIndex((p) => p.name === name);
  if (i >= 0) plugins.splice(i, 1);
}

export function listPlugins(): Plugin[] {
  return [...plugins];
}

export function pluginTools(api: PluginApi): ToolDef[] {
  const defs: ToolDef[] = [];
  for (const p of plugins) {
    for (const t of p.tools ?? []) {
      defs.push({
        name: t.name,
        description: `[${p.name}] ${t.description}`,
        parameters: t.parameters ?? { type: 'object', properties: {} },
        execute: (args) => t.execute(args, api),
      });
    }
  }
  return defs;
}

export function pluginPrompts(): string[] {
  return plugins.map((p) => p.systemPrompt ?? '').filter(Boolean);
}

export function pluginCommands(): Array<{ plugin: string; command: PluginCommand }> {
  return plugins.flatMap((p) => (p.commands ?? []).map((command) => ({ plugin: p.name, command })));
}

export function runBeforeSaveHooks(doc: HTMLElement, api: PluginApi): void {
  for (const p of plugins) {
    try { p.onBeforeSave?.(doc, api); } catch { /* a broken hook must not block saving */ }
  }
}
