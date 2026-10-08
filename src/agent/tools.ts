// Built-in agent tools. Every mutating tool runs fragments through
// validation and is undoable. Plugin tools are merged in by the registry.

import {
  elementOutline, getElement, insertHtml, listManagedScripts, pageOutline,
  readManagedScript, readStyles, removeElement, removeManagedScript,
  replaceElement, setAttributes, setStyles, setText, undo, upsertScript,
  type InsertPosition, type OpResult,
} from '../core/dom';
import { validateFragment } from '../core/validate';
import { configJson, getConfig, syncConfigElement, type PortableConfig } from '../core/config';

export interface ToolContext {
  markDirty(): void;
  onToolEffect?(name: string, summary: string): void;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> | string;
}

const str = (desc: string) => ({ type: 'string', description: desc });

function mutation(result: OpResult, ctx: ToolContext, okMsg: string): string {
  if (!result.ok) return `ERROR: ${result.error}`;
  ctx.markDirty();
  let msg = okMsg;
  if (result.warning) msg += `\nWARNING: ${result.warning}`;
  if (result.changed?.length) msg += `\nNew/changed element ids: ${result.changed.join(', ')}`;
  return msg;
}

function withValidation(html: string, apply: () => OpResult, ctx: ToolContext, okMsg: string): string {
  const v = validateFragment(html);
  if (!v.ok) return `ERROR: ${v.error}`;
  const out = mutation(apply(), ctx, okMsg);
  return v.warning ? `${out}\nWARNING: ${v.warning}` : out;
}

export const builtinTools: ToolDef[] = [
  {
    name: 'get_page_overview',
    description:
      'Get the current page structure: title, an outline tree of elements with their ids (like [e12]), the managed stylesheet size, managed scripts, and config. Always call this before editing if you are unsure of current element ids.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: () => {
      const cfg = getConfig();
      return [
        `Title: ${document.title || '(none)'}`,
        `Outline (ids in [brackets] are what edit tools take):`,
        pageOutline(),
        `Managed stylesheet (#page-styles): ${readStyles().length} chars (read_styles to view)`,
        `Managed scripts: ${listManagedScripts().map((s) => `${s.name} (${s.length} chars)`).join(', ') || '(none)'}`,
        `Plugins: ${cfg.plugins.map((p) => p.name).join(', ') || '(none)'}`,
      ].join('\n');
    },
  },
  {
    name: 'read_element',
    description: 'Read the full HTML of one element by its id (e.g. "e12").',
    parameters: {
      type: 'object',
      properties: { id: str('Element id from the outline, e.g. "e12"') },
      required: ['id'],
    },
    execute: ({ id }) => {
      const el = getElement(String(id));
      if (!el) return `ERROR: no element "${id}". Call get_page_overview for current ids.`;
      const html = el.outerHTML;
      return html.length > 8000
        ? `Element is large (${html.length} chars). Outline instead:\n${elementOutline(el)}`
        : html;
    },
  },
  {
    name: 'edit_element',
    description:
      'Replace an element entirely with new HTML (can be one or several elements). Read it first unless you just created it.',
    parameters: {
      type: 'object',
      properties: { id: str('Element id to replace'), html: str('Replacement HTML fragment') },
      required: ['id', 'html'],
    },
    execute: ({ id, html }, ctx) =>
      withValidation(String(html), () => replaceElement(String(id), String(html)), ctx, `Replaced ${id}.`),
  },
  {
    name: 'insert_html',
    description: 'Insert an HTML fragment relative to an existing element.',
    parameters: {
      type: 'object',
      properties: {
        target_id: str('Existing element id to position against'),
        position: { type: 'string', enum: ['before', 'after', 'prepend', 'append'], description: 'Where to insert relative to the target' },
        html: str('HTML fragment to insert'),
      },
      required: ['target_id', 'position', 'html'],
    },
    execute: ({ target_id, position, html }, ctx) =>
      withValidation(String(html), () => insertHtml(String(target_id), String(position) as InsertPosition, String(html)), ctx, `Inserted ${position} ${target_id}.`),
  },
  {
    name: 'remove_element',
    description: 'Remove an element from the page.',
    parameters: {
      type: 'object',
      properties: { id: str('Element id to remove') },
      required: ['id'],
    },
    execute: ({ id }, ctx) => mutation(removeElement(String(id)), ctx, `Removed ${id}.`),
  },
  {
    name: 'set_text',
    description: 'Replace the text content of an element (keeps the element, drops its children). Good for headings, paragraphs, buttons.',
    parameters: {
      type: 'object',
      properties: { id: str('Element id'), text: str('New plain-text content') },
      required: ['id', 'text'],
    },
    execute: ({ id, text }, ctx) => mutation(setText(String(id), String(text)), ctx, `Set text of ${id}.`),
  },
  {
    name: 'set_attributes',
    description: 'Set or remove attributes on an element. Pass null to remove an attribute.',
    parameters: {
      type: 'object',
      properties: {
        id: str('Element id'),
        attributes: { type: 'object', description: 'Map of attribute name to value, or null to remove', additionalProperties: { type: ['string', 'null'] } },
      },
      required: ['id', 'attributes'],
    },
    execute: ({ id, attributes }, ctx) =>
      mutation(setAttributes(String(id), (attributes ?? {}) as Record<string, string | null>), ctx, `Updated attributes of ${id}.`),
  },
  {
    name: 'read_styles',
    description: 'Read the full contents of the managed stylesheet (#page-styles).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: () => readStyles() || '(stylesheet is empty)',
  },
  {
    name: 'set_styles',
    description:
      'Replace the entire managed stylesheet (#page-styles) with new CSS. Use append_styles to add rules without reading first.',
    parameters: {
      type: 'object',
      properties: { css: str('Complete CSS for the page') },
      required: ['css'],
    },
    execute: ({ css }, ctx) => mutation(setStyles(String(css)), ctx, 'Stylesheet replaced.'),
  },
  {
    name: 'append_styles',
    description: 'Append CSS rules to the managed stylesheet.',
    parameters: {
      type: 'object',
      properties: { css: str('CSS rules to append') },
      required: ['css'],
    },
    execute: ({ css }, ctx) => mutation(setStyles(String(css), true), ctx, 'CSS appended.'),
  },
  {
    name: 'set_title',
    description: 'Set the page <title>.',
    parameters: {
      type: 'object',
      properties: { title: str('New page title') },
      required: ['title'],
    },
    execute: ({ title }, ctx) => {
      document.title = String(title);
      ctx.markDirty();
      return `Title set to "${title}".`;
    },
  },
  {
    name: 'read_script',
    description: 'Read the code of a managed script block by name.',
    parameters: {
      type: 'object',
      properties: { name: str('Managed script name') },
      required: ['name'],
    },
    execute: ({ name }) => readManagedScript(String(name)) ?? `ERROR: no managed script "${name}".`,
  },
  {
    name: 'upsert_script',
    description:
      'Create or replace a named JavaScript module that is stored in the page and runs on load. It also runs immediately now. Scripts that render content must render into an element marked data-volatile and tolerate re-running.',
    parameters: {
      type: 'object',
      properties: {
        name: str('Short identifier for this script, e.g. "clock" or "gallery"'),
        code: str('JavaScript (ES module) source'),
      },
      required: ['name', 'code'],
    },
    execute: ({ name, code }, ctx) => mutation(upsertScript(String(name), String(code)), ctx, `Script "${name}" stored and executed.`),
  },
  {
    name: 'remove_script',
    description: 'Remove a managed script block from the page.',
    parameters: {
      type: 'object',
      properties: { name: str('Managed script name') },
      required: ['name'],
    },
    execute: ({ name }, ctx) => mutation(removeManagedScript(String(name)), ctx, `Script "${name}" removed.`),
  },
  {
    name: 'read_config',
    description: 'Read the portable page config (plugins, metadata) stored in the file.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: () => configJson(),
  },
  {
    name: 'update_config',
    description: 'Merge a patch into the portable page config. Only non-secret, page-level data belongs here.',
    parameters: {
      type: 'object',
      properties: { patch: { type: 'object', description: 'Fields to merge into the config' } },
      required: ['patch'],
    },
    execute: ({ patch }, ctx) => {
      const cfg = getConfig();
      Object.assign(cfg, patch as Partial<PortableConfig>);
      syncConfigElement();
      ctx.markDirty();
      return 'Config updated:\n' + configJson();
    },
  },
  {
    name: 'undo',
    description: 'Undo the last n edit operations (default 1).',
    parameters: {
      type: 'object',
      properties: { n: { type: 'integer', description: 'How many operations to undo', default: 1 } },
    },
    execute: ({ n }, ctx) => {
      const done = undo(Number(n ?? 1));
      if (done) ctx.markDirty();
      return done ? `Undid ${done} operation(s).` : 'Nothing to undo.';
    },
  },
];
