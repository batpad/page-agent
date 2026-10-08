"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/core/dom.ts
  var dom_exports = {};
  __export(dom_exports, {
    CONFIG_ID: () => CONFIG_ID,
    EDITOR_SCRIPT_ATTR: () => EDITOR_SCRIPT_ATTR,
    EPHEMERAL_ATTR: () => EPHEMERAL_ATTR,
    ID_ATTR: () => ID_ATTR,
    MANAGED_SCRIPT_ATTR: () => MANAGED_SCRIPT_ATTR,
    OVERLAY_HOST_ID: () => OVERLAY_HOST_ID,
    STYLES_ID: () => STYLES_ID,
    clearUndo: () => clearUndo,
    describeElement: () => describeElement,
    elementOutline: () => elementOutline,
    flash: () => flash,
    getElement: () => getElement,
    getStylesEl: () => getStylesEl,
    idOf: () => idOf,
    insertHtml: () => insertHtml,
    isOverlayNode: () => isOverlayNode,
    isProtected: () => isProtected,
    listManagedScripts: () => listManagedScripts,
    onMutation: () => onMutation,
    pageOutline: () => pageOutline,
    parseFragment: () => parseFragment,
    pushUndo: () => pushUndo,
    readManagedScript: () => readManagedScript,
    readStyles: () => readStyles,
    removeElement: () => removeElement,
    removeManagedScript: () => removeManagedScript,
    replaceElement: () => replaceElement,
    scrollToElement: () => scrollToElement,
    setAttributes: () => setAttributes,
    setStyles: () => setStyles,
    setText: () => setText,
    tagPage: () => tagPage,
    tagTree: () => tagTree,
    undo: () => undo,
    undoDepth: () => undoDepth,
    upsertScript: () => upsertScript
  });
  var ID_ATTR = "data-pa";
  var EPHEMERAL_ATTR = "data-pa-ephemeral";
  var EDITOR_SCRIPT_ATTR = "data-pa-editor";
  var MANAGED_SCRIPT_ATTR = "data-pa-script";
  var CONFIG_ID = "pa-config";
  var STYLES_ID = "page-styles";
  var OVERLAY_HOST_ID = "pa-overlay-host";
  var idCounter = 0;
  var undoStack = [];
  var MAX_UNDO = 200;
  var dirtyListeners = [];
  function onMutation(fn) {
    dirtyListeners.push(fn);
  }
  function notifyMutation() {
    for (const fn of dirtyListeners) fn();
  }
  function pushUndo(entry) {
    undoStack.push(entry);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    notifyMutation();
  }
  function undoDepth() {
    return undoStack.length;
  }
  function undo(n = 1) {
    let done = 0;
    while (n-- > 0) {
      const entry = undoStack.pop();
      if (!entry) break;
      try {
        entry.undo();
      } catch {
      }
      done++;
    }
    if (done) notifyMutation();
    return done;
  }
  function clearUndo() {
    undoStack.length = 0;
  }
  function isOverlayNode(el) {
    return el.id === OVERLAY_HOST_ID || !!el.closest(`#${OVERLAY_HOST_ID}`);
  }
  function tagPage() {
    tagTree(document.body);
  }
  function tagTree(root) {
    if (isOverlayNode(root)) return;
    if (!root.hasAttribute(ID_ATTR)) root.setAttribute(ID_ATTR, `e${++idCounter}`);
    for (const el of Array.from(root.children)) tagTree(el);
  }
  function getElement(id) {
    const el = document.querySelector(`[${ID_ATTR}="${CSS.escape(id)}"]`);
    return el && !isOverlayNode(el) ? el : null;
  }
  function idOf(el) {
    return el.getAttribute(ID_ATTR);
  }
  function pageOutline(opts = {}) {
    tagPage();
    const { maxDepth = 6, maxChildren = 24 } = opts;
    const lines = [];
    walkOutline(document.body, 0, maxDepth, maxChildren, lines);
    return lines.join("\n");
  }
  function elementOutline(el, opts = {}) {
    tagPage();
    const { maxDepth = 6, maxChildren = 40 } = opts;
    const lines = [];
    walkOutline(el, 0, maxDepth, maxChildren, lines);
    return lines.join("\n");
  }
  function walkOutline(el, depth, maxDepth, maxChildren, out) {
    if (isOverlayNode(el)) return;
    const indent = "  ".repeat(depth);
    out.push(indent + describeElement(el));
    if (depth >= maxDepth) {
      if (el.children.length) out.push(`${indent}  \u2026 (${el.children.length} children, use read_element to expand)`);
      return;
    }
    const kids = Array.from(el.children).filter((c) => !isOverlayNode(c));
    kids.slice(0, maxChildren).forEach((c) => walkOutline(c, depth + 1, maxDepth, maxChildren, out));
    if (kids.length > maxChildren) out.push(`${indent}  \u2026 ${kids.length - maxChildren} more children`);
  }
  function describeElement(el) {
    const id = el.getAttribute(ID_ATTR) ?? "?";
    let desc = `[${id}] <${el.tagName.toLowerCase()}`;
    if (el.id) desc += ` id="${el.id}"`;
    const cls = el.getAttribute("class");
    if (cls) desc += ` class="${cls}"`;
    desc += ">";
    const text = ownText(el);
    if (text) desc += ` "${text.length > 60 ? text.slice(0, 60) + "\u2026" : text}"`;
    return desc;
  }
  function ownText(el) {
    let t = "";
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) t += n.textContent ?? "";
    }
    t = t.replace(/\s+/g, " ").trim();
    if (!t && el.children.length === 0) t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    return t;
  }
  function isProtected(el) {
    if (el.id === CONFIG_ID) return "the page config block";
    if (el.hasAttribute(EDITOR_SCRIPT_ATTR)) return "the editor script tag";
    if (el.id === OVERLAY_HOST_ID) return "the editor overlay";
    if (el === document.body) return "<body> itself (edit its children instead)";
    if (el === document.documentElement || el === document.head) return "the document root";
    return null;
  }
  function containsProtected(el) {
    const p = isProtected(el);
    if (p) return p;
    for (const child of Array.from(el.querySelectorAll("script, style"))) {
      const cp = isProtected(child);
      if (cp) return cp;
    }
    return null;
  }
  function parseFragment(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    return tpl.content;
  }
  function replaceElement(id, html) {
    const el = getElement(id);
    if (!el) return { ok: false, error: `No element with id "${id}". Call get_page_overview for current ids.` };
    const prot = containsProtected(el);
    if (prot) return { ok: false, error: `Refusing to replace ${prot}.` };
    const frag = parseFragment(html);
    const newNodes = Array.from(frag.childNodes);
    const parent = el.parentNode;
    const anchor = el.nextSibling;
    parent.insertBefore(frag, el);
    el.remove();
    pushUndo({
      label: `replace ${id}`,
      undo() {
        parent.insertBefore(el, newNodes[0] ?? anchor);
        newNodes.forEach((n) => n.remove());
      }
    });
    tagPage();
    const changed = newNodes.filter((n) => n.nodeType === 1).map((n) => idOf(n)).filter(Boolean);
    flash(changed);
    return { ok: true, changed };
  }
  function insertHtml(targetId, position, html) {
    const el = getElement(targetId);
    if (!el) return { ok: false, error: `No element with id "${targetId}".` };
    if ((position === "before" || position === "after") && isProtected(el) === "<body> itself (edit its children instead)") {
      return { ok: false, error: "Cannot insert siblings of <body>; use prepend/append on body instead." };
    }
    const frag = parseFragment(html);
    const newNodes = Array.from(frag.childNodes);
    if (!newNodes.length) return { ok: false, error: "Empty HTML fragment." };
    switch (position) {
      case "before":
        el.before(frag);
        break;
      case "after":
        el.after(frag);
        break;
      case "prepend":
        el.prepend(frag);
        break;
      case "append":
        el.append(frag);
        break;
      default:
        return { ok: false, error: `Bad position "${position}" (use before|after|prepend|append).` };
    }
    pushUndo({
      label: `insert near ${targetId}`,
      undo() {
        newNodes.forEach((n) => n.remove());
      }
    });
    tagPage();
    const changed = newNodes.filter((n) => n.nodeType === 1).map((n) => idOf(n)).filter(Boolean);
    flash(changed);
    return { ok: true, changed };
  }
  function removeElement(id) {
    const el = getElement(id);
    if (!el) return { ok: false, error: `No element with id "${id}".` };
    const prot = containsProtected(el);
    if (prot) return { ok: false, error: `Refusing to remove ${prot}.` };
    const parent = el.parentNode;
    const anchor = el.nextSibling;
    el.remove();
    pushUndo({
      label: `remove ${id}`,
      undo() {
        parent.insertBefore(el, anchor);
      }
    });
    return { ok: true, changed: [] };
  }
  function setAttributes(id, attrs) {
    const el = getElement(id);
    if (!el) return { ok: false, error: `No element with id "${id}".` };
    if (isProtected(el)) return { ok: false, error: `Refusing to modify ${isProtected(el)}.` };
    const prev = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (/^data-pa/.test(k)) return { ok: false, error: `Attribute "${k}" is reserved for the editor.` };
      prev[k] = el.getAttribute(k);
      if (v === null) el.removeAttribute(k);
      else el.setAttribute(k, v);
    }
    pushUndo({
      label: `attrs ${id}`,
      undo() {
        for (const [k, v] of Object.entries(prev)) {
          if (v === null) el.removeAttribute(k);
          else el.setAttribute(k, v);
        }
      }
    });
    flash([id]);
    return { ok: true, changed: [id] };
  }
  function setText(id, text) {
    const el = getElement(id);
    if (!el) return { ok: false, error: `No element with id "${id}".` };
    if (isProtected(el)) return { ok: false, error: `Refusing to modify ${isProtected(el)}.` };
    const prevNodes = Array.from(el.childNodes);
    el.textContent = text;
    pushUndo({
      label: `text ${id}`,
      undo() {
        el.textContent = "";
        prevNodes.forEach((n) => el.appendChild(n));
      }
    });
    flash([id]);
    return { ok: true, changed: [id] };
  }
  function getStylesEl() {
    let el = document.getElementById(STYLES_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLES_ID;
      document.head.appendChild(el);
    }
    return el;
  }
  function readStyles() {
    return getStylesEl().textContent ?? "";
  }
  function setStyles(css, append = false) {
    const el = getStylesEl();
    const prev = el.textContent ?? "";
    el.textContent = append ? prev + "\n" + css : css;
    pushUndo({ label: "styles", undo() {
      el.textContent = prev;
    } });
    return { ok: true, changed: [] };
  }
  function listManagedScripts() {
    return Array.from(document.querySelectorAll(`script[${MANAGED_SCRIPT_ATTR}]`)).map((s) => ({
      name: s.getAttribute(MANAGED_SCRIPT_ATTR) ?? "",
      length: (s.textContent ?? "").length
    }));
  }
  function readManagedScript(name) {
    const s = document.querySelector(`script[${MANAGED_SCRIPT_ATTR}="${CSS.escape(name)}"]`);
    return s ? s.textContent ?? "" : null;
  }
  function upsertScript(name, code) {
    if (!/^[\w-]+$/.test(name)) return { ok: false, error: "Script name must be alphanumeric/dash/underscore." };
    let s = document.querySelector(`script[${MANAGED_SCRIPT_ATTR}="${CSS.escape(name)}"]`);
    const prev = s ? s.textContent ?? "" : null;
    let warning;
    if (!s) {
      s = document.createElement("script");
      s.setAttribute(MANAGED_SCRIPT_ATTR, name);
      s.setAttribute("type", "module");
      s.textContent = code;
      document.body.appendChild(s);
    } else {
      s.textContent = code;
      try {
        const runner = document.createElement("script");
        runner.type = "module";
        runner.setAttribute(EPHEMERAL_ATTR, "1");
        runner.textContent = code;
        document.body.appendChild(runner);
        setTimeout(() => runner.remove(), 2e3);
      } catch (e) {
        warning = `Script stored but failed to execute now: ${String(e)}`;
      }
    }
    const el = s;
    pushUndo({
      label: `script ${name}`,
      undo() {
        if (prev === null) el.remove();
        else el.textContent = prev;
      }
    });
    return { ok: true, warning, changed: [] };
  }
  function removeManagedScript(name) {
    const s = document.querySelector(`script[${MANAGED_SCRIPT_ATTR}="${CSS.escape(name)}"]`);
    if (!s) return { ok: false, error: `No managed script named "${name}".` };
    const parent = s.parentNode;
    const anchor = s.nextSibling;
    s.remove();
    pushUndo({ label: `rm script ${name}`, undo() {
      parent.insertBefore(s, anchor);
    } });
    return { ok: true, warning: "Removed from the page; code it already ran this session is still in effect until reload.", changed: [] };
  }
  function flash(ids) {
    for (const id of ids) {
      const el = getElement(id);
      if (!(el instanceof HTMLElement)) continue;
      try {
        el.animate(
          [
            { boxShadow: "0 0 0 3px rgba(94, 161, 255, 0.9)", offset: 0 },
            { boxShadow: "0 0 0 3px rgba(94, 161, 255, 0)", offset: 1 }
          ],
          { duration: 1200, easing: "ease-out" }
        );
      } catch {
      }
    }
  }
  function scrollToElement(id) {
    const el = getElement(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // src/core/validate.ts
  var validate_exports = {};
  __export(validate_exports, {
    enforceInvariants: () => enforceInvariants,
    validateFragment: () => validateFragment
  });
  var VOID_TAGS = /* @__PURE__ */ new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
  ]);
  var FORBIDDEN_IN_FRAGMENT = ["html", "head", "body", "frameset"];
  function validateFragment(html) {
    if (!html.trim()) return { ok: false, error: "Empty HTML fragment." };
    const lower = html.toLowerCase();
    for (const tag of FORBIDDEN_IN_FRAGMENT) {
      if (new RegExp(`<${tag}[\\s>]`).test(lower)) {
        return { ok: false, error: `Fragment must not contain <${tag}> \u2014 provide body content only.` };
      }
    }
    if (new RegExp(`id\\s*=\\s*["']?${CONFIG_ID}`).test(lower)) {
      return { ok: false, error: "Fragment must not contain a second page-config block." };
    }
    if (lower.includes(EDITOR_SCRIPT_ATTR) || /<script[^>]+src=[^>]*page-agent/.test(lower)) {
      return { ok: false, error: "Fragment must not contain another copy of the editor script tag." };
    }
    const frag = parseFragment(html);
    if (!frag.childNodes.length) {
      return { ok: false, error: "The browser parser produced nothing from that HTML \u2014 check the markup." };
    }
    const srcCounts = tagCounts(html);
    const parsedCounts = /* @__PURE__ */ new Map();
    frag.querySelectorAll("*").forEach((el) => {
      const t = el.tagName.toLowerCase();
      parsedCounts.set(t, (parsedCounts.get(t) ?? 0) + 1);
    });
    const diffs = [];
    for (const [tag, n] of srcCounts) {
      const got = parsedCounts.get(tag) ?? 0;
      if (got !== n) diffs.push(`<${tag}>: wrote ${n}, parser kept ${got}`);
    }
    if (diffs.length) {
      const tpl = document.createElement("template");
      tpl.content.appendChild(frag.cloneNode(true));
      return {
        ok: true,
        warning: `The browser auto-corrected your HTML (${diffs.join("; ")}). It was applied as:
${truncate(tpl.innerHTML, 1500)}
If that is not what you intended, fix the markup and edit again.`
      };
    }
    return { ok: true };
  }
  function tagCounts(html) {
    const counts = /* @__PURE__ */ new Map();
    const stripped = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "<$1></$1>");
    const re = /<([a-zA-Z][a-zA-Z0-9-]*)[\s/>]/g;
    let m;
    while (m = re.exec(stripped)) {
      const tag = m[1].toLowerCase();
      if (VOID_TAGS.has(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return counts;
  }
  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + "\u2026" : s;
  }
  function enforceInvariants(root, editorSrc, configJson2) {
    const repaired = [];
    const head = root.querySelector("head") ?? root.insertBefore(document.createElement("head"), root.firstChild);
    if (!head.querySelector("title")) {
      const t = document.createElement("title");
      t.textContent = document.title || "Untitled page";
      head.appendChild(t);
      repaired.push("missing <title>");
    }
    const configs = Array.from(root.querySelectorAll(`#${CONFIG_ID}`));
    configs.slice(1).forEach((c) => c.remove());
    if (configs.length > 1) repaired.push("duplicate config blocks");
    let config2 = configs[0];
    if (!config2) {
      config2 = document.createElement("script");
      config2.type = "application/json";
      config2.id = CONFIG_ID;
      head.appendChild(config2);
      repaired.push("missing config block");
    }
    config2.textContent = "\n" + configJson2 + "\n";
    const editors = Array.from(root.querySelectorAll(`script[${EDITOR_SCRIPT_ATTR}]`));
    editors.slice(1).forEach((e) => e.remove());
    if (editors.length > 1) repaired.push("duplicate editor script tags");
    if (!editors.length) {
      const s = document.createElement("script");
      s.src = editorSrc;
      s.defer = true;
      s.setAttribute(EDITOR_SCRIPT_ATTR, "1");
      head.appendChild(s);
      repaired.push("missing editor script tag");
    }
    return { ok: repaired.length === 0, repaired };
  }

  // src/core/config.ts
  var config_exports = {};
  __export(config_exports, {
    configJson: () => configJson,
    getConfig: () => getConfig,
    getSettings: () => getSettings,
    settingsPersist: () => settingsPersist,
    syncConfigElement: () => syncConfigElement,
    updateConfig: () => updateConfig,
    updateSettings: () => updateSettings
  });
  var DEFAULT_CONFIG = { version: 1, plugins: [] };
  var config = null;
  function getConfig() {
    if (!config) {
      const el = document.getElementById(CONFIG_ID);
      try {
        config = { ...DEFAULT_CONFIG, ...el?.textContent ? JSON.parse(el.textContent) : {} };
      } catch {
        config = { ...DEFAULT_CONFIG };
      }
      config.plugins ?? (config.plugins = []);
    }
    return config;
  }
  function updateConfig(patch) {
    const c = getConfig();
    Object.assign(c, patch);
    syncConfigElement();
    return c;
  }
  function configJson() {
    return JSON.stringify(getConfig(), null, 2);
  }
  function syncConfigElement() {
    const el = document.getElementById(CONFIG_ID);
    if (el) el.textContent = "\n" + configJson() + "\n";
  }
  var LS_KEY = "page-agent:settings";
  var memoryFallback = {};
  var storageOk = null;
  function storageAvailable() {
    if (storageOk !== null) return storageOk;
    try {
      localStorage.setItem("__pa_t", "1");
      localStorage.removeItem("__pa_t");
      storageOk = true;
    } catch {
      storageOk = false;
    }
    return storageOk;
  }
  function getSettings() {
    if (!storageAvailable()) return memoryFallback;
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
    } catch {
      return {};
    }
  }
  function updateSettings(patch) {
    const s = { ...getSettings(), ...patch };
    if (storageAvailable()) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(s));
      } catch {
        memoryFallback = s;
      }
    } else {
      memoryFallback = s;
    }
    return s;
  }
  function settingsPersist() {
    return storageAvailable();
  }

  // src/core/serialize.ts
  var INDENT = "  ";
  var RAW_TEXT_TAGS = /* @__PURE__ */ new Set(["script", "style", "pre", "textarea"]);
  var VOID_TAGS2 = /* @__PURE__ */ new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
  ]);
  function serializePage(editorSrc, configJson2, transform) {
    const root = document.documentElement.cloneNode(true);
    root.querySelector(`#${OVERLAY_HOST_ID}`)?.remove();
    root.querySelectorAll(`[${EPHEMERAL_ATTR}]`).forEach((el) => el.remove());
    root.querySelectorAll("[data-ephemeral]").forEach((el) => el.remove());
    root.querySelectorAll("[data-volatile]").forEach((el) => {
      el.innerHTML = "";
    });
    root.querySelectorAll(`[${ID_ATTR}]`).forEach((el) => el.removeAttribute(ID_ATTR));
    root.removeAttribute(ID_ATTR);
    transform?.(root);
    enforceInvariants(root, editorSrc, configJson2);
    return "<!doctype html>\n" + printElement(root, 0) + "\n";
  }
  function printElement(el, depth) {
    const tag = el.tagName.toLowerCase();
    const open = `<${tag}${printAttrs(el)}>`;
    if (VOID_TAGS2.has(tag)) return open;
    if (RAW_TEXT_TAGS.has(tag)) {
      return open + (el.textContent ?? "") + `</${tag}>`;
    }
    const children = Array.from(el.childNodes);
    const meaningful = children.filter(
      (n) => !(n.nodeType === Node.TEXT_NODE && !(n.textContent ?? "").trim())
    );
    if (!meaningful.length) return open + `</${tag}>`;
    const hasText = meaningful.some((n) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.COMMENT_NODE);
    if (hasText) {
      let inner2 = "";
      for (const n of children) inner2 += nodeToString(n);
      return open + inner2 + `</${tag}>`;
    }
    const pad = INDENT.repeat(depth + 1);
    const inner = meaningful.map((n) => pad + printElement(n, depth + 1)).join("\n");
    return `${open}
${inner}
${INDENT.repeat(depth)}</${tag}>`;
  }
  function nodeToString(n) {
    if (n.nodeType === Node.TEXT_NODE) return escapeText(n.textContent ?? "");
    if (n.nodeType === Node.COMMENT_NODE) return `<!--${n.textContent ?? ""}-->`;
    if (n.nodeType === Node.ELEMENT_NODE) return n.outerHTML;
    return "";
  }
  function printAttrs(el) {
    let out = "";
    for (const attr of Array.from(el.attributes)) {
      out += attr.value === "" ? ` ${attr.name}` : ` ${attr.name}="${escapeAttr(attr.value)}"`;
    }
    return out;
  }
  function escapeAttr(v) {
    return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }
  function escapeText(v) {
    return v.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  // src/core/save.ts
  var IDB_NAME = "page-agent";
  var IDB_STORE = "file-handles";
  var Saver = class {
    constructor(getHtml) {
      this.getHtml = getHtml;
      this.dirty = false;
      this.override = null;
      this.detected = "download";
      this.available = ["download"];
      this.putUrl = null;
      this.handle = null;
      this.listeners = [];
    }
    async init(savedOverride) {
      this.override = savedOverride;
      this.available = ["download"];
      if ("showSaveFilePicker" in window) this.available.unshift("fsa");
      if (/^https?:$/.test(location.protocol)) {
        const put = await this.probePut();
        if (put) {
          this.available.unshift("http-put");
          this.putUrl = put;
        }
      }
      this.detected = this.available[0];
      if ("indexedDB" in window) {
        try {
          this.handle = await idbGet(location.href);
        } catch {
        }
      }
      this.emit();
      window.addEventListener("beforeunload", (e) => {
        if (this.dirty) {
          e.preventDefault();
          e.returnValue = "";
        }
      });
    }
    async probePut() {
      try {
        const res = await fetch(location.href, { method: "OPTIONS" });
        const allow = (res.headers.get("allow") ?? "") + (res.headers.get("dav") ?? "");
        if (res.headers.get("x-pa-save") === "1" || /put/i.test(allow)) return location.href;
      } catch {
      }
      return null;
    }
    get state() {
      return {
        backend: this.backend,
        detected: this.detected,
        available: [...this.available],
        dirty: this.dirty
      };
    }
    get backend() {
      return this.override && this.available.includes(this.override) ? this.override : this.detected;
    }
    setBackend(id) {
      this.override = id;
      this.emit();
    }
    markDirty() {
      if (!this.dirty) {
        this.dirty = true;
        this.emit();
      }
    }
    onChange(fn) {
      this.listeners.push(fn);
    }
    emit() {
      const s = this.state;
      this.listeners.forEach((fn) => fn(s));
    }
    suggestedFilename() {
      const last = decodeURIComponent(location.pathname.split("/").pop() ?? "");
      return last && last.endsWith(".html") ? last : (last || "page") + (last.includes(".") ? "" : ".html");
    }
    /** Save in place with the active backend. Must be called from a user gesture. */
    async save() {
      const html = this.getHtml();
      const backend = this.backend;
      try {
        let message;
        if (backend === "http-put") message = await this.savePut(html);
        else if (backend === "fsa") message = await this.saveFsa(html);
        else message = this.saveDownload(html);
        this.dirty = false;
        this.emit();
        return { ok: true, backend, message };
      } catch (e) {
        if (e?.name === "AbortError") {
          return { ok: false, backend, message: "Save cancelled." };
        }
        return { ok: false, backend, message: `Save failed: ${String(e?.message ?? e)}` };
      }
    }
    /** Always prompts for a new location (FSA picker if present, else download). */
    async saveAs() {
      const html = this.getHtml();
      try {
        if ("showSaveFilePicker" in window) {
          const picker = window.showSaveFilePicker;
          const handle = await picker({
            suggestedName: this.suggestedFilename(),
            types: [{ description: "HTML page", accept: { "text/html": [".html", ".htm"] } }]
          });
          await writeHandle(handle, html);
          this.handle = handle;
          try {
            await idbSet(location.href, handle);
          } catch {
          }
          this.dirty = false;
          this.emit();
          return { ok: true, backend: "fsa", message: `Saved as ${handle.name}.` };
        }
        const msg = this.saveDownload(html);
        this.dirty = false;
        this.emit();
        return { ok: true, backend: "download", message: msg };
      } catch (e) {
        if (e?.name === "AbortError") return { ok: false, backend: "fsa", message: "Save cancelled." };
        return { ok: false, backend: "fsa", message: `Save failed: ${String(e?.message ?? e)}` };
      }
    }
    async savePut(html) {
      const res = await fetch(this.putUrl ?? location.href, {
        method: "PUT",
        headers: { "content-type": "text/html;charset=utf-8" },
        body: html
      });
      if (!res.ok) throw new Error(`server answered ${res.status}`);
      return "Saved back to the server.";
    }
    async saveFsa(html) {
      if (this.handle) {
        const perm = await this.handle.queryPermission?.({ mode: "readwrite" });
        if (perm !== "granted") {
          const req = await this.handle.requestPermission?.({ mode: "readwrite" });
          if (req !== "granted") this.handle = null;
        }
      }
      if (!this.handle) {
        const picker = window.showOpenFilePicker;
        const [handle] = await picker({
          types: [{ description: "This HTML page", accept: { "text/html": [".html", ".htm"] } }]
        });
        const req = await handle.requestPermission?.({ mode: "readwrite" });
        if (req !== "granted") throw new Error("write permission not granted");
        this.handle = handle;
        try {
          await idbSet(location.href, handle);
        } catch {
        }
      }
      await writeHandle(this.handle, html);
      return `Saved to ${this.handle.name}. Reload to see the saved version.`;
    }
    saveDownload(html) {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = this.suggestedFilename();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e4);
      return "Downloaded a copy \u2014 replace the original file with it.";
    }
  };
  async function writeHandle(handle, html) {
    const w = await handle.createWritable();
    await w.write(html);
    await w.close();
  }
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, value) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // src/agent/prompts.ts
  function buildSystemPrompt(pluginPrompts2) {
    const cfg = getConfig();
    const scripts = listManagedScripts();
    const parts = [
      `You are the editor agent living inside this HTML page. You edit the page the user is looking at, using the provided tools. Edits appear instantly; the user decides when to save the file.

RULES
- Write simple, semantic HTML: header, nav, main, section, article, footer, h1-h6, p, ul, figure. No frameworks, no build steps.
- All CSS goes in the managed stylesheet via set_styles/append_styles. Avoid inline style attributes except for one-off tweaks.
- JavaScript goes in named managed scripts via upsert_script. Plain browser JS (ES modules), no dependencies unless a plugin provides them.
- A script that renders content must render INTO a container element marked with the data-volatile attribute (its children are cleared when the file is saved, and the script re-renders them on load). Scripts must tolerate running more than once.
- Never add, remove, or duplicate the editor <script> tag or the pa-config block. The system protects them, so don't try.
- Element ids like [e12] in outlines are temporary editor handles \u2014 use them as tool arguments, but never write data-pa attributes into HTML yourself.
- Prefer small, targeted edits over replacing large sections. Read an element before replacing it unless you just created it.
- If a tool returns ERROR or WARNING, fix the problem before moving on.

STYLE
- After each edit, tell the user in one short sentence what you changed and why \u2014 users read these to learn HTML.
- Keep designs clean and readable: sensible spacing, a restrained palette, system font stacks unless asked otherwise.
- When the user's request is ambiguous, make a reasonable choice and state it; don't interrogate them.`
    ];
    parts.push(`CURRENT PAGE
Title: ${document.title || "(none)"}
Outline:
${pageOutline({ maxDepth: 4, maxChildren: 16 })}
Stylesheet: ${readStyles().length} chars. Managed scripts: ${scripts.map((s) => s.name).join(", ") || "none"}. Plugins: ${cfg.plugins.map((p) => p.name).join(", ") || "none"}.`);
    for (const p of pluginPrompts2) {
      if (p.trim()) parts.push(`PLUGIN INSTRUCTIONS
${p.trim()}`);
    }
    return parts.join("\n\n");
  }

  // src/agent/loop.ts
  var MAX_ITERATIONS = 15;
  var MAX_HISTORY_MESSAGES = 60;
  var AgentLoop = class {
    constructor(getProvider, getTools, getPluginPrompts, toolCtx) {
      this.getProvider = getProvider;
      this.getTools = getTools;
      this.getPluginPrompts = getPluginPrompts;
      this.toolCtx = toolCtx;
      this.history = [];
      this.abort = null;
      this.busy = false;
    }
    stop() {
      this.abort?.abort();
    }
    clearHistory() {
      this.history = [];
    }
    async run(userText, cb) {
      const provider = this.getProvider();
      if (!provider) {
        cb.onError("No model configured. Open Settings and add a provider + API key.");
        cb.onFinished();
        return;
      }
      if (this.busy) {
        cb.onError("The agent is already working \u2014 stop it first.");
        return;
      }
      this.busy = true;
      this.abort = new AbortController();
      this.history.push({ role: "user", content: userText });
      const tools = this.getTools();
      const schemas = tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }));
      try {
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const messages = [
            { role: "system", content: buildSystemPrompt(this.getPluginPrompts()) },
            ...this.history.slice(-MAX_HISTORY_MESSAGES)
          ];
          cb.onAssistantStart();
          const turn = await provider.chat({
            messages,
            tools: schemas,
            signal: this.abort.signal,
            onText: cb.onAssistantText
          });
          this.history.push({
            role: "assistant",
            content: turn.content || null,
            ...turn.toolCalls.length ? { tool_calls: turn.toolCalls } : {}
          });
          cb.onAssistantDone(turn.content);
          if (!turn.toolCalls.length) break;
          for (const call of turn.toolCalls) {
            cb.onToolCall(call);
            const result = await this.execute(tools, call);
            this.history.push({ role: "tool", content: result, tool_call_id: call.id });
            cb.onToolResult(call, result);
          }
          if (i === MAX_ITERATIONS - 1) {
            cb.onError(`Stopped after ${MAX_ITERATIONS} rounds \u2014 send another message to continue.`);
          }
        }
      } catch (e) {
        if (e?.name === "AbortError") cb.onError("Stopped.");
        else cb.onError(String(e?.message ?? e));
      } finally {
        this.busy = false;
        this.abort = null;
        cb.onFinished();
      }
    }
    async execute(tools, call) {
      const tool = tools.find((t) => t.name === call.name);
      if (!tool) return `ERROR: unknown tool "${call.name}". Available: ${tools.map((t) => t.name).join(", ")}`;
      let args = {};
      if (call.arguments.trim()) {
        try {
          args = JSON.parse(call.arguments);
        } catch {
          return `ERROR: tool arguments were not valid JSON: ${call.arguments.slice(0, 200)}`;
        }
      }
      try {
        const out = await tool.execute(args, this.toolCtx);
        return typeof out === "string" ? out : JSON.stringify(out);
      } catch (e) {
        return `ERROR: tool threw: ${String(e?.message ?? e)}`;
      }
    }
  };

  // src/agent/tools.ts
  var str = (desc) => ({ type: "string", description: desc });
  function mutation(result, ctx, okMsg) {
    if (!result.ok) return `ERROR: ${result.error}`;
    ctx.markDirty();
    let msg = okMsg;
    if (result.warning) msg += `
WARNING: ${result.warning}`;
    if (result.changed?.length) msg += `
New/changed element ids: ${result.changed.join(", ")}`;
    return msg;
  }
  function withValidation(html, apply, ctx, okMsg) {
    const v = validateFragment(html);
    if (!v.ok) return `ERROR: ${v.error}`;
    const out = mutation(apply(), ctx, okMsg);
    return v.warning ? `${out}
WARNING: ${v.warning}` : out;
  }
  var builtinTools = [
    {
      name: "get_page_overview",
      description: "Get the current page structure: title, an outline tree of elements with their ids (like [e12]), the managed stylesheet size, managed scripts, and config. Always call this before editing if you are unsure of current element ids.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute: () => {
        const cfg = getConfig();
        return [
          `Title: ${document.title || "(none)"}`,
          `Outline (ids in [brackets] are what edit tools take):`,
          pageOutline(),
          `Managed stylesheet (#page-styles): ${readStyles().length} chars (read_styles to view)`,
          `Managed scripts: ${listManagedScripts().map((s) => `${s.name} (${s.length} chars)`).join(", ") || "(none)"}`,
          `Plugins: ${cfg.plugins.map((p) => p.name).join(", ") || "(none)"}`
        ].join("\n");
      }
    },
    {
      name: "read_element",
      description: 'Read the full HTML of one element by its id (e.g. "e12").',
      parameters: {
        type: "object",
        properties: { id: str('Element id from the outline, e.g. "e12"') },
        required: ["id"]
      },
      execute: ({ id }) => {
        const el = getElement(String(id));
        if (!el) return `ERROR: no element "${id}". Call get_page_overview for current ids.`;
        const html = el.outerHTML;
        return html.length > 8e3 ? `Element is large (${html.length} chars). Outline instead:
${elementOutline(el)}` : html;
      }
    },
    {
      name: "edit_element",
      description: "Replace an element entirely with new HTML (can be one or several elements). Read it first unless you just created it.",
      parameters: {
        type: "object",
        properties: { id: str("Element id to replace"), html: str("Replacement HTML fragment") },
        required: ["id", "html"]
      },
      execute: ({ id, html }, ctx) => withValidation(String(html), () => replaceElement(String(id), String(html)), ctx, `Replaced ${id}.`)
    },
    {
      name: "insert_html",
      description: "Insert an HTML fragment relative to an existing element.",
      parameters: {
        type: "object",
        properties: {
          target_id: str("Existing element id to position against"),
          position: { type: "string", enum: ["before", "after", "prepend", "append"], description: "Where to insert relative to the target" },
          html: str("HTML fragment to insert")
        },
        required: ["target_id", "position", "html"]
      },
      execute: ({ target_id, position, html }, ctx) => withValidation(String(html), () => insertHtml(String(target_id), String(position), String(html)), ctx, `Inserted ${position} ${target_id}.`)
    },
    {
      name: "remove_element",
      description: "Remove an element from the page.",
      parameters: {
        type: "object",
        properties: { id: str("Element id to remove") },
        required: ["id"]
      },
      execute: ({ id }, ctx) => mutation(removeElement(String(id)), ctx, `Removed ${id}.`)
    },
    {
      name: "set_text",
      description: "Replace the text content of an element (keeps the element, drops its children). Good for headings, paragraphs, buttons.",
      parameters: {
        type: "object",
        properties: { id: str("Element id"), text: str("New plain-text content") },
        required: ["id", "text"]
      },
      execute: ({ id, text }, ctx) => mutation(setText(String(id), String(text)), ctx, `Set text of ${id}.`)
    },
    {
      name: "set_attributes",
      description: "Set or remove attributes on an element. Pass null to remove an attribute.",
      parameters: {
        type: "object",
        properties: {
          id: str("Element id"),
          attributes: { type: "object", description: "Map of attribute name to value, or null to remove", additionalProperties: { type: ["string", "null"] } }
        },
        required: ["id", "attributes"]
      },
      execute: ({ id, attributes }, ctx) => mutation(setAttributes(String(id), attributes ?? {}), ctx, `Updated attributes of ${id}.`)
    },
    {
      name: "read_styles",
      description: "Read the full contents of the managed stylesheet (#page-styles).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute: () => readStyles() || "(stylesheet is empty)"
    },
    {
      name: "set_styles",
      description: "Replace the entire managed stylesheet (#page-styles) with new CSS. Use append_styles to add rules without reading first.",
      parameters: {
        type: "object",
        properties: { css: str("Complete CSS for the page") },
        required: ["css"]
      },
      execute: ({ css }, ctx) => mutation(setStyles(String(css)), ctx, "Stylesheet replaced.")
    },
    {
      name: "append_styles",
      description: "Append CSS rules to the managed stylesheet.",
      parameters: {
        type: "object",
        properties: { css: str("CSS rules to append") },
        required: ["css"]
      },
      execute: ({ css }, ctx) => mutation(setStyles(String(css), true), ctx, "CSS appended.")
    },
    {
      name: "set_title",
      description: "Set the page <title>.",
      parameters: {
        type: "object",
        properties: { title: str("New page title") },
        required: ["title"]
      },
      execute: ({ title }, ctx) => {
        document.title = String(title);
        ctx.markDirty();
        return `Title set to "${title}".`;
      }
    },
    {
      name: "read_script",
      description: "Read the code of a managed script block by name.",
      parameters: {
        type: "object",
        properties: { name: str("Managed script name") },
        required: ["name"]
      },
      execute: ({ name }) => readManagedScript(String(name)) ?? `ERROR: no managed script "${name}".`
    },
    {
      name: "upsert_script",
      description: "Create or replace a named JavaScript module that is stored in the page and runs on load. It also runs immediately now. Scripts that render content must render into an element marked data-volatile and tolerate re-running.",
      parameters: {
        type: "object",
        properties: {
          name: str('Short identifier for this script, e.g. "clock" or "gallery"'),
          code: str("JavaScript (ES module) source")
        },
        required: ["name", "code"]
      },
      execute: ({ name, code }, ctx) => mutation(upsertScript(String(name), String(code)), ctx, `Script "${name}" stored and executed.`)
    },
    {
      name: "remove_script",
      description: "Remove a managed script block from the page.",
      parameters: {
        type: "object",
        properties: { name: str("Managed script name") },
        required: ["name"]
      },
      execute: ({ name }, ctx) => mutation(removeManagedScript(String(name)), ctx, `Script "${name}" removed.`)
    },
    {
      name: "read_config",
      description: "Read the portable page config (plugins, metadata) stored in the file.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute: () => configJson()
    },
    {
      name: "update_config",
      description: "Merge a patch into the portable page config. Only non-secret, page-level data belongs here.",
      parameters: {
        type: "object",
        properties: { patch: { type: "object", description: "Fields to merge into the config" } },
        required: ["patch"]
      },
      execute: ({ patch }, ctx) => {
        const cfg = getConfig();
        Object.assign(cfg, patch);
        syncConfigElement();
        ctx.markDirty();
        return "Config updated:\n" + configJson();
      }
    },
    {
      name: "undo",
      description: "Undo the last n edit operations (default 1).",
      parameters: {
        type: "object",
        properties: { n: { type: "integer", description: "How many operations to undo", default: 1 } }
      },
      execute: ({ n }, ctx) => {
        const done = undo(Number(n ?? 1));
        if (done) ctx.markDirty();
        return done ? `Undid ${done} operation(s).` : "Nothing to undo.";
      }
    }
  ];

  // src/agent/providers/openai-compat.ts
  var OpenAICompatProvider = class {
    constructor(opts) {
      this.opts = opts;
      this.id = opts.id ?? "custom";
      this.label = opts.label ?? "Custom (OpenAI-compatible)";
    }
    async chat(req) {
      const body = {
        model: this.opts.model,
        stream: true,
        messages: req.messages.map((m) => ({
          role: m.role,
          content: m.content ?? "",
          ...m.tool_calls?.length ? {
            tool_calls: m.tool_calls.map((t) => ({
              id: t.id,
              type: "function",
              function: { name: t.name, arguments: t.arguments }
            }))
          } : {},
          ...m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}
        })),
        ...req.tools.length ? {
          tools: req.tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters }
          }))
        } : {}
      };
      const res = await fetch(this.opts.baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        signal: req.signal,
        headers: {
          "content-type": "application/json",
          ...this.opts.apiKey ? { authorization: `Bearer ${this.opts.apiKey}` } : {},
          ...this.opts.extraHeaders
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        let detail = "";
        try {
          detail = (await res.text()).slice(0, 400);
        } catch {
        }
        throw new Error(`${this.label}: HTTP ${res.status}. ${detail}`);
      }
      let content = "";
      const toolCalls = /* @__PURE__ */ new Map();
      for await (const data of sseEvents(res, req.signal)) {
        if (data === "[DONE]") break;
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        const p = parsed;
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
            entry = { id: tc.id ?? `call_${idx}`, name: "", arguments: "" };
            toolCalls.set(idx, entry);
          }
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.arguments += tc.function.arguments;
        }
      }
      return { content, toolCalls: Array.from(toolCalls.values()).filter((t) => t.name) };
    }
  };
  async function* sseEvents(res, signal) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (; ; ) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line.startsWith("data:")) yield line.slice(5).trim();
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // src/agent/providers/openrouter.ts
  var OPENROUTER_BASE = "https://openrouter.ai/api/v1";
  function openRouterProvider(apiKey, model) {
    return new OpenAICompatProvider({
      id: "openrouter",
      label: "OpenRouter",
      baseUrl: OPENROUTER_BASE,
      apiKey,
      model,
      extraHeaders: {
        "HTTP-Referer": "https://github.com/page-agent",
        "X-Title": "Page Agent"
      }
    });
  }
  async function listOpenRouterModels(apiKey) {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {}
    });
    if (!res.ok) throw new Error(`OpenRouter models: HTTP ${res.status}`);
    const data = await res.json();
    return (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      toolSupport: (m.supported_parameters ?? []).includes("tools")
    }));
  }

  // src/agent/providers/mock.ts
  var MockProvider = class {
    constructor() {
      this.id = "mock";
      this.label = "Mock (testing)";
    }
    async chat(req) {
      (window.__paMockLog ?? (window.__paMockLog = [])).push(req.messages);
      const turn = window.__paMockScript?.shift();
      if (!turn) return { content: "Mock provider: script queue is empty.", toolCalls: [] };
      const content = turn.content ?? "";
      if (content) req.onText?.(content);
      return {
        content,
        toolCalls: (turn.toolCalls ?? []).map((t, i) => ({
          id: `mock_${Date.now()}_${i}`,
          name: t.name,
          arguments: typeof t.arguments === "string" ? t.arguments : JSON.stringify(t.arguments)
        }))
      };
    }
  };

  // src/plugins/registry.ts
  var plugins = [];
  function registerPlugin(p, api) {
    if (!p || typeof p !== "object" || !p.name) return "Plugin must be an object with a name.";
    if (plugins.some((x) => x.name === p.name)) return `Plugin "${p.name}" is already registered.`;
    for (const t of p.tools ?? []) {
      if (!t.name || !t.description || typeof t.execute !== "function") {
        return `Plugin "${p.name}": every tool needs name, description, parameters, execute.`;
      }
    }
    plugins.push(p);
    try {
      p.onLoad?.(api);
    } catch (e) {
      api.notify(`Plugin "${p.name}" onLoad failed: ${e}`);
    }
    return null;
  }
  function unregisterPlugin(name) {
    const i = plugins.findIndex((p) => p.name === name);
    if (i >= 0) plugins.splice(i, 1);
  }
  function listPlugins() {
    return [...plugins];
  }
  function pluginTools(api) {
    const defs = [];
    for (const p of plugins) {
      for (const t of p.tools ?? []) {
        defs.push({
          name: t.name,
          description: `[${p.name}] ${t.description}`,
          parameters: t.parameters ?? { type: "object", properties: {} },
          execute: (args) => t.execute(args, api)
        });
      }
    }
    return defs;
  }
  function pluginPrompts() {
    return plugins.map((p) => p.systemPrompt ?? "").filter(Boolean);
  }
  function pluginCommands() {
    return plugins.flatMap((p) => (p.commands ?? []).map((command) => ({ plugin: p.name, command })));
  }
  function runBeforeSaveHooks(doc, api) {
    for (const p of plugins) {
      try {
        p.onBeforeSave?.(doc, api);
      } catch {
      }
    }
  }

  // src/plugins/loader.ts
  var nativeImport = new Function("u", "return import(u)");
  async function loadConfiguredPlugins(api, askConsent) {
    const cfg = getConfig();
    for (const ref of cfg.plugins) {
      if (ref.enabled === false) continue;
      try {
        await loadPlugin(ref, api, askConsent);
      } catch (e) {
        api.notify(`Plugin "${ref.name}" failed to load: ${String(e?.message ?? e)}`);
      }
    }
  }
  async function loadPlugin(ref, api, askConsent) {
    let source;
    let detail;
    if (ref.src === "inline") {
      const el = document.querySelector(`script[type="text/plain"][data-plugin="${CSS.escape(ref.name)}"]`);
      if (!el) throw new Error("no inline <script data-plugin> block found");
      source = el.textContent ?? "";
      detail = `inline plugin, ${source.length} chars of code stored in this file`;
    } else {
      source = ref.src;
      detail = `remote plugin loaded from ${ref.src}`;
    }
    const hash = await sha256(ref.src === "inline" ? source : ref.src);
    const consent = getSettings().pluginConsent ?? {};
    if (consent[ref.name] !== hash) {
      const ok = await askConsent(ref.name, detail, ref.src === "inline" ? source : ref.src);
      if (!ok) return false;
      updateSettings({ pluginConsent: { ...consent, [ref.name]: hash } });
    }
    let mod;
    if (ref.src === "inline") {
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      try {
        mod = await nativeImport(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    } else {
      mod = await nativeImport(ref.src);
    }
    const plugin = mod.default;
    if (!plugin) throw new Error("module has no default export");
    const err = registerPlugin(plugin, api);
    if (err) throw new Error(err);
    return true;
  }
  async function sha256(text) {
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "len:" + text.length;
    }
  }

  // src/ui/h.ts
  function h(tag, props = null, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "dataset") {
        Object.assign(el.dataset, v);
      } else if (k in el && k !== "list" && k !== "form") {
        el[k] = v;
      } else {
        el.setAttribute(k, String(v));
      }
    }
    el.append(...children.filter((c) => c != null && c !== false));
    return el;
  }
  function clear(el) {
    el.textContent = "";
  }

  // src/ui/styles.ts
  var overlayCss = (
    /* css */
    `
:host {
  --bg: #16181d;
  --bg2: #1e2128;
  --bg3: #262a33;
  --fg: #e8eaed;
  --fg-dim: #9aa0ab;
  --accent: #5ea1ff;
  --accent-dim: #2d4f82;
  --ok: #4cc38a;
  --warn: #e5a93d;
  --err: #e5604c;
  --radius: 10px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; margin: 0; }
button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
input, textarea, select { font: inherit; color: var(--fg); background: var(--bg3); border: 1px solid #3a3f4b; border-radius: 6px; padding: 6px 8px; }
input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent-dim); border-color: var(--accent); }

.fab {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--bg2); color: var(--fg);
  border: 1px solid #3a3f4b; box-shadow: 0 4px 16px rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; transition: transform .15s ease, background .15s ease;
}
.fab:hover { transform: scale(1.08); background: var(--bg3); }
.fab .dot {
  position: absolute; top: 2px; right: 2px; width: 11px; height: 11px;
  border-radius: 50%; background: var(--warn); border: 2px solid var(--bg);
  display: none;
}
.fab.dirty .dot { display: block; }

.drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483001;
  width: min(400px, 94vw);
  background: var(--bg); color: var(--fg);
  font-family: var(--font); font-size: 13.5px; line-height: 1.5;
  border-left: 1px solid #30343e;
  box-shadow: -8px 0 30px rgba(0,0,0,.45);
  display: flex; flex-direction: column;
  transform: translateX(105%); transition: transform .22s ease;
}
.drawer.open { transform: translateX(0); }

.titlebar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-bottom: 1px solid #30343e; background: var(--bg2);
}
.titlebar .name { font-weight: 600; }
.titlebar .spacer { flex: 1; }
.iconbtn {
  width: 28px; height: 28px; border-radius: 6px; color: var(--fg-dim);
  display: inline-flex; align-items: center; justify-content: center; font-size: 15px;
}
.iconbtn:hover { background: var(--bg3); color: var(--fg); }
.iconbtn.active { background: var(--accent-dim); color: #fff; }

.tabs { display: flex; border-bottom: 1px solid #30343e; background: var(--bg2); }
.tab { padding: 8px 14px; color: var(--fg-dim); border-bottom: 2px solid transparent; }
.tab:hover { color: var(--fg); }
.tab.active { color: var(--fg); border-bottom-color: var(--accent); }

.panel { flex: 1; overflow-y: auto; display: none; flex-direction: column; min-height: 0; }
.panel.active { display: flex; }

/* ---- chat ---- */
.messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.msg { max-width: 94%; border-radius: var(--radius); padding: 8px 12px; white-space: pre-wrap; overflow-wrap: break-word; }
.msg.user { align-self: flex-end; background: var(--accent-dim); }
.msg.assistant { align-self: flex-start; background: var(--bg2); }
.msg.error { align-self: stretch; background: #3b2420; color: #f0b3a8; font-size: 12.5px; }
.msg.notice { align-self: stretch; background: var(--bg2); color: var(--fg-dim); font-size: 12.5px; }
.msg code, .toolrow code { font-family: var(--mono); font-size: 12px; background: rgba(255,255,255,.07); padding: 1px 4px; border-radius: 4px; }
.msg pre { background: #11141a; border: 1px solid #2c303a; border-radius: 6px; padding: 8px; overflow-x: auto; margin: 6px 0; }
.msg pre code { background: none; padding: 0; display: block; white-space: pre; }

.toolrow { align-self: flex-start; width: 94%; background: var(--bg2); border: 1px solid #2c303a; border-radius: 8px; font-size: 12.5px; }
.toolrow > summary { padding: 6px 10px; cursor: pointer; color: var(--fg-dim); list-style: none; display: flex; gap: 6px; align-items: center; }
.toolrow > summary::before { content: "\u25B8"; font-size: 10px; transition: transform .12s; }
.toolrow[open] > summary::before { transform: rotate(90deg); }
.toolrow .body { padding: 2px 10px 10px; }
.toolrow pre { font-family: var(--mono); font-size: 11.5px; white-space: pre-wrap; overflow-wrap: anywhere; background: #11141a; border-radius: 6px; padding: 8px; max-height: 240px; overflow-y: auto; }
.toolrow .ok { color: var(--ok); } .toolrow .err { color: var(--err); }
.toolrow .label { font-family: var(--mono); color: var(--fg); }

.chatbox { border-top: 1px solid #30343e; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; background: var(--bg2); }
.chip { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  background: var(--bg3); border: 1px solid #3a3f4b; border-radius: 999px;
  padding: 2px 10px; font-size: 12px; color: var(--fg-dim); font-family: var(--mono); }
.chip button { color: var(--fg-dim); font-size: 14px; line-height: 1; }
.chatbox .row { display: flex; gap: 8px; align-items: flex-end; }
.chatbox textarea { flex: 1; resize: none; max-height: 140px; min-height: 38px; }
.send { background: var(--accent); color: #0b1320; font-weight: 600; border-radius: 8px; padding: 8px 14px; }
.send:disabled { opacity: .5; cursor: default; }
.send.stop { background: var(--err); color: #fff; }
.working { color: var(--fg-dim); font-size: 12px; display: none; align-items: center; gap: 6px; }
.working.on { display: flex; }
.working .spin { width: 10px; height: 10px; border: 2px solid var(--fg-dim); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---- page panel ---- */
.section { padding: 12px 14px; border-bottom: 1px solid #262a33; }
.section h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--fg-dim); margin-bottom: 8px; }
.tree { font-family: var(--mono); font-size: 12px; line-height: 1.7; overflow-x: auto; }
.tree .node { cursor: pointer; white-space: pre; color: var(--fg-dim); }
.tree .node:hover { color: var(--fg); background: var(--bg3); }
.tree .node.selected { color: var(--accent); }
.cssbox { width: 100%; min-height: 160px; font-family: var(--mono); font-size: 12px; white-space: pre; }
.btn { background: var(--bg3); border: 1px solid #3a3f4b; border-radius: 6px; padding: 5px 12px; }
.btn:hover { border-color: var(--accent); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #0b1320; font-weight: 600; }
.btn.danger:hover { border-color: var(--err); color: var(--err); }
.rowline { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.hint { color: var(--fg-dim); font-size: 12px; }
.pill { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: var(--bg3); color: var(--fg-dim); }

/* ---- selection card ---- */
.selcard { background: var(--bg2); border: 1px solid #2c303a; border-radius: var(--radius); padding: 10px 12px; }
.selcard .crumbs { font-family: var(--mono); font-size: 11.5px; color: var(--fg-dim); margin-bottom: 6px; overflow-wrap: anywhere; }
.selcard .crumbs span { cursor: pointer; }
.selcard .crumbs span:hover { color: var(--accent); }
.selcard pre { font-family: var(--mono); font-size: 11.5px; white-space: pre-wrap; overflow-wrap: anywhere; background: #11141a; border-radius: 6px; padding: 8px; max-height: 200px; overflow-y: auto; margin: 8px 0; }

/* ---- settings ---- */
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.field label { font-size: 12px; color: var(--fg-dim); }
.status { font-size: 12.5px; margin-top: 6px; }
.status.ok { color: var(--ok); } .status.err { color: var(--err); }

/* ---- save bar ---- */
.savebar {
  border-top: 1px solid #30343e; background: var(--bg2);
  padding: 10px 14px; display: flex; gap: 8px; align-items: center;
}
.savebar .state { flex: 1; font-size: 12px; color: var(--fg-dim); }
.savebar .state .dirty { color: var(--warn); }

/* ---- toast ---- */
.toasts { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 2147483002; display: flex; flex-direction: column; gap: 8px; }
.toast { background: var(--bg2); color: var(--fg); border: 1px solid #3a3f4b; border-radius: 8px; padding: 8px 16px; font-family: var(--font); font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,.4); }

/* ---- inspector highlight ---- */
.hl { position: fixed; z-index: 2147482999; pointer-events: none; border: 1.5px solid var(--accent); background: rgba(94,161,255,.08); border-radius: 2px; display: none; }
.hl .tag { position: absolute; top: -22px; left: -2px; background: var(--accent); color: #0b1320; font: 600 11px var(--mono); padding: 1px 7px; border-radius: 4px; white-space: nowrap; }
.hl.pinned { border-color: var(--ok); background: rgba(76,195,138,.07); }
.hl.pinned .tag { background: var(--ok); }

/* ---- modal ---- */
.modal-back { position: fixed; inset: 0; z-index: 2147483003; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; font-family: var(--font); }
.modal { background: var(--bg); color: var(--fg); border: 1px solid #3a3f4b; border-radius: 12px; width: min(460px, 92vw); padding: 18px; font-size: 13.5px; }
.modal h3 { margin-bottom: 8px; }
.modal pre { font-family: var(--mono); font-size: 11.5px; background: #11141a; border-radius: 6px; padding: 8px; max-height: 180px; overflow: auto; margin: 10px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.modal .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.modal.help { width: min(540px, 92vw); max-height: 84vh; overflow-y: auto; }
.modal.help h4 { margin: 14px 0 4px; font-size: 13px; color: var(--accent); }
.modal.help .helpline { margin: 4px 0; color: var(--fg); }
.modal.help .helpline + .helpline { color: var(--fg-dim); }
`
  );

  // src/ui/inspector.ts
  function createInspector(shadow, onSelect, getSelection) {
    const hoverBox = h("div", { className: "hl" }, h("span", { className: "tag" }));
    const pinBox = h("div", { className: "hl pinned" }, h("span", { className: "tag" }));
    shadow.append(hoverBox, pinBox);
    let active = false;
    function position(box, el) {
      const r = el.getBoundingClientRect();
      box.style.display = "block";
      box.style.left = `${r.left - 2}px`;
      box.style.top = `${r.top - 2}px`;
      box.style.width = `${r.width + 4}px`;
      box.style.height = `${r.height + 4}px`;
      const tag = box.querySelector(".tag");
      tagPage();
      tag.textContent = shortLabel(el);
      tag.style.top = r.top < 30 ? "auto" : "-22px";
      tag.style.bottom = r.top < 30 ? "-22px" : "auto";
    }
    function shortLabel(el) {
      const id = idOf(el) ?? "?";
      let s = `${el.tagName.toLowerCase()}`;
      if (el.id) s += `#${el.id}`;
      else if (el.classList.length) s += `.${el.classList[0]}`;
      return `[${id}] ${s}`;
    }
    function pageTarget(e) {
      const t = e.composedPath()[0];
      if (!(t instanceof Element)) return null;
      if (t.getRootNode() !== document) return null;
      const el = t.closest("body *");
      if (!el || isOverlayNode(el)) return null;
      return el;
    }
    const onMove = (e) => {
      const el = pageTarget(e);
      if (el) position(hoverBox, el);
      else hoverBox.style.display = "none";
    };
    const onClick = (e) => {
      const el = pageTarget(e);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(el);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setActive(false);
    };
    function setActive(on) {
      if (on === active) return;
      active = on;
      if (on) {
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("click", onClick, true);
        document.addEventListener("keydown", onKey, true);
        document.documentElement.style.cursor = "crosshair";
      } else {
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("keydown", onKey, true);
        document.documentElement.style.cursor = "";
        hoverBox.style.display = "none";
      }
      stateListeners.forEach((fn) => fn(on));
    }
    function updatePin() {
      const sel = getSelection();
      if (sel && sel.isConnected) position(pinBox, sel);
      else pinBox.style.display = "none";
    }
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updatePin);
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const stateListeners = [];
    setActive.onState = stateListeners;
    return {
      hoverBox,
      pinBox,
      setActive,
      updatePin,
      destroy() {
        setActive(false);
        window.removeEventListener("scroll", schedule, true);
        window.removeEventListener("resize", schedule);
      }
    };
  }
  function breadcrumb(el) {
    const chain = [];
    let cur = el;
    while (cur && cur !== document.body) {
      chain.unshift(cur);
      cur = cur.parentElement;
    }
    return chain;
  }

  // src/ui/chat.ts
  function buildChatPanel(ui) {
    const messages = h("div", { className: "messages" });
    const chipHolder = h("div");
    const input = h("textarea", {
      placeholder: 'Describe a change\u2026 ("make the header dark blue", "add an about section")',
      rows: 1,
      onkeydown: (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      },
      oninput: () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 140) + "px";
      }
    });
    const sendBtn = h("button", { className: "send", onclick: () => send() }, "Send");
    const working = h("div", { className: "working" }, h("span", { className: "spin" }), "thinking\u2026");
    const panel = h(
      "div",
      { className: "panel active" },
      messages,
      h(
        "div",
        { className: "chatbox" },
        chipHolder,
        working,
        h("div", { className: "row" }, input, sendBtn)
      )
    );
    addNotice(
      getSettings().provider?.apiKey || getSettings().provider?.provider === "mock" ? "This page edits itself. Ask for a change, watch it happen, then Save." : "Welcome! Open Settings (\u2699 tab) and add your model API key, then ask for any change to this page."
    );
    function addNotice(text) {
      messages.append(h("div", { className: "msg notice" }, text));
      scroll();
    }
    function addError(text) {
      messages.append(h("div", { className: "msg error" }, text));
      scroll();
    }
    function scroll() {
      messages.scrollTop = messages.scrollHeight;
    }
    function renderSelectionChip() {
      clear(chipHolder);
      const sel = ui.getSelection();
      if (!sel || !sel.isConnected) return;
      chipHolder.append(
        h(
          "span",
          { className: "chip" },
          `\u2316 ${shortDesc(sel)}`,
          h("button", { title: "Clear selection", onclick: () => ui.setSelection(null) }, "\xD7")
        )
      );
    }
    ui.onSelectionChange(renderSelectionChip);
    function shortDesc(el) {
      const id = idOf(el) ?? "?";
      let s = el.tagName.toLowerCase();
      if (el.id) s += `#${el.id}`;
      else if (el.classList.length) s += `.${el.classList[0]}`;
      return `${id} <${s}>`;
    }
    let currentAssistant = null;
    function send() {
      if (ui.loop.busy) {
        ui.loop.stop();
        return;
      }
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      input.style.height = "auto";
      messages.append(h("div", { className: "msg user" }, text));
      scroll();
      let fullText = text;
      const sel = ui.getSelection();
      if (sel && sel.isConnected) {
        fullText += `

[User has selected this element: ${describeElement(sel)} \u2014 if the request is about "this", it means this element.]`;
      }
      sendBtn.textContent = "Stop";
      sendBtn.classList.add("stop");
      working.classList.add("on");
      void ui.loop.run(fullText, {
        onAssistantStart: () => {
          currentAssistant = null;
        },
        onAssistantText: (delta) => {
          if (!currentAssistant) {
            currentAssistant = h("div", { className: "msg assistant" });
            messages.append(currentAssistant);
          }
          currentAssistant.append(document.createTextNode(delta));
          scroll();
        },
        onAssistantDone: (full) => {
          if (currentAssistant) renderRichText(currentAssistant, full);
          else if (full.trim()) {
            currentAssistant = h("div", { className: "msg assistant" });
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
          if (row) fillToolRow(row, call, result);
          scroll();
        },
        onError: addError,
        onFinished: () => {
          sendBtn.textContent = "Send";
          sendBtn.classList.remove("stop");
          working.classList.remove("on");
          ui.refreshPagePanel();
        }
      });
    }
    return panel;
  }
  function pendingToolRow(call) {
    const row = h("details", { className: "toolrow" });
    row.setAttribute("data-call", call.id);
    row.append(
      h("summary", null, h("span", { className: "label" }, toolSummary(call)), " \u2026")
    );
    return row;
  }
  function fillToolRow(row, call, result) {
    clear(row);
    const isErr = result.startsWith("ERROR");
    const hasWarn = result.includes("WARNING:");
    row.append(
      h(
        "summary",
        null,
        h("span", { className: "label" }, toolSummary(call)),
        h("span", { className: isErr ? "err" : "ok" }, isErr ? "\u2717" : hasWarn ? "\u26A0" : "\u2713")
      ),
      h(
        "div",
        { className: "body" },
        h("pre", null, prettyArgs(call.arguments)),
        h("pre", null, result.length > 1200 ? result.slice(0, 1200) + "\u2026" : result)
      )
    );
  }
  function toolSummary(call) {
    let target = "";
    try {
      const a = JSON.parse(call.arguments || "{}");
      target = a.id ?? a.target_id ?? a.name ?? "";
    } catch {
    }
    return target ? `${call.name} ${target}` : call.name;
  }
  function prettyArgs(raw) {
    try {
      return JSON.stringify(JSON.parse(raw || "{}"), null, 1);
    } catch {
      return raw;
    }
  }
  function renderRichText(el, text) {
    clear(el);
    const parts = text.split(/```(?:\w+)?\n?/);
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        el.append(h("pre", null, h("code", null, part.replace(/\n$/, ""))));
      } else {
        const bits = part.split(/`([^`\n]+)`/);
        bits.forEach((b, j) => {
          if (j % 2 === 1) el.append(h("code", null, b));
          else if (b) el.append(document.createTextNode(b));
        });
      }
    });
  }

  // src/ui/page-panel.ts
  function buildPagePanel(ui) {
    const selHolder = h("div");
    const tree = h("div", { className: "tree" });
    const cssBox = h("textarea", { className: "cssbox", spellcheck: false });
    const scriptsHolder = h("div");
    const pluginsHolder = h("div");
    const undoInfo = h("span", { className: "hint" });
    const el = h(
      "div",
      { className: "panel" },
      h("div", { className: "section" }, selHolder),
      h(
        "div",
        { className: "section" },
        h("h3", null, "Structure"),
        h("p", { className: "hint" }, "The live element tree. Click to select; ids like [e12] are what the agent uses."),
        tree,
        h(
          "div",
          { className: "rowline" },
          h("button", {
            className: "btn",
            onclick: () => {
              const n = undo(1);
              ui.notify(n ? "Undid 1 edit." : "Nothing to undo.");
              refresh();
              ui.setSelection(null);
            }
          }, "\u232B Undo edit"),
          undoInfo
        )
      ),
      h(
        "div",
        { className: "section" },
        h("h3", null, "Stylesheet"),
        h("p", { className: "hint" }, "The page\u2019s managed CSS (#page-styles). Edit and apply \u2014 changes are undoable."),
        cssBox,
        h(
          "div",
          { className: "rowline" },
          h("button", {
            className: "btn primary",
            onclick: () => {
              setStyles(cssBox.value);
              ui.pluginApi.markDirty();
              ui.notify("Stylesheet applied.");
            }
          }, "Apply CSS"),
          h("button", { className: "btn", onclick: () => {
            cssBox.value = readStyles();
          } }, "Reload")
        )
      ),
      h(
        "div",
        { className: "section" },
        h("h3", null, "Scripts"),
        scriptsHolder
      ),
      h(
        "div",
        { className: "section" },
        h("h3", null, "Plugins"),
        h("p", { className: "hint" }, "Plugins add tools and instructions to the agent. Inline plugins travel inside this HTML file."),
        pluginsHolder,
        h(
          "div",
          { className: "rowline" },
          h("button", { className: "btn", onclick: () => addInlinePlugin(ui).then(refresh) }, "+ Add inline plugin"),
          h("button", { className: "btn", onclick: () => addRemotePlugin(ui).then(refresh) }, "+ Add from URL")
        )
      )
    );
    function renderSelection() {
      clear(selHolder);
      const sel = ui.getSelection();
      if (!sel || !sel.isConnected) {
        selHolder.append(
          h("h3", null, "Selection"),
          h("p", { className: "hint" }, "Nothing selected. Use the \u2316 button in the title bar, then click any element on the page.")
        );
        return;
      }
      const id = idOf(sel) ?? "?";
      const crumbs = h("div", { className: "crumbs" });
      breadcrumb(sel).forEach((a, i, arr) => {
        const s = h("span", { onclick: () => ui.setSelection(a) }, a.tagName.toLowerCase() + (a.id ? `#${a.id}` : ""));
        if (a === sel) s.style.color = "var(--accent)";
        crumbs.append(s);
        if (i < arr.length - 1) crumbs.append(" \u203A ");
      });
      const htmlPre = h("pre", null, truncate2(sel.outerHTML, 1800));
      selHolder.append(
        h("h3", null, "Selection"),
        h(
          "div",
          { className: "selcard" },
          crumbs,
          h("div", null, describeElement(sel)),
          htmlPre,
          h(
            "div",
            { className: "rowline" },
            h("button", { className: "btn", onclick: () => editTextInline(sel, ui) }, "\u270E Edit text"),
            h("button", {
              className: "btn danger",
              onclick: () => {
                const r = removeElement(id);
                if (r.ok) {
                  ui.pluginApi.markDirty();
                  ui.setSelection(null);
                  refresh();
                } else ui.notify(r.error ?? "Could not remove.");
              }
            }, "\u{1F5D1} Delete"),
            h("button", {
              className: "btn",
              onclick: () => {
                ui.openDrawer("chat");
                ui.notify("Selection attached \u2014 describe what to do with it.");
              }
            }, "\u{1F4AC} Ask agent"),
            h("button", { className: "btn", onclick: () => ui.setSelection(null) }, "\u2715 Deselect")
          )
        )
      );
    }
    function renderTree() {
      tagPage();
      clear(tree);
      const sel = ui.getSelection();
      const walk = (node, depth) => {
        if (isOverlayNode(node)) return;
        const id = idOf(node);
        const line = h("div", {
          className: "node" + (node === sel ? " selected" : ""),
          title: node === sel ? "Click again to deselect" : "Click to select",
          onclick: () => {
            if (node === ui.getSelection()) {
              ui.setSelection(null);
              return;
            }
            ui.setSelection(node);
            if (id) scrollToElement(id);
          }
        }, "  ".repeat(depth) + describeElement(node));
        tree.append(line);
        if (depth < 7) Array.from(node.children).forEach((c) => walk(c, depth + 1));
      };
      Array.from(document.body.children).forEach((c) => walk(c, 0));
      undoInfo.textContent = undoDepth() ? `${undoDepth()} edit(s) on the undo stack` : "";
    }
    function renderScripts() {
      clear(scriptsHolder);
      const scripts = listManagedScripts();
      if (!scripts.length) {
        scriptsHolder.append(h("p", { className: "hint" }, "No managed scripts yet. The agent creates them with upsert_script."));
        return;
      }
      scripts.forEach((s) => {
        scriptsHolder.append(h(
          "div",
          { className: "rowline" },
          h("span", { className: "pill" }, s.name),
          h("span", { className: "hint" }, `${s.length} chars`)
        ));
      });
    }
    function renderPlugins() {
      clear(pluginsHolder);
      const cfg = getConfig();
      const loaded = new Set(listPlugins().map((p) => p.name));
      if (!cfg.plugins.length) {
        pluginsHolder.append(h("p", { className: "hint" }, "No plugins configured."));
        return;
      }
      cfg.plugins.forEach((ref) => {
        pluginsHolder.append(h(
          "div",
          { className: "rowline" },
          h("span", { className: "pill" }, ref.name),
          h("span", { className: "hint" }, ref.src === "inline" ? "inline" : ref.src),
          h("span", { className: "hint" }, loaded.has(ref.name) ? "\u25CF loaded" : "\u25CB not loaded"),
          h("button", {
            className: "btn danger",
            onclick: async () => {
              if (!await ui.confirm("Remove plugin", `Remove "${ref.name}" from this page?`)) return;
              updateConfig({ plugins: cfg.plugins.filter((p) => p !== ref) });
              document.querySelector(`script[type="text/plain"][data-plugin="${CSS.escape(ref.name)}"]`)?.remove();
              unregisterPlugin(ref.name);
              ui.pluginApi.markDirty();
              refresh();
            }
          }, "remove")
        ));
      });
    }
    function refresh() {
      renderSelection();
      renderTree();
      renderScripts();
      renderPlugins();
      if (document.activeElement !== cssBox) cssBox.value = readStyles();
    }
    ui.onSelectionChange(() => {
      renderSelection();
      renderTree();
    });
    refresh();
    return { el, refresh };
  }
  function editTextInline(el, ui) {
    if (!(el instanceof HTMLElement)) return;
    const prev = el.innerHTML;
    el.contentEditable = "true";
    el.focus();
    ui.notify("Editing text in place \u2014 click elsewhere or press Escape to finish.");
    const finish = () => {
      el.contentEditable = "false";
      el.removeEventListener("blur", finish);
      el.removeEventListener("keydown", onKey);
      if (el.innerHTML !== prev) {
        pushUndo({ label: "inline text edit", undo: () => {
          el.innerHTML = prev;
        } });
        ui.pluginApi.markDirty();
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        el.blur();
      }
    };
    el.addEventListener("blur", finish);
    el.addEventListener("keydown", onKey);
  }
  async function addInlinePlugin(ui) {
    const name = prompt("Plugin name (letters/dashes):")?.trim();
    if (!name || !/^[\w-]+$/.test(name)) return;
    const source = prompt("Paste the plugin module source (export default {...}):");
    if (!source) return;
    const holder = document.createElement("script");
    holder.setAttribute("type", "text/plain");
    holder.setAttribute("data-plugin", name);
    holder.textContent = "\n" + source + "\n";
    document.body.appendChild(holder);
    const cfg = getConfig();
    updateConfig({ plugins: [...cfg.plugins, { name, src: "inline" }] });
    syncConfigElement();
    ui.pluginApi.markDirty();
    try {
      await loadPlugin({ name, src: "inline" }, ui.pluginApi, (n, d, src) => ui.confirm(`Load plugin "${n}"?`, d, src));
      ui.notify(`Plugin "${name}" added and loaded.`);
    } catch (e) {
      ui.notify(`Plugin stored but failed to load: ${e}`);
    }
  }
  async function addRemotePlugin(ui) {
    const url = prompt("Plugin module URL (must be an ES module with a default export):")?.trim();
    if (!url) return;
    const name = prompt("Plugin name:")?.trim() || url.split("/").pop() || "plugin";
    const cfg = getConfig();
    updateConfig({ plugins: [...cfg.plugins, { name, src: url }] });
    syncConfigElement();
    ui.pluginApi.markDirty();
    try {
      await loadPlugin({ name, src: url }, ui.pluginApi, (n, d, src) => ui.confirm(`Load plugin "${n}"?`, d, src));
      ui.notify(`Plugin "${name}" added and loaded.`);
    } catch (e) {
      ui.notify(`Plugin stored but failed to load: ${e}`);
    }
  }
  function truncate2(s, n) {
    return s.length > n ? s.slice(0, n) + "\u2026" : s;
  }

  // src/ui/settings.ts
  var BACKEND_LABELS = {
    "http-put": "Server (silent save back to this URL)",
    fsa: "Local file (browser file permission)",
    download: "Download a copy"
  };
  function buildSettingsPanel(ui) {
    const s = getSettings();
    const p = s.provider ?? { provider: "openrouter" };
    const providerSel = h(
      "select",
      null,
      h("option", { value: "openrouter" }, "OpenRouter"),
      h("option", { value: "custom" }, "Custom (OpenAI-compatible)"),
      h("option", { value: "mock" }, "Mock (testing)")
    );
    providerSel.value = p.provider;
    const baseUrlField = h(
      "div",
      { className: "field" },
      h("label", null, "Base URL (e.g. http://localhost:11434/v1 for Ollama)"),
      h("input", { value: p.baseUrl ?? "", placeholder: "https://\u2026/v1" })
    );
    const baseUrlInput = baseUrlField.querySelector("input");
    const keyInput = h("input", { type: "password", value: p.apiKey ?? "", placeholder: "sk-or-\u2026" });
    const modelInput = h("input", {
      value: p.model ?? "",
      placeholder: "e.g. anthropic/claude-sonnet-4.5",
      list: "pa-models"
    });
    const modelList = h("datalist", { id: "pa-models" });
    const status = h("div", { className: "status" });
    const backendSel = h("select", null);
    function refreshBackends() {
      clear(backendSel);
      const st = ui.saver.state;
      backendSel.append(h("option", { value: "" }, `Auto (${BACKEND_LABELS[st.detected]})`));
      st.available.forEach((b) => backendSel.append(h("option", { value: b }, BACKEND_LABELS[b])));
      backendSel.value = getSettings().saveBackend ?? "";
    }
    function syncVisibility() {
      baseUrlField.style.display = providerSel.value === "custom" ? "" : "none";
      const needsKey = providerSel.value !== "mock";
      keyField.style.display = needsKey ? "" : "none";
      modelField.style.display = needsKey ? "" : "none";
    }
    function save() {
      updateSettings({
        provider: {
          provider: providerSel.value,
          baseUrl: baseUrlInput.value.trim() || void 0,
          apiKey: keyInput.value.trim() || void 0,
          model: modelInput.value.trim() || void 0
        },
        saveBackend: backendSel.value || null
      });
      ui.saver.setBackend(backendSel.value || null);
      status.className = "status ok";
      status.textContent = settingsPersist() ? "Saved (kept only in this browser, never written into the HTML file)." : "Saved for this session only \u2014 this browser blocks local storage here.";
    }
    async function testModels() {
      status.className = "status";
      status.textContent = "Fetching model list\u2026";
      try {
        const models = await listOpenRouterModels(keyInput.value.trim() || void 0);
        clear(modelList);
        models.filter((m) => m.toolSupport).slice(0, 400).forEach((m) => modelList.append(h("option", { value: m.id }, m.name)));
        status.className = "status ok";
        status.textContent = `${models.filter((m) => m.toolSupport).length} tool-capable models loaded \u2014 type in the model field to search.`;
      } catch (e) {
        status.className = "status err";
        status.textContent = String(e?.message ?? e);
      }
    }
    const keyField = h(
      "div",
      { className: "field" },
      h("label", null, "API key (stays in this browser only)"),
      keyInput
    );
    const modelField = h(
      "div",
      { className: "field" },
      h("label", null, "Model"),
      modelInput,
      modelList,
      h(
        "div",
        { className: "rowline" },
        h("button", { className: "btn", onclick: () => void testModels() }, "Browse OpenRouter models")
      )
    );
    providerSel.addEventListener("change", syncVisibility);
    const panel = h(
      "div",
      { className: "panel" },
      h(
        "div",
        { className: "section" },
        h("h3", null, "Model"),
        h("div", { className: "field" }, h("label", null, "Provider"), providerSel),
        baseUrlField,
        keyField,
        modelField
      ),
      h(
        "div",
        { className: "section" },
        h("h3", null, "Saving"),
        h("div", { className: "field" }, h("label", null, "Save method"), backendSel),
        h(
          "p",
          { className: "hint" },
          "Server saving needs a server that accepts PUT (run: node server/serve.mjs). Local-file saving asks the browser for permission to this file once."
        )
      ),
      h(
        "div",
        { className: "section" },
        h(
          "div",
          { className: "rowline" },
          h("button", { className: "btn primary", onclick: save }, "Save settings")
        ),
        status
      )
    );
    syncVisibility();
    refreshBackends();
    ui.saver.onChange(refreshBackends);
    return panel;
  }

  // src/ui/overlay.ts
  function mountOverlay(deps) {
    const host = document.createElement("div");
    host.id = OVERLAY_HOST_ID;
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.append(h("style", null, overlayCss));
    let selection = null;
    const selectionListeners = [];
    const toasts = h("div", { className: "toasts" });
    function notify(message) {
      const t = h("div", { className: "toast" }, message);
      toasts.append(t);
      setTimeout(() => t.remove(), 4e3);
    }
    function confirmDialog(title, body, code) {
      return new Promise((resolve) => {
        const back = h("div", { className: "modal-back" });
        const close = (v) => {
          back.remove();
          resolve(v);
        };
        back.append(h(
          "div",
          { className: "modal" },
          h("h3", null, title),
          h("div", null, body),
          code ? h("pre", null, code.length > 2e3 ? code.slice(0, 2e3) + "\u2026" : code) : null,
          h(
            "div",
            { className: "actions" },
            h("button", { className: "btn", onclick: () => close(false) }, "Cancel"),
            h("button", { className: "btn primary", onclick: () => close(true) }, "OK")
          )
        ));
        shadow.append(back);
      });
    }
    const ui = {
      shadow,
      saver: deps.saver,
      loop: deps.loop,
      pluginApi: deps.pluginApi,
      notify,
      confirm: confirmDialog,
      getSelection: () => selection,
      setSelection(el) {
        selection = el;
        inspector.updatePin();
        selectionListeners.forEach((fn) => fn(el));
      },
      onSelectionChange(fn) {
        selectionListeners.push(fn);
      },
      setInspecting(on) {
        inspector.setActive(on);
        inspectBtn.classList.toggle("active", on);
      },
      openDrawer,
      refreshPagePanel: () => pagePanel.refresh()
    };
    const inspector = createInspector(shadow, (el) => {
      ui.setSelection(el);
      ui.setInspecting(false);
      openDrawer("page");
    }, () => selection);
    const inspectBtn = h("button", {
      className: "iconbtn",
      title: "Select an element on the page (Esc to cancel)",
      onclick: () => ui.setInspecting(!inspectBtn.classList.contains("active"))
    }, "\u2316");
    const helpBtn = h("button", {
      className: "iconbtn",
      title: "How to use this editor",
      onclick: () => showHelp()
    }, "?");
    function showHelp() {
      const back = h("div", { className: "modal-back", onclick: (e) => {
        if (e.target === back) back.remove();
      } });
      const sec = (title, ...lines) => h("div", null, h("h4", null, title), ...lines.map((l) => h("p", { className: "helpline" }, l)));
      back.append(h(
        "div",
        { className: "modal help" },
        h("h3", null, "How this editor works"),
        h(
          "p",
          { className: "helpline" },
          "This page edits itself. Everything \u2014 content, styling, the agent\u2019s configuration \u2014 lives in this one HTML file. Changes happen live; nothing touches the file until you press Save."
        ),
        sec(
          "Chat",
          "Describe any change in plain words: \u201Cmake the header dark blue\u201D, \u201Cadd an about section\u201D. The agent edits the page in front of you.",
          "Each edit shows up as a small expandable row \u2014 open it to see the exact HTML that was written. A good way to learn how the page is built."
        ),
        sec(
          "Selecting elements",
          "\u2316 (title bar): hover highlights elements on the page; click one to select it. Esc cancels.",
          "Or click any line in the Page tab\u2019s Structure tree. Click the same line again to deselect.",
          "A selected element is attached to your next chat message (\u201Cmake this bigger\u201D), and the Page tab shows its HTML with quick actions: edit text in place, delete, deselect.",
          "To unselect: the \u2715 on the chip above the chat box, the \u2715 Deselect button in the Page tab, or press Esc."
        ),
        sec(
          "Page tab",
          "The Structure tree is the live page; ids like [e12] are the handles the agent uses.",
          "Edit the page\u2019s CSS directly in the Stylesheet box \u2014 Apply is undoable, like every edit. Undo rolls back one edit at a time."
        ),
        sec(
          "Saving",
          "Save writes this HTML file back: silently via a save server, through a one-time browser file permission (Chrome), or as a download elsewhere. The \u25CF dot on the \u270E button means unsaved edits.",
          "The saved file is yours to share \u2014 mail it, host it, copy it. It stays editable anywhere because the editor script tag travels with it."
        ),
        sec(
          "Settings & privacy",
          "Your model API key is stored only in this browser, never written into the HTML file. The page talks directly to your model provider \u2014 there is no middleman server."
        ),
        h(
          "div",
          { className: "actions" },
          h("button", { className: "btn primary", onclick: () => back.remove() }, "Got it")
        )
      ));
      shadow.append(back);
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && selection && !inspectBtn.classList.contains("active")) {
        ui.setSelection(null);
      }
    });
    const drawer = h("div", { className: "drawer" });
    const fab = h(
      "button",
      { className: "fab", title: "Edit this page", onclick: () => toggleDrawer() },
      "\u270E",
      h("span", { className: "dot" })
    );
    const tabNames = [["chat", "Chat"], ["page", "Page"], ["settings", "\u2699 Settings"]];
    const tabBar = h("div", { className: "tabs" });
    const panels = {};
    function selectTab(name) {
      tabBar.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
      Object.entries(panels).forEach(([k, p]) => p.classList.toggle("active", k === name));
    }
    tabNames.forEach(([key, label]) => {
      tabBar.append(h("button", { className: "tab", dataset: { tab: key }, onclick: () => selectTab(key) }, label));
    });
    const chatPanel = buildChatPanel(ui);
    const pagePanel = buildPagePanel(ui);
    const settingsPanel = buildSettingsPanel(ui);
    panels.chat = chatPanel;
    panels.page = pagePanel.el;
    panels.settings = settingsPanel;
    const saveState = h("span", { className: "state" });
    const saveBtn = h("button", { className: "btn primary", onclick: () => doSave(false) }, "Save");
    const saveAsBtn = h("button", { className: "btn", title: "Save to a new file", onclick: () => doSave(true) }, "Save as\u2026");
    const savebar = h("div", { className: "savebar" }, saveState, saveAsBtn, saveBtn);
    async function doSave(as) {
      const r = as ? await deps.saver.saveAs() : await deps.saver.save();
      notify(r.message);
    }
    function renderSaveState() {
      const st = deps.saver.state;
      clear(saveState);
      saveState.append(
        st.dirty ? h("span", { className: "dirty" }, "\u25CF unsaved edits") : h("span", null, "no unsaved edits"),
        h("span", null, ` \xB7 via ${{ "http-put": "server", fsa: "local file", download: "download" }[st.backend]}`)
      );
      fab.classList.toggle("dirty", st.dirty);
    }
    deps.saver.onChange(renderSaveState);
    renderSaveState();
    const commandsRow = h("div");
    function renderCommands() {
      clear(commandsRow);
      const cmds = pluginCommands();
      if (!cmds.length) return;
      const row = h("div", { className: "rowline", style: "padding: 8px 14px 0;" });
      cmds.forEach(({ command }) => {
        row.append(h("button", { className: "btn", onclick: () => void command.run(deps.pluginApi) }, command.label));
      });
      commandsRow.append(row);
    }
    drawer.append(
      h(
        "div",
        { className: "titlebar" },
        h("span", { className: "name" }, "Page Agent"),
        h("span", { className: "spacer" }),
        helpBtn,
        inspectBtn,
        h("button", { className: "iconbtn", title: "Close", onclick: () => toggleDrawer(false) }, "\u2715")
      ),
      tabBar,
      commandsRow,
      chatPanel,
      pagePanel.el,
      settingsPanel,
      savebar
    );
    shadow.append(fab, drawer, toasts);
    let open = false;
    function toggleDrawer(force) {
      open = force ?? !open;
      drawer.classList.toggle("open", open);
      if (open) {
        pagePanel.refresh();
        renderCommands();
      }
    }
    function openDrawer(tab) {
      toggleDrawer(true);
      if (tab) selectTab(tab);
    }
    selectTab("chat");
    return ui;
  }

  // src/index.ts
  function boot() {
    if (document.getElementById(OVERLAY_HOST_ID)) return;
    const self = document.currentScript ?? document.querySelector(`script[${EDITOR_SCRIPT_ATTR}]`) ?? document.querySelector('script[src*="page-agent"]');
    const editorSrc = self?.getAttribute("src") ?? "page-agent.js";
    self?.setAttribute(EDITOR_SCRIPT_ATTR, "1");
    tagPage();
    getConfig();
    const saver = new Saver(() => {
      syncConfigElement();
      return serializePage(editorSrc, configJson(), (root) => runBeforeSaveHooks(root, pluginApi));
    });
    const pluginApi = {
      dom: dom_exports,
      validate: validate_exports,
      config: config_exports,
      markDirty: () => saver.markDirty(),
      notify: (m) => ui.notify(m)
    };
    function currentProvider() {
      const p = getSettings().provider;
      if (!p) return null;
      if (p.provider === "mock") return new MockProvider();
      if (p.provider === "openrouter") {
        if (!p.apiKey || !p.model) return null;
        return openRouterProvider(p.apiKey, p.model);
      }
      if (!p.baseUrl || !p.model) return null;
      return new OpenAICompatProvider({ baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model });
    }
    const allTools = () => [...builtinTools, ...pluginTools(pluginApi)];
    const loop = new AgentLoop(currentProvider, allTools, pluginPrompts, pluginApi);
    const ui = mountOverlay({ saver, loop, pluginApi });
    onMutation(() => saver.markDirty());
    void saver.init(getSettings().saveBackend ?? null);
    void loadConfiguredPlugins(
      pluginApi,
      (name, detail, source) => ui.confirm(`Load plugin "${name}"?`, `${detail}. Plugins run code with full access to this page.`, source)
    );
    const api = {
      version: "0.1.0",
      register: (p) => {
        const err = registerPlugin(p, pluginApi);
        if (err) throw new Error(err);
      },
      serialize: () => serializePage(editorSrc, configJson()),
      save: () => saver.save(),
      ctx: pluginApi,
      ui,
      _debug: { saver, loop, runBeforeSaveHooks }
    };
    window.PageAgent = api;
    document.dispatchEvent(new CustomEvent("page-agent-ready", { detail: api }));
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
