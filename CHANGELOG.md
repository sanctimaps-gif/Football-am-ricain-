# Changelog

## 0.4.0 — inspirations Rugby Nations 26 et Madden Mobile

### Ajouté
- Carrière de club : création de son propre club (pays d'origine, identité, maillot), montée par playoffs (top 4,
  seul le vainqueur monte, le dernier descend), tournoi intersaison contre des clubs d'autres régions, trophées.
- Éditeur de maillot détaillé (maillot, manches, épaules, col, numéros, pantalon, chaussettes, chaussures, gants,
  casque, bande, grille, tenue extérieure) visible sur les joueurs 3D.
- Ultimate Team hors ligne : cartes, raretés, cartes doubles et synergie, traits, EVO, packs (monnaies gagnées en
  jouant uniquement), playbook à budget, défis du jour, Journeys (30 étapes), Arena, VS, Field Pass gratuit,
  événement du mois.
- Équipes féminines (12 sélections, Coupe du monde féminine, défi) avec modèle 3D adapté.
- Commandes simplifiées en option.

## 0.3.0 — monde et modes façon « football league »

### Ajouté
- 7 ligues régionales (USA 32 clubs, Canada, Europe, Francophone, Asie-Pacifique, Amérique latine, Afrique) et
  16 sélections nationales. Clubs sans licence nommés « Ville + couleur », logos et stades génériques.
- Carrière de club : départ en 3e division avec 3 joueurs gardés, pyramide D3 → D2 → D1 (montées, relégations,
  playoffs du titre), revenus par division, marché des transferts (achat, vente, recherche par poste).
- Championnats par ligue et ligue personnalisée (6 à 20 clubs au choix).
- Coupes et tournois : 10 compétitions (coupes nationales, continentales, des Champions, des Nations), groupes et
  élimination directe.
- Défis « moments » (8) et événement de la semaine, étoiles sauvegardées.
- Match rapide : choix de la ligue pour chaque équipe.

### Modifié
- Menu principal réorganisé (9 modes) ; maillot extérieur coloré pour les clubs dont la couleur principale est claire.

## 0.2.0 — règles NFL appliquées

### Ajouté
- Quart-temps de 15 min (durée réelle) en plus de 1, 3 et 5 min.
- Chrono de jeu de 40 s (affiché dans le HUD, rouge sous 10 s) et pénalité de retard de jeu (−5) ; option dans les paramètres.
- Two-minute warning aux 2e et 4e quarts-temps.
- Pénalités : holding défensif (+5 et 1er down automatique), interférence offensive (−10), contact illégal sur le passeur
  (+15, 1er down), passe volontairement au sol (perte du down, safety dans l'en-but), comportement antisportif (15 yards,
  reportés sur le coup d'envoi après un score).
- Statistiques : plaquages pour perte (TFL) et fumbles provoqués, affichés dans les résultats.

### Modifié
- Prolongation : chaque équipe a au moins une possession, même après un TD sur la première ; mort subite ensuite ;
  playoffs en périodes de la durée d'un quart-temps, sans égalité.
- Sortie en touche : le chrono ne s'arrête que dans les 2 dernières minutes du 2e QT, les 5 dernières du 4e et en
  prolongation.
- QB IA : laisse davantage les tracés se développer et ne jette le ballon hors du terrain qu'en dehors du tackle box.

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
