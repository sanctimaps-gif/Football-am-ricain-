import * as THREE from 'three';
import type { Player, Team } from '../data/types';
import type { AnimAction } from '../sim/types';

/**
 * Modèle de joueur procédural articulé (provisoire, remplaçable par un modèle riggé glTF).
 * Repère local : l'avant du joueur est +X, le haut +Y. Unité : yard.
 */

const SKIN = ['#f1d3bc', '#e0b291', '#c68e68', '#9c6644', '#6f4529', '#4a2e1b'];

export interface TeamLook {
  jersey: THREE.MeshStandardMaterial;
  pads: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  helmet: THREE.MeshStandardMaterial;
  stripe: THREE.MeshStandardMaterial;
  socks: THREE.MeshStandardMaterial;
  numberColor: string;
  jerseyColor: string;
}

export function makeTeamLook(team: Team, home: boolean): TeamLook {
  const u = team.uniform;
  const jerseyColor = home ? u.homeJersey : u.awayJersey;
  return {
    jersey: new THREE.MeshStandardMaterial({ color: jerseyColor, roughness: 0.7 }),
    pads: new THREE.MeshStandardMaterial({ color: jerseyColor, roughness: 0.55 }),
    pants: new THREE.MeshStandardMaterial({ color: home ? u.homePants : u.awayPants, roughness: 0.65 }),
    helmet: new THREE.MeshStandardMaterial({ color: u.helmet, roughness: 0.25, metalness: 0.35 }),
    stripe: new THREE.MeshStandardMaterial({ color: u.stripe, roughness: 0.4 }),
    socks: new THREE.MeshStandardMaterial({ color: home ? team.colors.primary : team.colors.secondary === '#FFFFFF' ? team.colors.primary : team.colors.secondary, roughness: 0.8 }),
    numberColor: home ? u.numberColor : team.colors.primary,
    jerseyColor,
  };
}

// Géométries partagées
const G = {
  torso: new THREE.CapsuleGeometry(0.2, 0.32, 4, 10),
  pads: new THREE.BoxGeometry(0.34, 0.2, 0.74),
  padCap: new THREE.SphereGeometry(0.15, 10, 8),
  neck: new THREE.CylinderGeometry(0.075, 0.085, 0.12, 8),
  helmet: new THREE.SphereGeometry(0.155, 16, 12),
  stripe: new THREE.BoxGeometry(0.33, 0.03, 0.04),
  mask: new THREE.TorusGeometry(0.12, 0.012, 6, 14, Math.PI),
  maskBar: new THREE.CylinderGeometry(0.01, 0.01, 0.22, 5),
  upperArm: new THREE.CapsuleGeometry(0.06, 0.2, 3, 8),
  foreArm: new THREE.CapsuleGeometry(0.052, 0.19, 3, 8),
  glove: new THREE.SphereGeometry(0.06, 8, 6),
  thigh: new THREE.CapsuleGeometry(0.095, 0.3, 3, 8),
  shin: new THREE.CapsuleGeometry(0.07, 0.3, 3, 8),
  cleat: new THREE.BoxGeometry(0.24, 0.07, 0.1),
  numberPlane: new THREE.PlaneGeometry(0.26, 0.26),
  shadowBlob: new THREE.CircleGeometry(0.42, 16),
};
const MASK_MAT = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.6, roughness: 0.3 });
const CLEAT_MAT = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6 });
const GLOVE_MAT = new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.7 });
const SKIN_MATS = SKIN.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
const VISOR_MAT = new THREE.MeshStandardMaterial({ color: '#10141a', metalness: 0.8, roughness: 0.15, transparent: true, opacity: 0.85 });
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false });

const numberTexCache = new Map<string, THREE.CanvasTexture>();
function numberTexture(num: number, color: string, outline: string): THREE.CanvasTexture {
  const key = `${num}|${color}|${outline}`;
  let t = numberTexCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = '900 92px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = outline;
  ctx.strokeText(String(num), 64, 70);
  ctx.fillStyle = color;
  ctx.fillText(String(num), 64, 70);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  numberTexCache.set(key, t);
  return t;
}

interface Limb {
  pivot: THREE.Group;
  lower: THREE.Group;
}

export class PlayerView {
  readonly root = new THREE.Group();
  private body = new THREE.Group(); // inclinaison globale (plongeon / au sol)
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL: Limb;
  private armR: Limb;
  private legL: Limb;
  private legR: Limb;
  private blob: THREE.Mesh;
  private bodyScale: number;
  private widthScale: number;
  playerId = '';
  // état lissé de l'animation
  private lean = 0;
  private crouch = 0;
  private downBlend = 0;

  constructor(player: Player, look: TeamLook, shadows: boolean) {
    this.playerId = player.id;
    const heavy = ['OT', 'OG', 'C', 'DT', 'DE'].includes(player.position);
    this.bodyScale = player.appearance.heightCm / 188;
    this.widthScale = heavy ? 1.22 : player.position === 'K' || player.position === 'P' ? 0.88 : player.position === 'WR' || player.position === 'CB' ? 0.94 : 1.0;
    const skin = SKIN_MATS[player.appearance.skinTone % SKIN_MATS.length];
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.98;
    this.hips.add(this.torso);
    // torse + maillot
    const torsoMesh = new THREE.Mesh(G.torso, look.jersey);
    torsoMesh.position.y = 0.34;
    torsoMesh.scale.set(0.85, 1, 1.25 * this.widthScale);
    this.torso.add(torsoMesh);
    const pads = new THREE.Mesh(G.pads, look.pads);
    pads.position.y = 0.62;
    pads.scale.z = this.widthScale;
    this.torso.add(pads);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(G.padCap, look.pads);
      cap.position.set(0, 0.6, s * 0.33 * this.widthScale);
      cap.scale.set(1, 0.7, 1);
      this.torso.add(cap);
    }
    // numéros (dos et poitrine)
    const ntex = numberTexture(player.number, look.numberColor, look.jerseyColor === '#F4F4F4' ? '#222' : '#ffffff');
    const nmat = new THREE.MeshBasicMaterial({ map: ntex, transparent: true });
    const back = new THREE.Mesh(G.numberPlane, nmat);
    back.position.set(-0.19, 0.4, 0);
    back.rotation.y = -Math.PI / 2;
    const front = new THREE.Mesh(G.numberPlane, nmat);
    front.position.set(0.19, 0.42, 0);
    front.rotation.y = Math.PI / 2;
    front.scale.setScalar(0.75);
    this.torso.add(back, front);
    // cou + tête/casque
    const neck = new THREE.Mesh(G.neck, skin);
    neck.position.y = 0.76;
    this.torso.add(neck);
    this.head.position.y = 0.9;
    this.torso.add(this.head);
    const helmet = new THREE.Mesh(G.helmet, look.helmet);
    helmet.scale.set(1.12, 1.05, 1.0);
    this.head.add(helmet);
    const stripe = new THREE.Mesh(G.stripe, look.stripe);
    stripe.position.y = 0.155;
    this.head.add(stripe);
    const mask = new THREE.Mesh(G.mask, MASK_MAT);
    mask.position.set(0.13, -0.03, 0);
    mask.rotation.set(0, Math.PI / 2, Math.PI / 2);
    this.head.add(mask);
    for (const yy of [-0.06, 0.0]) {
      const bar = new THREE.Mesh(G.maskBar, MASK_MAT);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(0.17, yy, 0);
      this.head.add(bar);
    }
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), player.appearance.visor ? VISOR_MAT : skin);
    face.position.set(0.09, -0.02, 0);
    face.scale.set(0.6, 0.9, 0.9);
    this.head.add(face);
    // bras
    this.armL = this.makeArm(look, skin, -1);
    this.armR = this.makeArm(look, skin, 1);
    // jambes
    this.legL = this.makeLeg(look, -1);
    this.legR = this.makeLeg(look, 1);
    // ombre portée simple (mode qualité basse)
    this.blob = new THREE.Mesh(G.shadowBlob, BLOB_MAT);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.02;
    this.blob.visible = !shadows;
    this.root.add(this.blob);
    this.root.scale.setScalar(this.bodyScale);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== this.blob) {
        o.castShadow = shadows;
      }
    });
  }

  private makeArm(look: TeamLook, skin: THREE.Material, side: number): Limb {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.6, side * 0.36 * this.widthScale);
    const upper = new THREE.Mesh(G.upperArm, look.jersey);
    upper.position.y = -0.15;
    pivot.add(upper);
    const lower = new THREE.Group();
    lower.position.y = -0.3;
    const fore = new THREE.Mesh(G.foreArm, skin);
    fore.position.y = -0.13;
    lower.add(fore);
    const glove = new THREE.Mesh(G.glove, GLOVE_MAT);
    glove.position.y = -0.29;
    lower.add(glove);
    pivot.add(lower);
    this.torso.add(pivot);
    return { pivot, lower };
  }

  private makeLeg(look: TeamLook, side: number): Limb {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, side * 0.13 * this.widthScale);
    const thigh = new THREE.Mesh(G.thigh, look.pants);
    thigh.position.y = -0.22;
    thigh.scale.x = this.widthScale;
    pivot.add(thigh);
    const lower = new THREE.Group();
    lower.position.y = -0.47;
    const shin = new THREE.Mesh(G.shin, look.socks);
    shin.position.y = -0.2;
    lower.add(shin);
    const cleat = new THREE.Mesh(G.cleat, CLEAT_MAT);
    cleat.position.set(0.05, -0.42, 0);
    lower.add(cleat);
    pivot.add(lower);
    this.hips.add(pivot);
    return { pivot, lower };
  }

  /**
   * Animation procédurale : course, appuis, blocage, lancer, réception, plongeon, plaquage au sol, célébration…
   */
  animate(action: AnimAction, actionTime: number, speed: number, stride: number, dt: number, lineman: boolean, hasBall: boolean): void {
    const k = Math.min(1, dt * 10);
    const run = Math.min(1, speed / 7);
    const phase = stride * Math.PI;
    let targetLean = 0;
    let targetCrouch = 0;
    let down = 0;
    // valeurs par défaut (repos)
    let thighL = 0, thighR = 0, kneeL = 0.05, kneeR = 0.05;
    let armLz = 0.15, armRz = 0.15, armLx = 0.1, armRx = -0.1, elbowL = -0.3, elbowR = -0.3;
    let bob = 0;
    let headPitch = 0;
    let bodyRoll = 0;
    switch (action) {
      case 'stance': {
        targetCrouch = lineman ? 0.42 : 0.25;
        targetLean = lineman ? 0.95 : 0.45;
        thighL = 0.6; thighR = lineman ? 0.2 : 0.5;
        kneeL = 1.0; kneeR = 0.9;
        if (lineman) { armRz = 1.9; elbowR = 0; armLz = 0.6; elbowL = -0.6; }
        else { armLz = 0.5; armRz = 0.5; elbowL = -0.6; elbowR = -0.6; }
        headPitch = -targetLean * 0.7;
        break;
      }
      case 'run':
      case 'backpedal':
      case 'idle': {
        const amp = 0.95 * run;
        const sgn = action === 'backpedal' ? -1 : 1;
        thighL = Math.sin(phase) * amp * sgn;
        thighR = -Math.sin(phase) * amp * sgn;
        kneeL = 0.1 + Math.max(0, -Math.cos(phase)) * 1.4 * run;
        kneeR = 0.1 + Math.max(0, Math.cos(phase)) * 1.4 * run;
        armLz = -Math.sin(phase) * 0.9 * run + 0.1;
        armRz = Math.sin(phase) * 0.9 * run + 0.1;
        elbowL = -0.4 - run * 0.9;
        elbowR = -0.4 - run * 0.9;
        if (hasBall) { armRz = 0.5; elbowR = -1.9; armRx = 0.25; }
        targetLean = action === 'backpedal' ? -0.05 : run * 0.32;
        targetCrouch = action === 'backpedal' ? 0.15 : 0;
        bob = Math.abs(Math.sin(phase)) * 0.06 * run;
        if (action === 'idle') {
          bob = Math.sin(actionTime * 2) * 0.01;
          if (lineman) { targetCrouch = 0.12; targetLean = 0.2; }
        }
        headPitch = -targetLean * 0.6;
        break;
      }
      case 'block': {
        targetLean = 0.55;
        targetCrouch = 0.2;
        thighL = Math.sin(actionTime * 9) * 0.35 + 0.3;
        thighR = -Math.sin(actionTime * 9) * 0.35 + 0.3;
        kneeL = 0.7; kneeR = 0.7;
        armLz = 1.45; armRz = 1.45; elbowL = -0.2; elbowR = -0.2;
        armLx = 0.25; armRx = -0.25;
        headPitch = -0.3;
        break;
      }
      case 'throw': {
        const t = Math.min(1, actionTime / 0.45);
        armRz = t < 0.4 ? -1.2 * (t / 0.4) - 0.4 : -1.6 + (t - 0.4) * 5.5;
        armRx = -1.2;
        elbowR = t < 0.5 ? -1.6 : -0.3;
        armLz = 1.0 - t; elbowL = -1.2;
        targetLean = 0.1 + t * 0.25;
        thighL = 0.35; thighR = -0.25; kneeL = 0.3; kneeR = 0.2;
        break;
      }
      case 'catch': {
        const t = Math.min(1, actionTime / 0.3);
        armLz = 2.6 * t; armRz = 2.6 * t; elbowL = -0.3; elbowR = -0.3;
        armLx = 0.2; armRx = -0.2;
        thighL = Math.sin(phase) * 0.6 * run; thighR = -thighL;
        kneeL = 0.4; kneeR = 0.4;
        bob = actionTime < 0.4 ? Math.sin((actionTime / 0.4) * Math.PI) * 0.25 : 0;
        headPitch = 0.3;
        break;
      }
      case 'kick': {
        const t = Math.min(1, actionTime / 0.5);
        thighR = -0.8 + t * 2.6;
        kneeR = t < 0.4 ? 1.4 : 0.1;
        armLz = 0.6; armRz = -0.6; armLx = 0.8; armRx = -0.8;
        targetLean = -0.15;
        break;
      }
      case 'juke': {
        bodyRoll = Math.sin(Math.min(1, actionTime / 0.4) * Math.PI) * 0.5;
        thighL = 0.6; thighR = -0.4; kneeL = 0.9; kneeR = 0.5;
        armLz = 0.8; armRz = 0.5; elbowR = -1.8;
        targetLean = 0.35;
        targetCrouch = 0.12;
        break;
      }
      case 'handoff': {
        armLz = 1.1; armRz = 1.1; elbowL = -0.6; elbowR = -0.6;
        targetLean = 0.2;
        break;
      }
      case 'dive':
      case 'down': {
        down = 1;
        armLz = 2.8; armRz = 2.8; elbowL = -0.2; elbowR = -0.2;
        thighL = -0.2; thighR = 0.1; kneeL = 0.3; kneeR = 0.6;
        break;
      }
      case 'celebrate': {
        const t = actionTime * 6;
        bob = Math.max(0, Math.sin(t)) * 0.35;
        armLz = 2.9 + Math.sin(t) * 0.2; armRz = 2.9 - Math.sin(t) * 0.2;
        armLx = 0.4; armRx = -0.4; elbowL = -0.2; elbowR = -0.2;
        thighL = 0.2; thighR = -0.1; kneeL = Math.max(0, Math.sin(t)) * 0.8; kneeR = kneeL;
        headPitch = 0.35;
        break;
      }
      case 'kneel': {
        targetCrouch = 0.45;
        thighL = 1.4; kneeL = 1.5; thighR = -0.2; kneeR = 2.3;
        armLz = 0.6; armRz = 0.6; elbowR = -1.6;
        break;
      }
      case 'hold': {
        targetCrouch = 0.5;
        thighL = 1.2; kneeL = 2.0; thighR = 0.6; kneeR = 2.3;
        armLz = 1.2; armRz = 1.2; elbowL = -0.4;
        break;
      }
    }
    this.lean += (targetLean - this.lean) * k;
    this.crouch += (targetCrouch - this.crouch) * k;
    this.downBlend += (down - this.downBlend) * Math.min(1, dt * (down ? 9 : 4));
    // appliquer
    this.hips.position.y = 0.98 - this.crouch * 0.55 + bob;
    this.torso.rotation.z = -this.lean;
    this.torso.rotation.x = bodyRoll;
    this.head.rotation.z = -headPitch;
    this.legL.pivot.rotation.z = thighL + this.crouch * 0.3;
    this.legR.pivot.rotation.z = thighR + this.crouch * 0.3;
    this.legL.lower.rotation.z = -kneeL;
    this.legR.lower.rotation.z = -kneeR;
    this.armL.pivot.rotation.z = armLz;
    this.armR.pivot.rotation.z = armRz;
    this.armL.pivot.rotation.x = -0.15 + armLx;
    this.armR.pivot.rotation.x = 0.15 + armRx;
    this.armL.lower.rotation.z = -elbowL;
    this.armR.lower.rotation.z = -elbowR;
    // corps à l'horizontale (plongeon / au sol)
    this.body.rotation.z = -this.downBlend * (Math.PI / 2 - 0.08);
    this.body.position.y = this.downBlend * 0.22;
    this.body.position.x = this.downBlend * 0.75;
    this.blob.scale.set(1 + this.downBlend * 1.3, 1, 1);
  }
}
