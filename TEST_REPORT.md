# Rapport de tests — 0.1.0

Environnement : conteneur Linux sans GPU, Node 22, Chromium 141 (Playwright 1.56) en rendu logiciel SwiftShader.
**Aucun test sur un vrai téléphone n'a pu être réalisé** et **aucun APK n'a été compilé** (pas de SDK Android).

## Résumé

| Suite | Commande | Résultat |
|---|---|---|
| Vérification de types | `npm run typecheck` | ✅ 0 erreur |
| Build de production | `npm run build` | ✅ (≈760 ko JS, 210 ko gzip) |
| Unitaires — règles | `npm test` | ✅ 43/43 |
| Unitaires — ligue, marché, carrière, sauvegardes | `npm test` | ✅ 13/13 |
| Intégration — matchs pilotés, IA, ligue + sauvegarde | `npm test` | ✅ 7/7 |
| End-to-end Chromium (4 résolutions) | `npm run e2e` | ✅ 6/6 |
| Unity (C#, NUnit EditMode) | — | ⬜ **non exécuté** (Unity / .NET indisponibles) |
| Appareil Android/iOS réel | — | ⬜ **non exécuté** |

## Tests unitaires (`tests/unit`)

**Règles (43)** : gain de terrain et downs ; premier down ; goal to go ; perte de terrain ; turnover on downs ;
passe incomplète (ballon à la LOS, chrono arrêté) ; sortie en touche ; touchdown 6 pts + conversion ; pas de double
comptage après la fin ; extra point ; conversion à 2 points réussie/ratée ; field goal réussi/manqué (spot du coup de
pied) ; safety + free kick du 20 ; interception (spot, touchback dans l'en-but, TD défensif) ; kickoff (touchback 25,
retour) ; punt avec fair catch ; faux départ ; hors-jeu donnant un premier down ; demi-distance ; holding accepté/refusé ;
interférence de passe ; facemask ; fautes compensées ; écoulement du chrono ; temps morts ; fin de quart-temps ;
mi-temps (bon botteur, temps morts réinitialisés) ; fin de match ; conversion jouée à 0:00 ; prolongation ; égalité sans
prolongation ; changement de côté ; prolongation : TD gagnant, FG puis possession adverse, FG égalisateur puis mort
subite ; statistiques passeur/receveur ; statistiques annulées par une pénalité acceptée.

**Ligue (13)** : round-robin sans doublon ; classement V/D/N/PF/PA et tri ; saison complète → playoffs → champion →
intersaison → draft (IA + utilisateur) → saison 2 ; plafond salarial ; offre inférieure refusée puis acceptée (prime
débitée) ; échanges déséquilibrés refusés / équilibrés acceptés ; indemnité de libération ; installations limitées par
la trésorerie ; carrière de joueur (draft, entraînement une fois par semaine) ; sauvegarde/rechargement d'une ligue ;
données corrompues → valeurs par défaut ; version de sauvegarde future ignorée.

## Tests d'intégration (`tests/integration`)

* Match complet piloté comme un humain (choix d'actions, snap, passes, courses, punts, FG, conversions, jauge de kick) :
  le match se termine, le score reconstruit depuis le journal correspond au score final, chaque TD est suivi d'une
  conversion, toutes les phases de la machine à états sont traversées.
* Aucune action ne dépasse 32 s de jeu ; le chrono ne remonte jamais à l'intérieur d'un quart-temps.
* Snap impossible pendant la sélection ; impulsion « passe » sans effet hors action.
* Pause : ni la simulation ni le chrono n'avancent.
* 4 matchs IA contre IA complets ; scores plausibles ; jamais de score de 1 point isolé.
* Interception / fumble / turnover on downs changent bien la possession.
* Match joué enregistré dans la ligue puis rechargé depuis la sauvegarde.

## Tests end-to-end (`tests/e2e`, Chromium, écran tactile simulé)

1. Écran titre → menu → match rapide → pile ou face → coup d'envoi → sélection d'une passe → HIKE → PASSE → résolution
   de l'action ; **aucune erreur console**.
2. Pause et reprise sans perte d'état (temps de simulation figé en pause).
3. à 6. Menu et HUD de match à 667×375, 800×360, 844×390, 1180×820 : tous les boutons sont entièrement dans l'écran et
   mesurent au moins 40 px (cible tactile).

## Sessions de jeu automatisées (scripts `scripts/*.mjs`)

* Une session de 7 min a joué un vrai drive via l'interface (courses, passes complétées/incomplètes, hors-jeu, FG de l'IA).
* Parcours complet des modes : création de franchise, 11 onglets du hub, simulation d'une saison, playoffs, bilan,
  draft, saison 2, sauvegardes, carrière de joueur, tutoriel — sans erreur console.

## Mesures

* Rendu : ~140 appels de rendu par image (stade + foule + 22 joueurs instanciés + ombres) en qualité moyenne.
* Les FPS mesurés ici (10-13) **ne sont pas représentatifs** : rendu logiciel sans GPU. Mesure sur téléphone à faire.
* Simulation headless d'un match complet (agents) : ≈350 ms ; simulation rapide (statistique) : ≈3 ms.

## Problèmes connus

* Équilibrage : yards par réception élevés, courses très variables, peu de sacks (voir `ROADMAP.md`).
* Modèles/animations procéduraux provisoires.
* Anglais partiel (repli automatique sur le français).
* En carrière de joueur, si le joueur créé n'est pas sur le terrain pour une action, le contrôle revient au joueur par
  défaut (QB en attaque, linebacker en défense).
