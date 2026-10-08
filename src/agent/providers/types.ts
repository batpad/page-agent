// Provider abstraction. OpenRouter is a preset of the generic
// OpenAI-compatible adapter; WebLLM later implements the same interface.

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCallReq {
  id: string;
  name: string;
  /** raw JSON string of arguments, as providers stream it */
  arguments: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCallReq[];
  tool_call_id?: string;
}

export interface ProviderRequest {
  messages: ChatMessage[];
  tools: ToolSchema[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}

export interface AssistantTurn {
  content: string;
  toolCalls: ToolCallReq[];
}

export interface Provider {
  id: string;
  label: string;
  chat(req: ProviderRequest): Promise<AssistantTurn>;
}
