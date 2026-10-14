# Game design — Gridiron Dynasty

Ce document décrit le jeu **tel qu'il est implémenté** (et signale ce qui ne l'est pas).

## 1. Expérience visée

Un match de football américain en 3D, lisible sur téléphone en paysage : on choisit une action dans un playbook
illustré, puis on joue l'action en contrôlant directement un joueur (QB, porteur, receveur, défenseur), l'IA gérant
les 21 autres. Les modes de gestion (saison, coach, franchise, carrière de joueur) réutilisent exactement le même moteur.

## 2. Règlement (`src/rules/config.ts`, `src/rules/engine.ts`)

Règlement unique de type « pro », centralisé :

| Règle | Valeur |
|---|---|
| Joueurs | 11 contre 11 |
| Durée | 4 quarts-temps de **1, 3, 5 ou 15 min** (réglable ; 3 par défaut, 15 = durée NFL réelle), changement de côté à chaque quart-temps |
| Downs | 4 tentatives pour 10 yards ; « goal to go » près de l'en-but ; perte de balle sur downs |
| Points | TD 6, extra point 1 (tiré du 15), conversion à 2 points (du 2), field goal 3, safety 2 |
| Coups d'envoi | du 35, touchback au 25, sortie en touche → 40 ; free kick du 20 après un safety |
| Punts | touchback au 20, arrêt de volée (fair catch) |
| Field goal manqué | ballon à l'adversaire au point du coup de pied (minimum le 20) |
| Chrono | s'arrête sur passe incomplète, score, changement de possession, pénalité, temps mort ; **sortie en touche** : arrêt seulement dans les 2 dernières minutes du 2e QT, les 5 dernières du 4e et en prolongation (seuils mis à l'échelle de la durée choisie), sinon le chrono repart ; écoulement entre les actions proportionnel à la durée du quart-temps |
| Two-minute warning | arrêt automatique du chrono à 2:00 (à l'échelle) des 2e et 4e QT ; l'écoulement entre actions ne peut pas le franchir |
| Chrono de jeu | 40 s pour snapper quand l'utilisateur attaque (affiché ⏱, rouge sous 10 s) ; dépassement = retard de jeu (−5). Désactivable dans les paramètres |
| Temps morts | 3 par mi-temps (2 en prolongation) |
| Pénalités | faux départ (−5), hors-jeu (+5), retard de jeu (−5), holding offensif (−10, down rejoué), **holding défensif (+5 et 1er down automatique)**, interférence défensive (au point de faute + 1er down ; au 1 si dans l'en-but), **interférence offensive (−10, down rejoué)**, facemask et **contact illégal sur le passeur** (+15 après l'action, 1er down), **passe volontairement au sol** (perte du down, recul de 10 yards ou au point de la passe ; safety si dans l'en-but ; uniquement dans la zone du tackle box), **comportement antisportif** (15 yards, reportés sur le coup d'envoi si un score a lieu) ; règle de la demi-distance ; acceptation/refus automatique au profit de l'équipe lésée ; fautes compensées |
| Prolongation | règle NFL actuelle : **chaque équipe a au moins une possession** (même après un TD sur la première) ; si l'égalité persiste ensuite, mort subite. Un safety ou un TD défensif termine immédiatement le match. Saison régulière : une période (durée réduite), égalité possible ; playoffs : périodes de la durée d'un quart-temps, jamais d'égalité |
| Intérieur de l'en-but | touchback sur interception/récupération dans son propre en-but, safety si le porteur y est plaqué |

Statistiques défensives : plaquages, **plaquages pour perte (TFL)**, sacks, interceptions, **fumbles provoqués (FF)**, passes déviées.

Non implémenté (documenté dans `ROADMAP.md`) : onside kick, coup de pied contré, challenge vidéo, chrono de jeu de 25 s
après temps mort, conversion défensive à 2 points sur retour (le tag existe, la simulation ne la produit pas encore).

## 3. Machine à états du match (`src/match/MatchController.ts`)

`PreGame → CoinToss → (PreSnap kickoff) → LivePlay ⇄ PassInFlight → BallDead → PlayReview → [QuarterBreak | Halftime] → PlaySelection → PreSnap → … → MatchFinished`

* La conversion est une `PlaySelection` spéciale (choix XP / 2 points).
* Les entrées utilisateur ne sont lues que dans les phases où elles ont un sens : impossible de lancer en sélection,
  de snapper deux fois, ou de compter un TD deux fois (le moteur ignore toute action après la fin du match et chaque
  action n'est résolue qu'une fois, à la transition `BallDead → PlayReview`).

## 4. Simulation d'une action (`src/sim/`)

* 22 agents en 2D (le terrain mesure 120 × 53,3 yards), ballon en 3D avec gravité.
* **Attributs utilisés** : vitesse (vitesse max), accélération, agilité (virages, feintes, esquive des plaquages),
  force (blocage, résistance au plaquage, fumbles), plaquage, précision et puissance de bras (dispersion, portée,
  vitesse de la passe), réception (receveurs et interceptions), blocage, endurance (fatigue cumulée sur le match),
  vision du jeu (temps de réaction, lecture des courses, retours de ballons libres), puissance/précision de frappe.
* **Blocages** : engagement au contact, rapport de force bloqueur/défenseur, libération (shed) probabiliste, double équipe,
  holding possible quand un bloqueur est battu.
* **Plaquages** : uniquement au contact (pas de plaquage à distance), probabilité selon plaquage vs agilité/force,
  bonus de plaquage collectif, feinte en cours, plongeon ; plaquages manqués ; chute vers l'avant ; fumble possible.
* **Passes** : trois types (rapide, tendue, lobée), point visé avec anticipation de la course du receveur, dispersion selon
  distance, précision, pression et course du QB ; réception/déviation/interception résolues au point de chute
  (receveur visé favorisé, défenseurs dos au ballon pénalisés). Passe en avant impossible au-delà de la ligne.
* **Coups de pied** : kickoff, punt, field goal / extra point avec trajectoire physique ; le FG est réussi si le ballon
  franchit le plan des poteaux entre les montants et au-dessus de la barre.
* **Collisions** : séparation des corps (pas de traversée), contraintes d'engagement.
* Garde-fou : une action ne peut pas dépasser 28 s de jeu.

## 5. Commandes tactiles (`src/input/TouchControls.ts`)

Joystick dynamique sur la moitié gauche, boutons contextuels à droite (inversables pour les gauchers), bulles de receveurs
projetées au-dessus des joueurs, anti-double appui (150 ms), vibration légère, sensibilité réglable. Assistance optionnelle
à la visée (sinon le joystick décale le point visé de 3 yards) et au changement de joueur. Toutes les commandes visibles
déclenchent une action réelle.

## 6. Playbook et IA

* **Attaque** (19 actions) : inside zone, power I, outside zone, toss sweep, option (latérale au RB), QB sneak, dive,
  slants, hitch & flat, mesh, curl flat, dig out, four verticals, post corner, RB screen, deux play-actions, TE pop, punt,
  field goal, genou à terre. Formations shotgun, shotgun trips, singleback (sous le centre), I-form, goal line.
* **Défense** (11) : 4-3 Cover 2 / Cover 3 / Cover 1, 4-3 stop course, 3-4 Cover 3, 3-4 blitz Cover 0, nickel individuelle,
  nickel blitz, nickel Cover 4, dime prevent, goal line. Couvertures individuelles et de zone, blitz.
* **IA d'appel** : situation (down, distance, terrain, score, temps), 4e tentative (go / punt / FG selon la portée du kicker),
  conversion à 2 points selon le tableau d'écart, genou à terre, temps morts de fin de mi-temps, variété (pénalité de
  répétition), plan de jeu du coach. La défense ne voit que la **formation** adverse et les **tendances observées** — jamais
  l'action choisie ni les entrées du joueur.
* **IA d'action** : QB (lecture de progression, seuil d'ouverture décroissant, pression, scramble, dégagement), porteur
  (recherche d'espace, feintes, protection du ballon, sortie en touche quand il faut arrêter le chrono), receveurs (tracés,
  démarquage), bloqueurs (pass pro, run block, lead, screen, escorte), défenseurs (rush, individuelle, zones, lecture des
  courses avec délai, morsure sur play-action, poursuite avec angle d'interception).
* **Difficulté** : facile / normal / difficile — agit sur les temps de réaction, la précision, le plaquage, la réception et
  la puissance de l'IA (jamais sur la connaissance des entrées de l'utilisateur).

## 7. Modes de jeu

| Mode | Contenu implémenté |
|---|---|
| Match rapide | 16 équipes, choix du côté, difficulté, durée ; rejouer ; statistiques ; historique sauvegardé |
| Mode spectateur | IA contre IA en 3D |
| Saison | calendrier (6/10/15 semaines), classement (tiebreaks : % victoires, confrontation directe, différence), playoffs (4 ou 8 équipes), finale, champion, MVP, saison suivante |
| Carrière de coach | + profondeur de poste, recrutement d'agents libres, prolongations, libérations, draft (3 tours, serpentin), plan de jeu, objectifs de la direction, confiance/réputation, licenciement et offres d'autres clubs |
| Franchise | + création du club (nom, ville, abréviation, couleurs, logo original à partir de formes/glyphe, maillots domicile/extérieur), échanges validés par la valeur et le plafond salarial, installations (entraînement, médical, stade), prix des billets, trésorerie, historique et records |
| Carrière de joueur | création (nom, poste, numéro, teint, taille, visière), draft, place dans la hiérarchie, entraînement hebdomadaire, objectifs de saison, points de compétence, promotion titulaire, récompenses ; pendant les matchs le joueur créé est **verrouillé** comme joueur contrôlé quand il est sur le terrain |
| Entraînement & tutoriel | 7 étapes guidées validées par de vrais événements de jeu (déplacement, passe, réception, downs, plaquage, couverture, précision), puis entraînement libre sans chrono ni enjeu |
| Multijoueur en ligne | **Non implémenté** (aucun bouton). Architecture prête : moteur de règles pur et contrôleur indépendant du rendu |

Les matchs non joués par l'utilisateur sont simulés par `quickSim.ts` : action par action avec **le même moteur de règles**
(downs, score, chrono, pénalités, prolongation) ; seules les issues des actions sont tirées statistiquement des notes.

## 8. Économie

Plafond salarial 200 M$ ; salaires selon la note et le poste ; recettes (TV/sponsors, billetterie selon capacité,
soutien des fans, prix), dépenses (salaires, installations) ; prime de signature 25 % ; indemnité de libération 50 % ;
effectif entre 45 et 55 joueurs ; échanges refusés si la valeur ou le plafond ne le permettent pas.

## 9. Présentation

Stade complet (tribunes à gradins, ~3 000 spectateurs instanciés qui s'animent, pylônes d'éclairage, écran géant, bancs,
tunnel), terrain marqué (lignes tous les 5 yards, hash marks, numéros, en-buts, pylônes, logo central, poteaux),
lignes de scrimmage et de premier down, joueurs articulés procéduraux (casque, grille, visière, épaulières, maillot
numéroté, gants, chaussettes, crampons, silhouettes selon le poste) animés (appuis, course, recul, blocage, lancer,
réception, feinte, plongeon, au sol, célébration, coup de pied), retour au huddle, survol d'avant-match, plan orbital
sur les touchdowns. Audio entièrement synthétisé (foule, réactions, sifflet, impacts, ballon, fanfare, musique de menu).

Limites assumées : modèles et animations **procéduraux provisoires** (pas de capture de mouvement), conçus pour être
remplacés par des modèles riggés glTF.
