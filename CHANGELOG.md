# Changelog

## 0.7.2 — schémas tactiques

### Ajouté
- **Schéma de chaque tactique** (académie et bouton « 📐 Schéma » du panneau d'appel) : les 22 joueurs alignés comme
  dans la simulation, flèches par mission (routes, course, remise, bloqueur de tête, blocs, blitz, charge, couverture
  individuelle, zones défendues), légende, et **rôle de chacun** des 11 joueurs numérotés.

## 0.7.0 — investisseur, accueil, qualité d'image

### Ajouté
- **Installations** (rôle d'investisseur, tous les modes de gestion) : Stade, Sièges, Boutique du club, Infirmerie,
  Entraînement, 5 niveaux chacun ; coût en argent et en diplômes, temps de construction en semaines (une construction à
  la fois). Effets réels : avantage à domicile (3 à 8 %, appliqué aux matchs joués et simulés), bonus de billetterie,
  capacité, revenu hebdomadaire de la boutique, blessures plus courtes, trousses de secours, progression des joueurs.
- **Récompenses après chaque match** de ligue (argent, diplômes, trousses de secours) ; trousse = soigne un blessé.
- **Accueil** façon jeux mobiles : bannière d'événement (Coupe des Nations 2026), cartes Tutoriel/Académie, Carrière de
  club (ou Reprendre), Match, TV, Boutique (Ultimate Team), Carrière d'entraîneur.
- **Image** : gradins avec rangées de sièges, spectateurs plus détaillés, panneaux LED défilants, toits avec rampes
  lumineuses, écran géant avec le score en direct, caméra TV plus proche de l'action.

## 0.6.0 — NFL League : vous êtes l'entraîneur

### Ajouté
- Nouveau nom : **NFL League** (aucun logo ni marque de la NFL dans le jeu).
- Rôle d'**entraîneur / investisseur** : match regardé comme à la télévision (caméra latérale, bandeau de commentaire),
  appel d'une tactique avant chaque action, consigne « receveur prioritaire », temps morts, conversion, entraîneur adjoint
  (suggestions, mode automatique), panneaux Aperçu / Plan de jeu / Stats / Notes, vitesse ×1/×2/×4.
- **Académie tactique** : 29 leçons (texte, action au ralenti avec joueurs clés étiquetés, question) ; une tactique doit
  être apprise avant d'être appelée ; 4 tutoriels de base obligatoires avant le premier match.
- **Rapport d'avant-match** sur l'adversaire (forme, style, joueurs clés, forces/faiblesses, comparaison des unités,
  conseils reliés aux leçons) et compositions ; « Jouer le match » ou « Jeu rapide ».
- **Menu en catégories** (barre latérale) et grandes cartes ; profil d'entraîneur (nom, portrait) ; portraits sans logos.
- Installations améliorables dans tous les modes de gestion.

### Supprimé
- Contrôle des joueurs sur le terrain (joystick, boutons, commandes simplifiées, réglages associés), carrière de joueur
  (anciennes sauvegardes converties en championnat), ancien tutoriel des commandes.

## 0.5.0 — joueurs réalistes

### Ajouté
- Joueurs 3D réalistes avec squelette (modèle CC BY 4.0 de blakeallen25, allégé) en qualités moyenne et haute :
  couleurs d'équipe appliquées sur le maillot, le pantalon, les chaussettes et les accessoires, numéros devant et
  derrière, 6 tons de peau, silhouette selon la taille, animation procédurale (course, appui, lancer, plaquage, au sol).
- Casque procédural verni attaché à la tête (bande, grille, protections d'oreilles) aux couleurs de l'équipe.

- Qualité adaptative en moyenne et haute : si l'appareil n'atteint pas la cadence choisie, la résolution baisse
  par paliers (jusqu'à ×0,8), puis le halo se coupe ; elle remonte quand l'appareil suit. Joueurs réalistes,
  ombres et effets restent actifs.

### Modifié
- Qualité haute par défaut (les anciens réglages « moyenne », qui était le défaut, passent en haute une fois).
- Mesure des images par seconde en temps réel (elle était faussée sous 10 FPS).
- Logos de marque et numéros d'origine retirés des textures du modèle.
- Les joueurs en primitives restent utilisés en qualité basse ou si le modèle ne se charge pas.

## 0.4.1 — rendu et commandes

### Ajouté
- Éclairage d'environnement procédural (reflets des projecteurs), casques vernis, ciel de nuit étoilé, halos des
  projecteurs, post-traitement (bloom en qualité haute, étalonnage, vignettage, anticrénelage MSAA).
- Gazon réaliste : bruit multi-échelle, bandes de tonte, usure au centre, relief des brins (carte de normales).
- Spectateurs avec têtes et vêtements aux tons naturels.
- Multi-touch : joystick et boutons utilisables en même temps (événements tactiles suivis doigt par doigt,
  geste de zoom iOS neutralisé, relâchement fiable même si le bouton change pendant l'appui).

### Modifié
- Tableau de score compact.
- `index.html` à la racine = jeu compilé autonome (GitHub Pages) ; page de développement : `dev.html`.

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
