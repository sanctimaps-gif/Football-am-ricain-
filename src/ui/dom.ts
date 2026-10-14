/** Petits utilitaires DOM (pas de framework : interface légère pour mobile). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Délégation : appelle `fn(action, element)` pour tout clic sur [data-action]. */
export function onAction(root: HTMLElement, fn: (action: string, target: HTMLElement) => void): void {
  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t || !root.contains(t) || t.hasAttribute('disabled')) return;
    fn(t.dataset.action!, t);
  });
}

export function ovrClass(o: number): string {
  return o >= 80 ? 'hi' : o >= 68 ? 'mid' : 'lo';
}
