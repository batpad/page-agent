# AGENTS.md — Page Agent

Orientation for agents working on this codebase. Read this before touching anything; the design has several non-obvious constraints that look like bugs if you don't know why they're there.

## The idea

TiddlyWiki, but agent-driven: a **single HTML file is both the document and the distribution medium**. One hosted `<script>` tag (`dist/page-agent.js`) gives any page an overlay with a chat agent, an element inspector, structured+validated editing tools, in-place saving, and a plugin system. People open the file, talk to the agent, watch the page change live, hit Save, and the file on disk is updated. Copies of the file stay editable because the script tag travels with it.

Everything optimizes for that one property. When in doubt, the single self-contained HTML file wins over elegance, features, or framework comfort.

## Non-negotiable design decisions (agreed with the project owner)

- **TypeScript + esbuild**, single IIFE bundle, **zero runtime dependencies**. Keep it that way.
- Overlay UI is **vanilla DOM** via the tiny `h()` helper (`src/ui/h.ts`). No framework, not even Preact.
- The embedded agent is steered toward **plain semantic HTML/CSS/JS** in user pages — small models do best with it. No frameworks in generated pages.
- Agent edits apply **live to the real DOM with an undo stack**; there is deliberately no per-edit approval. Saving is the gate.
- WebLLM is **deferred but designed for**: it will be one more implementation of `Provider` (`src/agent/providers/types.ts`). Don't let anything grow provider-specific assumptions.
- Platform quirks: timebox investigation, keep the abstraction so every outcome slots in, ship the fallback, and **report which world we're in** rather than chasing workarounds (owner preference).

## The page contract

A Page Agent file is ordinary HTML plus three managed pieces:

```html
<style id="page-styles">                                   <!-- the ONE agent-managed stylesheet -->
<script type="application/json" id="pa-config">…</script>   <!-- portable config: plugins, model pref, meta -->
<script src="…/page-agent.js" defer data-pa-editor="1">     <!-- the editor itself -->
```

**Serializer invariants** (enforced + auto-repaired on every save, `src/core/validate.ts:enforceInvariants`): doctype, `<title>`, exactly one config block, exactly one editor script tag. Agent tools additionally *refuse* to touch these ("protected elements", `src/core/dom.ts:isProtected`). Never weaken either layer; they're what keeps saved files alive and editable.

**Config split** (`src/core/config.ts`): portable config travels in `#pa-config` inside the file; machine-local settings (API keys, save-backend override, plugin consent hashes) live in localStorage under `page-agent:settings`. **Secrets must never be serialized into the HTML file** — people mail these files around.

## The core problem: the DOM is the document

Serializing the live DOM would bake runtime script output into the file (a clock would freeze). Conventions, taught to the model in the system prompt and enforced by `src/core/serialize.ts`:

- `data-volatile` — element kept on save, **children cleared**; scripts render into these and must tolerate re-running and starting empty.
- `data-ephemeral` — element **dropped entirely** on save (used by runtime-injected CDN tags, script runners, etc.).
- `data-pa*` attributes — editor bookkeeping, stripped on save (except `data-pa-editor`, which marks the editor tag and is part of the contract).

The serializer also conservatively pretty-prints: only elements with **no mixed text content** get re-indented, so inline whitespace semantics are never corrupted. Don't "improve" it into a full formatter.

## Architecture / module map

```
src/index.ts            boot: find own <script> (currentScript → data-pa-editor → src match),
                        wire everything, expose window.PageAgent, fire 'page-agent-ready'
src/core/dom.ts         ephemeral ids (data-pa="e7"), outline builder, edit ops, undo stack,
                        managed scripts/stylesheet, protected-element checks, flash highlight
src/core/validate.ts    fragment validation + document invariants (see below)
src/core/serialize.ts   clone → strip/clean → plugin onBeforeSave hooks → invariants → pretty-print
src/core/save.ts        Saver: 3 backends, auto-detect order http-put > fsa > download;
                        FSA handle persisted in IndexedDB ('page-agent'/'file-handles', key = href)
src/core/config.ts      portable config + local settings (localStorage w/ in-memory fallback)
src/agent/loop.ts       tool-calling loop: 15-iteration cap, system prompt rebuilt every round
                        so the page outline stays current, errors fed back as tool results
src/agent/prompts.ts    system prompt (RULES / STYLE / CURRENT PAGE / plugin sections)
src/agent/tools.ts      built-in tools; all mutations run through validateFragment + undo
src/agent/providers/    types.ts (the Provider interface), openai-compat.ts (SSE streaming +
                        tool-call delta accumulation), openrouter.ts (preset + model listing),
                        mock.ts (scripted turns for tests, window.__paMockScript / __paMockLog)
src/plugins/registry.ts register/validate plugins, merge tools + prompts + commands + hooks
src/plugins/loader.ts   inline (text/plain blocks → Blob-URL import) and remote (URL) loading,
                        consent via SHA-256 content hash in local settings
src/ui/                 shadow-DOM overlay in #pa-overlay-host: overlay.ts (shell, tabs, savebar,
                        toasts, confirm modal), chat.ts, inspector.ts, page-panel.ts, settings.ts,
                        context.ts (UIContext — how panels talk to each other), h.ts, styles.ts
server/serve.mjs        zero-dep static+PUT save server; OPTIONS advertises `x-pa-save: 1`,
                        PUT writes body to disk keeping a .bak of the previous version
template/blank.html     starter page (note: users may save their own content over local copies —
                        its *intended* role is the pristine template; restore from git/README if needed)
examples/homepage.html  conventions demo; examples/map-page.html — worked inline-plugin example
tests/smoke.html        the test suite (see Testing)
```

Elements are addressed by **ephemeral ids** (`[e12]`, stamped as `data-pa` attrs by `tagPage()`, stripped on save). The agent never sees raw full-page HTML; it gets a token-lean outline and reads elements on demand.

### Validation philosophy

Browsers never error on bad HTML — they silently "fix" it, which is worse than an error for an agent. So `validateFragment`:
1. rejects outright: `<html>/<head>/<body>` in fragments, second config block, second editor tag;
2. parses via `<template>`, then compares **per-tag open-tag counts** in the source text vs. the parsed result — a mismatch means the parser dropped/relocated elements (unclosed tags, `<p><div>` auto-closing, stray closers) and produces a *warning containing the corrected HTML*, returned to the model as the tool result so it can self-correct.

Validation failures never throw at the user; they're strings starting with `ERROR:` / containing `WARNING:` flowing back through the loop.

### Plugin system

Users extend the **agent** from inside their own file; the library stays generic. Declared in `#pa-config` → `plugins: [{name, src: "inline" | url}]`. Inline source travels in inert `<script type="text/plain" data-plugin="name">` blocks, imported via Blob URL. Tool `parameters` are JSON Schema (OpenAI/MCP function format). Plugins get `PluginApi` (`ctx.dom`, `ctx.validate`, `ctx.config`, `ctx.notify`, `ctx.markDirty`) — this is the **stable surface**; breaking it breaks plugins embedded in files in the wild, so treat it like a public API. New/changed plugins require one-time consent (content hash in local settings). `window.PageAgent.register(plugin)` is the programmatic path. `examples/map-page.html` is the reference implementation of a non-trivial plugin.

Dynamic `import()` is wrapped in `new Function('u','return import(u)')` in loader.ts **on purpose** — esbuild would otherwise transform it in an IIFE build.

## Hard-won gotchas (do not relearn these)

- **FSA works on `file://` in Chrome** (probed 2026-10-08): `showOpenFilePicker`, localStorage, IndexedDB all available; `isSecureContext` is true. The serverless double-click UX is real on Chromium. Firefox/Safari get the PUT server or download fallback.
- **Script execution semantics** (`dom.ts:upsertScript`): setting `textContent` on an *empty* already-inserted `<script>` DOES execute it (HTML "children changed" steps — an empty script is never marked already-started). And module scripts evaluate async, so a runner `<script type=module>` must **stay in the DOM** until evaluation (it's marked `data-pa-ephemeral` and removed after 2s). New blocks execute once on insertion; updates need the ephemeral runner.
- A page can't get a write handle to the file it was loaded from — the FSA flow must ask the user to pick the file on first save. Persisted handles still need a `requestPermission` per session.
- The overlay lives in a shadow root under `#pa-overlay-host` appended to `documentElement` (not body) so `tagPage()`/serialization never see it. Inspector hit-testing uses `composedPath()[0].getRootNode() !== document` to ignore overlay-internal events.
- Boot is idempotent (`#pa-overlay-host` existence guard) because saved files that were booted via dynamic script injection can end up with two includes.
- OpenRouter CORS from `file://` (`Origin: null`) is expected to work but **not yet verified with a real key** — see Status.

## Build, run, test

```sh
npm run build        # esbuild → dist/page-agent.js + .min.js (~58KB min, no deps)
npm run watch        # watch mode with inline sourcemaps
npx tsc --noEmit     # typecheck (strict; keep it clean)
node server/serve.mjs . [port=8440]   # save server; open /template/blank.html
```

### Testing (no test framework — headless Chrome drives the real bundle)

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --disable-gpu --virtual-time-budget=8000 \
  --dump-dom "file://$PWD/tests/smoke.html" 2>/dev/null \
  | grep -o 'RESULTS_JSON{[^E]*END_RESULTS'
```

`tests/smoke.html` (27 assertions) seeds localStorage (mock provider + plugin-consent hash) *before* injecting the bundle, then exercises: boot, validation, edit ops + undo, protected elements, serialization invariants (`data-volatile` emptying, id stripping, editor-tag survival), managed-script execute/re-execute, the full agent loop driven by the **mock provider** (`window.__paMockScript` = scripted turns; `window.__paMockLog` captures every request's messages for asserting on system prompts and tool results), and inline plugin loading. Results land in `<pre id="results">` as `RESULTS_JSON{…}END_RESULTS`.

Pitfalls when editing the test: the page's own inline script text is part of the dumped DOM, so never grep the raw HTML for strings that appear in the test source — parse with `DOMParser` and assert on the DOM. Keep `--virtual-time-budget` ≥ the test's internal timeouts.

The PUT save loop has been verified end-to-end (headless page edited itself → `PUT` → file changed on disk, `.bak` created). There's no committed test for it; the pattern is in the session history: generate a throwaway page under the server root, drive it headless, grep the file.

Run the smoke test after any change to core/, agent/, or plugins/. For UI changes, also load `template/blank.html` in a real browser — the inspector and FSA save need a human hand.

## Status / roadmap

Done and verified: milestones 1 (save loop), 2 (DOM core + inspector), 4 (plugins), and 3 with the mock provider.

**Real-model verification: done (2026-10-08).** OpenRouter CORS allows `Origin: null`, so `file://` pages call the API directly. E2E passed with `z-ai/glm-5.3-flash` (cheap small model): 3-section homepage via tool calls, all invariants held — the simple-HTML steering works on small models. The key lives in `.env` (gitignored, `OPENROUTER_KEY`). E2E harness pattern (not committed, embeds the key): generate `tests/tmp-real.html` seeding localStorage with provider+key, serve via `server/serve.mjs`, run live headless Chrome (no `--dump-dom`), page PUTs a results JSON back through the server; delete tmp files afterwards.

**Distribution**: `dist/` is committed on purpose — it's served via jsDelivr (`https://cdn.jsdelivr.net/gh/batpad/page-agent@main/dist/page-agent.min.js`; raw.githubusercontent serves `text/plain`+`nosniff` and won't execute). Rebuild `dist/` whenever `src/` changes so the committed bundle never goes stale. The end-user starter lives in a **separate repo**: `~/batpad/selfedit` → GitHub `batpad/selfedit-html` (one HTML file + user-facing README); keep its script URL and instructions in sync with changes here.

**Workflow**: the owner commits and pushes himself — stage changes (`git add`) and hand off; never `git commit` or push.

Open items, roughly in order:
1. Replace browser `prompt()` dialogs in the add-plugin flows (page-panel.ts) with proper modals.
2. Retry-on-429 in the agent loop (upstream rate limits currently surface as terminal errors).
3. "Revert to last saved" (undo stack covers per-edit revert; whole-page revert needs the last-saved HTML kept in memory).
4. WebLLM provider adapter (lazy-loaded; implements `Provider`, nothing else should change).
5. Educational polish: per-edit one-line explanations are prompted for but could surface better in tool rows.

Out of scope for v1 (deliberate): multi-file/asset management, collaboration/sync, plugin integrity pinning, a mirrored source-document model, serverless in-place save on non-Chromium.

The original plan lives at `~/.claude/plans/there-used-to-be-curious-plum.md`; README.md is the user-facing version of this document — keep both in sync when behavior changes.
