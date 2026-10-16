import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Player, Team } from '../data/types';
import type { AnimAction } from '../sim/types';
import { computePose, numberTexture, type TeamLook } from './playerModel';

/**
 * Joueur réaliste : modèle articulé « American Football Player » de blakeallen25 (Sketchfab, CC-BY 4.0),
 * optimisé pour le jeu mobile (≈ 18 000 triangles, marques et numéros d'origine retirés des textures).
 * Les couleurs de chaque équipe sont appliquées à l'exécution, l'animation est calculée sur le squelette.
 */

/** Hauteur du modèle source (unités du fichier) et repère : le modèle regarde vers +Z. */
const SOURCE_HEIGHT = 1.29;
const YARD_CM = 91.44;

interface Assets {
  scene: THREE.Group;
  /** Pose de référence (image 0 de l'animation d'attente) : rotations locales par os. */
  basePose: Map<string, THREE.Quaternion>;
  tex: Record<'jersey' | 'jerseyNormal' | 'pants' | 'cleats' | 'skin' | 'skinNormal', THREE.Texture>;
}

let assets: Assets | null = null;
let loading: Promise<Assets | null> | null = null;

/** Dossier des fichiers du jeu (la page compilée à la racine du dépôt les trouve dans public/). */
const base = (): string => ((globalThis as { __ASSET_BASE?: string }).__ASSET_BASE ?? './');

export const playerAssetsReady = (): boolean => assets !== null;

/** Modèle embarqué en base64 (version « fichier unique » où les .glb ne sont pas servis), sinon fichier .glb. */
function loadModel(loader: GLTFLoader): Promise<GLTF> {
  const b64 = (globalThis as { __PLAYER_GLB?: string }).__PLAYER_GLB;
  if (!b64) return loader.loadAsync(`${base()}models/player.glb`);
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return loader.parseAsync(buf.buffer, '');
}

export function loadPlayerAssets(): Promise<Assets | null> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const loader = new GLTFLoader();
      const tl = new THREE.TextureLoader();
      const t = (f: string, srgb = true) => tl.loadAsync(`${base()}models/${f}`).then((x) => {
        x.flipY = false;
        if (srgb) x.colorSpace = THREE.SRGBColorSpace;
        x.anisotropy = 4;
        return x;
      });
      const [gltf, jersey, jerseyNormal, pants, cleats, skin, skinNormal] = await Promise.all([
        loadModel(loader), t('jersey_mask.png', false), t('jersey_normal.jpg', false), t('pants_shade.jpg'),
        t('cleats_shade.jpg'), t('skin.jpg'), t('skin_normal.jpg', false),
      ]);
      const scene = gltf.scene;
      // pose de référence : on échantillonne l'animation d'attente à t = 0
      const basePose = new Map<string, THREE.Quaternion>();
      const clip = gltf.animations[0];
      if (clip) {
        const mixer = new THREE.AnimationMixer(scene);
        mixer.clipAction(clip).play();
        mixer.setTime(0);
      }
      scene.traverse((o) => {
        if ((o as THREE.Bone).isBone) basePose.set(o.name, o.quaternion.clone());
      });
      assets = { scene, basePose, tex: { jersey, jerseyNormal, pants, cleats, skin, skinNormal } };
      return assets;
    } catch (e) {
      console.warn('Modèle de joueur indisponible, repli sur le modèle simplifié', e);
      return null;
    }
  })();
  return loading;
}

const SKIN = ['#f3dccb', '#e3bda0', '#c99a78', '#a0714f', '#7a4f33', '#5a3a26'];

interface SkinnedLook {
  materials: Map<string, THREE.Material>;
  skins: THREE.Material[];
  visorOn: THREE.Material;
  visorOff: THREE.Material;
}

const looksCache = new WeakMap<TeamLook, SkinnedLook>();

/** Maillot : ombrage du tissu (R) teinté par la couleur d'équipe, liserés (G) dans la couleur secondaire. */
function jerseyMaterial(a: Assets, main: string, trim: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: main, map: a.tex.jersey, normalMap: a.tex.jerseyNormal, roughness: 0.78 });
  const trimColor = new THREE.Color(trim);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.trimColor = { value: trimColor };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 trimColor;')
      .replace('#include <map_fragment>', `
        vec4 jm = texture2D( map, vMapUv );
        float shade = jm.r;
        vec3 base = mix( diffuseColor.rgb, trimColor, smoothstep( 0.35, 0.75, jm.g ) );
        diffuseColor.rgb = base * ( 0.35 + 0.65 * shade );
      `);
  };
  m.customProgramCacheKey = () => 'jersey-mask';
  return m;
}

/** Ordre de la palette (identique à tools/process.py) : chaussettes, manchon, poignets, ceinture, liseré, grille, rembourrage, bande. */
function paletteMaterial(colors: string[]): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true });
  const pal = colors.map((c) => new THREE.Color(c));
  while (pal.length < 8) pal.push(new THREE.Color('#888888'));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.palette = { value: pal };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 palette[8];')
      .replace('#include <color_fragment>', `
        int pi = int( floor( vColor.r * 16.0 ) );
        vec3 pc = palette[0];
        for ( int i = 1; i < 8; i ++ ) if ( i == pi ) pc = palette[i];
        diffuseColor.rgb = pc;
      `);
  };
  m.customProgramCacheKey = () => 'player-palette';
  return m;
}

function lookFor(a: Assets, look: TeamLook): SkinnedLook {
  let l = looksCache.get(look);
  if (l) return l;
  const c = look.colors;
  const std = (color: string, map: THREE.Texture | null, roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, map, roughness, metalness });
  const materials = new Map<string, THREE.Material>();
  materials.set('role_jersey', jerseyMaterial(a, c.jersey, c.trim));
  materials.set('role_pants', std(c.pants, a.tex.pants, 0.7));
  materials.set('role_cleats', std(c.cleats, a.tex.cleats, 0.55));
  void std;
  // petites pièces unies : un seul matériau, couleur lue dans une palette selon l'index codé dans COLOR_0
  materials.set('role_palette', paletteMaterial([c.socks, c.sleeve, '#f2f2f2', '#151515', c.trim, c.mask, c.helmet, c.stripe]));
  materials.set('role_helmet', new THREE.MeshPhysicalMaterial({ color: c.helmet, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 }));
  materials.set('helmet_mask', new THREE.MeshStandardMaterial({ color: c.mask, roughness: 0.35, metalness: 0.55 }));
  materials.set('helmet_stripe', new THREE.MeshStandardMaterial({ color: c.stripe, roughness: 0.4 }));
  materials.set('helmet_pad', new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.85 }));
  const skins = SKIN.map((s) => new THREE.MeshStandardMaterial({ color: s, map: a.tex.skin, normalMap: a.tex.skinNormal, roughness: 0.62 }));
  const visorOn = new THREE.MeshStandardMaterial({ color: '#0b0d12', roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.85 });
  const visorOff = new THREE.MeshBasicMaterial({ visible: false });
  l = { materials, skins, visorOn, visorOff };
  looksCache.set(look, l);
  return l;
}

/**
 * Casque construit par le jeu (le casque d'origine du modèle ne se simplifie pas proprement) :
 * coque vernie, bande centrale, grille à 3 barres, protège-oreilles. Repère : avant = +X, haut = +Y, unité = yard.
 */
const HELMET_GEO = (() => {
  const shell = new THREE.SphereGeometry(0.165, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.64);
  shell.scale(1.12, 1.0, 0.98);
  // bord découpé au niveau du visage : on aplatit l'avant bas de la coque
  const pos = shell.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    if (x > 0.06 && y < 0.03) pos.setY(i, Math.max(y, 0.03 - (x - 0.06) * 0.1));
  }
  shell.computeVertexNormals();
  const stripe = new THREE.SphereGeometry(0.168, 6, 16, -0.07, 0.14, 0.02, Math.PI * 0.55);
  stripe.scale(1.12, 1.0, 0.98);
  const bar = new THREE.TorusGeometry(0.15, 0.011, 5, 16, Math.PI * 0.9);
  const vbar = new THREE.CylinderGeometry(0.01, 0.01, 0.13, 5);
  const ear = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12);
  return { shell, stripe, bar, vbar, ear };
})();

function buildHelmet(l: SkinnedLook): THREE.Group {
  const g = new THREE.Group();
  const shellMat = l.materials.get('role_helmet')!;
  const mask = l.materials.get('helmet_mask')!;
  g.add(new THREE.Mesh(HELMET_GEO.shell, shellMat));
  g.add(new THREE.Mesh(HELMET_GEO.stripe, l.materials.get('helmet_stripe')!));
  for (const [y, r] of [[-0.03, 1], [-0.075, 0.92], [-0.115, 0.8]] as [number, number][]) {
    const b = new THREE.Mesh(HELMET_GEO.bar, mask);
    b.rotation.set(Math.PI / 2, 0, -Math.PI / 2 + Math.PI * 0.05);
    b.scale.set(r, r, 1);
    b.position.set(0.035, y, 0);
    g.add(b);
  }
  const v = new THREE.Mesh(HELMET_GEO.vbar, mask);
  v.position.set(0.18, -0.07, 0);
  g.add(v);
  for (const z of [-1, 1]) {
    const e = new THREE.Mesh(HELMET_GEO.ear, l.materials.get('helmet_pad')!);
    e.rotation.x = Math.PI / 2;
    e.position.set(0.0, -0.03, z * 0.16);
    g.add(e);
  }
  return g;
}

/** Os recherché par son nom Mixamo (suffixe numérique du fichier ignoré). */
function findBone(root: THREE.Object3D, name: string): THREE.Bone | null {
  const re = new RegExp(`^mixamorig_${name}_\\d+$`);
  let found: THREE.Bone | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Bone).isBone && re.test(o.name)) found = o as THREE.Bone;
  });
  return found;
}

const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpQ3 = new THREE.Quaternion();

export class SkinnedPlayerView {
  readonly root = new THREE.Group();
  /** Aucune pièce instanciée (compatibilité avec PlayerBatcher). */
  readonly anchors: THREE.Object3D[] = [];
  playerId: string;
  private body = new THREE.Group();
  private model: THREE.Object3D;
  private bones: Record<string, THREE.Bone | null>;
  private hipsBaseY = 0;
  private blob: THREE.Mesh;
  /** Casque (réglage de position exposé pour le banc d'essai). */
  helmet: THREE.Group | null = null;
  private lean = 0;
  private crouch = 0;
  private downBlend = 0;

  constructor(player: Player, team: Team, look: TeamLook, shadows: boolean) {
    const a = assets!;
    void team;
    this.playerId = player.id;
    this.model = cloneSkinned(a.scene);
    const l = lookFor(a, look);
    const skin = l.skins[player.appearance.skinTone % l.skins.length];
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      const swap = (m: THREE.Material) => (m.name === 'role_skin' ? skin : m.name === 'role_visor' ? (player.appearance.visor ? l.visorOn : l.visorOff) : l.materials.get(m.name.replace(/\.\d+$/, '')) ?? m);
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
    const names = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftFoot', 'RightFoot'];
    this.bones = Object.fromEntries(names.map((n) => [n, findBone(this.model, n)]));
    this.hipsBaseY = this.bones.Hips?.position.y ?? 0;
    // échelle : taille réelle du joueur (yards), silhouette plus fine pour les joueuses
    const s = (player.appearance.heightCm / YARD_CM) / SOURCE_HEIGHT;
    const heavy = ['OT', 'OG', 'C', 'DT', 'DE'].includes(player.position);
    const w = (player.appearance.female ? 0.9 : 1) * (heavy ? 1.14 : player.position === 'WR' || player.position === 'CB' ? 0.96 : 1);
    this.model.scale.set(s * w, s, s * w);
    // le modèle regarde vers +Z ; le repère du jeu regarde vers +X
    this.model.rotation.y = Math.PI / 2;
    this.body.add(this.model);
    this.root.add(this.body);
    // numéros (poitrine et dos) portés par le haut du dos : support aligné sur le repère du jeu (yards)
    const spine2 = this.bones.Spine2;
    if (spine2) {
      this.root.updateMatrixWorld(true);
      const tex = numberTexture(player.number, look.numberColor, look.jerseyColor.toUpperCase() === '#F4F4F4' ? '#222222' : '#ffffff');
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      const geo = new THREE.PlaneGeometry(0.24, 0.24);
      const holder = new THREE.Group();
      const bq = spine2.getWorldQuaternion(new THREE.Quaternion());
      holder.quaternion.copy(bq.invert().multiply(this.root.getWorldQuaternion(new THREE.Quaternion())));
      holder.scale.setScalar(1 / spine2.getWorldScale(new THREE.Vector3()).x);
      spine2.add(holder);
      const bp = spine2.getWorldPosition(new THREE.Vector3());
      // le repère du support est celui de root : avant = +X, haut = +Y
      for (const [x, rot, sc, y] of [[0.2 * w, Math.PI / 2, 0.75, 0.0], [-0.21 * w, -Math.PI / 2, 1, 0.02]] as [number, number, number, number][]) {
        const n = new THREE.Mesh(geo, mat);
        n.position.set(x, y + 0.02, 0);
        n.rotation.y = rot;
        n.scale.setScalar(sc);
        holder.add(n);
      }
      void bp;
    }
    // casque sur l'os de la tête, dans le repère du jeu
    const head = this.bones.Head;
    if (head) {
      this.root.updateMatrixWorld(true);
      const holder = new THREE.Group();
      holder.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.root.getWorldQuaternion(new THREE.Quaternion())));
      holder.scale.setScalar(1 / head.getWorldScale(new THREE.Vector3()).x);
      head.add(holder);
      const helmet = buildHelmet(l);
      const hs = player.appearance.heightCm / 188;
      helmet.scale.setScalar(hs);
      helmet.position.set(0.01 * hs, 0.11 * hs, 0);
      helmet.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = shadows)));
      holder.add(helmet);
      this.helmet = helmet;
    }
    // ombre de contact (qualité sans ombres portées)
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.02;
    this.blob.visible = !shadows;
    this.root.add(this.blob);
  }

  /** Rotation autour d'un axe du repère du modèle, appliquée par-dessus la pose de référence de l'os. */
  private rot(bone: THREE.Bone | null, axis: THREE.Vector3, angle: number): void {
    if (!bone || !angle) return;
    const parent = bone.parent!;
    parent.getWorldQuaternion(tmpQ);
    this.model.getWorldQuaternion(tmpQ2);
    // axe exprimé dans le repère du parent : q_parent⁻¹ · q_modèle · axe
    tmpQ3.copy(tmpQ).invert().multiply(tmpQ2);
    const local = axis.clone().applyQuaternion(tmpQ3).normalize();
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(local, angle));
  }

  animate(action: AnimAction, actionTime: number, speed: number, stride: number, dt: number, lineman: boolean, hasBall: boolean): void {
    const p = computePose(action, actionTime, speed, stride, lineman, hasBall);
    const k = Math.min(1, dt * 10);
    this.lean += (p.lean - this.lean) * k;
    this.crouch += (p.crouch - this.crouch) * k;
    this.downBlend += (p.down - this.downBlend) * Math.min(1, dt * (p.down ? 9 : 4));
    const a = assets!;
    // pose de référence
    for (const b of Object.values(this.bones)) if (b) b.quaternion.copy(a.basePose.get(b.name) ?? b.quaternion);
    this.root.updateMatrixWorld(true);
    const B = this.bones;
    const hips = B.Hips;
    if (hips) hips.position.y = this.hipsBaseY * (1 - this.crouch * 0.28) + p.bob * this.hipsBaseY * 0.25;
    // haut du corps (penché vers l'avant = rotation autour de l'axe latéral X du modèle)
    this.rot(B.Spine, AX, this.lean * 0.45);
    B.Spine?.updateMatrixWorld(true);
    this.rot(B.Spine1, AX, this.lean * 0.35);
    this.rot(B.Spine1, AZ, p.roll);
    B.Spine1?.updateMatrixWorld(true);
    this.rot(B.Head, AX, -p.headPitch);
    // jambes (cuisse vers l'avant = rotation négative autour de X), genoux vers l'arrière
    for (const [side, thigh, knee] of [['Left', p.thighL, p.kneeL], ['Right', p.thighR, p.kneeR]] as [string, number, number][]) {
      const up = B[`${side}UpLeg`];
      this.rot(up, AX, -(thigh + this.crouch * 0.3));
      up?.updateMatrixWorld(true);
      this.rot(B[`${side}Leg`], AX, knee);
    }
    // bras : balancier avant/arrière, écartement latéral, coude
    for (const [side, swing, spread, elbow] of [['Left', p.armLz, p.armLx, p.elbowL], ['Right', p.armRz, -p.armRx, p.elbowR]] as [string, number, number, number][]) {
      const arm = B[`${side}Arm`];
      this.rot(arm, AX, -(swing - 0.15));
      arm?.updateMatrixWorld(true);
      this.rot(arm, AZ, (side === 'Left' ? 1 : -1) * (spread - 0.1) * 0.8);
      arm?.updateMatrixWorld(true);
      this.rot(B[`${side}ForeArm`], AX, elbow + 0.3);
    }
    // corps à l'horizontale (plongeon / au sol)
    this.body.rotation.z = -this.downBlend * (Math.PI / 2 - 0.08);
    this.body.position.y = this.downBlend * 0.22;
    this.body.position.x = this.downBlend * 0.75;
    this.blob.scale.set(1 + this.downBlend * 1.3, 1, 1);
  }
}
