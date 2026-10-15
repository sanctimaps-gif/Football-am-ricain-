import { emptyInput, type PassType, type SimInput } from '../sim/types';

export type ButtonId =
  | 'snap' | 'pass' | 'target' | 'passType' | 'sprint' | 'juke' | 'dive' | 'protect' | 'switch'
  | 'tackle' | 'jump' | 'contain' | 'kick' | 'fairCatch';

/** Emplacement fixe de chaque action secondaire (1 = gauche du principal, 2 = au-dessus, 3 = diagonale, 4 = extrême gauche). */
const SLOT_OF: Partial<Record<ButtonId, number>> = {
  sprint: 1, switch: 2, target: 2, juke: 3, passType: 3, contain: 3, jump: 3, dive: 4, protect: 4, fairCatch: 4, pass: 4,
};

/** Réduit la taille du texte jusqu'à ce qu'il tienne dans le bouton. */
export function fitLabel(span: HTMLElement, box: HTMLElement, min = 9): void {
  span.style.fontSize = '';
  const fit = () => {
    let size = parseFloat(getComputedStyle(span).fontSize) || 14;
    const maxW = box.clientWidth * 0.82;
    const maxH = box.clientHeight * 0.7;
    let guard = 0;
    while ((span.scrollWidth > maxW || span.scrollHeight > maxH) && size > min && guard++ < 20) {
      size -= 1;
      span.style.fontSize = `${size}px`;
    }
  };
  if (box.isConnected && box.clientWidth) fit();
  else requestAnimationFrame(fit);
}

export interface ButtonSpec {
  id: ButtonId;
  label: string;
  /** Bouton maintenu (sprint, suivre, protéger) ou impulsion. */
  hold?: boolean;
}

/**
 * Commandes tactiles : joystick dynamique (moitié gauche) + boutons contextuels (droite).
 * Clavier pris en charge pour le test sur ordinateur.
 */
export class TouchControls {
  readonly el: HTMLElement;
  private stickBase: HTMLElement;
  private stickKnob: HTMLElement;
  private buttonsEl: HTMLElement;
  /** Doigt (ou pointeur souris) qui tient le joystick : « t<n> » pour un toucher, « p<n> » pour un pointeur. */
  private stickId: string | null = null;
  /** Doigts posés sur les boutons : identifiant du toucher → bouton. */
  private touchButtons = new Map<number, { id: ButtonId; el: HTMLElement; hold: boolean }>();
  private stickOrigin = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  private held = new Set<ButtonId>();
  private pulses = new Set<ButtonId>();
  private keys = new Set<string>();
  private currentSpecs = '';
  private lastPress = new Map<ButtonId, number>();
  passType: PassType = 'touch';
  sensitivity = 1;
  onPress: ((id: ButtonId) => void) | null = null;
  private passTargetPulse = -1;
  /** Commandes simplifiées : glisser le doigt déclenche une feinte, l'IA déplace le joueur contrôlé. */
  simple = false;
  private stickT0 = 0;
  private swipe: { x: number; y: number } | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'controls';
    this.el.innerHTML = `<div class="stick-zone"><div class="stick-base"><div class="stick-knob"></div></div></div><div class="buttons"></div>`;
    parent.appendChild(this.el);
    this.stickBase = this.el.querySelector('.stick-base')!;
    this.stickKnob = this.el.querySelector('.stick-knob')!;
    this.buttonsEl = this.el.querySelector('.buttons')!;
    const zone = this.el.querySelector('.stick-zone') as HTMLElement;
    // Multi-touch : sur téléphone, les événements tactiles (touchstart/touchmove/touchend) suivent chaque doigt
    // indépendamment, ce qui permet de tenir le joystick et d'appuyer sur un bouton en même temps. Les événements
    // « pointer » restent utilisés pour la souris (et les tests).
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') this.stickDown(`p${e.pointerId}`, e.clientX, e.clientY);
    });
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (this.stickId === null) this.stickDown(`t${t.identifier}`, t.clientX, t.clientY);
      }
    }, { passive: false });
    const onTouchMove = (e: TouchEvent) => {
      let ours = false;
      for (const t of Array.from(e.changedTouches)) {
        if (`t${t.identifier}` === this.stickId) {
          this.stickMove(`t${t.identifier}`, t.clientX, t.clientY);
          ours = true;
        }
        if (this.touchButtons.has(t.identifier)) ours = true;
      }
      if (ours && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        this.stickUp(`t${t.identifier}`, t.clientX, t.clientY);
        const b = this.touchButtons.get(t.identifier);
        if (b) {
          this.touchButtons.delete(t.identifier);
          this.releaseButton(b.id, b.el, b.hold);
        }
      }
    };
    const listeners: [string, EventListener][] = [
      ['pointermove', (e) => {
        const p = e as PointerEvent;
        if (p.pointerType !== 'touch') this.stickMove(`p${p.pointerId}`, p.clientX, p.clientY);
      }],
      ['pointerup', (e) => {
        const p = e as PointerEvent;
        if (p.pointerType !== 'touch') this.stickUp(`p${p.pointerId}`, p.clientX, p.clientY);
      }],
      ['pointercancel', (e) => {
        const p = e as PointerEvent;
        if (p.pointerType !== 'touch') this.stickUp(`p${p.pointerId}`, p.clientX, p.clientY);
      }],
      ['touchmove', onTouchMove as EventListener],
      ['touchend', onTouchEnd as EventListener],
      ['touchcancel', onTouchEnd as EventListener],
      // iOS : empêche le geste de zoom à deux doigts d'annuler les commandes
      ['gesturestart', (e) => e.preventDefault()],
      ['keydown', (e) => this.key(e as KeyboardEvent, true)],
      ['keyup', (e) => this.key(e as KeyboardEvent, false)],
      ['blur', () => {
        this.keys.clear();
        this.held.clear();
        this.touchButtons.clear();
        this.resetStick();
      }],
    ];
    for (const [ev, fn] of listeners) window.addEventListener(ev, fn, { passive: false });
    this.dispose = () => {
      for (const [ev, fn] of listeners) window.removeEventListener(ev, fn);
    };
  }

  /** Retire les écouteurs globaux. */
  dispose: () => void;

  setVisible(v: boolean): void {
    this.el.style.display = v ? '' : 'none';
    if (!v) {
      this.held.clear();
      this.touchButtons.clear();
      this.resetStick();
    }
  }

  /**
   * Met à jour les boutons visibles selon la phase (sans recréer s'ils sont identiques).
   * Disposition harmonisée : le premier bouton est l'action principale (grand, en bas à droite),
   * chaque autre action garde toujours le même emplacement (mémoire musculaire).
   */
  setButtons(specs: ButtonSpec[]): void {
    const key = specs.map((s) => `${s.id}:${s.label}`).join('|');
    if (key === this.currentSpecs) return;
    this.currentSpecs = key;
    this.buttonsEl.innerHTML = '';
    const used = new Set<number>();
    specs.forEach((s, i) => {
      let slot = i === 0 ? 0 : SLOT_OF[s.id] ?? 1;
      while (used.has(slot) && slot < 6) slot++;
      used.add(slot);
      const b = document.createElement('button');
      b.className = `ctl-btn${i === 0 ? ' primary' : ''}`;
      b.dataset.id = s.id;
      b.dataset.slot = String(slot);
      b.setAttribute('aria-label', s.label);
      const span = document.createElement('span');
      span.textContent = s.label;
      b.appendChild(span);
      // toucher (multi-touch) : chaque doigt est suivi par son identifiant
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (const t of Array.from(e.changedTouches)) this.touchButtons.set(t.identifier, { id: s.id, el: b, hold: !!s.hold });
        b.classList.add('pressed');
        this.press(s.id, !!s.hold);
      }, { passive: false });
      // fin du toucher écoutée sur le bouton lui-même : si le bouton est retiré du DOM pendant l'appui,
      // l'événement n'atteint plus window (il reste ciblé sur l'élément détaché)
      const touchUp = (e: TouchEvent) => {
        for (const t of Array.from(e.changedTouches)) {
          const held = this.touchButtons.get(t.identifier);
          if (!held) continue;
          this.touchButtons.delete(t.identifier);
          this.releaseButton(held.id, held.el, held.hold);
        }
      };
      b.addEventListener('touchend', touchUp);
      b.addEventListener('touchcancel', touchUp);
      b.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('pressed');
        this.press(s.id, !!s.hold);
        try {
          b.setPointerCapture(e.pointerId);
        } catch {
          /* pointeur déjà relâché */
        }
      });
      const release = (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        this.releaseButton(s.id, b, !!s.hold);
      };
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('lostpointercapture', release);
      // évite le menu contextuel / la loupe d'iOS sur appui long
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      this.buttonsEl.appendChild(b);
      fitLabel(span, b);
    });
    // les boutons maintenus disparus sont relâchés
    for (const id of [...this.held]) if (!specs.some((s) => s.id === id)) this.held.delete(id);
  }

  private releaseButton(id: ButtonId, el: HTMLElement, hold: boolean): void {
    el.classList.remove('pressed');
    // un bouton maintenu reste actif tant qu'un autre doigt le tient encore
    if (hold && ![...this.touchButtons.values()].some((b) => b.id === id)) this.held.delete(id);
  }

  /** Grise un bouton (temps de récupération) sans le recréer. */
  setCooling(id: ButtonId, cooling: boolean): void {
    const b = this.buttonsEl.querySelector(`[data-id="${id}"]`);
    b?.classList.toggle('cooling', cooling);
  }

  private press(id: ButtonId, hold: boolean): void {
    // anti double-commande : 150 ms minimum entre deux impulsions du même bouton
    const now = performance.now();
    if (!hold && now - (this.lastPress.get(id) ?? 0) < 150) return;
    this.lastPress.set(id, now);
    if (hold) this.held.add(id);
    else this.pulses.add(id);
    if (navigator.vibrate) {
      try {
        navigator.vibrate(8);
      } catch {
        /* ignoré */
      }
    }
    this.onPress?.(id);
  }

  /** Lancer direct vers un receveur (bulle tactile). */
  throwTo(agentIdx: number): void {
    this.passTargetPulse = agentIdx;
    this.pulses.add('pass');
  }

  private stickDown(id: string, cx: number, cy: number): void {
    if (this.stickId !== null) return;
    this.stickId = id;
    this.stickOrigin = { x: cx, y: cy };
    this.stickT0 = performance.now();
    const zoneRect = (this.stickBase.parentElement as HTMLElement).getBoundingClientRect();
    this.stickBase.style.left = `${cx - zoneRect.left}px`;
    this.stickBase.style.top = `${cy - zoneRect.top}px`;
    this.stickBase.classList.add('active');
    this.stick = { x: 0, y: 0 };
    this.updateKnob();
  }

  private stickMove(id: string, cx: number, cy: number): void {
    if (id !== this.stickId) return;
    const max = 52;
    let dx = cx - this.stickOrigin.x;
    let dy = cy - this.stickOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    this.stick = { x: dx / max, y: -dy / max };
    this.updateKnob();
  }

  private stickUp(id: string, cx: number, cy: number): void {
    if (id !== this.stickId) return;
    if (this.simple) {
      const dx = cx - this.stickOrigin.x;
      const dy = cy - this.stickOrigin.y;
      if (performance.now() - this.stickT0 < 320 && Math.hypot(dx, dy) > 36) {
        const d = Math.hypot(dx, dy);
        this.swipe = { x: dx / d, y: -dy / d };
        this.pulses.add('juke');
      }
    }
    this.resetStick();
  }

  private resetStick(): void {
    this.stickId = null;
    this.stick = { x: 0, y: 0 };
    this.stickBase.classList.remove('active');
    this.updateKnob();
  }

  private updateKnob(): void {
    this.stickKnob.style.transform = `translate(${this.stick.x * 52}px, ${-this.stick.y * 52}px)`;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    if (!down || e.repeat) return;
    const map: Record<string, ButtonId> = { ' ': 'pass', e: 'switch', q: 'juke', f: 'dive', r: 'jump', t: 'passType', enter: 'snap', g: 'fairCatch', x: 'tackle', tab: 'target' };
    if (k in map) {
      e.preventDefault();
      this.press(map[k], false);
    }
    if (['1', '2', '3', '4', '5'].includes(k)) this.pulses.add(`pass` as ButtonId), (this.passTargetPulse = -100 - Number(k));
  }

  /** Construit l'entrée de simulation pour l'image courante (direction écran → monde). */
  read(axes: { fx: number; fy: number; rx: number; ry: number }, invertForTeam = false): SimInput {
    const inp = emptyInput();
    let sx = this.stick.x;
    let sy = this.stick.y;
    if (this.keys.has('arrowleft') || this.keys.has('a')) sx -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) sx += 1;
    if (this.keys.has('arrowup') || this.keys.has('w') || this.keys.has('z')) sy += 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) sy -= 1;
    const m = Math.hypot(sx, sy);
    if (m > 1) {
      sx /= m;
      sy /= m;
    }
    sx *= this.sensitivity;
    sy *= this.sensitivity;
    void invertForTeam;
    if (this.swipe) {
      // geste de feinte : direction du glissement pour cette image seulement
      sx = this.swipe.x;
      sy = this.swipe.y;
      this.swipe = null;
    }
    inp.moveX = axes.fx * sy + axes.rx * sx;
    inp.moveY = axes.fy * sy + axes.ry * sx;
    inp.autoMove = this.simple;
    inp.sprint = this.held.has('sprint') || this.keys.has('shift');
    inp.contain = this.held.has('contain') || this.keys.has('c');
    inp.protect = this.held.has('protect');
    inp.passType = this.passType;
    const p = this.pulses;
    inp.pass = p.has('pass');
    inp.passTarget = this.passTargetPulse;
    inp.switchPlayer = p.has('switch');
    inp.juke = p.has('juke');
    inp.dive = p.has('dive');
    inp.tackle = p.has('tackle');
    inp.jump = p.has('jump');
    inp.fairCatch = p.has('fairCatch');
    return inp;
  }

  /** Impulsions non liées à la simulation (snap, cible, type de passe, kick). */
  consumeMeta(): { snap: boolean; target: boolean; passType: boolean; kick: boolean } {
    const r = { snap: this.pulses.has('snap'), target: this.pulses.has('target'), passType: this.pulses.has('passType'), kick: this.pulses.has('kick') };
    return r;
  }

  clearPulses(): void {
    this.pulses.clear();
    this.passTargetPulse = -1;
  }

  /** Index du receveur demandé au clavier (touches 1-5), -1 sinon. */
  get keyboardReceiver(): number {
    return this.passTargetPulse <= -100 ? -this.passTargetPulse - 101 : -1;
  }
}
