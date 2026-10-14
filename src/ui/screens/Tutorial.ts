import { audio } from '../../audio/AudioEngine';
import { esc } from '../dom';
import type { MatchController } from '../../match/MatchController';
import type { GameState, Side } from '../../rules/types';
import type { SimEvent } from '../../sim/types';
import type { App, Screen } from '../App';
import { el, onAction } from '../dom';
import { MainMenu } from './MainMenu';
import { MatchScreen } from './MatchScreen';

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** L'utilisateur est en attaque (true) ou en défense (false). */
  offense: boolean;
  ballOn?: number;
  needed: number;
  check: (e: SimEvent, mc: MatchController) => boolean;
}

const userAgentIs = (mc: MatchController, idx: number) => !!mc.sim && mc.sim.userAgent === idx;

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'move', title: 'Déplacement', offense: true, needed: 1,
    text: 'Choisissez une COURSE (onglet Courses), touchez HIKE puis utilisez le joystick (moitié gauche de l’écran) pour diriger le porteur. Maintenez SPRINT pour accélérer. Objectif : gagner du terrain sur une course.',
    check: (e, mc) => e.type === 'tackle' && !!mc.sim && mc.sim.carrierRole === 'rush' && mc.sim.agents[e.carrier].side === mc.userSide && mc.sim.agents[e.carrier].x * mc.sim.dir > mc.sim.losX * mc.sim.dir,
  },
  {
    id: 'pass', title: 'Passe', offense: true, needed: 1,
    text: 'Choisissez une PASSE. Après le snap, touchez la bulle numérotée d’un receveur vert (démarqué) pour lancer. Le bouton Rapide/Tendue/Lobée change le type de passe ; CIBLE change le receveur sélectionné et PASSE lance vers lui.',
    check: (e, mc) => e.type === 'throw' && !!mc.sim && mc.sim.agents[e.by].side === mc.userSide,
  },
  {
    id: 'catch', title: 'Réception', offense: true, needed: 1,
    text: 'Après le lancer, vous contrôlez le receveur : dirigez-le vers le cercle blanc (point de chute) et touchez SAUT pour une réception acrobatique. Réussissez une réception.',
    check: (e, mc) => e.type === 'catch' && !!mc.sim && mc.sim.agents[e.by].side === mc.userSide && mc.sim.agents[e.by].offense,
  },
  {
    id: 'downs', title: 'Les downs', offense: true, needed: 1, ballOn: 40,
    text: 'L’attaque dispose de 4 tentatives (downs) pour avancer de 10 yards (ligne jaune). Si elle y parvient, elle obtient un nouveau « premier down ». Sinon, au 4e down, on tente un field goal, on dégage (punt) ou on risque de rendre le ballon. Obtenez un premier down.',
    check: () => false,
  },
  {
    id: 'tackle', title: 'Plaquage', offense: false, needed: 1,
    text: 'En défense, CHANGER sélectionne le joueur le plus proche du ballon. Rapprochez-vous du porteur et touchez PLAQUAGE pour plonger. CONTENIR (maintenu) vous guide automatiquement vers lui. Réalisez un plaquage avec votre joueur.',
    check: (e, mc) => e.type === 'tackle' && userAgentIs(mc, e.by),
  },
  {
    id: 'cover', title: 'Couverture', offense: false, needed: 1,
    text: 'Choisissez une couverture (zone ou individuelle). Quand le ballon est en l’air, placez-vous sur sa trajectoire et touchez INTERCEPT. pour le dévier ou l’intercepter. Empêchez une passe d’être complétée.',
    check: (e, mc) => (e.type === 'incomplete' || e.type === 'interception' || e.type === 'deflect') && mc.userSide !== null && !!mc.sim && mc.sim.offense !== mc.userSide,
  },
  {
    id: 'accuracy', title: 'Précision', offense: true, needed: 3,
    text: 'Exercice de précision : complétez 3 passes. Astuce : les passes Tendues sont rapides mais moins précises de loin ; les Lobées passent au-dessus des défenseurs.',
    check: (e, mc) => e.type === 'catch' && !!mc.sim && mc.sim.agents[e.by].side === mc.userSide && mc.sim.agents[e.by].offense,
  },
];

/** Tutoriel guidé puis entraînement libre (aucun résultat enregistré). */
export class TutorialRunner {
  index = 0;
  progress = 0;
  free = false;
  panel: HTMLElement;

  constructor(private app: App, private freeOffense = true) {
    this.panel = el('div', 'panel');
    Object.assign(this.panel.style, { position: 'absolute', left: 'calc(8px + var(--safe-l))', top: 'calc(58px + var(--safe-t))', width: '25%', maxHeight: '58%', overflowY: 'auto', fontSize: '13px', pointerEvents: 'auto', zIndex: '3' });
  }

  get step(): TutorialStep | null {
    return this.free ? null : TUTORIAL_STEPS[this.index] ?? null;
  }

  attach(screen: MatchScreen): void {
    const mc = screen.mc;
    screen.el.appendChild(this.panel);
    screen.el.classList.add('tutorial');
    mc.practiceHook = (s: GameState) => this.setup(s, mc.userSide!);
    mc.bus.on('sim', ({ event }) => {
      const st = this.step;
      if (st && st.check(event, mc)) this.advance();
    });
    mc.bus.on('resolved', ({ tags }) => {
      const st = this.step;
      if (st?.id === 'downs' && tags.includes('FIRST_DOWN')) this.advance();
    });
    onAction(this.panel, (a) => {
      if (a === 'skip') this.advance(true);
      if (a === 'quit') this.app.go(new MainMenu(this.app));
      if (a === 'side') this.freeOffense = !this.freeOffense;
      this.render();
    });
    this.render();
  }

  private setup(s: GameState, user: Side): void {
    const st = this.step;
    const offense = st ? st.offense : this.freeOffense;
    s.clock = Math.max(s.clock, 600);
    s.quarter = 1;
    s.finished = false;
    if (s.nextKind === 'conversion') return;
    s.nextKind = 'scrimmage';
    s.possession = offense ? user : ((1 - user) as Side);
    if (st?.ballOn || s.ballOn < 15 || s.ballOn > 85 || s.down > 3) {
      s.ballOn = st?.ballOn ?? 30;
      s.down = 1;
      s.toGo = 10;
    }
  }

  private advance(skip = false): void {
    this.progress++;
    const st = this.step;
    if (!st) return;
    if (skip || this.progress >= st.needed) {
      audio.fanfare();
      this.index++;
      this.progress = 0;
      if (!this.step) {
        this.free = true;
        if (!this.app.profile.tutorialDone.includes('all')) {
          this.app.profile.tutorialDone.push('all');
          this.app.saveProfile();
        }
      }
    }
    this.render();
  }

  render(): void {
    const st = this.step;
    if (!st) {
      this.panel.innerHTML = `<b>Entraînement libre</b><div class="muted">Aucune pression de résultat : le chrono est figé et le score ne compte pas. Situation : ${this.freeOffense ? 'attaque' : 'défense'}.</div><div class="row" style="margin-top:6px"><button class="btn" data-action="side">Passer en ${this.freeOffense ? 'défense' : 'attaque'}</button><button class="btn" data-action="quit">Quitter</button></div>`;
      return;
    }
    this.panel.innerHTML = `<b>Tutoriel ${this.index + 1}/${TUTORIAL_STEPS.length} — ${esc(st.title)}</b>${st.needed > 1 ? ` (${this.progress}/${st.needed})` : ''}<div style="margin:4px 0;line-height:1.25">${esc(st.text)}</div><div class="row"><button class="btn" style="min-height:36px" data-action="skip">Passer</button><button class="btn" style="min-height:36px" data-action="quit">Quitter</button></div>`;
  }
}

export function openTraining(app: App, guided: boolean): Screen {
  const teams = app.teams;
  const runner = new TutorialRunner(app);
  if (!guided) {
    runner.index = TUTORIAL_STEPS.length;
    runner.free = true;
  }
  const screen = new MatchScreen(app, {
    home: teams[0], away: teams[1], userSide: 0, context: 'spectator', quarterMinutes: 15, difficulty: 'easy',
    onExit: () => app.go(new MainMenu(app)),
    title: 'Entraînement',
  });
  runner.attach(screen);
  return screen;
}
