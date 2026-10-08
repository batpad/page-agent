// HTML fragment validation + whole-document invariants.
//
// Browsers never throw on bad HTML — they silently "fix" it, which is worse
// for an agent than an error. So validation works by detecting what the
// parser changed and reporting it back as a structured message the model can
// act on.

import { CONFIG_ID, EDITOR_SCRIPT_ATTR, parseFragment } from './dom';

export interface ValidationResult {
  ok: boolean;
  error?: string;
  warning?: string;
}

/** Tags where a closing tag is forbidden/optional, excluded from count checks. */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Tags the parser relocates or that are illegal inside body fragments. */
const FORBIDDEN_IN_FRAGMENT = ['html', 'head', 'body', 'frameset'];

export function validateFragment(html: string): ValidationResult {
  if (!html.trim()) return { ok: false, error: 'Empty HTML fragment.' };

  const lower = html.toLowerCase();
  for (const tag of FORBIDDEN_IN_FRAGMENT) {
    if (new RegExp(`<${tag}[\\s>]`).test(lower)) {
      return { ok: false, error: `Fragment must not contain <${tag}> — provide body content only.` };
    }
  }
  if (new RegExp(`id\\s*=\\s*["']?${CONFIG_ID}`).test(lower)) {
    return { ok: false, error: 'Fragment must not contain a second page-config block.' };
  }
  if (lower.includes(EDITOR_SCRIPT_ATTR) || /<script[^>]+src=[^>]*page-agent/.test(lower)) {
    return { ok: false, error: 'Fragment must not contain another copy of the editor script tag.' };
  }

  const frag = parseFragment(html);
  if (!frag.childNodes.length) {
    return { ok: false, error: 'The browser parser produced nothing from that HTML — check the markup.' };
  }

  // Compare per-tag open-tag counts in the source text against the parsed
  // result. A mismatch means the parser dropped or relocated elements
  // (unclosed tags swallowing siblings, stray closers, <p><div> auto-closing…).
  const srcCounts = tagCounts(html);
  const parsedCounts = new Map<string, number>();
  frag.querySelectorAll('*').forEach((el) => {
    const t = el.tagName.toLowerCase();
    parsedCounts.set(t, (parsedCounts.get(t) ?? 0) + 1);
  });
  const diffs: string[] = [];
  for (const [tag, n] of srcCounts) {
    const got = parsedCounts.get(tag) ?? 0;
    if (got !== n) diffs.push(`<${tag}>: wrote ${n}, parser kept ${got}`);
  }
  if (diffs.length) {
    const tpl = document.createElement('template');
    tpl.content.appendChild(frag.cloneNode(true));
    return {
      ok: true,
      warning:
        `The browser auto-corrected your HTML (${diffs.join('; ')}). ` +
        `It was applied as:\n${truncate(tpl.innerHTML, 1500)}\n` +
        `If that is not what you intended, fix the markup and edit again.`,
    };
  }
  return { ok: true };
}

function tagCounts(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  // Skip the contents of raw-text elements (script/style) when counting.
  const stripped = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '<$1></$1>');
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)[\s/>]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    const tag = m[1].toLowerCase();
    if (VOID_TAGS.has(tag)) continue;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ---------------------------------------------------------------------------
// Document invariants

export interface InvariantReport {
  ok: boolean;
  repaired: string[];
}

/**
 * Check + repair the invariants that keep the file alive and editable:
 * doctype, <title>, exactly one config block, exactly one editor script tag.
 * Operates on the *clone* used for serialization.
 */
export function enforceInvariants(root: HTMLElement, editorSrc: string, configJson: string): InvariantReport {
  const repaired: string[] = [];
  const head = root.querySelector('head') ?? root.insertBefore(document.createElement('head'), root.firstChild);

  if (!head.querySelector('title')) {
    const t = document.createElement('title');
    t.textContent = document.title || 'Untitled page';
    head.appendChild(t);
    repaired.push('missing <title>');
  }

  const configs = Array.from(root.querySelectorAll(`#${CONFIG_ID}`));
  configs.slice(1).forEach((c) => c.remove());
  if (configs.length > 1) repaired.push('duplicate config blocks');
  let config = configs[0] as HTMLScriptElement | undefined;
  if (!config) {
    config = document.createElement('script');
    config.type = 'application/json';
    config.id = CONFIG_ID;
    head.appendChild(config);
    repaired.push('missing config block');
  }
  config.textContent = '\n' + configJson + '\n';

  const editors = Array.from(root.querySelectorAll(`script[${EDITOR_SCRIPT_ATTR}]`));
  editors.slice(1).forEach((e) => e.remove());
  if (editors.length > 1) repaired.push('duplicate editor script tags');
  if (!editors.length) {
    const s = document.createElement('script');
    s.src = editorSrc;
    s.defer = true;
    s.setAttribute(EDITOR_SCRIPT_ATTR, '1');
    head.appendChild(s);
    repaired.push('missing editor script tag');
  }

  return { ok: repaired.length === 0, repaired };
}
