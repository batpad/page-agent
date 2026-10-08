// Turn the live DOM back into the HTML file.
//
// Rules:
//  - overlay + [data-pa-ephemeral] nodes are removed
//  - [data-ephemeral] (user convention) nodes are removed
//  - [data-volatile] containers keep themselves but lose their children
//    (scripts render into them at runtime)
//  - all data-pa* bookkeeping attributes are stripped (except the editor
//    script marker, which is part of the file contract)
//  - invariants are enforced (config block, editor tag, title, doctype)
//  - output is conservatively pretty-printed: only elements with no mixed
//    text content get re-indented, so inline whitespace is never corrupted

import { EPHEMERAL_ATTR, ID_ATTR, OVERLAY_HOST_ID } from './dom';
import { enforceInvariants } from './validate';

const INDENT = '  ';
const RAW_TEXT_TAGS = new Set(['script', 'style', 'pre', 'textarea']);
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

export function serializePage(
  editorSrc: string,
  configJson: string,
  transform?: (root: HTMLElement) => void,
): string {
  const root = document.documentElement.cloneNode(true) as HTMLElement;

  root.querySelector(`#${OVERLAY_HOST_ID}`)?.remove();
  root.querySelectorAll(`[${EPHEMERAL_ATTR}]`).forEach((el) => el.remove());
  root.querySelectorAll('[data-ephemeral]').forEach((el) => el.remove());
  root.querySelectorAll('[data-volatile]').forEach((el) => { el.innerHTML = ''; });

  root.querySelectorAll(`[${ID_ATTR}]`).forEach((el) => el.removeAttribute(ID_ATTR));
  root.removeAttribute(ID_ATTR);

  transform?.(root);
  enforceInvariants(root, editorSrc, configJson);

  return '<!doctype html>\n' + printElement(root, 0) + '\n';
}

function printElement(el: Element, depth: number): string {
  const tag = el.tagName.toLowerCase();
  const open = `<${tag}${printAttrs(el)}>`;
  if (VOID_TAGS.has(tag)) return open;

  if (RAW_TEXT_TAGS.has(tag)) {
    return open + (el.textContent ?? '') + `</${tag}>`;
  }

  const children = Array.from(el.childNodes);
  const meaningful = children.filter(
    (n) => !(n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim()),
  );

  if (!meaningful.length) return open + `</${tag}>`;

  const hasText = meaningful.some((n) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.COMMENT_NODE);
  if (hasText) {
    // Mixed content: emit verbatim to preserve inline whitespace semantics.
    let inner = '';
    for (const n of children) inner += nodeToString(n);
    return open + inner + `</${tag}>`;
  }

  // Element-only content: indent one child per line.
  const pad = INDENT.repeat(depth + 1);
  const inner = meaningful
    .map((n) => pad + printElement(n as Element, depth + 1))
    .join('\n');
  return `${open}\n${inner}\n${INDENT.repeat(depth)}</${tag}>`;
}

function nodeToString(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return escapeText(n.textContent ?? '');
  if (n.nodeType === Node.COMMENT_NODE) return `<!--${n.textContent ?? ''}-->`;
  if (n.nodeType === Node.ELEMENT_NODE) return (n as Element).outerHTML;
  return '';
}

function printAttrs(el: Element): string {
  let out = '';
  for (const attr of Array.from(el.attributes)) {
    out += attr.value === '' ? ` ${attr.name}` : ` ${attr.name}="${escapeAttr(attr.value)}"`;
  }
  return out;
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
