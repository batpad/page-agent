// Scripted provider for development and automated tests. Feed it turns via
// window.__paMockScript = [{ content, toolCalls: [{name, arguments}] }, …]
// and each chat() call shifts the next one off the queue.

import type { AssistantTurn, Provider, ProviderRequest } from './types';

interface MockTurn {
  content?: string;
  toolCalls?: Array<{ name: string; arguments: string | object }>;
}

declare global {
  interface Window { __paMockScript?: MockTurn[]; __paMockLog?: ProviderRequest['messages'][] }
}

export class MockProvider implements Provider {
  id = 'mock';
  label = 'Mock (testing)';

  async chat(req: ProviderRequest): Promise<AssistantTurn> {
    (window.__paMockLog ??= []).push(req.messages);
    const turn = window.__paMockScript?.shift();
    if (!turn) return { content: 'Mock provider: script queue is empty.', toolCalls: [] };
    const content = turn.content ?? '';
    if (content) req.onText?.(content);
    return {
      content,
      toolCalls: (turn.toolCalls ?? []).map((t, i) => ({
        id: `mock_${Date.now()}_${i}`,
        name: t.name,
        arguments: typeof t.arguments === 'string' ? t.arguments : JSON.stringify(t.arguments),
      })),
    };
  }
}
