# Changelog

## 0.1.0 — première version jouable

### Ajouté
- Moteur de règles pur : downs, premier down, goal to go, TD, XP, 2 points, FG, safety, kickoff/punt/touchback/fair catch,
  turnovers, chrono avec écoulement entre les actions, temps morts, fin de période, mi-temps, prolongation (mort subite
  modifiée), pénalités (faux départ, hors-jeu, holding, interférence, facemask) avec acceptation/refus et demi-distance.
- Simulation d'action 22 contre 22 : blocages, plaquages au contact, feintes, plongeons, fumbles, passes (3 types),
  interceptions/déviations, latérales, coups de pied physiques, fatigue.
- IA : QB (progression, pression, scramble), porteur, receveurs, bloqueurs, défense (rush, individuelle, zones, blitz,
  play-action), appels d'actions selon la situation, 4e tentative, conversions, temps morts ; 3 difficultés.
- Playbook : 19 actions offensives, 11 défenses, schémas dessinés sur les cartes.
- Rendu 3D Three.js : stade complet, foule animée, joueurs articulés animés, caméra arrière/TV, survol d'avant-match,
  plan des touchdowns, retour au huddle, particules, lignes de scrimmage/premier down.
- Commandes tactiles contextuelles, bulles de receveurs, jauge de coup de pied, clavier.
- Audio procédural et volumes indépendants.
- Écrans : titre, menu, match rapide, match, pause, aide, résultats et statistiques, paramètres, sauvegardes.
- Modes : saison + playoffs, carrière de coach, franchise (création de club, échanges, installations, billetterie),
  carrière de joueur, mode spectateur, tutoriel guidé + entraînement libre.
- Sauvegardes versionnées avec validation et migrations, sauvegarde automatique.
- Portage C# du moteur de règles pour Unity + tests NUnit.
- Tests : unitaires, intégration (matchs pilotés), e2e Playwright multi-résolutions.
