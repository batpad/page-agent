// Inspect mode: hover outlines over the real page, click to select.
// The highlight box lives in the overlay shadow root (position: fixed),
// so the page DOM is never touched.

import { h } from './h';
import { describeElement, idOf, isOverlayNode, tagPage } from '../core/dom';

export interface Inspector {
  hoverBox: HTMLElement;
  pinBox: HTMLElement;
  setActive(on: boolean): void;
  updatePin(): void;
  destroy(): void;
}

export function createInspector(
  shadow: ShadowRoot,
  onSelect: (el: Element) => void,
  getSelection: () => Element | null,
): Inspector {
  const hoverBox = h('div', { className: 'hl' }, h('span', { className: 'tag' }));
  const pinBox = h('div', { className: 'hl pinned' }, h('span', { className: 'tag' }));
  shadow.append(hoverBox, pinBox);

  let active = false;

  function position(box: HTMLElement, el: Element): void {
    const r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = `${r.left - 2}px`;
    box.style.top = `${r.top - 2}px`;
    box.style.width = `${r.width + 4}px`;
    box.style.height = `${r.height + 4}px`;
    const tag = box.querySelector('.tag') as HTMLElement;
    tagPage();
    tag.textContent = shortLabel(el);
    tag.style.top = r.top < 30 ? 'auto' : '-22px';
    tag.style.bottom = r.top < 30 ? '-22px' : 'auto';
  }

  function shortLabel(el: Element): string {
    const id = idOf(el) ?? '?';
    let s = `${el.tagName.toLowerCase()}`;
    if (el.id) s += `#${el.id}`;
    else if (el.classList.length) s += `.${el.classList[0]}`;
    return `[${id}] ${s}`;
  }

  function pageTarget(e: Event): Element | null {
    const t = e.composedPath()[0];
    if (!(t instanceof Element)) return null;
    if (t.getRootNode() !== document) return null; // inside our shadow root
    const el = t.closest('body *');
    if (!el || isOverlayNode(el)) return null;
    return el;
  }

  const onMove = (e: MouseEvent) => {
    const el = pageTarget(e);
    if (el) position(hoverBox, el);
    else hoverBox.style.display = 'none';
  };

  const onClick = (e: MouseEvent) => {
    const el = pageTarget(e);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(el);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setActive(false);
  };

  function setActive(on: boolean): void {
    if (on === active) return;
    active = on;
    if (on) {
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
      document.documentElement.style.cursor = 'crosshair';
    } else {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.style.cursor = '';
      hoverBox.style.display = 'none';
    }
    stateListeners.forEach((fn) => fn(on));
  }

  function updatePin(): void {
    const sel = getSelection();
    if (sel && sel.isConnected) position(pinBox, sel);
    else pinBox.style.display = 'none';
  }

  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(updatePin);
  };
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);

  const stateListeners: Array<(on: boolean) => void> = [];
  (setActive as unknown as { onState: typeof stateListeners }).onState = stateListeners;

  return {
    hoverBox,
    pinBox,
    setActive,
    updatePin,
    destroy() {
      setActive(false);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    },
  };
}

export function breadcrumb(el: Element): Element[] {
  const chain: Element[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    chain.unshift(cur);
    cur = cur.parentElement;
  }
  return chain;
}

export { describeElement };
