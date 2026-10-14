/**
 * Audio procédural (Web Audio) : aucun fichier sonore externe, donc aucune question de licence.
 * Foule, sifflet, impacts, ballon, interface et musique de menu sont synthétisés.
 */
export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  crowd: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private crowd!: GainNode;
  private crowdFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private crowdSrc: AudioBufferSourceNode | null = null;
  private musicTimer: number | null = null;
  private lastPlayed = new Map<string, number>();
  volumes: Volumes = { master: 0.8, music: 0.5, sfx: 0.8, crowd: 0.6 };

  /** Doit être appelé après une interaction utilisateur (politique des navigateurs). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.music = c.createGain();
    this.sfx = c.createGain();
    this.crowd = c.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.crowdFilter = c.createBiquadFilter();
    this.crowdFilter.type = 'bandpass';
    this.crowdFilter.frequency.value = 900;
    this.crowdFilter.Q.value = 0.6;
    this.crowd.connect(this.crowdFilter);
    this.crowdFilter.connect(this.master);
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04; // bruit rose approché
      d[i] = last * 3.2 + w * 0.15;
    }
    this.applyVolumes();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.music.gain.value = this.volumes.music * 0.35;
    this.sfx.gain.value = this.volumes.sfx;
    this.crowd.gain.value = this.volumes.crowd * 0.25;
  }

  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? 0) < ms) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  startCrowd(): void {
    if (!this.ctx || this.crowdSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.connect(this.crowd);
    src.start();
    this.crowdSrc = src;
  }

  stopCrowd(): void {
    this.crowdSrc?.stop();
    this.crowdSrc = null;
  }

  /** Réaction du public (0..1). */
  cheer(intensity: number): void {
    if (!this.ctx || !this.throttle('cheer', 400)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700 + intensity * 600;
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35 * intensity * this.volumes.crowd, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2 + intensity * 2.2);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 4);
  }

  whistle(): void {
    if (!this.ctx || !this.throttle('whistle', 600)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2900;
    const lfo = c.createOscillator();
    lfo.frequency.value = 38;
    const lg = c.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.02);
    g.gain.setValueAtTime(0.18, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.55);
    lfo.stop(t + 0.55);
  }

  /** Impact d'équipement (plaquage, blocage). */
  hit(strength = 0.6): void {
    if (!this.ctx || !this.throttle('hit', 90)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.2);
    // claquement de plastique (casques / épaulières)
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.25 * strength, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(hp).connect(ng).connect(this.sfx);
    n.start(t, Math.random());
    n.stop(t + 0.08);
  }

  /** Ballon frappé / attrapé. */
  thump(pitch = 1): void {
    if (!this.ctx || !this.throttle('thump', 60)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(220 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(80 * pitch, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.14);
  }

  ui(kind: 'click' | 'confirm' | 'back' = 'click'): void {
    if (!this.ctx || !this.throttle('ui', 40)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = kind === 'confirm' ? 880 : kind === 'back' ? 330 : 620;
    const g = c.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.08);
  }

  /** Corne / fanfare de touchdown. */
  fanfare(): void {
    if (!this.ctx || !this.throttle('fanfare', 2000)) return;
    const c = this.ctx;
    const notes = [392, 523, 659, 784];
    notes.forEach((f, i) => {
      const t = c.currentTime + i * 0.13;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + (i === 3 ? 0.9 : 0.2));
      o.connect(lp).connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 1);
    });
  }

  /** Boucle musicale de menu générée (accords + basse). */
  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    const chords = [
      [220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 330],
    ];
    let step = 0;
    const play = () => {
      if (!this.ctx) return;
      const c = this.ctx;
      const t = c.currentTime;
      const ch = chords[Math.floor(step / 4) % chords.length];
      const f = ch[step % 3] * (step % 2 ? 2 : 1);
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 0.4);
      if (step % 4 === 0) {
        const b = c.createOscillator();
        b.type = 'sine';
        b.frequency.value = ch[0] / 2;
        const bg = c.createGain();
        bg.gain.setValueAtTime(0.3, t);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        b.connect(bg).connect(this.music);
        b.start(t);
        b.stop(t + 1);
      }
      step++;
    };
    this.musicTimer = window.setInterval(play, 240);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}

export const audio = new AudioEngine();
