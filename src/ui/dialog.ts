import { el, esc } from './dom';

/** Fenêtre de message intégrée (remplace alert(), indisponible dans certains lecteurs). */
export function showMessage(text: string): Promise<void> {
  return new Promise((resolve) => {
    const m = el('div', 'modal', `<div class="box"><div class="helptext">${esc(text)}</div><div class="actions"><button class="btn primary">OK</button></div></div>`);
    m.style.zIndex = '40';
    m.querySelector('button')!.addEventListener('click', () => {
      m.remove();
      resolve();
    });
    document.getElementById('ui')!.appendChild(m);
  });
}

/** Confirmation intégrée (remplace confirm()). */
export function showConfirm(text: string, yes = 'Oui', no = 'Non'): Promise<boolean> {
  return new Promise((resolve) => {
    const m = el('div', 'modal', `<div class="box"><div class="helptext">${esc(text)}</div><div class="actions"><button class="btn primary" data-r="1">${esc(yes)}</button><button class="btn" data-r="0">${esc(no)}</button></div></div>`);
    m.style.zIndex = '40';
    m.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      m.remove();
      resolve(b.dataset.r === '1');
    }));
    document.getElementById('ui')!.appendChild(m);
  });
}
