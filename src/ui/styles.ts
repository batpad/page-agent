// All overlay CSS. Lives inside the shadow root, so nothing leaks into the
// page and the page can't break the editor.

export const overlayCss = /* css */ `
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
.toolrow > summary::before { content: "▸"; font-size: 10px; transition: transform .12s; }
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
`;
