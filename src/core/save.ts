// Saver abstraction: three interchangeable backends, auto-detected.
//
//   http-put  — page is served by a server that accepts PUT back to its own
//               URL (our server/serve.mjs, or any WebDAV-ish server).
//               Silent saves, works in every browser.
//   fsa       — File System Access API (Chromium, incl. file:// pages).
//               User picks the file once; handle is persisted in IndexedDB.
//   download  — download a fresh copy. Always works.

export type BackendId = 'http-put' | 'fsa' | 'download';

export interface SaveResult {
  ok: boolean;
  backend: BackendId;
  message: string;
}

export interface SaverState {
  backend: BackendId;
  detected: BackendId;
  available: BackendId[];
  dirty: boolean;
}

type Listener = (s: SaverState) => void;

const IDB_NAME = 'page-agent';
const IDB_STORE = 'file-handles';

export class Saver {
  private dirty = false;
  private override: BackendId | null = null;
  private detected: BackendId = 'download';
  private available: BackendId[] = ['download'];
  private putUrl: string | null = null;
  private handle: FileSystemFileHandle | null = null;
  private listeners: Listener[] = [];

  constructor(private getHtml: () => string) {}

  async init(savedOverride: BackendId | null): Promise<void> {
    this.override = savedOverride;
    this.available = ['download'];
    if ('showSaveFilePicker' in window) this.available.unshift('fsa');
    if (/^https?:$/.test(location.protocol)) {
      const put = await this.probePut();
      if (put) {
        this.available.unshift('http-put');
        this.putUrl = put;
      }
    }
    this.detected = this.available[0];
    if ('indexedDB' in window) {
      try { this.handle = await idbGet(location.href); } catch { /* no stored handle */ }
    }
    this.emit();
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  private async probePut(): Promise<string | null> {
    try {
      const res = await fetch(location.href, { method: 'OPTIONS' });
      const allow = (res.headers.get('allow') ?? '') + (res.headers.get('dav') ?? '');
      if (res.headers.get('x-pa-save') === '1' || /put/i.test(allow)) return location.href;
    } catch { /* no server support */ }
    return null;
  }

  get state(): SaverState {
    return {
      backend: this.backend,
      detected: this.detected,
      available: [...this.available],
      dirty: this.dirty,
    };
  }

  get backend(): BackendId {
    return this.override && this.available.includes(this.override) ? this.override : this.detected;
  }

  setBackend(id: BackendId | null): void {
    this.override = id;
    this.emit();
  }

  markDirty(): void {
    if (!this.dirty) { this.dirty = true; this.emit(); }
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    const s = this.state;
    this.listeners.forEach((fn) => fn(s));
  }

  suggestedFilename(): string {
    const last = decodeURIComponent(location.pathname.split('/').pop() ?? '');
    return last && last.endsWith('.html') ? last : (last || 'page') + (last.includes('.') ? '' : '.html');
  }

  /** Save in place with the active backend. Must be called from a user gesture. */
  async save(): Promise<SaveResult> {
    const html = this.getHtml();
    const backend = this.backend;
    try {
      let message: string;
      if (backend === 'http-put') message = await this.savePut(html);
      else if (backend === 'fsa') message = await this.saveFsa(html);
      else message = this.saveDownload(html);
      this.dirty = false;
      this.emit();
      return { ok: true, backend, message };
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') {
        return { ok: false, backend, message: 'Save cancelled.' };
      }
      return { ok: false, backend, message: `Save failed: ${String((e as Error)?.message ?? e)}` };
    }
  }

  /** Always prompts for a new location (FSA picker if present, else download). */
  async saveAs(): Promise<SaveResult> {
    const html = this.getHtml();
    try {
      if ('showSaveFilePicker' in window) {
        const picker = (window as unknown as { showSaveFilePicker: (o?: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
        const handle = await picker({
          suggestedName: this.suggestedFilename(),
          types: [{ description: 'HTML page', accept: { 'text/html': ['.html', '.htm'] } }],
        });
        await writeHandle(handle, html);
        this.handle = handle;
        try { await idbSet(location.href, handle); } catch { /* persistence is best-effort */ }
        this.dirty = false;
        this.emit();
        return { ok: true, backend: 'fsa', message: `Saved as ${handle.name}.` };
      }
      const msg = this.saveDownload(html);
      this.dirty = false;
      this.emit();
      return { ok: true, backend: 'download', message: msg };
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return { ok: false, backend: 'fsa', message: 'Save cancelled.' };
      return { ok: false, backend: 'fsa', message: `Save failed: ${String((e as Error)?.message ?? e)}` };
    }
  }

  private async savePut(html: string): Promise<string> {
    const res = await fetch(this.putUrl ?? location.href, {
      method: 'PUT',
      headers: { 'content-type': 'text/html;charset=utf-8' },
      body: html,
    });
    if (!res.ok) throw new Error(`server answered ${res.status}`);
    return 'Saved back to the server.';
  }

  private async saveFsa(html: string): Promise<string> {
    if (this.handle) {
      const perm = await this.handle.queryPermission?.({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const req = await this.handle.requestPermission?.({ mode: 'readwrite' });
        if (req !== 'granted') this.handle = null;
      }
    }
    if (!this.handle) {
      const picker = (window as unknown as { showOpenFilePicker: (o?: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
      const [handle] = await picker({
        types: [{ description: 'This HTML page', accept: { 'text/html': ['.html', '.htm'] } }],
      });
      const req = await handle.requestPermission?.({ mode: 'readwrite' });
      if (req !== 'granted') throw new Error('write permission not granted');
      this.handle = handle;
      try { await idbSet(location.href, handle); } catch { /* best-effort */ }
    }
    await writeHandle(this.handle, html);
    return `Saved to ${this.handle.name}. Reload to see the saved version.`;
  }

  private saveDownload(html: string): string {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.suggestedFilename();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'Downloaded a copy — replace the original file with it.';
  }
}

async function writeHandle(handle: FileSystemFileHandle, html: string): Promise<void> {
  const w = await (handle as unknown as { createWritable: () => Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }).createWritable();
  await w.write(html);
  await w.close();
}

// Minimal IndexedDB helpers for persisting the file handle across sessions.

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<FileSystemFileHandle | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: FileSystemFileHandle): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

declare global {
  interface FileSystemFileHandle {
    queryPermission?(opts: { mode: string }): Promise<string>;
    requestPermission?(opts: { mode: string }): Promise<string>;
  }
}
