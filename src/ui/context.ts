// Shared wiring object the UI panels work with (keeps the panels decoupled
// from boot order and from each other).

import type { Saver } from '../core/save';
import type { AgentLoop } from '../agent/loop';
import type { PluginApi } from '../plugins/registry';

export interface UIContext {
  shadow: ShadowRoot;
  saver: Saver;
  loop: AgentLoop;
  pluginApi: PluginApi;
  notify(message: string): void;
  confirm(title: string, body: string, code?: string): Promise<boolean>;
  /** current inspector selection */
  getSelection(): Element | null;
  setSelection(el: Element | null): void;
  onSelectionChange(fn: (el: Element | null) => void): void;
  setInspecting(on: boolean): void;
  openDrawer(tab?: string): void;
  refreshPagePanel(): void;
}
