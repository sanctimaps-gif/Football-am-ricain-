import * as THREE from 'three';
import { FIELD } from '../core/config';
import { clamp, lerp } from '../core/math';
import type { Team } from '../data/types';
import type { MatchController } from '../match/MatchController';
import { attackDir } from '../rules/engine';
import type { PlaySim } from '../sim/PlaySim';
import type { Agent } from '../sim/types';
import { makeTeamLook, PlayerBatcher, PlayerView, type TeamLook } from './playerModel';
import { loadPlayerAssets, playerAssetsReady, SkinnedPlayerView } from './skinnedPlayer';
import { buildSky, buildStadium, toScene, type StadiumParts } from './stadium';
import { createStadiumEnvironment, PostFX } from './effects';

export type Quality = 'low' | 'medium' | 'high';
export type CameraMode = 'behind' | 'broadcast';

interface ViewState {
  view: PlayerView | SkinnedPlayerView;
  x: number;
  y: number;
  facing: number;
  seen: boolean;
}

const LINEMEN = new Set(['OT', 'OG', 'C', 'DT', 'DE']);

/** Rendu 3D du match (three.js). Ne modifie jamais l'état de la simulation. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private quality: Quality;
  private stadium: StadiumParts | null = null;
  private views = new Map<string, ViewState>();
  private looks: [TeamLook, TeamLook] | null = null;
  private teams: [Team, Team] | null = null;
  private batcher: PlayerBatcher;
  private ball: THREE.Group;
  private ballShadow: THREE.Mesh;
  private losLine: THREE.Mesh;
  /** Incrustation « 2E & 10 » peinte sur la pelouse avant le snap (comme à la télévision). */
  private downGraphic: THREE.Mesh;
  private downCanvas: HTMLCanvasElement;
  private downTex: THREE.CanvasTexture;
  private downKey = '';
  private downFade = 0;
  private downTime = 0;
  private fdLine: THREE.Mesh;
  private userRing: THREE.Mesh;
  private targetRing: THREE.Mesh;
  private landing: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  private post: PostFX | null = null;
  private particles: { mesh: THREE.InstancedMesh; vel: Float32Array; pos: Float32Array; life: Float32Array; next: number };
  private camPos = new THREE.Vector3(0, 30, 40);
  private camLook = new THREE.Vector3();
  private camYaw = 0;
  private celebrate: { x: number; y: number; t: number } | null = null;
  private excitement = 0;
  private time = 0;
  private lastSim: PlaySim | null = null;
  private simStartTime = 0;
  cameraMode: CameraMode = 'behind';
  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3(1, 1, 1);
  private tmpProj = new THREE.Vector3();

  // qualité adaptative : la résolution baisse (puis le halo se coupe) si l'appareil n'atteint pas la cadence visée
  private maxRatio = 1;
  private minRatio = 1;
  private ratio = 1;
  private bloomOff = false;
  private goodSeconds = 0;
  private warmup = 3;
  private size = { w: 1, h: 1 };

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.maxRatio = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1);
    this.minRatio = Math.min(this.maxRatio, quality === 'low' ? 1 : 0.8);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.3, 900);
    this.batcher = new PlayerBatcher(this.scene, quality !== 'low');
    this.scene.fog = new THREE.Fog('#16223a', 220, 520);
    this.scene.add(buildSky(quality));
    // éclairage : environnement PBR procédural (reflets des projecteurs) + lumière principale ombrée + contre-jour
    this.scene.environment = createStadiumEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.6;
    this.scene.add(new THREE.HemisphereLight('#cfdcff', '#22401f', 0.42));
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.5);
    this.sun.position.set(-30, 60, 25);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.near = 10;
    sc.far = 140;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight('#c9dcff', 0.85);
    fill.position.set(40, 40, -30);
    this.scene.add(fill);

    // ballon (ellipsoïde + lacets)
    this.ball = new THREE.Group();
    const leather = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), new THREE.MeshStandardMaterial({ color: '#7a3b15', roughness: 0.55 }));
    leather.scale.set(1.75, 1, 1);
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.03), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    lace.position.y = 0.155;
    const stripe1 = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.008, 4, 16), new THREE.MeshBasicMaterial({ color: '#f0f0f0' }));
    stripe1.rotation.y = Math.PI / 2;
    stripe1.position.x = 0.19;
    const stripe2 = stripe1.clone();
    stripe2.position.x = -0.19;
    this.ball.add(leather, lace, stripe1, stripe2);
    this.ball.traverse((o) => (o.castShadow = quality !== 'low'));
    this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);

    const lineGeo = new THREE.PlaneGeometry(0.22, FIELD.width);
    this.losLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: '#2f80ff', transparent: true, opacity: 0.85, depthWrite: false }));
    this.losLine.rotation.x = -Math.PI / 2;
    this.losLine.position.y = 0.03;
    this.fdLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.9, depthWrite: false }));
    this.fdLine.rotation.x = -Math.PI / 2;
    this.fdLine.position.y = 0.035;
    this.scene.add(this.losLine, this.fdLine);
    this.downCanvas = document.createElement('canvas');
    this.downCanvas.width = 512;
    this.downCanvas.height = 160;
    this.downTex = new THREE.CanvasTexture(this.downCanvas);
    this.downTex.colorSpace = THREE.SRGBColorSpace;
    this.downTex.anisotropy = 4;
    this.downGraphic = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.06), new THREE.MeshBasicMaterial({ map: this.downTex, transparent: true, depthWrite: false, opacity: 0 }));
    this.downGraphic.rotation.x = -Math.PI / 2;
    this.downGraphic.position.y = 0.04;
    this.downGraphic.renderOrder = 2;
    this.scene.add(this.downGraphic);

    const ring = (color: string, r: number) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.05;
      return m;
    };
    this.userRing = ring('#33e1ff', 0.75);
    this.targetRing = ring('#ffd400', 0.7);
    this.landing = ring('#ffffff', 0.9);
    this.scene.add(this.userRing, this.targetRing, this.landing);

    // particules de gazon (pool réutilisé)
    const pCount = 60;
    const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.04, 0.08), new THREE.MeshLambertMaterial({ color: '#3f7a2f' }), pCount);
    pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pMesh.frustumCulled = false;
    this.scene.add(pMesh);
    if (quality !== 'low') this.post = new PostFX(this.renderer, this.scene, this.camera, quality);
    // joueurs réalistes : chargement en arrière-plan, les vues sont recréées une fois le modèle prêt
    if (quality !== 'low') {
      void loadPlayerAssets().then((ok) => {
        if (!ok) return;
        for (const v of this.views.values()) this.scene.remove(v.view.root);
        this.views.clear();
      });
    }
    this.particles = { mesh: pMesh, vel: new Float32Array(pCount * 3), pos: new Float32Array(pCount * 3), life: new Float32Array(pCount), next: 0 };
    for (let i = 0; i < pCount; i++) {
      this.tmpM.makeScale(0, 0, 0);
      pMesh.setMatrixAt(i, this.tmpM);
    }
  }

  setupMatch(home: Team, away: Team): void {
    if (this.stadium) {
      this.scene.remove(this.stadium.group);
      this.stadium.dispose();
    }
    for (const v of this.views.values()) this.scene.remove(v.view.root);
    this.views.clear();
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    this.stadium = buildStadium(home, away, this.quality, Math.min(aniso, this.quality === 'high' ? 8 : 4));
    this.scene.add(this.stadium.group);
    this.looks = [makeTeamLook(home, true), makeTeamLook(away, false)];
    this.teams = [home, away];
  }

  resize(w: number, h: number): void {
    this.size = { w, h };
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    // en paysage étroit, champ de vision un peu plus large
    this.camera.fov = w / h < 1.6 ? 54 : 46;
    this.camera.updateProjectionMatrix();
  }

  /** Événements visuels (particules, excitation de la foule, célébration). */
  onEvent(type: string, x: number, y: number, strength = 1): void {
    if (type === 'tackle' || type === 'hit') this.burst(x, y, Math.round(6 * strength));
    if (type === 'tackle') this.excitement = Math.max(this.excitement, 0.3);
    if (type === 'catch' || type === 'interception') this.excitement = Math.max(this.excitement, 0.5);
    if (type === 'touchdown') {
      this.excitement = 1;
      this.celebrate = { x, y, t: 0 };
    }
  }

  clearCelebration(): void {
    this.celebrate = null;
  }

  private burst(x: number, y: number, n: number): void {
    const p = this.particles;
    const [sx, sz] = toScene(x, y);
    for (let k = 0; k < n; k++) {
      const i = p.next;
      p.next = (p.next + 1) % p.life.length;
      p.pos[i * 3] = sx + (Math.random() - 0.5) * 0.6;
      p.pos[i * 3 + 1] = 0.1;
      p.pos[i * 3 + 2] = sz + (Math.random() - 0.5) * 0.6;
      p.vel[i * 3] = (Math.random() - 0.5) * 3;
      p.vel[i * 3 + 1] = 2 + Math.random() * 2.5;
      p.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      p.life[i] = 0.8;
    }
  }

  private updateParticles(dt: number): void {
    const p = this.particles;
    let dirty = false;
    for (let i = 0; i < p.life.length; i++) {
      if (p.life[i] <= 0) continue;
      dirty = true;
      p.life[i] -= dt;
      p.vel[i * 3 + 1] -= 9 * dt;
      p.pos[i * 3] += p.vel[i * 3] * dt;
      p.pos[i * 3 + 1] = Math.max(0.02, p.pos[i * 3 + 1] + p.vel[i * 3 + 1] * dt);
      p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
      const s = p.life[i] > 0 ? 1 : 0;
      this.tmpV.set(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
      this.tmpS.set(s, s, s);
      this.tmpQ.identity();
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
      p.mesh.setMatrixAt(i, this.tmpM);
    }
    this.tmpS.set(1, 1, 1);
    if (dirty) p.mesh.instanceMatrix.needsUpdate = true;
  }

  private updateCrowd(dt: number): void {
    const st = this.stadium;
    if (!st) return;
    this.excitement = Math.max(0.08, this.excitement - dt * 0.25);
    // mise à jour d'une partie de la foule à chaque image (coût borné)
    const chunk = Math.min(st.crowdCount, this.quality === 'low' ? 250 : 600);
    const start = Math.floor((this.time * 60 * chunk) % Math.max(1, st.crowdCount));
    for (let k = 0; k < chunk; k++) {
      const i = (start + k) % st.crowdCount;
      const jump = Math.max(0, Math.sin(this.time * 9 + i * 1.7)) * 0.35 * this.excitement * (i % 3 === 0 ? 1 : 0.5);
      this.tmpV.set(st.crowdBase[i * 3], st.crowdBase[i * 3 + 1] + jump, st.crowdBase[i * 3 + 2]);
      st.crowd.getMatrixAt(i, this.tmpM);
      this.tmpM.setPosition(this.tmpV);
      st.crowd.setMatrixAt(i, this.tmpM);
      this.tmpV.y += 0.62;
      this.tmpM.setPosition(this.tmpV);
      st.heads.setMatrixAt(i, this.tmpM);
    }
    st.crowd.instanceMatrix.needsUpdate = true;
    st.heads.instanceMatrix.needsUpdate = true;
  }

  private viewFor(a: Agent): ViewState {
    let v = this.views.get(a.player.id);
    if (!v) {
      const look = this.looks![a.side];
      // modèle réaliste (si chargé, qualités moyenne et haute), sinon modèle simplifié instancié
      const view = this.quality !== 'low' && playerAssetsReady()
        ? new SkinnedPlayerView(a.player, a.side === 0 ? this.teams![0] : this.teams![1], look, this.quality === 'high')
        : new PlayerView(a.player, look, this.quality !== 'low');
      this.scene.add(view.root);
      v = { view, x: a.x, y: a.y, facing: a.facing, seen: true };
      this.views.set(a.player.id, v);
    }
    return v;
  }

  /** Synchronise la scène avec le contrôleur de match et rend une image. */
  update(dt: number, mc: MatchController): void {
    this.time += dt;
    const sim = mc.sim;
    if (sim !== this.lastSim) {
      this.lastSim = sim;
      this.simStartTime = this.time;
    }
    const sinceNew = this.time - this.simStartTime;
    for (const v of this.views.values()) v.seen = false;
    if (sim) {
      const holder = sim.ball.state === 'held' ? sim.ball.holder : -1;
      for (const a of sim.agents) {
        const v = this.viewFor(a);
        v.seen = true;
        // trottinement vers la formation au début de l'avant-snap
        if (mc.phase === 'PreSnap' && sinceNew < 0.9) {
          const k = Math.min(1, dt * 5.5);
          const dx = a.x - v.x;
          const dy = a.y - v.y;
          v.x += dx * k;
          v.y += dy * k;
          const moving = Math.hypot(dx, dy) > 0.3;
          if (moving) v.facing = Math.atan2(dy, dx);
          else v.facing = a.facing;
          v.view.animate(moving ? 'run' : a.action, a.actionTime, moving ? Math.min(7, Math.hypot(dx, dy) * 5) : 0, a.stride + this.time * 1.6, dt, LINEMEN.has(a.pos), false);
        } else if (mc.phase === 'PlaySelection' || mc.phase === 'CoinToss') {
          // retour au huddle
          const offense = a.side === sim.offense;
          const dir = sim.dir;
          const hx = sim.losX + (offense ? -9 : 6) * dir * (sim.setup.kind === 'kickoff' ? 0 : 1);
          const ang = (a.idx % 11) / 11 * Math.PI * 2;
          const tx = hx + Math.cos(ang) * 1.8;
          const ty = FIELD.width / 2 + Math.sin(ang) * 1.8;
          const dx = tx - v.x;
          const dy = ty - v.y;
          const d = Math.hypot(dx, dy);
          const sp = d > 0.5 ? Math.min(3.5, d) : 0;
          if (d > 0.5) {
            v.x += (dx / d) * sp * dt;
            v.y += (dy / d) * sp * dt;
            v.facing = Math.atan2(dy, dx);
          } else v.facing = Math.atan2(FIELD.width / 2 - v.y, hx - v.x);
          v.view.animate(sp > 0 ? 'run' : 'idle', this.time, sp, a.stride + this.time * sp * 0.5, dt, false, false);
        } else {
          v.x = a.x;
          v.y = a.y;
          v.facing = a.facing;
          v.view.animate(a.action, a.actionTime, Math.hypot(a.vx, a.vy), a.stride, dt, LINEMEN.has(a.pos), a.idx === holder);
        }
        const [sx, sz] = toScene(v.x, v.y);
        v.view.root.position.set(sx, 0, sz);
        v.view.root.rotation.y = -v.facing;
      }
    }
    this.batcher.begin();
    for (const v of this.views.values()) {
      v.view.root.visible = v.seen;
      this.batcher.add(v.view);
    }
    this.batcher.end();
    this.updateBall(mc);
    this.updateMarkers(mc);
    this.updateParticles(dt);
    this.updateCrowd(dt);
    if (this.stadium) {
      this.stadium.tick(dt);
      const st = mc.state;
      this.stadium.updateScreen({ home: mc.teams[0].abbr, away: mc.teams[1].abbr, score: [st.score[0], st.score[1]], info: `${st.quarter <= 4 ? `QT${st.quarter}` : 'PROL.'} · ${Math.floor(mc.displayClock() / 60)}:${String(Math.floor(mc.displayClock() % 60)).padStart(2, '0')}` });
    }
    this.updateCamera(dt, mc);
    this.draw();
  }

  private updateBall(mc: MatchController): void {
    const sim = mc.sim;
    if (!sim) {
      this.ball.visible = false;
      return;
    }
    this.ball.visible = true;
    const b = sim.ball;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    if (b.state === 'held' && b.holder >= 0) {
      const v = this.views.get(sim.agents[b.holder].player.id);
      if (v) {
        bx = v.x + Math.cos(v.facing) * 0.28;
        by = v.y + Math.sin(v.facing) * 0.28;
      }
    }
    if (mc.phase === 'PreSnap' && sim.setup.kind !== 'kickoff') {
      bx = sim.losX;
      by = sim.setup.ballY;
      bz = 0.15;
    }
    const [sx, sz] = toScene(bx, by);
    this.ball.position.set(sx, Math.max(0.12, bz), sz);
    if (b.state === 'air') {
      // spirale alignée sur la vitesse
      const yaw = Math.atan2(b.vy, b.vx);
      const pitch = Math.atan2(b.vz, Math.hypot(b.vx, b.vy));
      this.ball.rotation.set(b.spin, -yaw, pitch, 'YZX');
      this.ball.rotation.x = b.spin * (b.flight === 'pass' ? 1 : 0.3);
    } else if (b.state === 'held') {
      const f = sim.agents[b.holder]?.facing ?? 0;
      this.ball.rotation.set(0, -f, 0.5);
    } else {
      this.ball.rotation.set(0, 0, 0);
    }
    this.ballShadow.position.set(sx, 0.025, sz);
    this.ballShadow.visible = bz > 0.3;
  }

  /** Tentative et distance peintes sur la pelouse, derrière la ligne de mêlée côté caméra, avec le logo de l'attaque. */
  private updateDownGraphic(mc: MatchController, los: number, dir: number): void {
    const s = mc.state;
    const show = (mc.phase === 'PlaySelection' || mc.phase === 'PreSnap') && s.nextKind === 'scrimmage';
    // fondu en temps réel (indépendant de la cadence d'affichage)
    const dt = Math.min(0.1, Math.max(0, this.time - this.downTime));
    this.downTime = this.time;
    this.downFade = Math.max(0, Math.min(1, this.downFade + (show ? dt * 3 : -dt * 6)));
    const mat = this.downGraphic.material as THREE.MeshBasicMaterial;
    mat.opacity = this.downFade * 0.92;
    this.downGraphic.visible = this.downFade > 0.01;
    if (!this.downGraphic.visible) return;
    const team = mc.teams[s.possession];
    const dist = s.ballOn + s.toGo >= 100 ? 'BUT' : String(s.toGo);
    const key = `${s.down}|${dist}|${team.id}`;
    if (key !== this.downKey) {
      this.downKey = key;
      const g = this.downCanvas.getContext('2d')!;
      g.clearRect(0, 0, 512, 160);
      // pastille aux couleurs de l'équipe en attaque (pas de logo réel)
      g.fillStyle = team.colors.primary;
      g.beginPath();
      g.arc(80, 80, 62, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(255,255,255,.85)';
      g.stroke();
      g.fillStyle = '#ffffff';
      g.font = '900 44px "Arial Narrow", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(team.abbr, 80, 84, 110);
      g.font = '900 86px "Arial Narrow", Arial, sans-serif';
      g.textAlign = 'left';
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.fillText(`${s.down}${s.down === 1 ? 'ER' : 'E'} & ${dist}`, 160, 86, 340);
      this.downTex.needsUpdate = true;
    }
    // côté caméra TV (z négatif), juste devant la ligne de mêlée : reste dans le cadre de la caméra qui suit le ballon
    const [x] = toScene(los - dir * 6, 0);
    this.downGraphic.position.x = x;
    this.downGraphic.position.z = -6.5;
    this.downGraphic.rotation.z = Math.PI; // haut du texte vers le fond du terrain : lisible depuis la caméra TV
  }

  private updateMarkers(mc: MatchController): void {
    const s = mc.state;
    const sim = mc.sim;
    const showLines = (mc.phase === 'PlaySelection' || mc.phase === 'PreSnap' || mc.phase === 'LivePlay' || mc.phase === 'PassInFlight') && s.nextKind === 'scrimmage';
    const dir = attackDir(s.possession, s.quarter);
    const ownGoal = dir > 0 ? FIELD.goalLeft : FIELD.goalRight;
    const los = sim && mc.phase !== 'PlaySelection' ? sim.losX : ownGoal + s.ballOn * dir;
    this.losLine.visible = showLines;
    this.losLine.position.x = los - FIELD.length / 2;
    const fd = ownGoal + Math.min(100, s.ballOn + s.toGo) * dir;
    this.fdLine.visible = showLines && s.ballOn + s.toGo < 100;
    this.fdLine.position.x = fd - FIELD.length / 2;
    this.updateDownGraphic(mc, los, dir);
    // anneau du joueur contrôlé
    const u = sim && sim.userAgent >= 0 ? sim.agents[sim.userAgent] : null;
    const uv = u ? this.views.get(u.player.id) : null;
    this.userRing.visible = !!uv && mc.phase !== 'PlaySelection' && mc.phase !== 'PlayReview';
    if (uv) {
      const [x, z] = toScene(uv.x, uv.y);
      this.userRing.position.set(x, 0.05, z);
      const pulse = 1 + Math.sin(this.time * 6) * 0.08;
      this.userRing.scale.set(pulse, pulse, pulse);
    }
    // receveur ciblé
    const tgt = sim && sim.passTarget >= 0 && u && u.idx === sim.qbIdx && !sim.thrown ? sim.agents[sim.passTarget] : null;
    this.targetRing.visible = !!tgt && (mc.phase === 'LivePlay' || mc.phase === 'PreSnap');
    if (tgt) {
      const [x, z] = toScene(tgt.x, tgt.y);
      this.targetRing.position.set(x, 0.06, z);
    }
    // point de chute du ballon
    const air = sim && sim.ball.state === 'air' && (sim.ball.flight === 'pass' || sim.ball.flight === 'kickoff' || sim.ball.flight === 'punt');
    this.landing.visible = !!air;
    if (air && sim) {
      const [x, z] = toScene(sim.ball.tx, sim.ball.ty);
      this.landing.position.set(x, 0.06, z);
      const r = 0.6 + Math.max(0, sim.ball.flightTime - sim.ball.airTime) * 0.8;
      this.landing.scale.set(r, r, r);
    }
  }

  private updateCamera(dt: number, mc: MatchController): void {
    const sim = mc.sim;
    const s = mc.state;
    let fx: number;
    let fy: number;
    let pd: number = attackDir(s.possession, s.quarter);
    let height = 7.5;
    let back = 13;
    let ahead = 7;
    if (sim) {
      const b = sim.ball;
      fx = b.state === 'air' ? lerp(b.x, b.tx, 0.35) : b.x;
      fy = b.state === 'air' ? lerp(b.y, b.ty, 0.35) : b.y;
      if (mc.phase === 'PreSnap' && sim.setup.kind !== 'kickoff') {
        fx = sim.losX;
        fy = sim.setup.ballY;
      }
      pd = sim.dir;
      const c = sim.carrier();
      if (c && c.side !== sim.offense) pd = -sim.dir;
      if (sim.setup.kind === 'kickoff' && (b.state === 'air' || (c && c.side !== sim.offense))) {
        height = 11;
        back = 16;
      }
      if (b.state === 'air' && b.flight === 'pass') {
        height = 9;
        back = 14;
      }
      if (mc.phase === 'PlaySelection') {
        height = 12;
        back = 16;
        ahead = 3;
      }
    } else {
      fx = FIELD.length / 2;
      fy = FIELD.width / 2;
    }
    // choix de l'action : cadrage sur la nouvelle ligne de mêlée (et non sur l'action précédente)
    if (mc.phase === 'PlaySelection' && s.nextKind !== 'kickoff') {
      const d = attackDir(s.possession, s.quarter);
      fx = (d > 0 ? FIELD.goalLeft : FIELD.goalRight) + s.ballOn * d;
      fy = mc.ballY;
      pd = d;
    }
    // l'utilisateur en défense voit l'action depuis le côté défensif
    if (mc.userSide !== null && sim && mc.userSide !== sim.offense && sim.setup.kind !== 'kickoff' && mc.phase !== 'LivePlay' && mc.phase !== 'PassInFlight') {
      pd = sim.dir;
    }
    const targetYaw = pd > 0 ? 0 : Math.PI;
    let dy = targetYaw - this.camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.camYaw += dy * Math.min(1, dt * 2.2);
    const cx = Math.cos(this.camYaw);
    const cz = Math.sin(this.camYaw);
    const [sx, sz] = toScene(fx, fy);
    let px: number;
    let py: number;
    let pz: number;
    let lx: number;
    let ly: number;
    let lz: number;
    if (mc.phase === 'CoinToss' || mc.phase === 'PreGame' || mc.phase === 'MatchFinished') {
      // survol du stade (avant-match / fin de match)
      const a = this.time * 0.12;
      px = Math.cos(a) * 55;
      pz = Math.sin(a) * 40;
      py = 18 + Math.sin(this.time * 0.3) * 4;
      lx = 0;
      ly = 0;
      lz = 0;
    } else if (this.celebrate && mc.phase === 'PlayReview') {
      this.celebrate.t += dt;
      const [cxs, czs] = toScene(this.celebrate.x, this.celebrate.y);
      const ang = this.celebrate.t * 0.6 + this.camYaw + Math.PI;
      px = cxs + Math.cos(ang) * 7;
      pz = czs + Math.sin(ang) * 7;
      py = 3.2;
      lx = cxs;
      ly = 1.3;
      lz = czs;
    } else if (this.cameraMode === 'broadcast') {
      // caméra TV : plus serrée sur l'action, s'élargit pendant les passes et coups de pied
      px = sx - cx * 3;
      py = 9.5 + Math.max(0, height - 9) * 0.6;
      pz = -FIELD.width / 2 - 9 - Math.max(0, back - 12) * 0.5;
      lx = sx + cx * 3;
      ly = 0.6;
      lz = sz * 0.65;
    } else {
      // vue arrière dynamique (style retransmission « all-22 bas »)
      lx = sx + cx * ahead;
      ly = 0.5;
      lz = clamp(sz, -FIELD.width / 2 + 6, FIELD.width / 2 - 6) * 0.85 + cz * ahead;
      px = sx - cx * back;
      py = height;
      pz = sz * 0.75 - cz * back;
    }
    const k = Math.min(1, dt * (this.celebrate && mc.phase === 'PlayReview' ? 2 : 3.2));
    this.camPos.x += (px - this.camPos.x) * k;
    this.camPos.y += (py - this.camPos.y) * k;
    this.camPos.z += (pz - this.camPos.z) * k;
    this.camLook.x += (lx - this.camLook.x) * k * 1.4;
    this.camLook.y += (ly - this.camLook.y) * k * 1.4;
    this.camLook.z += (lz - this.camLook.z) * k * 1.4;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // ombre centrée sur l'action
    this.sun.position.set(this.camLook.x - 30, 60, this.camLook.z + 25);
    this.sun.target.position.copy(this.camLook);
  }

  /** Direction monde (sim) correspondant à « haut » sur l'écran (pour le joystick). */
  screenAxes(): { fx: number; fy: number; rx: number; ry: number } {
    const fx = Math.cos(this.camYaw);
    const fy = Math.sin(this.camYaw);
    if (this.cameraMode === 'broadcast') {
      // caméra sur la touche : haut de l'écran = vers la touche opposée
      return { fx: 0, fy: 1, rx: -1, ry: 0 };
    }
    return { fx, fy, rx: -fy, ry: fx };
  }

  /** Projection d'un point du terrain vers l'écran (pixels CSS). */
  project(x: number, y: number, h: number, w: number, hgt: number): { x: number; y: number; visible: boolean } {
    const [sx, sz] = toScene(x, y);
    this.tmpProj.set(sx, h, sz).project(this.camera);
    return { x: (this.tmpProj.x * 0.5 + 0.5) * w, y: (-this.tmpProj.y * 0.5 + 0.5) * hgt, visible: this.tmpProj.z < 1 };
  }

  /** Rendu d'un fond animé pour les menus (stade vide en orbite). */
  renderMenu(dt: number): void {
    this.time += dt;
    const a = this.time * 0.05;
    this.camera.position.set(Math.cos(a) * 75, 26, Math.sin(a) * 55);
    this.camera.lookAt(0, 0, 0);
    this.updateCrowd(dt);
    this.stadium?.tick(dt);
    this.ball.visible = false;
    this.losLine.visible = this.fdLine.visible = this.userRing.visible = this.targetRing.visible = this.landing.visible = false;
    for (const v of this.views.values()) v.view.root.visible = false;
    this.batcher.begin();
    this.batcher.end();
    this.draw();
  }

  private draw(): void {
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /**
   * Appelé chaque seconde avec la cadence mesurée. Trop lent : résolution −12 % jusqu'au plancher, puis halo coupé.
   * Confortable 3 s de suite : on remonte dans l'ordre inverse. Les joueurs réalistes, ombres et effets restent actifs.
   */
  adapt(fps: number, target: number): void {
    if (this.quality === 'low') return;
    if (this.warmup > 0) {
      this.warmup--;
      return;
    }
    let ratio = this.ratio;
    if (fps < target * 0.88) {
      this.goodSeconds = 0;
      if (ratio > this.minRatio + 0.01) ratio = Math.max(this.minRatio, ratio * 0.88);
      else if (!this.bloomOff) {
        this.bloomOff = true;
        this.post?.setBloom(false);
      }
    } else if (fps >= target * 0.96) {
      if (++this.goodSeconds < 3) return;
      this.goodSeconds = 0;
      if (this.bloomOff) {
        this.bloomOff = false;
        this.post?.setBloom(true);
      } else if (ratio < this.maxRatio - 0.01) ratio = Math.min(this.maxRatio, ratio * 1.08);
    } else this.goodSeconds = 0;
    if (ratio !== this.ratio) {
      this.ratio = ratio;
      this.warmup = 1;
      this.resize(this.size.w, this.size.h);
    }
  }

  /** Résolution de rendu actuelle (diagnostic). */
  get pixelRatio(): number {
    return this.ratio;
  }

  /** Nombre d'appels de rendu de la dernière image (diagnostic). */
  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  dispose(): void {
    this.batcher.dispose();
    this.post?.dispose();
    this.stadium?.dispose();
    this.renderer.dispose();
  }
}
