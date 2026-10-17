# Game design — NFL League

Ce document décrit le jeu **tel qu'il est implémenté** (et signale ce qui ne l'est pas).

## 1. Expérience visée

L'utilisateur est **entraîneur et investisseur** de son club (à la manière d'un jeu de management) : il ne dirige
aucun joueur sur le terrain. Le match se regarde comme à la télévision (caméra latérale, bandeau de commentaire,
tableau de score) ; **avant chaque action**, l'entraîneur appelle une tactique — uniquement parmi celles qu'il a apprises
à l'académie — et peut donner une consigne (receveur prioritaire). Les 22 joueurs sont dirigés par l'IA.
Avant chaque match, l'entraîneur adjoint remet un **rapport sur l'adversaire**.

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

## 5. Rôle d'entraîneur (`src/coach/`, `src/ui/screens/MatchScreen.ts`)

* **Académie tactique** (`coach/academy.ts`, `ui/screens/AcademyScreen.ts`) : une leçon par tactique (18 en attaque, 11 en
  défense). Chaque leçon = un court texte (principe, quand l'utiliser, point faible, points à regarder), l'**action rejouée
  au ralenti** (×0,15 à ×1) avec les joueurs clés étiquetés et les étapes affichées au fil de l'action, puis une
  **question de compréhension** (3 réponses). Une bonne réponse débloque la tactique (profil sauvegardé).
  Les démonstrations sont déterministes (pas fixes de 1/60 s) et choisies pour illustrer la tactique (réussite de
  l'attaque pour une leçon d'attaque, de la défense pour une leçon de défense).
* **4 tutoriels de base obligatoires** avant le premier match : Inside Zone, Slants, 4-3 Cover 3, 4-3 Stop course.
  Les autres leçons s'ouvrent ensuite. Les actions spéciales (punt, field goal, genou) restent toujours disponibles.
* **Appel avant chaque action** : panneau d'appel automatique (situation, suggestion de l'adjoint « Suivre », familles
  Passes/Courses/Spéciales, cartes avec schéma et usage, consigne « receveur prioritaire » pour les passes, temps morts,
  choix de conversion). Le snap est automatique ; l'appel adverse reste secret.
* **Entraîneur adjoint automatique** (option) : il appelle à votre place, toujours parmi vos tactiques apprises.
* **Panneaux** (barre de droite) : Appel, Aperçu (possession, anneaux de stats, mini-carte des 22 joueurs, remarques de
  l'adjoint selon le déroulement), Plan de jeu (course/passe, prise de risque, passes longues), Stats, Notes des joueurs.
* Vitesse ×1/×2/×4 pendant les actions ; la difficulté porte sur l'entraîneur adverse (facile : appels moins adaptés ;
  difficile : il lit souvent vos intentions). Les joueurs des deux équipes ont les mêmes réflexes.
* **Avant-match** (`coach/scouting.ts`, `ui/screens/PreMatchScreen.ts`) : entraîneur adverse, forme récente (V/N/D),
  style de jeu attendu, joueurs clés, forces et faiblesses, comparaison des 6 unités, conseils tactiques reliés aux leçons
  (bouton « Apprendre » si la tactique n'est pas encore connue), compositions ; « Jouer le match » ou « Jeu rapide ».

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

## 7. Monde et modes de jeu (structure inspirée des jeux de football sans licences)

### Clubs sans licence officielle (`src/data/world.ts`)

Le jeu ne possède **aucune licence**. Comme les jeux de sport qui représentent des clubs réels sans en avoir les droits,
les clubs portent un **nom de remplacement « Ville + couleur »** (ex. « Kansas City Red », « Madrid White ») : seuls la
ville et une couleur dominante sont repris. Aucun surnom officiel, logo, police, nom de stade ou nom de joueur réel n'est
utilisé : logos vectoriels génériques (forme + initiales), stades génériques (« Buffalo Stadium »), joueurs générés.
Les noms de joueurs réels, même légèrement modifiés, ne sont **pas** utilisés (droit à l'image des personnes).

| Ligue | Clubs | Conférences |
|---|---|---|
| Ligue Pro Américaine | 32 | Américaine / Nationale |
| Ligue Canadienne | 9 | Est / Ouest |
| Ligue Européenne | 12 | Ouest / Est |
| Ligue Francophone | 16 (clubs fictifs d'origine) | Atlantique / Horizon |
| Ligue Asie-Pacifique | 8 | Nord / Sud |
| Ligue Latino-Américaine | 8 | Nord / Sud |
| Ligue Africaine | 8 | Ouest / Est |
| Sélections nationales | 16 | — |

### Modes

| Mode | Ce qui progresse | Contenu implémenté |
|---|---|---|
| Carrière de club | le club, son effectif, ses résultats sur plusieurs saisons | **deux départs au choix** : reprendre un club existant (style FL 26 : départ en 3e division avec seulement **3 joueurs** gardés) ou **créer son club** (style Rugby Nations : pays d'origine = ligue, nom, abréviation, logo, couleurs, **éditeur de maillot** pièce par pièce, effectif généré) ; pyramide de 3 divisions de 10 clubs : dans **chaque division les 4 premiers jouent des playoffs (demies + finale) et seul le vainqueur monte**, le dernier descend (D1 : playoffs du titre) ; **tournoi intersaison** à 4 contre des clubs d'autres régions du monde (primes, trophée) ; onglet Maillot pour modifier la tenue à tout moment ; divisions inférieures générées (« Ville + couleur ») ; revenus selon la division ; **marché des transferts** : recherche par poste, achat aux clubs de la division ou à des clubs étrangers contre une indemnité, vente avec offres des clubs ; agents libres, composition (profondeur de poste), plan de jeu, draft, contrats |
| Championnats | les résultats dans une ligue | choix parmi les 7 ligues (ou **ligue personnalisée** de 6 à 20 clubs de n'importe quelle ligue), calendrier, classement par conférence, playoffs, saisons suivantes |
| Coupes & tournois | la progression dans une compétition | coupe nationale de chaque ligue (élimination directe), Coupe des Champions (16 meilleurs clubs du monde, quotas par ligue), Coupe d'Europe des clubs, Coupe d'Amérique du Nord, Copa Latina, Coupe d'Afrique, Coupe d'Asie-Pacifique, Coupe des Nations (16 sélections), Ligue des Nations européenne, Gold Bowl ; phases de groupes (tirage par chapeaux, 2 premiers qualifiés) puis tableau (A1–B2, B1–A2…) |
| Défis & événements | la capacité à renverser une situation | 8 « moments » (drive de la victoire, goal-line stand, field goal de la gagne, remontée, sans temps mort, fermer le match, finale des Nations, petit poucet) + **événement de la semaine** tiré au sort (le même pour tous pendant 7 jours) ; quarts de 15 min, chrono réel ; 1 à 3 étoiles selon la difficulté, sauvegardées |
| Match rapide | — | 109 équipes : ligue choisie séparément pour chaque camp |
| Carrière de coach / Franchise | — | modes d'origine conservés (objectifs de la direction, création de club, échanges, installations) ; onglet Maillot (éditeur détaillé) en franchise |
| Ultimate Team (hors ligne) | l'effectif de cartes et le niveau du joueur | cartes de joueurs (Bronze → Légende, note GÉN, **cartes doubles** jouables à 2 postes + synergie), composition par emplacement, **22 traits** améliorables (points d'entraînement), **évolution EVO** (2 cartes sacrifiées, 3 niveaux), vente rapide ; **pièces, gemmes et points d'entraînement gagnés uniquement en jouant** (aucun achat réel, probabilités des packs affichées) ; boutique de packs ; **playbook à budget** (coût par action, budget qui monte avec le niveau, seules les actions choisies sont proposées en match) ; **Défis du jour** (3 par jour, Rookie/Pro/All-Pro) ; **Journeys** (carte de 30 étapes) ; **Arena** (drive chronométré, classement hebdomadaire contre des rivaux IA) ; **VS** (match éclair de 4 min contre un rival IA, cote) ; **Field Pass gratuit** (30 niveaux) ; **événement du mois** (calendrier de la saison : coup d'envoi, playoffs, draft…) avec carte d'événement ; identité et maillot de l'équipe |
| Équipes féminines | — | 12 sélections féminines (joueuses générées, silhouette et queue de cheval sous le casque), Coupe du monde féminine, défi dédié, disponibles en match rapide |
| Mode spectateur | — | match entre deux équipes au hasard |
| Multijoueur en ligne | — | **Non implémenté** (aucun bouton) |

Non implémenté (exige un serveur) : Leagues avec chat, VS en temps réel, classements communautaires, énergie (refusée par choix). Pas de licences officielles.

**Supprimé en 0.6** : contrôle des joueurs (joystick, boutons, commandes simplifiées), carrière de joueur (les anciennes
sauvegardes sont converties en championnat), ancien tutoriel des commandes.

**Installations** (`league/facilities.ts`, `ui/league/Installations.ts`) : Stade (avantage à domicile 3→8 %, bonus de
billetterie), Sièges (capacité ×1 → ×1,75), Boutique du club (300 → 2 200 k$ par semaine), Infirmerie (blessures plus
courtes, trousse après match), Entraînement (+10 → +50 % de progression). Coût en argent + diplômes, construction en
semaines de compétition, une à la fois. Après chaque match de ligue : écran de récompenses (argent, diplômes, trousses).

**Menu** : barre latérale de catégories (Accueil, Club, Compétitions, National, Académie, Défis, Femmes, UT) et grandes
cartes par mode ; installations (entraînement, médical, stade) améliorables dans tous les modes de gestion (rôle
d'investisseur).

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
