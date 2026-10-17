import type { App } from '../App';

/** Catégories du menu principal (barre latérale). */
export type MenuCategory = 'home' | 'club' | 'competitions' | 'national' | 'academy' | 'challenges' | 'women' | 'ut';

/** Entrées de menu enregistrées par les modules de modes de jeu (évite les dépendances circulaires). */
export interface MenuEntry {
  id: string;
  icon: string;
  label: () => string;
  sub: () => string;
  open: (app: App) => void;
  category?: MenuCategory;
}

export const menuExtensions: { tiles: MenuEntry[]; footer: MenuEntry[] } = { tiles: [], footer: [] };
