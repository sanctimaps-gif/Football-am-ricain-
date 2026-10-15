# Gridiron Dynasty

Jeu de football américain en 3D conçu pour téléphone en **mode paysage**, avec match jouable aux commandes tactiles,
IA offensive et défensive, règles NFL et une structure de modes inspirée des jeux de football sans licences :
109 équipes (7 ligues régionales aux clubs « Ville + couleur » + 16 sélections), **carrière de club** (départ en 3e
division avec 3 joueurs, montées, transferts), carrière de joueur, championnats (dont ligue personnalisée), coupes et
tournois, défis et événement de la semaine, **Ultimate Team hors ligne** (cartes, packs gagnés en jouant, EVO, Journeys,
Arena, VS, Field Pass), équipes féminines, carrière de coach, franchise. Club créé ou repris, montée par playoffs,
éditeur de maillot, commandes simplifiées en option.

> Nom de travail modifiable dans `src/core/config.ts` (`GAME_NAME`).

## Choix technique

Unity n'a pas pu être installé dans l'environnement de développement (téléchargement bloqué par le proxy réseau,
pas de GPU, pas de licence, pas de SDK Android). Avec votre accord (« les deux »), le jeu est construit en
**TypeScript + Three.js (WebGL)** — jouable sur mobile via navigateur et empaquetable en APK — et le moteur de règles a été
**porté en C# pour Unity** dans `unity-port/` (non compilé ici, voir plus bas).

| Élément | Version |
|---|---|
| Node.js | 22 |
| TypeScript | 5.6 |
| Three.js | 0.169 |
| Vite (build) | 5.4 |
| Vitest (tests unitaires/intégration) | 2.1 |
| Playwright (tests e2e) | 1.56 |

Aucune ressource externe (modèles, sons, polices, images) : tout est généré par le code (voir `ASSET_CREDITS.md`).

## Lancer le jeu

```bash
npm install
npm run dev        # http://localhost:5173 (ajoutez ?fps pour afficher les FPS, ?quality=low pour forcer la qualité basse)
npm run build      # version de production dans dist/
npm run preview    # sert dist/ (accessible depuis un téléphone sur le même réseau : --host)
```

Sur téléphone : ouvrez l'adresse affichée par `npm run dev -- --host` ou `npm run preview -- --host`, touchez l'écran
titre (passage en plein écran + verrouillage paysage quand le navigateur le permet).

## Tests

```bash
npm run typecheck  # vérification TypeScript
npm test           # tests unitaires + intégration (Vitest)
npm run e2e        # tests de bout en bout dans Chromium (Playwright), lance le serveur Vite
```

Résultats détaillés : `TEST_REPORT.md`.

## Construire un APK Android (non réalisé dans cet environnement)

Le SDK Android n'est pas disponible ici ; voici la procédure prévue avec Capacitor :

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Gridiron Dynasty" com.gridiron.dynasty --web-dir dist
npm run build
npx cap add android
# Dans android/app/src/main/AndroidManifest.xml, activité principale :
#   android:screenOrientation="sensorLandscape"
npx cap sync android
npx cap open android   # puis Build > Build APK dans Android Studio (JDK 17, SDK 34+)
```

## Commandes

| Phase | Commandes |
|---|---|
| Avant le snap (attaque) | **HIKE** (snap), **CIBLE** (receveur), type de passe **Rapide / Tendue / Lobée** |
| QB dans la poche | Toucher une **bulle numérotée** (vert = démarqué, rouge = couvert) pour lancer, **PASSE** vers la cible, joystick = déplacement / scramble |
| Porteur du ballon | Joystick, **SPRINT** (maintenu), **FEINTE**, **PLONGEON** ou **PROTÉGER** (contextuel), **GENOU** dans l'en-but sur un retour |
| Receveur (ballon en l'air) | **SAUT** (réception acrobatique), placement automatique si le joystick est relâché |
| Défense | **CHANGER** (joueur le plus proche du ballon), **SPRINT**, **PLAQUAGE**, **INTERCEPT.** (ballon en l'air), **CONTENIR** (maintenu : poursuite assistée) |
| Coups de pied | Jauge : **FRAPPER** quand le curseur est au centre ; **ARRÊT VOLÉE** sur un punt |
| Clavier (test PC) | ZQSD/WASD/flèches, Maj = sprint, Espace = passe/plaquage, E = changer, Q = feinte, F = plongeon, R = saut, C = contenir, Entrée = snap, 1-5 = receveur, T = type de passe, Tab = cible |

## Structure

```
src/
  core/      utilitaires (RNG déterministe, maths, bus d'événements, configuration)
  data/      types, équipes fictives, générateur d'effectifs, notes, playbook (formations, tracés, défenses)
  rules/     moteur de règles pur (downs, score, chrono, pénalités, prolongation, statistiques)
  sim/       simulation d'une action (22 agents, ballon, blocages, plaquages, passes, coups de pied, QB IA)
  ai/        appel des actions (attaque, défense, 4e tentative, conversions, temps morts)
  match/     contrôleur de match (machine à états) + simulation rapide pour les matchs non joués
  league/    calendrier, classement, playoffs, intersaison, draft, marché, finances, carrière
  render/    rendu Three.js (stade, terrain, joueurs procéduraux animés, caméra)
  input/     commandes tactiles + clavier
  audio/     audio procédural Web Audio
  save/      sauvegardes versionnées (localStorage), réglages
  ui/        écrans (menus, match, résultats, ligue, création, tutoriel)
  i18n/      textes français (défaut) et anglais
tests/unit, tests/integration, tests/e2e
unity-port/  portage C# du moteur de règles + tests NUnit
```

Documentation : `GAME_DESIGN.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `TEST_REPORT.md`, `ASSET_CREDITS.md`, `CHANGELOG.md`.

## Licences

Toutes les équipes, noms, logos et maillots sont **fictifs et originaux**. Aucune équipe n'est licenciée ;
l'architecture (`Team.licensed`, `TEAM_TEMPLATES`) permet d'ajouter plus tard des données licenciées.
