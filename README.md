# Page Agent

A single HTML file that edits itself — TiddlyWiki's idea, driven by an AI agent.

One `<script>` tag gives any HTML page an overlay with a chat agent, an element
inspector, structured + validated editing tools, in-place saving, and a plugin
system. The HTML file is the document **and** the distribution medium: copy it,
mail it, host it anywhere — it stays editable, because the script tag travels
with it.

```html
<script src="https://your-host/page-agent.js" defer data-pa-editor="1"></script>
```

## Quick start

```sh
npm install
npm run build          # → dist/page-agent.js (+ .min.js)

# easiest: with the save server (silent in-place saves, any browser)
node server/serve.mjs .
# open http://localhost:8440/template/blank.html

# or serverless: just double-click template/blank.html in Chrome/Edge
# (saving uses the browser's file permission — you pick the file once)
```

## Hosting the editor JS

`dist/` is committed so the bundle can be served straight from the repo via
jsDelivr (raw.githubusercontent.com won't work — it serves JS as `text/plain`
with `nosniff`, so browsers refuse to execute it):

```html
<script src="https://cdn.jsdelivr.net/gh/batpad/page-agent@main/dist/page-agent.min.js"
        defer data-pa-editor="1"></script>
```

`@main` tracks the branch with ~12h CDN lag; pin a tag (`@v0.1.0`) for
immutable files floating around in the wild. No separate hosting or copy step
needed — push to GitHub and the URL is live.

The end-user starter file lives in its own repo: **batpad/selfedit-html**
(`~/batpad/selfedit`) — a single HTML page pointing at the URL above, with a
user-oriented README.

Open the ✎ button → **Settings** → pick OpenRouter (or any OpenAI-compatible
endpoint — Ollama, LM Studio, …), paste your API key, choose a tool-capable
model. Keys live only in that browser's localStorage, never in the HTML file.

Then just talk: *"make me a homepage with a dark header and three sections"*.
Edits apply live with highlight flashes and an undo stack; **Save** writes the
file when you're happy.

## The page contract

A Page Agent file is ordinary HTML plus three managed pieces:

```html
<style id="page-styles">        <!-- the one agent-managed stylesheet -->
<script type="application/json" id="pa-config">   <!-- portable config -->
<script src="…/page-agent.js" defer data-pa-editor="1">   <!-- the editor -->
```

On every save the serializer enforces invariants (exactly one editor tag, one
config block, a doctype, a title), strips all editor bookkeeping, and
conservatively pretty-prints the output so the file stays human-readable.

**Dynamic content convention:** the DOM *is* the document, so a save would
normally bake runtime script output into the file. Scripts therefore render
into containers marked `data-volatile` (children cleared on save, re-rendered
on load). `data-ephemeral` elements are dropped from saves entirely. The agent
is prompted to follow this automatically.

## Saving

Three interchangeable backends, auto-detected (override in Settings):

| backend | when | behavior |
|---|---|---|
| `http-put` | served by a PUT-capable server (`server/serve.mjs`, WebDAV…) | silent save back to the page's own URL; previous version kept as `.bak` |
| `fsa` | Chromium, including plain `file://` pages | File System Access API — pick the file once, then one permission prompt per session |
| `download` | everywhere else (Firefox/Safari) | downloads a copy to replace manually |

## Agent tools

The model edits through structured, validated operations — never whole-page
rewrites: `get_page_overview`, `read_element`, `edit_element`, `insert_html`,
`remove_element`, `set_text`, `set_attributes`, `set_styles` / `append_styles`,
`set_title`, `upsert_script` / `read_script` / `remove_script`,
`read_config` / `update_config`, `undo`.

Elements are addressed by ephemeral ids (`[e12]`) stamped as `data-pa`
attributes and stripped on save. Because browsers silently "fix" bad HTML
instead of erroring, the validator detects what the parser changed and feeds
it back to the model as a correction prompt. Protected pieces (editor tag,
config block) refuse edits and are repaired on save if anything slips through.

## Plugins

Users extend the **agent** from inside their own file. Declare in the config:

```json
{ "plugins": [{ "name": "map-tools", "src": "inline" }] }
```

`src: "inline"` means the source travels in the file, inert until loaded:

```html
<script type="text/plain" data-plugin="map-tools">
export default {
  name: 'map-tools',
  systemPrompt: 'Extra instructions for the agent…',
  tools: [{
    name: 'add_map',
    description: '…',
    parameters: { /* JSON Schema — same format as OpenAI/MCP tools */ },
    execute(args, ctx) { /* ctx.dom, ctx.validate, ctx.config, ctx.notify */ }
  }],
  commands: [{ label: 'Button in the drawer', run(ctx) {} }],
  onLoad(ctx) {}, onBeforeSave(docClone, ctx) {}
};
</script>
```

`src` can also be a URL to a remote ES module. Plugins are code, so any new or
changed plugin asks for one-time consent (recorded as a content hash, locally
only). `examples/map-page.html` is a complete worked example: it teaches the
agent an `add_map` tool that wires up Leaflet maps correctly.

Programmatic registration also works: `window.PageAgent.register({...})`.

## Project layout

```
src/core/      dom ops + undo, validation, serializer, saver, config
src/agent/     loop, prompts, tools, providers (openai-compat, openrouter, mock)
src/plugins/   registry + loader (inline / remote, consent)
src/ui/        shadow-DOM overlay: chat, inspector, page panel, settings
server/        optional zero-dep static+PUT save server
template/      blank starter page
examples/      homepage, map plugin demo
tests/         smoke.html — run via headless Chrome (see below)
```

```sh
npx tsc --noEmit    # typecheck
# smoke test (27 assertions: boot, ops, undo, validation, serialization,
# mock-provider agent loop, inline plugin loading):
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --virtual-time-budget=8000 --dump-dom "file://$PWD/tests/smoke.html" \
  | grep -o 'RESULTS_JSON{[^E]*END_RESULTS'
```

## Current limitations

- WebLLM (in-browser model) is designed for — `Provider` is one interface —
  but not yet implemented.
- Serverless in-place save is Chromium-only; others use the server or download.
- Scripts that ignore the `data-volatile` convention will have their runtime
  DOM baked into saves.
- Browser `prompt()` dialogs are still used for the add-plugin flows.
