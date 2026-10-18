# Crédits des ressources

Deux ressources externes : le modèle des joueurs réalistes et les portraits d'entraîneurs (voir ci-dessous). Tout le reste est généré par le code du dépôt.

## Ressource externe

| Ressource | Auteur | Licence | Modifications |
|---|---|---|---|
| Joueur 3D réaliste avec squelette (`public/models/player.glb` et textures `public/models/*`) — « American Football Player », https://sketchfab.com/3d-models/american-football-player-10bf41a1c05a4c9cb74676b7dd8cb18e | blakeallen25 | CC BY 4.0 | Maillage allégé (≈11 000 triangles), casque d'origine supprimé (remplacé par un casque procédural), logos de marque effacés des textures, numéros d'origine retirés, couleurs d'équipe appliquées par masque, animation remplacée par une animation procédurale |

| Relief des bras (forme musculaire de l'avant-bras et du biceps) — « Male body », https://sketchfab.com/3d-models/male-body-5c818a5be6c84f898826d989f02932b0 | Chin Eeyang | CC BY 4.0 | Le maillage n'est pas inclus : il sert uniquement de référence pour sculpter les bras du joueur (bras repliés sur le squelette du joueur, relief limité à 8 mm et lissé) |
| Portraits d'entraîneurs (`public/coach/coach0-3.jpg`) | Images fournies par l'auteur du projet | Utilisation dans le jeu à sa demande | Recadrées en 4 portraits 256 px ; **tous les logos et marques effacés** (logos d'équipes et de la ligue sur casquettes et vestes, virgule d'équipementier, marque du micro) par remplissage par diffusion |

Le modèle n'est utilisé qu'en qualités moyenne et haute ; en qualité basse (ou s'il ne se charge pas), les joueurs en primitives ci-dessous sont utilisés.

## Ressources générées

| Ressource | Origine |
|---|---|
| Terrain (gazon, lignes, numéros, en-buts, logo central) | Canvas 2D généré (`src/render/fieldTexture.ts`) |
| Stade, tribunes, foule, poteaux, pylônes, bancs, tunnel, écran | Primitives Three.js (`src/render/stadium.ts`) |
| Joueurs en qualité basse (casque, grille, épaulières, maillots, numéros, gants, crampons) | Primitives Three.js + numéros dessinés en Canvas (`src/render/playerModel.ts`) |
| Animations | Procédurales (`PlayerView.animate`) — provisoires, non issues de capture de mouvement |
| Ballon | Primitives Three.js |
| Logos des équipes et de la franchise créée | SVG générés à partir de formes et d'un glyphe (`src/ui/logo.ts`) |
| Sons (foule, sifflet, impacts, ballon, fanfare, interface, musique) | Synthèse Web Audio (`src/audio/AudioEngine.ts`) |
| Icône | SVG original (`public/favicon.svg`) |
| Polices | Polices système (pile `Barlow Condensed`, `Roboto Condensed`, `Arial Narrow`, sans-serif) — aucune police embarquée |
| Noms de joueurs | Combinaisons aléatoires de prénoms/noms courants (`src/data/names.ts`), aucune personne réelle visée |
| Équipes, villes-nom, stades | Ligue Francophone : fictifs et originaux (`src/data/teams.ts`). Autres ligues (`src/data/world.ts`) : noms de remplacement « Ville + couleur » (nom de ville + couleur dominante), sans surnom officiel, logo, police ni nom de stade réel ; stades génériques « Ville + Stadium/Field/Dome… ». Aucune licence de ligue professionnelle. |
| Sélections nationales | Nom du pays, couleurs du drapeau et code pays à 2 lettres ; aucun logo de fédération |

## Bibliothèques

| Paquet | Licence |
|---|---|
| three | MIT |
| vite, vitest, typescript, @playwright/test, tsx (développement uniquement) | MIT / Apache-2.0 |

Emojis de l'interface : rendus par la police système de l'appareil.
