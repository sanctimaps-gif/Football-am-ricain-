import type { App } from '../App';

/** Entrées de menu enregistrées par les modules de modes de jeu (évite les dépendances circulaires). */
export interface MenuEntry {
  id: string;
  icon: string;
  label: () => string;
  sub: () => string;
  open: (app: App) => void;
}

export const menuExtensions: { tiles: MenuEntry[]; footer: MenuEntry[] } = { tiles: [], footer: [] };
