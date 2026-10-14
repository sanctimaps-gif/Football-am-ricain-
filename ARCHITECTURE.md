# Architecture

## Principes

1. **Séparation stricte** : règles (`rules/`) ← simulation (`sim/`) ← contrôleur (`match/`) ← rendu/UI (`render/`, `ui/`).
   Les couches basses n'importent jamais les couches hautes. `rules/`, `sim/`, `ai/`, `match/`, `league/` n'utilisent
   ni le DOM ni Three.js : ils tournent dans Node (tests, simulation headless).
2. **Un seul moteur de match** : le même `MatchController` sert au match interactif, au mode spectateur, au tutoriel et aux
   tests ; `quickSim.ts` réutilise le même `resolvePlay` pour les matchs de saison non joués.
3. **Déterminisme** : RNG `mulberry32` à graine (`core/rng.ts`) ; une même graine produit le même match (utile aux tests).
4. **Données pilotées** : formations, tracés, défenses (`data/playbook.ts`) et équipes (`data/teams.ts`) sont des données ;
   ajouter une équipe ou une action ne demande pas de modifier les moteurs.

## Flux d'une action

```
UI (PlaySelection) ──selectOffense/selectDefense──▶ MatchController
                                                   │ buildSim(): personnel (profondeur de poste), formation, alignement défensif
                                                   ▼
PreSnap ── snap() ──▶ PlaySim.snap()  ── step(1/60, SimInput) × N ──▶ PlaySim.result (PlayResult : faits physiques)
                                                   │
BallDead ─────────────────────────────────────────▶ rules.resolvePlay(state, result)  → score, downs, possession, chrono,
                                                                                         pénalités, prolongation, stats
PlayReview → prepareNext() → PlaySelection | PreSnap (kickoff) | QuarterBreak | Halftime | CoinToss (prolongation) | MatchFinished
```

* La simulation **ne décide jamais** du score : elle rapporte où le ballon est mort, qui le tient, si la passe est
  incomplète, etc. Le moteur de règles en déduit TD, safety, touchback, premier down…
* Le pas de simulation est fixe (1/60 s) avec accumulateur ; les impulsions (boutons) ne sont consommées qu'au premier
  sous-pas d'une image.
* Les événements (`SimEvent`) remontent par un bus typé vers l'audio, les effets visuels et le HUD.

## Modules

| Module | Rôle |
|---|---|
| `core/` | RNG, maths, bus d'événements, constantes (`GAME_NAME`, dimensions du terrain) |
| `data/` | types (`Player`, `Team`…), notes par poste, générateur d'effectifs/joueurs, 16 franchises fictives, playbook |
| `rules/` | `RulesConfig`, `GameState`, `resolvePlay`, chrono, temps morts, conversions, statistiques |
| `sim/` | `PlaySim` (agents, ballon, contacts, plaquages, passes, coups de pied), `behaviors.ts` (IA de chaque rôle), `qb.ts` (décisions et lancers), `personnel.ts` (sélection selon la profondeur) |
| `ai/` | `playcaller.ts` : appels offensifs/défensifs, 4e down, conversion, genou, temps morts, plan de jeu |
| `match/` | `MatchController` (machine à états), `simulateMatch` (headless), `quickSim` (statistique, mêmes règles) |
| `league/` | `League` (modèle sérialisable), calendrier, classement, playoffs, intersaison, draft, marché, finances, carrière |
| `render/` | `GameRenderer` (scène, lumière unique ombrée, caméra), `stadium.ts`, `fieldTexture.ts`, `playerModel.ts` |
| `input/` | `TouchControls` (joystick + boutons + clavier) |
| `audio/` | `AudioEngine` (Web Audio, synthèse) |
| `save/` | `SaveManager` (enveloppes versionnées + migrations), `settings.ts` (validation), `storage.ts` |
| `ui/` | `App` (boucle, navigation), écrans, HUD, hub de ligue, créateurs, tutoriel |
| `i18n/` | dictionnaires FR (complet) / EN (partiel, repli FR) |

## Sauvegardes

* Clés `gd.settings`, `gd.profile`, `gd.slotN.meta`, `gd.slotN.data` (3 emplacements de carrière).
* Chaque valeur est une enveloppe `{ version, savedAt, data }`. Les migrations `MIGRATIONS[v]` transforment v → v+1.
* Au chargement : JSON invalide → ignoré ; version future → ignorée ; réglages complétés/validés (`sanitizeSettings`) ;
  ligue validée (`isLeague`). Identifiants stables (`teamId`, `playerId`).
* Sauvegarde automatique après chaque semaine/match, création, draft, échange ; bouton de sauvegarde manuelle.

## Performances (mobile)

* Une seule lumière ombrée qui suit l'action (ombres coupées en qualité basse, remplacées par des ombres « blob »).
* Foule : un `InstancedMesh` (≈3 000 instances, 1 appel de rendu), animée par tranches bornées par image.
* Géométries et matériaux partagés entre joueurs ; textures de numéros mises en cache ; particules en pool.
* Pas d'allocation dans les boucles chaudes du rendu (vecteurs temporaires réutilisés).
* Qualité basse/moyenne/haute : ratio de pixels (1 / 1,5 / 2), antialiasing, ombres, résolution du terrain, densité de foule.
* Limitation optionnelle à 30 FPS.
* Point d'attention : chaque joueur compte ~25 maillages (≈550 appels de rendu pour 22 joueurs). Piste d'optimisation :
  fusion des parties rigides par joueur ou modèles skinnés (voir `ROADMAP.md`).

## Portage Unity (`unity-port/`)

Le moteur de règles est porté en C# (`GridironDynasty.Rules`) sans dépendance à `UnityEngine`, avec des tests NUnit
EditMode. Correspondance prévue des autres couches :

| TypeScript | Unity |
|---|---|
| `sim/PlaySim.ts` | `MonoBehaviour` `PlaySimulation` avec `FixedUpdate` à 60 Hz, mêmes structures de données |
| `render/*` | prefabs URP + Animator (modèles riggés), Cinemachine pour la caméra |
| `input/TouchControls.ts` | Input System (On-Screen Stick / Buttons) |
| `ui/*` | UI Toolkit ou uGUI avec `Safe Area` |
| `save/*` | `JsonUtility`/Newtonsoft + `Application.persistentDataPath` |
| `data/*` | `ScriptableObject` (équipes, playbook) |
