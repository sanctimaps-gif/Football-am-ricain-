# Crédits des ressources

Le projet **n'utilise aucune ressource externe** (ni modèle 3D, ni texture, ni son, ni police, ni image téléchargés).
Tout est généré par le code du dépôt :

| Ressource | Origine |
|---|---|
| Terrain (gazon, lignes, numéros, en-buts, logo central) | Canvas 2D généré (`src/render/fieldTexture.ts`) |
| Stade, tribunes, foule, poteaux, pylônes, bancs, tunnel, écran | Primitives Three.js (`src/render/stadium.ts`) |
| Joueurs (casque, grille, épaulières, maillots, numéros, gants, crampons) | Primitives Three.js + numéros dessinés en Canvas (`src/render/playerModel.ts`) |
| Animations | Procédurales (`PlayerView.animate`) — provisoires, non issues de capture de mouvement |
| Ballon | Primitives Three.js |
| Logos des équipes et de la franchise créée | SVG générés à partir de formes et d'un glyphe (`src/ui/logo.ts`) |
| Sons (foule, sifflet, impacts, ballon, fanfare, interface, musique) | Synthèse Web Audio (`src/audio/AudioEngine.ts`) |
| Icône | SVG original (`public/favicon.svg`) |
| Polices | Polices système (pile `Barlow Condensed`, `Roboto Condensed`, `Arial Narrow`, sans-serif) — aucune police embarquée |
| Noms de joueurs | Combinaisons aléatoires de prénoms/noms courants (`src/data/names.ts`), aucune personne réelle visée |
| Équipes, villes-nom, stades | Fictifs et originaux (`src/data/teams.ts`) ; aucune marque ni licence de ligue professionnelle |

## Bibliothèques

| Paquet | Licence |
|---|---|
| three | MIT |
| vite, vitest, typescript, @playwright/test, tsx (développement uniquement) | MIT / Apache-2.0 |

Emojis de l'interface : rendus par la police système de l'appareil.
