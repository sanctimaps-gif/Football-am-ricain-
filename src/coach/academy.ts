import { DEFENSIVE_PLAYS, OFFENSIVE_PLAYS } from '../data/playbook';
import type { Team } from '../data/types';
import { MatchController } from '../match/MatchController';
import { DEFAULT_RULES } from '../rules/config';
import { Rng } from '../core/rng';

/**
 * Académie tactique : chaque tactique (attaque ou défense) doit être apprise avant d'être appelée en match.
 * Une leçon = un court texte + l'action rejouée au ralenti + une question de compréhension.
 */

export type LessonSide = 'off' | 'def';

export interface Lesson {
  /** Identifiant de la tactique (playbook). */
  id: string;
  side: LessonSide;
  family: string;
  /** 1 : base, 2 : intermédiaire, 3 : avancé. */
  level: 1 | 2 | 3;
  text: string;
  /** Ce qu'il faut regarder pendant le ralenti (affiché pas à pas). */
  keys: string[];
  whenToUse: string;
  weakness: string;
  /** Situation et adversaire de la démonstration. */
  demo: { against: string; ballOn: number; down: 1 | 2 | 3 | 4; toGo: number };
}

const L = (id: string, side: LessonSide, family: string, level: 1 | 2 | 3, text: string, keys: string[], whenToUse: string, weakness: string, demo: Lesson['demo']): Lesson =>
  ({ id, side, family, level, text, keys, whenToUse, weakness, demo });

export const LESSONS: Lesson[] = [
  // ——————————— Attaque : courses ———————————
  L('insideZone', 'off', 'Course', 1,
    'Le quarterback remet le ballon au running back, qui attaque l’intervalle entre le guard et le tackle. Toute la ligne bloque « en zone » : chaque joueur pousse l’adversaire devant lui dans la même direction, et le coureur choisit le trou qui s’ouvre.',
    ['La ligne offensive avance d’un seul bloc vers la droite.', 'Le running back reçoit le ballon et lit ses blocs.', 'Il coupe dans le premier trou qui s’ouvre et protège le ballon au contact.'],
    'En 1er ou 2e down, pour gagner 3 à 5 yards et garder le ballon.',
    'Contre une défense qui met 8 joueurs près de la ligne, les trous se referment vite.',
    { against: '43cover2', ballOn: 30, down: 1, toGo: 10 }),
  L('powerI', 'off', 'Course', 2,
    'Formation en I : le fullback se place devant le running back. Au snap, il fonce dans l’intervalle et percute le linebacker ; le running back suit dans son sillage. C’est une course de force, pas de vitesse.',
    ['Le fullback part en premier, comme un bélier.', 'Le running back reste derrière lui jusqu’au contact.', 'Après le bloc du fullback, il accélère tout droit.'],
    'En courte distance (3e et 2, 4e et 1) ou pour user une défense physique.',
    'Lente à se développer : une défense rapide qui pénètre peut plaquer derrière la ligne.',
    { against: '43cover3', ballOn: 45, down: 2, toGo: 4 }),
  L('outsideZone', 'off', 'Course', 2,
    'Le running back part en diagonale vers la ligne de touche, derrière une ligne qui bloque latéralement. Il cherche à déborder la défense ; s’il ne peut pas, il « coupe » vers l’intérieur derrière ses blocs.',
    ['Toute la ligne glisse latéralement vers le bord.', 'Le running back court parallèlement à la ligne de mêlée.', 'Il choisit : déborder au bord ou couper à l’intérieur.'],
    'Contre une défense lourde et lente, ou quand les linebackers montent trop vite au centre.',
    'Si un défenseur extérieur tient son couloir, le coureur est poussé en touche sans gain.',
    { against: '43runStop', ballOn: 35, down: 1, toGo: 10 }),
  L('tossSweep', 'off', 'Course', 3,
    'Le quarterback lance (« toss ») le ballon au running back qui file vers l’extérieur, côté faible. Le fullback et un guard sortent pour ouvrir la route devant lui. Course de vitesse pour prendre la défense de vitesse.',
    ['Le QB lance le ballon en arrière, sans remise de la main à la main.', 'Le fullback court vers le bord pour bloquer le premier défenseur.', 'Le running back accélère le long de la ligne de touche.'],
    'Avec un running back rapide, contre une défense qui se resserre au centre.',
    'Perte de terrain possible si un défenseur pénètre côté extérieur avant le bloc.',
    { against: '43cover1', ballOn: 40, down: 2, toGo: 6 }),
  L('readOption', 'off', 'Course', 3,
    'Le quarterback garde le ballon et court vers l’extérieur avec le running back à côté de lui. Il « lit » le défenseur du bord : si celui-ci vient sur lui, il latéralise au running back ; sinon il garde le ballon.',
    ['Le QB et le RB partent ensemble vers l’extérieur.', 'Le QB fixe le défenseur extérieur.', 'Décision : il garde le ballon ou le latéralise au dernier moment.'],
    'Avec un QB mobile, pour mettre un défenseur en situation de choisir le mauvais joueur.',
    'Risque de ballon perdu sur une latérale ratée ; le QB prend des coups.',
    { against: '43cover3', ballOn: 38, down: 1, toGo: 10 }),
  L('qbSneak', 'off', 'Course', 2,
    'Le quarterback reçoit le snap et plonge immédiatement derrière son centre. Personne d’autre ne touche le ballon : c’est l’action la plus rapide du football pour gagner un yard.',
    ['La ligne charge bas et droit devant.', 'Le QB plonge derrière le centre sans attendre.', 'Le ballon doit franchir la ligne à gagner.'],
    'En 3e ou 4e et 1 : il faut un seul yard.',
    'Ne gagne presque jamais plus de 2 yards.',
    { against: '43cover2', ballOn: 48, down: 3, toGo: 1 }),
  L('goalLineDive', 'off', 'Course', 2,
    'Formation lourde (deux tight ends, fullback). Le running back plonge plein centre derrière un mur de bloqueurs. Simple et direct, pour les tout derniers yards.',
    ['Formation compacte : tout le monde serré.', 'Le running back prend le ballon en pleine course.', 'Il plonge vers l’en-but par le centre.'],
    'Près de l’en-but ou en très courte distance.',
    'Prévisible : la défense de goal line est faite pour l’arrêter.',
    { against: '43cover3', ballOn: 96, down: 2, toGo: 4 }),
  // ——————————— Attaque : passes ———————————
  L('quickSlants', 'off', 'Passe courte', 1,
    'Les receveurs extérieurs font trois pas puis coupent en diagonale vers le centre (« slant »). Le quarterback lance très vite, avant que la pression n’arrive. Passe courte, sûre, qui fait avancer les chaînes.',
    ['Trois pas en recul du QB, pas plus.', 'Les receveurs extérieurs coupent vers l’intérieur à 45°.', 'Le ballon part tôt, devant le défenseur.'],
    'En 2e ou 3e et moyen (4 à 7 yards), ou contre un blitz.',
    'Faible gain si un linebacker se place dans la trajectoire.',
    { against: '43cover3', ballOn: 30, down: 2, toGo: 6 }),
  L('hitchFlat', 'off', 'Passe courte', 2,
    'Trois receveurs du même côté (« trips »). L’un s’arrête et se retourne à 5 yards (« hitch »), un autre sort vers la ligne de touche (« flat »). Le défenseur de la zone ne peut pas couvrir les deux.',
    ['Trois receveurs regroupés d’un côté.', 'Un receveur s’arrête net et se retourne.', 'Le QB lance à celui que le défenseur n’a pas suivi.'],
    'Contre une couverture qui recule (Cover 3, Cover 4).',
    'Gains limités ; la défense individuelle collée l’étouffe.',
    { against: 'nickelQuarters', ballOn: 35, down: 1, toGo: 10 }),
  L('meshDrag', 'off', 'Passe courte', 2,
    'Deux receveurs se croisent à faible profondeur au milieu du terrain (« mesh »). Les défenseurs qui les suivent en individuelle se gênent mutuellement, et l’un des receveurs se retrouve seul.',
    ['Deux receveurs courent l’un vers l’autre à 5 yards.', 'Ils se croisent en se frôlant.', 'Le QB lance à celui qui sort libre du croisement.'],
    'Contre une défense individuelle (Cover 1, Nickel Man, blitz).',
    'Contre la zone, les croisements tombent dans les bras des linebackers.',
    { against: 'nickelMan', ballOn: 40, down: 3, toGo: 5 }),
  L('curlFlat', 'off', 'Passe intermédiaire', 2,
    'Le receveur extérieur court 10 yards et revient vers le QB (« curl ») pendant qu’un running back sort vers le bord (« flat »). Le défenseur extérieur doit choisir : s’il couvre l’un, l’autre est libre.',
    ['Le receveur s’arrête à 10 yards et revient vers le ballon.', 'Le running back sort vers la ligne de touche.', 'Le QB lit le défenseur du flat et lance à l’opposé.'],
    'En 2e et moyen contre la zone.',
    'Lente : contre un blitz, le QB n’a pas le temps.',
    { against: '43cover2', ballOn: 32, down: 2, toGo: 8 }),
  L('digsOut', 'off', 'Passe intermédiaire', 3,
    'Les receveurs courent 10 à 12 yards puis coupent à angle droit : vers l’intérieur (« dig ») ou vers l’extérieur (« out »). Conçu pour dépasser la ligne à gagner en 3e et long.',
    ['Les routes montent droit à 10-12 yards.', 'Coupure nette à 90°.', 'Le ballon arrive au-delà de la ligne jaune.'],
    'En 3e et long (7 à 12 yards).',
    'Demande une bonne protection : le QB tient le ballon longtemps.',
    { against: '43cover1', ballOn: 40, down: 3, toGo: 9 }),
  L('fourVerts', 'off', 'Passe longue', 3,
    'Quatre receveurs filent tout droit en profondeur. Deux safeties ne peuvent pas couvrir quatre couloirs : un receveur se retrouve en un contre un, ou seul entre deux défenseurs.',
    ['Quatre receveurs sprintent droit devant.', 'Les safeties s’écartent pour couvrir.', 'Le QB lance dans l’espace libre entre eux.'],
    'Pour un gros gain, quand on est mené ou contre une défense qui monte.',
    'Passe risquée (interception) ; contre Cover 4 / Prevent, peu d’espace.',
    { against: '43cover2', ballOn: 35, down: 1, toGo: 10 }),
  L('postCorner', 'off', 'Passe longue', 3,
    'Un receveur feint une course vers le centre (« post ») puis repart vers le coin du terrain (« corner »). Le safety mord sur la feinte et laisse le coin vide.',
    ['Le receveur part vers le centre du terrain.', 'Feinte : il repart vers le coin opposé.', 'Ballon lancé haut, vers la ligne de touche.'],
    'Contre une zone avec un seul safety profond (Cover 3, Cover 1).',
    'Route longue : il faut 3 secondes de protection.',
    { against: '43cover3', ballOn: 45, down: 2, toGo: 7 }),
  L('rbScreen', 'off', 'Passe écran', 3,
    'La ligne laisse volontairement passer les défenseurs qui chargent, puis sort pour escorter le running back à qui le QB fait une passe courte derrière la ligne. Le rush agressif se retrouve hors de l’action.',
    ['Les linemen relâchent leur bloc après deux secondes.', 'Le QB recule et attire les défenseurs.', 'Passe au running back, escorté par ses linemen.'],
    'Contre un blitz ou une défense qui charge fort, en 2e et long.',
    'Si un défenseur ne mord pas, il attend le running back et le plaque derrière la ligne.',
    { against: '34blitz', ballOn: 30, down: 2, toGo: 10 }),
  L('paBoot', 'off', 'Feinte de course', 3,
    'Le QB fait semblant de remettre le ballon au running back (« play action »), puis lance en profondeur. Les linebackers et safeties qui avancent pour arrêter la course laissent la profondeur vide.',
    ['Fausse remise au running back.', 'Les linebackers avancent vers la ligne : ils ont mordu.', 'Le QB se redresse et lance loin derrière eux.'],
    'Après plusieurs courses réussies, en 1er ou 2e down.',
    'Le QB tourne le dos à la défense quelques instants : vulnérable au blitz.',
    { against: '43runStop', ballOn: 40, down: 1, toGo: 10 }),
  L('paCross', 'off', 'Feinte de course', 2,
    'Même feinte de course que le Play-Action Deep, mais les receveurs croisent à mi-distance (10-15 yards) dans l’espace laissé par les linebackers qui ont avancé.',
    ['Fausse remise au running back.', 'Les linebackers montent vers la ligne.', 'Un receveur traverse le terrain derrière eux.'],
    'En 1er et 10 contre une défense qui respecte votre jeu de course.',
    'Moins efficace si vous n’avez pas encore couru dans le match.',
    { against: '43cover1', ballOn: 33, down: 1, toGo: 10 }),
  L('tePop', 'off', 'Passe courte', 2,
    'Formation lourde de goal line, comme pour une course. Le tight end bloque une seconde puis se détache dans l’en-but. La défense, persuadée d’une course, l’oublie.',
    ['Formation de course près de l’en-but.', 'Le tight end fait semblant de bloquer.', 'Il se libère et reçoit une passe courte.'],
    'Près de l’en-but, quand la défense attend une course.',
    'Peu d’options si le tight end est couvert.',
    { against: '43runStop', ballOn: 96, down: 3, toGo: 4 }),
  // ——————————— Défense ———————————
  L('43cover3', 'def', 'Zone', 1,
    'Quatre linemen, trois linebackers. Derrière, le terrain profond est découpé en trois tiers : chaque cornerback prend un tiers latéral, le free safety prend le centre. Les linebackers couvrent les zones courtes.',
    ['Au snap, les cornerbacks reculent dans leur tiers.', 'Le safety recule au centre du terrain.', 'Les linebackers lisent : course ou passe ?'],
    'Défense polyvalente en 1er et 2e down ; protège contre la passe longue.',
    'Les zones courtes près des lignes de touche sont faibles (hitch, flat).',
    { against: 'fourVerts', ballOn: 35, down: 1, toGo: 10 }),
  L('43runStop', 'def', 'Contre la course', 1,
    'Le strong safety descend près de la ligne : huit défenseurs dans la « boîte ». Chacun prend un intervalle et le défend. La couverture derrière est individuelle avec un seul safety libre.',
    ['Le strong safety s’avance avant le snap.', 'Chaque défenseur attaque son intervalle.', 'Le coureur ne trouve pas de trou.'],
    'Quand une course est probable : courte distance, formation lourde.',
    'Vulnérable à la feinte de course et aux passes longues.',
    { against: 'insideZone', ballOn: 40, down: 2, toGo: 3 }),
  L('43cover2', 'def', 'Zone', 2,
    'Deux safeties se partagent la profondeur en deux moitiés. Les cornerbacks restent bas pour couvrir les passes courtes vers la ligne de touche. Défense « qui plie mais ne rompt pas ».',
    ['Deux safeties reculent, un de chaque côté.', 'Les cornerbacks attendent dans les zones courtes.', 'Les passes courtes extérieures sont plaquées aussitôt.'],
    'Contre les passes courtes et moyennes, en 2e et long.',
    'Le centre du terrain en profondeur, entre les deux safeties, est le point faible.',
    { against: 'hitchFlat', ballOn: 32, down: 2, toGo: 8 }),
  L('43cover1', 'def', 'Individuelle', 2,
    'Chaque défenseur suit un receveur précis où qu’il aille (« man »), et un safety libre reste en profondeur pour aider. Très agressif sur les receveurs.',
    ['Chaque défenseur colle son receveur.', 'Le free safety surveille le fond du terrain.', 'Les fenêtres de passe se referment.'],
    'Avec de bons cornerbacks, contre des passes courtes et moyennes.',
    'Les croisements (Mesh) et la vitesse pure peuvent semer les défenseurs.',
    { against: 'curlFlat', ballOn: 35, down: 2, toGo: 7 }),
  L('34cover3', 'def', 'Zone', 2,
    'Trois linemen et quatre linebackers : un linebacker extérieur charge le QB pendant que les autres reculent en zone en trois tiers. L’attaque ne sait pas qui va charger.',
    ['Un linebacker extérieur part sur le QB.', 'Les autres reculent dans leurs zones.', 'Le QB est pressé d’un côté inattendu.'],
    'Pour mettre de la pression sans sacrifier la couverture.',
    'Avec seulement trois linemen, une course au centre peut percer.',
    { against: 'curlFlat', ballOn: 40, down: 2, toGo: 8 }),
  L('34blitz', 'def', 'Blitz', 3,
    'Quatre défenseurs supplémentaires chargent le QB en plus des linemen. Personne en profondeur : chaque receveur est couvert en individuelle, sans aide (« Cover 0 »). Tout ou rien.',
    ['Sept défenseurs chargent au snap.', 'Les cornerbacks sont seuls avec leur receveur.', 'Le QB doit lancer en moins de deux secondes.'],
    'En 3e et long, contre une attaque qui tient le ballon longtemps.',
    'Si une passe rapide trouve un receveur, il n’y a plus personne derrière : touchdown possible.',
    { against: 'digsOut', ballOn: 40, down: 3, toGo: 9 }),
  L('nickelMan', 'def', 'Individuelle', 2,
    'Un cinquième défenseur arrière (le « nickelback ») remplace un linebacker pour couvrir le troisième receveur. Couverture individuelle partout, un safety libre.',
    ['Cinq défenseurs arrière face aux receveurs.', 'Chacun suit son receveur.', 'Le nickelback marque le receveur du slot.'],
    'Contre les formations à trois receveurs, en situation de passe.',
    'Moins de joueurs lourds : une course peut faire mal.',
    { against: 'quickSlants', ballOn: 40, down: 3, toGo: 6 }),
  L('nickelBlitz', 'def', 'Blitz', 3,
    'Le nickelback et le linebacker central chargent le QB par surprise, depuis l’intérieur et l’extérieur. Couverture individuelle avec un safety libre derrière.',
    ['Le nickelback s’approche discrètement de la ligne.', 'Il part sur le QB au snap avec le linebacker.', 'Le QB est pressé avant d’avoir lu sa défense.'],
    'En 3e et moyen, pour forcer une passe précipitée.',
    'Le receveur du slot est moins couvert : une passe rapide peut passer.',
    { against: 'curlFlat', ballOn: 38, down: 3, toGo: 7 }),
  L('nickelQuarters', 'def', 'Zone', 3,
    'Quatre défenseurs arrière se partagent la profondeur en quatre couloirs (« Cover 4 »). Presque impossible de lancer long, mais les zones courtes sont plus ouvertes.',
    ['Quatre défenseurs reculent chacun dans un quart.', 'Les receveurs profonds sont doublés.', 'L’attaque doit se contenter de passes courtes.'],
    'Quand l’adversaire doit gagner beaucoup de terrain (3e et long, fin de match).',
    'Passes courtes et courses gagnent facilement 5 yards.',
    { against: 'fourVerts', ballOn: 40, down: 3, toGo: 12 }),
  L('dimeDeep', 'def', 'Zone', 3,
    'Six défenseurs arrière, tout le monde recule (« prevent »). On accepte de concéder des passes courtes pour interdire la passe longue et le touchdown rapide.',
    ['Six défenseurs reculent très profond.', 'Seuls quatre joueurs chargent.', 'Les receveurs sont plaqués dès la réception.'],
    'En fin de match quand vous menez : empêcher le gros jeu.',
    'Laisse avancer l’adversaire par petits morceaux.',
    { against: 'postCorner', ballOn: 50, down: 2, toGo: 10 }),
  L('goalLineD', 'def', 'Contre la course', 2,
    'Cinq linemen, tout le monde près de la ligne. On défend les derniers yards : chaque défenseur pousse vers l’avant pour arrêter le coureur avant l’en-but.',
    ['Formation basse et compacte.', 'Charge immédiate au snap.', 'Le coureur est arrêté dans la mêlée.'],
    'Près de votre en-but ou en 4e et 1.',
    'Une passe courte ou une feinte (TE Pop) peut surprendre.',
    { against: 'goalLineDive', ballOn: 97, down: 3, toGo: 3 }),
];

/** Les 4 tutoriels de base, obligatoires avant le premier match. */
export const STARTER_LESSONS = ['insideZone', 'quickSlants', '43cover3', '43runStop'];

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);

export const playName = (id: string): string =>
  OFFENSIVE_PLAYS.find((p) => p.id === id)?.name ?? DEFENSIVE_PLAYS.find((p) => p.id === id)?.name ?? id;

/** Les tutoriels de base sont-ils tous faits ? */
export const basicsDone = (unlocked: string[]): boolean => STARTER_LESSONS.every((id) => unlocked.includes(id));

/** Tactiques disponibles en match pour l'entraîneur. */
export function coachPlaybook(unlocked: string[]): { off: string[]; def: string[] } {
  const set = new Set(unlocked);
  return {
    off: LESSONS.filter((l) => l.side === 'off' && set.has(l.id)).map((l) => l.id),
    def: LESSONS.filter((l) => l.side === 'def' && set.has(l.id)).map((l) => l.id),
  };
}

/** Prochaine leçon de base à suivre (ordre imposé), ou null. */
export const nextStarter = (unlocked: string[]): string | null => STARTER_LESSONS.find((id) => !unlocked.includes(id)) ?? null;

/** Une leçon avancée n'est accessible qu'après les tutoriels de base. */
export const lessonAvailable = (l: Lesson, unlocked: string[]): boolean => STARTER_LESSONS.includes(l.id) ? true : basicsDone(unlocked);

export interface Quiz {
  question: string;
  answers: string[];
  correct: number;
}

/** Question de compréhension : « quand utiliser cette tactique ? » parmi 3 réponses (dont 2 d'autres leçons). */
export function lessonQuiz(l: Lesson, seed = 1): Quiz {
  const rng = new Rng(seed + l.id.length * 31);
  const others = LESSONS.filter((x) => x.id !== l.id && x.side === l.side && x.whenToUse !== l.whenToUse);
  const picks: string[] = [];
  while (picks.length < 2 && others.length) {
    const o = others.splice(rng.int(0, others.length - 1), 1)[0];
    picks.push(o.whenToUse);
  }
  const answers = [l.whenToUse, ...picks];
  // mélange déterministe
  for (let i = answers.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [answers[i], answers[j]] = [answers[j], answers[i]];
  }
  return { question: `Quand faut-il appeler « ${playName(l.id)} » ?`, answers, correct: answers.indexOf(l.whenToUse) };
}

/** Débloque une tactique (retourne la liste mise à jour, sans doublon). */
export function unlock(unlocked: string[], id: string): string[] {
  return unlocked.includes(id) ? unlocked : [...unlocked, id];
}

// ——————————— Démonstration au ralenti ———————————

export const DEMO_STEP = 1 / 60;

/** Contrôleur de démonstration : situation fixée, actions imposées, déterministe (mêmes pas de 1/60 s). */
export function demoController(l: Lesson, home: Team, away: Team, seed: number): MatchController {
  const off = l.side === 'off' ? l.id : l.demo.against;
  const def = l.side === 'def' ? l.id : l.demo.against;
  const mc = new MatchController(home, away, {
    userSide: null,
    seed,
    rules: { ...DEFAULT_RULES, penaltiesEnabled: false },
    forcedCalls: { off, def },
  });
  mc.practiceHook = (s) => {
    s.nextKind = 'scrimmage';
    s.possession = 0;
    s.quarter = 1;
    s.ballOn = l.demo.ballOn;
    s.down = l.demo.down;
    s.toGo = Math.min(l.demo.toGo, 100 - l.demo.ballOn);
  };
  mc.start();
  return mc;
}

/** Gain de l'action de démonstration (yards, du point de vue de l'attaque), null si non terminée. */
export function demoOutcome(mc: MatchController): { gain: number; turnover: boolean; incomplete: boolean; td: boolean } | null {
  const r = mc.sim?.result;
  if (!r || !mc.sim) return null;
  const ballOn = mc.state.ballOn;
  const turnover = r.turnover !== 'none' || r.finalPossessor !== mc.sim.offense;
  const gain = r.incomplete ? 0 : r.endSpot - ballOn;
  return { gain, turnover, incomplete: r.incomplete, td: !turnover && r.endSpot >= 100 };
}

/** L'action illustre-t-elle bien la leçon (réussite de l'attaque ou de la défense selon le cas) ? */
export function demoIllustrates(l: Lesson, o: NonNullable<ReturnType<typeof demoOutcome>>): boolean {
  const good = o.td || (!o.turnover && !o.incomplete && o.gain >= Math.min(4, l.demo.toGo));
  return l.side === 'off' ? good : !good;
}

/**
 * Cherche une graine dont l'action illustre la leçon (pré-calcul sans rendu, mêmes pas que la démonstration).
 * Retourne la meilleure graine trouvée (ou la première).
 */
export function findDemoSeed(l: Lesson, home: Team, away: Team, tries = 30): number {
  for (let k = 0; k < tries; k++) {
    const seed = 1000 + k * 7919 + l.id.length;
    const mc = demoController(l, home, away, seed);
    let n = 0;
    while (mc.phase !== 'BallDead' && mc.phase !== 'PlayReview' && n++ < 60 * 40) mc.update(DEMO_STEP);
    const o = demoOutcome(mc);
    if (o && demoIllustrates(l, o)) return seed;
  }
  return 1000 + l.id.length;
}

export interface FocusMark {
  slot: string;
  offense: boolean;
  label: string;
}

/** Joueurs à suivre pendant le ralenti (étiquetés au-dessus de leur tête). */
export function focusSlots(l: Lesson): FocusMark[] {
  if (l.side === 'off') {
    const p = OFFENSIVE_PLAYS.find((x) => x.id === l.id)!;
    const out: FocusMark[] = [];
    if (p.category === 'run') {
      if (p.subtype === 'option' || p.subtype === 'sneak') out.push({ slot: 'QB', offense: true, label: 'QB : porteur' });
      if (p.handoffTo) out.push({ slot: p.handoffTo, offense: true, label: 'Porteur' });
      else if (p.subtype === 'option') out.push({ slot: 'RB', offense: true, label: 'Option latérale' });
      for (const [slot, a] of Object.entries(p.assign)) if (a.kind === 'lead') out.push({ slot, offense: true, label: 'Bloqueur de tête' });
    } else {
      out.push({ slot: 'QB', offense: true, label: 'QB' });
      if (p.subtype === 'playAction' && p.assign.RB?.kind === 'fake') out.push({ slot: 'RB', offense: true, label: 'Fausse remise' });
      (p.progression ?? []).slice(0, 2).forEach((slot, i) => out.push({ slot, offense: true, label: `Cible ${i + 1}` }));
    }
    return out;
  }
  const d = DEFENSIVE_PLAYS.find((x) => x.id === l.id)!;
  const out: FocusMark[] = d.blitz.map((slot) => ({ slot, offense: false, label: 'Blitz' }));
  const add = (slots: string[], label: string) => slots.filter((s) => !d.blitz.includes(s)).forEach((slot) => out.push({ slot, offense: false, label }));
  if (d.coverage === 'cover3') add(['LCB', 'RCB', 'FS'], 'Tiers profond');
  else if (d.coverage === 'cover2') add(['FS', 'SS'], 'Moitié profonde');
  else if (d.coverage === 'cover4') add(['LCB', 'RCB', 'FS', 'SS'], 'Quart profond');
  else if (d.coverage === 'cover1') {
    add(['FS'], 'Safety libre');
    add(['LCB', 'RCB'], 'Individuelle');
  }
  else add(['LCB', 'RCB'], 'Individuelle sans aide');
  if (d.runFocus) add(['SS'], 'Dans la boîte');
  return out.slice(0, 5);
}
