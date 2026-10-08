// Tiny element builder — the only "framework" the overlay uses.

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'dataset') {
      Object.assign(el.dataset, v);
    } else if (k in el && k !== 'list' && k !== 'form') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else {
      el.setAttribute(k, String(v));
    }
  }
  el.append(...children.filter((c): c is Node | string => c != null && c !== false));
  return el;
}

export function clear(el: Element): void {
  el.textContent = '';
}
