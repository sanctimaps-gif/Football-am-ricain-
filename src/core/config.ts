/** Nom du jeu : modifiable en un seul endroit. */
export const GAME_NAME = 'Gridiron Dynasty';
export const GAME_VERSION = '0.1.0';

/** Dimensions du terrain en yards (repère du monde de simulation). */
export const FIELD = {
  length: 120, // lignes de fond à x=0 et x=120
  width: 53.333,
  goalLeft: 10, // ligne de but gauche
  goalRight: 110, // ligne de but droite
  hashOffset: 3.08, // demi-écart des hash marks (style pro : 18'6" entre les hash)
  postHalfWidth: 3.083, // demi-largeur des poteaux (18'6")
  crossbarHeight: 3.333, // 10 pieds
};
export const GRAVITY = 10.73; // yards/s²
