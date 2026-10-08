import { OpenAICompatProvider } from './openai-compat';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export function openRouterProvider(apiKey: string, model: string): OpenAICompatProvider {
  return new OpenAICompatProvider({
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: OPENROUTER_BASE,
    apiKey,
    model,
    extraHeaders: {
      'HTTP-Referer': 'https://github.com/page-agent',
      'X-Title': 'Page Agent',
    },
  });
}

export interface ModelInfo {
  id: string;
  name: string;
  toolSupport: boolean;
}

export async function listOpenRouterModels(apiKey?: string): Promise<ModelInfo[]> {
  const res = await fetch(`${OPENROUTER_BASE}/models`, {
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
  });
  if (!res.ok) throw new Error(`OpenRouter models: HTTP ${res.status}`);
  const data = (await res.json()) as { data?: Array<{ id: string; name?: string; supported_parameters?: string[] }> };
  return (data.data ?? []).map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    toolSupport: (m.supported_parameters ?? []).includes('tools'),
  }));
}
