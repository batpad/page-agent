// Settings panel: model provider + key (stored only in this browser),
// model picker, save backend.

import { h, clear } from './h';
import type { UIContext } from './context';
import { getSettings, updateSettings, settingsPersist, type ProviderSettings } from '../core/config';
import { listOpenRouterModels } from '../agent/providers/openrouter';
import type { BackendId } from '../core/save';

const BACKEND_LABELS: Record<BackendId, string> = {
  'http-put': 'Server (silent save back to this URL)',
  fsa: 'Local file (browser file permission)',
  download: 'Download a copy',
};

export function buildSettingsPanel(ui: UIContext): HTMLElement {
  const s = getSettings();
  const p: ProviderSettings = s.provider ?? { provider: 'openrouter' };

  const providerSel = h('select', null,
    h('option', { value: 'openrouter' }, 'OpenRouter'),
    h('option', { value: 'custom' }, 'Custom (OpenAI-compatible)'),
    h('option', { value: 'mock' }, 'Mock (testing)'),
  ) as HTMLSelectElement;
  providerSel.value = p.provider;

  const baseUrlField = h('div', { className: 'field' },
    h('label', null, 'Base URL (e.g. http://localhost:11434/v1 for Ollama)'),
    h('input', { value: p.baseUrl ?? '', placeholder: 'https://…/v1' }),
  );
  const baseUrlInput = baseUrlField.querySelector('input') as HTMLInputElement;

  const keyInput = h('input', { type: 'password', value: p.apiKey ?? '', placeholder: 'sk-or-…' }) as HTMLInputElement;
  const modelInput = h('input', {
    value: p.model ?? '',
    placeholder: 'e.g. anthropic/claude-sonnet-4.5',
    list: 'pa-models',
  }) as HTMLInputElement;
  const modelList = h('datalist', { id: 'pa-models' });
  const status = h('div', { className: 'status' });

  const backendSel = h('select', null) as HTMLSelectElement;

  function refreshBackends(): void {
    clear(backendSel);
    const st = ui.saver.state;
    backendSel.append(h('option', { value: '' }, `Auto (${BACKEND_LABELS[st.detected]})`));
    st.available.forEach((b) => backendSel.append(h('option', { value: b }, BACKEND_LABELS[b])));
    backendSel.value = getSettings().saveBackend ?? '';
  }

  function syncVisibility(): void {
    baseUrlField.style.display = providerSel.value === 'custom' ? '' : 'none';
    const needsKey = providerSel.value !== 'mock';
    keyField.style.display = needsKey ? '' : 'none';
    modelField.style.display = needsKey ? '' : 'none';
  }

  function save(): void {
    updateSettings({
      provider: {
        provider: providerSel.value as ProviderSettings['provider'],
        baseUrl: baseUrlInput.value.trim() || undefined,
        apiKey: keyInput.value.trim() || undefined,
        model: modelInput.value.trim() || undefined,
      },
      saveBackend: backendSel.value || null,
    });
    ui.saver.setBackend((backendSel.value || null) as BackendId | null);
    status.className = 'status ok';
    status.textContent = settingsPersist()
      ? 'Saved (kept only in this browser, never written into the HTML file).'
      : 'Saved for this session only — this browser blocks local storage here.';
  }

  async function testModels(): Promise<void> {
    status.className = 'status';
    status.textContent = 'Fetching model list…';
    try {
      const models = await listOpenRouterModels(keyInput.value.trim() || undefined);
      clear(modelList);
      models.filter((m) => m.toolSupport).slice(0, 400).forEach((m) => modelList.append(h('option', { value: m.id }, m.name)));
      status.className = 'status ok';
      status.textContent = `${models.filter((m) => m.toolSupport).length} tool-capable models loaded — type in the model field to search.`;
    } catch (e) {
      status.className = 'status err';
      status.textContent = String((e as Error)?.message ?? e);
    }
  }

  const keyField = h('div', { className: 'field' },
    h('label', null, 'API key (stays in this browser only)'),
    keyInput,
  );
  const modelField = h('div', { className: 'field' },
    h('label', null, 'Model'),
    modelInput, modelList,
    h('div', { className: 'rowline' },
      h('button', { className: 'btn', onclick: () => void testModels() }, 'Browse OpenRouter models'),
    ),
  );

  providerSel.addEventListener('change', syncVisibility);

  const panel = h('div', { className: 'panel' },
    h('div', { className: 'section' },
      h('h3', null, 'Model'),
      h('div', { className: 'field' }, h('label', null, 'Provider'), providerSel),
      baseUrlField,
      keyField,
      modelField,
    ),
    h('div', { className: 'section' },
      h('h3', null, 'Saving'),
      h('div', { className: 'field' }, h('label', null, 'Save method'), backendSel),
      h('p', { className: 'hint' },
        'Server saving needs a server that accepts PUT (run: node server/serve.mjs). ' +
        'Local-file saving asks the browser for permission to this file once.'),
    ),
    h('div', { className: 'section' },
      h('div', { className: 'rowline' },
        h('button', { className: 'btn primary', onclick: save }, 'Save settings'),
      ),
      status,
    ),
  );

  syncVisibility();
  refreshBackends();
  ui.saver.onChange(refreshBackends);
  return panel;
}
