// The agent loop: plain tool-calling with streaming, iteration cap, and
// validation errors fed back as tool results so the model self-corrects.

import type { ChatMessage, Provider, ToolCallReq, ToolSchema } from './providers/types';
import type { ToolContext, ToolDef } from './tools';
import { buildSystemPrompt } from './prompts';

const MAX_ITERATIONS = 15;
const MAX_HISTORY_MESSAGES = 60;

export interface LoopCallbacks {
  onAssistantStart(): void;
  onAssistantText(delta: string): void;
  onAssistantDone(full: string): void;
  onToolCall(call: ToolCallReq): void;
  onToolResult(call: ToolCallReq, result: string): void;
  onError(message: string): void;
  onFinished(): void;
}

export class AgentLoop {
  private history: ChatMessage[] = [];
  private abort: AbortController | null = null;
  busy = false;

  constructor(
    private getProvider: () => Provider | null,
    private getTools: () => ToolDef[],
    private getPluginPrompts: () => string[],
    private toolCtx: ToolContext,
  ) {}

  stop(): void {
    this.abort?.abort();
  }

  clearHistory(): void {
    this.history = [];
  }

  async run(userText: string, cb: LoopCallbacks): Promise<void> {
    const provider = this.getProvider();
    if (!provider) {
      cb.onError('No model configured. Open Settings and add a provider + API key.');
      cb.onFinished();
      return;
    }
    if (this.busy) {
      cb.onError('The agent is already working — stop it first.');
      return;
    }
    this.busy = true;
    this.abort = new AbortController();
    this.history.push({ role: 'user', content: userText });

    const tools = this.getTools();
    const schemas: ToolSchema[] = tools.map((t) => ({
      name: t.name, description: t.description, parameters: t.parameters,
    }));

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        // System prompt is rebuilt every round so the outline stays current.
        const messages: ChatMessage[] = [
          { role: 'system', content: buildSystemPrompt(this.getPluginPrompts()) },
          ...this.history.slice(-MAX_HISTORY_MESSAGES),
        ];
        cb.onAssistantStart();
        const turn = await provider.chat({
          messages,
          tools: schemas,
          signal: this.abort.signal,
          onText: cb.onAssistantText,
        });
        this.history.push({
          role: 'assistant',
          content: turn.content || null,
          ...(turn.toolCalls.length ? { tool_calls: turn.toolCalls } : {}),
        });
        cb.onAssistantDone(turn.content);

        if (!turn.toolCalls.length) break;

        for (const call of turn.toolCalls) {
          cb.onToolCall(call);
          const result = await this.execute(tools, call);
          this.history.push({ role: 'tool', content: result, tool_call_id: call.id });
          cb.onToolResult(call, result);
        }

        if (i === MAX_ITERATIONS - 1) {
          cb.onError(`Stopped after ${MAX_ITERATIONS} rounds — send another message to continue.`);
        }
      }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') cb.onError('Stopped.');
      else cb.onError(String((e as Error)?.message ?? e));
    } finally {
      this.busy = false;
      this.abort = null;
      cb.onFinished();
    }
  }

  private async execute(tools: ToolDef[], call: ToolCallReq): Promise<string> {
    const tool = tools.find((t) => t.name === call.name);
    if (!tool) return `ERROR: unknown tool "${call.name}". Available: ${tools.map((t) => t.name).join(', ')}`;
    let args: Record<string, unknown> = {};
    if (call.arguments.trim()) {
      try {
        args = JSON.parse(call.arguments);
      } catch {
        return `ERROR: tool arguments were not valid JSON: ${call.arguments.slice(0, 200)}`;
      }
    }
    try {
      const out = await tool.execute(args, this.toolCtx);
      return typeof out === 'string' ? out : JSON.stringify(out);
    } catch (e) {
      return `ERROR: tool threw: ${String((e as Error)?.message ?? e)}`;
    }
  }
}
