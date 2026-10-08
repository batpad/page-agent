// Chat panel: streamed assistant messages, expandable tool-call rows (the
// "learn HTML by watching" mechanism), selection chips, stop button.

import { h, clear } from './h';
import type { UIContext } from './context';
import type { ToolCallReq } from '../agent/providers/types';
import { describeElement, idOf } from '../core/dom';
import { getSettings } from '../core/config';

export function buildChatPanel(ui: UIContext): HTMLElement {
  const messages = h('div', { className: 'messages' });
  const chipHolder = h('div');
  const input = h('textarea', {
    placeholder: 'Describe a change… ("make the header dark blue", "add an about section")',
    rows: 1,
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    oninput: () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    },
  });
  const sendBtn = h('button', { className: 'send', onclick: () => send() }, 'Send');
  const working = h('div', { className: 'working' }, h('span', { className: 'spin' }), 'thinking…');
  const panel = h('div', { className: 'panel active' },
    messages,
    h('div', { className: 'chatbox' },
      chipHolder,
      working,
      h('div', { className: 'row' }, input, sendBtn),
    ),
  );

  addNotice(
    getSettings().provider?.apiKey || getSettings().provider?.provider === 'mock'
      ? 'This page edits itself. Ask for a change, watch it happen, then Save.'
      : 'Welcome! Open Settings (⚙ tab) and add your model API key, then ask for any change to this page.',
  );

  function addNotice(text: string): void {
    messages.append(h('div', { className: 'msg notice' }, text));
    scroll();
  }

  function addError(text: string): void {
    messages.append(h('div', { className: 'msg error' }, text));
    scroll();
  }

  function scroll(): void {
    messages.scrollTop = messages.scrollHeight;
  }

  function renderSelectionChip(): void {
    clear(chipHolder);
    const sel = ui.getSelection();
    if (!sel || !sel.isConnected) return;
    chipHolder.append(
      h('span', { className: 'chip' },
        `⌖ ${shortDesc(sel)}`,
        h('button', { title: 'Clear selection', onclick: () => ui.setSelection(null) }, '×'),
      ),
    );
  }
  ui.onSelectionChange(renderSelectionChip);

  function shortDesc(el: Element): string {
    const id = idOf(el) ?? '?';
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    else if (el.classList.length) s += `.${el.classList[0]}`;
    return `${id} <${s}>`;
  }

  let currentAssistant: HTMLElement | null = null;

  function send(): void {
    if (ui.loop.busy) {
      ui.loop.stop();
      return;
    }
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    messages.append(h('div', { className: 'msg user' }, text));
    scroll();

    let fullText = text;
    const sel = ui.getSelection();
    if (sel && sel.isConnected) {
      fullText += `\n\n[User has selected this element: ${describeElement(sel)} — if the request is about "this", it means this element.]`;
    }

    sendBtn.textContent = 'Stop';
    sendBtn.classList.add('stop');
    working.classList.add('on');

    void ui.loop.run(fullText, {
      onAssistantStart: () => { currentAssistant = null; },
      onAssistantText: (delta) => {
        if (!currentAssistant) {
          currentAssistant = h('div', { className: 'msg assistant' });
          messages.append(currentAssistant);
        }
        currentAssistant.append(document.createTextNode(delta));
        scroll();
      },
      onAssistantDone: (full) => {
        if (currentAssistant) renderRichText(currentAssistant, full);
        else if (full.trim()) {
          currentAssistant = h('div', { className: 'msg assistant' });
          renderRichText(currentAssistant, full);
          messages.append(currentAssistant);
        }
        currentAssistant = null;
        scroll();
      },
      onToolCall: (call) => {
        messages.append(pendingToolRow(call));
        scroll();
      },
      onToolResult: (call, result) => {
        const row = messages.querySelector(`[data-call="${call.id}"]`);
        if (row) fillToolRow(row as HTMLElement, call, result);
        scroll();
      },
      onError: addError,
      onFinished: () => {
        sendBtn.textContent = 'Send';
        sendBtn.classList.remove('stop');
        working.classList.remove('on');
        ui.refreshPagePanel();
      },
    });
  }

  return panel;
}

function pendingToolRow(call: ToolCallReq): HTMLElement {
  const row = h('details', { className: 'toolrow' }) as unknown as HTMLElement;
  row.setAttribute('data-call', call.id);
  row.append(
    h('summary', null, h('span', { className: 'label' }, toolSummary(call)), ' …'),
  );
  return row;
}

function fillToolRow(row: HTMLElement, call: ToolCallReq, result: string): void {
  clear(row);
  const isErr = result.startsWith('ERROR');
  const hasWarn = result.includes('WARNING:');
  row.append(
    h('summary', null,
      h('span', { className: 'label' }, toolSummary(call)),
      h('span', { className: isErr ? 'err' : 'ok' }, isErr ? '✗' : hasWarn ? '⚠' : '✓'),
    ),
    h('div', { className: 'body' },
      h('pre', null, prettyArgs(call.arguments)),
      h('pre', null, result.length > 1200 ? result.slice(0, 1200) + '…' : result),
    ),
  );
}

function toolSummary(call: ToolCallReq): string {
  let target = '';
  try {
    const a = JSON.parse(call.arguments || '{}');
    target = a.id ?? a.target_id ?? a.name ?? '';
  } catch { /* partial args */ }
  return target ? `${call.name} ${target}` : call.name;
}

function prettyArgs(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw || '{}'), null, 1);
  } catch {
    return raw;
  }
}

/** Minimal rich text: fenced code blocks and `inline code` only. */
function renderRichText(el: HTMLElement, text: string): void {
  clear(el);
  const parts = text.split(/```(?:\w+)?\n?/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      el.append(h('pre', null, h('code', null, part.replace(/\n$/, ''))));
    } else {
      const bits = part.split(/`([^`\n]+)`/);
      bits.forEach((b, j) => {
        if (j % 2 === 1) el.append(h('code', null, b));
        else if (b) el.append(document.createTextNode(b));
      });
    }
  });
}
