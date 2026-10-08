// Generic adapter for any OpenAI-compatible chat-completions endpoint
// (OpenRouter, OpenAI, Groq, Ollama, LM Studio, …) with SSE streaming and
// tool calling.

import type { AssistantTurn, Provider, ProviderRequest, ToolCallReq } from './types';

export interface OpenAICompatOptions {
  id?: string;
  label?: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

export class OpenAICompatProvider implements Provider {
  id: string;
  label: string;

  constructor(private opts: OpenAICompatOptions) {
    this.id = opts.id ?? 'custom';
    this.label = opts.label ?? 'Custom (OpenAI-compatible)';
  }

  async chat(req: ProviderRequest): Promise<AssistantTurn> {
    const body = {
      model: this.opts.model,
      stream: true,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content ?? '',
        ...(m.tool_calls?.length
          ? {
              tool_calls: m.tool_calls.map((t) => ({
                id: t.id,
                type: 'function',
                function: { name: t.name, arguments: t.arguments },
              })),
            }
          : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      })),
      ...(req.tools.length
        ? {
            tools: req.tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
    };

    const res = await fetch(this.opts.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      signal: req.signal,
      headers: {
        'content-type': 'application/json',
        ...(this.opts.apiKey ? { authorization: `Bearer ${this.opts.apiKey}` } : {}),
        ...this.opts.extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 400); } catch { /* body unreadable */ }
      throw new Error(`${this.label}: HTTP ${res.status}. ${detail}`);
    }

    let content = '';
    const toolCalls = new Map<number, ToolCallReq>();

    for await (const data of sseEvents(res, req.signal)) {
      if (data === '[DONE]') break;
      let parsed: unknown;
      try { parsed = JSON.parse(data); } catch { continue; }
      const p = parsed as {
        error?: { message?: string };
        choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } }>;
      };
      if (p.error?.message) throw new Error(`${this.label}: ${p.error.message}`);
      const delta = p.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        req.onText?.(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        let entry = toolCalls.get(idx);
        if (!entry) {
          entry = { id: tc.id ?? `call_${idx}`, name: '', arguments: '' };
          toolCalls.set(idx, entry);
        }
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name += tc.function.name;
        if (tc.function?.arguments) entry.arguments += tc.function.arguments;
      }
    }

    return { content, toolCalls: Array.from(toolCalls.values()).filter((t) => t.name) };
  }
}

async function* sseEvents(res: Response, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.startsWith('data:')) yield line.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock();
  }
}
