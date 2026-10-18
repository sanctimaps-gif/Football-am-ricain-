import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Player, Team } from '../data/types';
import type { AnimAction } from '../sim/types';
import { applyBodyMotion, celebrationOf, computePose, numberTexture, type TeamLook } from './playerModel';

/**
 * Joueur réaliste : modèle articulé « American Football Player » de blakeallen25 (Sketchfab, CC-BY 4.0),
 * optimisé pour le jeu mobile (≈ 18 000 triangles, marques et numéros d'origine retirés des textures).
 * Les couleurs de chaque équipe sont appliquées à l'exécution, l'animation est calculée sur le squelette.
 */

/** Hauteur du modèle source (unités du fichier) et repère : le modèle regarde vers +Z. */
const SOURCE_HEIGHT = 1.29;
const YARD_CM = 91.44;

const STRIPE_BINS = 14;
/** Section du pantalon tranche par tranche (bande latérale centrée sur le côté extérieur de chaque jambe). */
interface StripeData { up: THREE.Vector3; lat: THREE.Vector3; fwd: THREE.Vector3; h0: number; dh: number; bins: THREE.Vector3[]; cl: number }

function computeStripe(sk: THREE.SkinnedMesh, up: THREE.Vector3, lat: THREE.Vector3, center: THREE.Vector3): StripeData {
  const g = sk.geometry;
  const pos = g.attributes.position;
  const idx = g.index!;
  const fwd = new THREE.Vector3().crossVectors(up, lat).normalize();
  const grp = { start: 0, count: idx.count };
  const v = new THREE.Vector3();
  const pts: { h: number; l: number; f: number }[] = [];
  const seen = new Set<number>();
  for (let k = grp.start; k < grp.start + grp.count; k++) {
    const i = idx.getX(k);
    if (seen.has(i)) continue;
    seen.add(i);
    v.fromBufferAttribute(pos, i).applyMatrix4(sk.bindMatrix).sub(center);
    pts.push({ h: v.dot(up) + center.dot(up), l: v.dot(lat) + center.dot(lat), f: v.dot(fwd) + center.dot(fwd) });
  }
  const cl = center.dot(lat);
  let hMin = Infinity, hMax = -Infinity;
  for (const p of pts) { hMin = Math.min(hMin, p.h); hMax = Math.max(hMax, p.h); }
  // haut du pantalon : on évite la ceinture et l'entrejambe (8 % du haut)
  const h0 = hMin, dh = ((hMax - hMin) * 0.92) / (STRIPE_BINS - 1);
  const bins: THREE.Vector3[] = [];
  for (const side of [1, -1]) {
    for (let b = 0; b < STRIPE_BINS; b++) {
      const lo = h0 + (b - 0.5) * dh, hi = h0 + (b + 0.5) * dh;
      const sel = pts.filter((p) => p.h >= lo && p.h < hi && (p.l - cl) * side > 0.01);
      if (sel.length < 4) { bins.push(new THREE.Vector3(0, 99, 0)); continue; }
      const ls = sel.map((p) => (p.l - cl) * side);
      const lMax = Math.max(...ls), lMin = Math.min(...ls);
      // centre avant-arrière : points les plus à l'extérieur
      const fs = sel.map((p) => p.f);
      const fC = (Math.max(...fs) + Math.min(...fs)) / 2;
      bins.push(new THREE.Vector3(fC, lMin + (lMax - lMin) * 0.55, 1));
    }
  }
  // lissage d'une tranche à l'autre (bande droite et continue)
  for (let pass = 0; pass < 3; pass++) {
    for (const o of [0, STRIPE_BINS]) {
      const prev = bins.slice(o, o + STRIPE_BINS).map((b) => b.clone());
      for (let b = 0; b < STRIPE_BINS; b++) {
        if (!prev[b].z) continue;
        const nb = [prev[b - 1], prev[b], prev[b], prev[b + 1]].filter((x) => x && x.z);
        bins[o + b].x = nb.reduce((t, x) => t + x.x, 0) / nb.length;
        bins[o + b].y = nb.reduce((t, x) => t + x.y, 0) / nb.length;
      }
    }
  }
  return { up, lat, fwd, h0, dh, bins, cl };
}

interface Assets {
  scene: THREE.Group;
  /** Pose de référence (image 0 de l'animation d'attente) : rotations locales par os. */
  basePose: Map<string, THREE.Quaternion>;
  tex: Record<'jersey' | 'jerseyNormal' | 'pants' | 'cleats' | 'skin' | 'skinNormal', THREE.Texture>;
  /** Articulations dans l'espace de liaison du maillage (gants, bande du pantalon). */
  joints: { wristL: THREE.Vector3; dirL: THREE.Vector3; wristR: THREE.Vector3; dirR: THREE.Vector3; stripe: StripeData };
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
      // articulations en position de liaison (inverse des matrices de liaison des os)
      let sk: THREE.SkinnedMesh | null = null;
      scene.traverse((o) => { if (!sk && (o as THREE.SkinnedMesh).isSkinnedMesh) sk = o as THREE.SkinnedMesh; });
      const bindPos = (name: string): THREE.Vector3 => {
        const s = sk!.skeleton;
        const i = s.bones.findIndex((b) => new RegExp(`^mixamorig_${name}_\\d+$`).test(b.name));
        return new THREE.Vector3().setFromMatrixPosition(s.boneInverses[i].clone().invert());
      };
      const wristL = bindPos('LeftHand'), wristR = bindPos('RightHand');
      const hipL = bindPos('LeftUpLeg'), hipR = bindPos('RightUpLeg');
      const upAxis = bindPos('Head').sub(bindPos('Hips')).normalize();
      const latAxis = hipL.clone().sub(hipR).normalize();
      let pantsMesh: THREE.SkinnedMesh | null = null;
      scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && !Array.isArray(m.material) && m.material.name === 'role_pants') pantsMesh = m; });
      const joints = {
        wristL, dirL: wristL.clone().sub(bindPos('LeftForeArm')).normalize(),
        wristR, dirR: wristR.clone().sub(bindPos('RightForeArm')).normalize(),
        stripe: computeStripe(pantsMesh ?? sk!, upAxis, latAxis, hipL.clone().add(hipR).multiplyScalar(0.5)),
      };
      assets = { scene, basePose, tex: { jersey, jerseyNormal, pants, cleats, skin, skinNormal }, joints };
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

/** Position de liaison du sommet (avant animation) transmise au fragment shader. */
const BIND_VARYING = (decl: string, body: string) => (sh: { vertexShader: string; fragmentShader: string }) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${decl}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n#ifdef USE_SKINNING\n vec3 bp = ( bindMatrix * vec4( position, 1.0 ) ).xyz;\n vec3 bn = normalize( mat3( bindMatrix ) * objectNormal );\n#else\n vec3 bp = position; vec3 bn = objectNormal;\n#endif\n${body}`);
};

/** Peau : les mains sont recouvertes de gants (au-delà du poignet, dans le sens de l'avant-bras). */
function gloveSkin(a: Assets, skinColor: string, glove: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: skinColor, map: a.tex.skin, normalMap: a.tex.skinNormal, roughness: 0.62 });
  const j = a.joints;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { wristL: { value: j.wristL }, dirL: { value: j.dirL }, wristR: { value: j.wristR }, dirR: { value: j.dirR }, gloveColor: { value: new THREE.Color(glove) } });
    BIND_VARYING('uniform vec3 wristL; uniform vec3 dirL; uniform vec3 wristR; uniform vec3 dirR; varying float vGlove;',
      'vGlove = max( smoothstep( -0.002, 0.004, dot( bp - wristL, dirL ) ), smoothstep( -0.002, 0.004, dot( bp - wristR, dirR ) ) );')(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 gloveColor; varying float vGlove;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix( diffuseColor.rgb, gloveColor * 0.9, vGlove );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix( roughnessFactor, 0.45, vGlove );');
  };
  m.customProgramCacheKey = () => 'skin-gloves';
  return m;
}

/** Pantalon : bande latérale verticale (côté extérieur de chaque jambe), aux couleurs de l'équipe. */
function pantsMaterial(a: Assets, color: string, stripe: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, map: a.tex.pants, roughness: 0.7 });
  const j = a.joints;
  m.onBeforeCompile = (sh) => {
    const st = j.stripe;
    Object.assign(sh.uniforms, { sUp: { value: st.up }, sLat: { value: st.lat }, sFwd: { value: st.fwd }, sH0: { value: st.h0 }, sDH: { value: st.dh }, sCl: { value: st.cl }, sBins: { value: st.bins }, stripeColor: { value: new THREE.Color(stripe) } });
    BIND_VARYING('varying vec3 vBind;', 'vBind = bp;')(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 sUp; uniform vec3 sLat; uniform vec3 sFwd; uniform float sH0; uniform float sDH; uniform float sCl; uniform vec3 sBins[${STRIPE_BINS * 2}];
      varying vec3 vBind;
      float stripeAt( vec3 p ) {
        float lat = dot( p, sLat ) - sCl; float side = lat >= 0.0 ? 1.0 : -1.0; int o = lat >= 0.0 ? 0 : ${STRIPE_BINS};
        float t = clamp( ( dot( p, sUp ) - sH0 ) / sDH, 0.0, ${STRIPE_BINS - 1}.0 );
        int i0 = int( floor( t ) ); int i1 = min( i0 + 1, ${STRIPE_BINS - 1} ); float f = t - float( i0 );
        vec3 b0 = sBins[0]; vec3 b1 = sBins[0];
        for ( int i = 0; i < ${STRIPE_BINS * 2}; i ++ ) { if ( i == o + i0 ) b0 = sBins[i]; if ( i == o + i1 ) b1 = sBins[i]; }
        vec3 bb = mix( b0, b1, f ); // x : centre avant-arrière, y : milieu latéral, z : 1 si valide
        float fw = abs( dot( p, sFwd ) - bb.x );
        return bb.z * ( 1.0 - smoothstep( 0.010, 0.014, fw ) ) * step( bb.y, lat * side );
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 stripeColor;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n float vStripe = stripeAt( vBind );\n diffuseColor.rgb = mix( diffuseColor.rgb, stripeColor * ( 0.55 + 0.45 * texture2D( map, vMapUv ).r ), vStripe );');
  };
  m.customProgramCacheKey = () => 'pants-stripe';
  return m;
}

function lookFor(a: Assets, look: TeamLook): SkinnedLook {
  let l = looksCache.get(look);
  if (l) return l;
  const c = look.colors;
  const std = (color: string, map: THREE.Texture | null, roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, map, roughness, metalness });
  const materials = new Map<string, THREE.Material>();
  materials.set('role_jersey', jerseyMaterial(a, c.jersey, c.trim));
  materials.set('role_pants', pantsMaterial(a, c.pants, c.stripe));
  materials.set('role_cleats', new THREE.MeshBasicMaterial({ visible: false })); // remplacés par des crampons construits par le jeu
  const dark = new THREE.Color(c.cleats).getHSL({ h: 0, s: 0, l: 0 }).l < 0.35;
  materials.set('cleat_upper', new THREE.MeshPhysicalMaterial({ color: c.cleats, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 }));
  materials.set('cleat_sole', new THREE.MeshStandardMaterial({ color: dark ? '#e8eaed' : '#17191c', roughness: 0.7 }));
  materials.set('cleat_accent', new THREE.MeshStandardMaterial({ color: c.trim, roughness: 0.5 }));
  materials.set('cleat_stud', new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.5, metalness: 0.3 }));
  void std;
  // petites pièces unies : un seul matériau, couleur lue dans une palette selon l'index codé dans COLOR_0
  materials.set('role_palette', paletteMaterial([c.socks, c.sleeve, '#f2f2f2', '#151515', c.trim, c.mask, c.helmet, c.stripe]));
  materials.set('role_helmet', new THREE.MeshPhysicalMaterial({ color: c.helmet, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }));
  materials.set('helmet_chin', new THREE.MeshStandardMaterial({ color: '#eceef0', roughness: 0.6 }));
  materials.set('helmet_mask', new THREE.MeshStandardMaterial({ color: c.mask, roughness: 0.35, metalness: 0.55 }));
  materials.set('helmet_stripe', new THREE.MeshStandardMaterial({ color: c.stripe, roughness: 0.4 }));
  materials.set('helmet_pad', new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.85 }));
  const skins = SKIN.map((s) => gloveSkin(a, s, c.gloves));
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
/**
 * Casque moderne (repère du casque : +X = avant, +Y = haut, Z = latéral, origine au centre de la tête).
 * Coque enveloppante qui descend sur les oreilles et la mâchoire, ouverture du visage, bande centrale.
 */
const deg = Math.PI / 180;
/** Rayon de la coque selon la direction (plus large vers le bas pour envelopper la mâchoire). */
const shellPoint = (yaw: number, el: number, inflate = 0): THREE.Vector3 => {
  const R = 0.158 + inflate;
  const low = Math.max(0, -Math.sin(el));
  const r = R * (1 + 0.16 * low);
  const front = Math.max(0, Math.cos(yaw));
  return new THREE.Vector3(Math.cos(el) * Math.cos(yaw) * r * (1.13 + 0.05 * front), Math.sin(el) * r * 1.02, Math.cos(el) * Math.sin(yaw) * r * 0.98);
};
/** Ouverture du visage et bord inférieur de la coque. */
const shellCovers = (yaw: number, el: number): boolean => {
  const a = Math.abs(yaw);
  // bord inférieur : bas sur les joues, plus haut à l'arrière (nuque)
  const bottom = a < 100 * deg ? -58 * deg : -58 * deg + ((a - 100 * deg) / (80 * deg)) * 24 * deg;
  if (el < bottom) return false;
  // ouverture : du sourcil au menton, élargie aux yeux
  const brow = 16 * deg - Math.max(0, a - 40 * deg) * 0.6;
  if (a < 58 * deg && el < brow) return false;
  return true;
};
function shellGeometry(nYaw = 90, nEl = 48, inflate = 0, test: (yaw: number, el: number) => boolean = shellCovers): THREE.BufferGeometry {
  const pos: number[] = [];
  const el0 = -70 * deg;
  const el1 = 90 * deg;
  const cell = (i: number, j: number) => [(-Math.PI + (i / nYaw) * Math.PI * 2), el0 + (j / nEl) * (el1 - el0)];
  for (let i = 0; i < nYaw; i++) {
    for (let j = 0; j < nEl; j++) {
      const [y0, e0] = cell(i, j);
      const [y1, e1] = cell(i + 1, j + 1);
      if (!test((y0 + y1) / 2, (e0 + e1) / 2)) continue;
      const p00 = shellPoint(y0, e0, inflate), p10 = shellPoint(y1, e0, inflate), p01 = shellPoint(y0, e1, inflate), p11 = shellPoint(y1, e1, inflate);
      pos.push(...p00.toArray(), ...p01.toArray(), ...p10.toArray(), ...p10.toArray(), ...p01.toArray(), ...p11.toArray());
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const merged = mergeVertices(g, 1e-5);
  merged.computeVertexNormals();
  return merged;
}
const tube = (pts: THREE.Vector3[], r: number, seg = 24) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 6, false);
const HELMET_GEO = (() => {
  const shell = shellGeometry();
  // bande centrale : fine tranche de la coque, du front à la nuque
  const stripe = shellGeometry(180, 48, 0.0016, (yaw, el) => {
    const a = Math.abs(yaw);
    const onTop = (a < 6 * deg || a > 174 * deg) && shellCovers(yaw, el) && el > (a < 90 * deg ? 18 * deg : -20 * deg);
    return onTop;
  });
  // grille : barres horizontales qui s'accrochent aux côtés de la coque, montants verticaux
  const bars: THREE.BufferGeometry[] = [];
  const arc = (y: number, front: number, side: number, span: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = -span + (k / 12) * span * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * front, y - (1 - Math.cos(t)) * 0.012, Math.sin(t) * side));
    }
    return pts;
  };
  bars.push(tube(arc(-0.035, 0.215, 0.158, 80 * deg), 0.0055));
  bars.push(tube(arc(-0.082, 0.21, 0.152, 74 * deg), 0.0055));
  bars.push(tube(arc(-0.128, 0.192, 0.14, 62 * deg), 0.0055));
  for (const t of [-24 * deg, 0, 24 * deg]) {
    const top = t === 0 ? 0.02 : -0.035;
    bars.push(tube([new THREE.Vector3(Math.cos(t) * 0.208, top, Math.sin(t) * 0.155), new THREE.Vector3(Math.cos(t) * 0.21, -0.082, Math.sin(t) * 0.152), new THREE.Vector3(Math.cos(t) * 0.192, -0.13, Math.sin(t) * 0.14)], 0.005, 8));
  }
  // attaches de la grille sur la coque (au niveau des tempes)
  for (const z of [-1, 1]) {
    const a = shellPoint(z * 62 * deg, 8 * deg, 0.002);
    const b2 = new THREE.Vector3(Math.cos(80 * deg) * 0.215, -0.035 - 0.0098, z * Math.sin(80 * deg) * 0.158);
    bars.push(tube([a, a.clone().lerp(b2, 0.5).add(new THREE.Vector3(0.005, 0, 0)), b2], 0.006, 6));
  }
  const mask = mergeGeometries(bars.map((b) => b.toNonIndexed()))!;
  // bourrelet le long de l'ouverture du visage et du bord inférieur (masque l'escalier de la découpe)
  const rimPts: THREE.Vector3[] = [];
  const brow = (yaw: number) => 16 * deg - Math.max(0, Math.abs(yaw) - 40 * deg) * 0.6;
  const yawEdge = 58 * deg;
  for (let k = 0; k <= 10; k++) rimPts.push(shellPoint(yawEdge, -58 * deg + (k / 10) * (brow(yawEdge) + 58 * deg), 0.001));
  for (let k = 1; k < 20; k++) { const y = yawEdge - (k / 20) * yawEdge * 2; rimPts.push(shellPoint(y, brow(y), 0.001)); }
  for (let k = 0; k <= 10; k++) rimPts.push(shellPoint(-yawEdge, brow(-yawEdge) - (k / 10) * (brow(-yawEdge) + 58 * deg), 0.001));
  const rim = tube(rimPts, 0.007, 80);
  const botPts: THREE.Vector3[] = [];
  for (let k = 0; k <= 40; k++) {
    const y = yawEdge + (k / 40) * (Math.PI * 2 - yawEdge * 2);
    const a = Math.abs(((y + Math.PI) % (Math.PI * 2)) - Math.PI);
    const bottom = a < 100 * deg ? -58 * deg : -58 * deg + ((a - 100 * deg) / (80 * deg)) * 24 * deg;
    botPts.push(shellPoint(y, bottom + 1.5 * deg, 0.001));
  }
  const bottomRim = tube(botPts, 0.006, 80);
  const rims = mergeGeometries([rim.toNonIndexed(), bottomRim.toNonIndexed()])!;
  // mentonnière (blanche) et trous d'oreille
  const chin = new THREE.SphereGeometry(0.04, 12, 8);
  chin.scale(0.8, 0.55, 1.15);
  chin.translate(0.15, -0.145, 0);
  const ear = new THREE.CylinderGeometry(0.02, 0.02, 0.012, 12);
  ear.rotateX(Math.PI / 2);
  return { shell, stripe, mask, chin, ear, rims };
})();

function buildHelmet(l: SkinnedLook): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(HELMET_GEO.shell, l.materials.get('role_helmet')!));
  g.add(new THREE.Mesh(HELMET_GEO.stripe, l.materials.get('helmet_stripe')!));
  g.add(new THREE.Mesh(HELMET_GEO.mask, l.materials.get('helmet_mask')!));
  g.add(new THREE.Mesh(HELMET_GEO.rims, l.materials.get('helmet_pad')!));
  g.add(new THREE.Mesh(HELMET_GEO.chin, l.materials.get('helmet_chin')!));
  for (const z of [-1, 1]) {
    const e = new THREE.Mesh(HELMET_GEO.ear, l.materials.get('helmet_pad')!);
    e.position.copy(shellPoint(z * 90 * deg, -10 * deg, 0.002));
    g.add(e);
  }
  return g;
}

/** Contour du pied vu de dessus (x : avant, y : latéral), talon à x = -heel, pointe à x = toe. */
function footShape(heel: number, toe: number, width: number): THREE.Shape {
  const sh = new THREE.Shape();
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const front = c > 0;
    const x = front ? c * toe : c * heel;
    // avant-pied plus large, talon arrondi plus étroit, pointe légèrement effilée
    const wz = width * (front ? 1 - 0.25 * Math.pow(c, 4) : 0.78 + 0.1 * (1 + c));
    const y = s * wz;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  return sh;
}

/**
 * Crampons construits par le jeu : tige vernie qui descend vers la pointe, semelle contrastée, crampons, bande
 * décorative aux couleurs du club (pas de logo). Origine au sol sous la cheville, avant = +X, haut = +Y.
 */
const cleatCache = new Map<string, { upper: THREE.BufferGeometry; sole: THREE.BufferGeometry; studs: THREE.BufferGeometry; accent: THREE.BufferGeometry }>();
function buildCleat(l: SkinnedLook, ankle: number, toeFwd: number): THREE.Group {
  const key = `${ankle.toFixed(3)}|${toeFwd.toFixed(3)}`;
  let geo = cleatCache.get(key);
  if (!geo) {
    const toe = toeFwd * 1.5;
    const heel = toeFwd * 0.5;
    const width = toeFwd * 0.38;
    const soleH = ankle * 0.16;
    const shape = footShape(heel, toe, width);
    const sole = new THREE.ExtrudeGeometry(shape, { depth: soleH, bevelEnabled: true, bevelThickness: soleH * 0.25, bevelSize: soleH * 0.25, bevelSegments: 2, curveSegments: 6 });
    sole.rotateX(-Math.PI / 2);
    // tige : contour un peu plus étroit, hauteur qui diminue vers la pointe, resserrée vers le haut
    const upperH = ankle * 1.12;
    const upper = new THREE.ExtrudeGeometry(footShape(heel * 0.96, toe * 0.97, width * 0.94), { depth: upperH, steps: 6, bevelEnabled: true, bevelThickness: upperH * 0.12, bevelSize: width * 0.18, bevelSegments: 3, curveSegments: 8 });
    upper.rotateX(-Math.PI / 2);
    const p = upper.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const u = Math.max(0, Math.min(1, y / upperH));
      // profil : col à la cheville, descente progressive jusqu'à la pointe
      const fx = Math.max(0, (x - heel * 0.2) / (toe - heel * 0.2));
      const hMax = 1 - 0.78 * Math.pow(fx, 0.6);
      const ny = y * hMax;
      // resserrement vers le haut (cou-de-pied) et autour de la cheville
      const pinch = 1 - 0.5 * Math.pow(u, 1.2) * (1 - 0.7 * fx);
      const cx = heel * -0.05;
      p.setXYZ(i, cx + (x - cx) * (1 - 0.32 * Math.pow(u, 1.3) * (1 - fx)), ny + soleH * 1.1, z * pinch);
    }
    upper.computeVertexNormals();
    // crampons sous la semelle
    const studs: THREE.BufferGeometry[] = [];
    const stud = new THREE.CylinderGeometry(width * 0.13, width * 0.18, soleH * 0.9, 8);
    for (const [fx, fz] of [[0.8, 0.45], [0.8, -0.45], [0.45, 0.6], [0.45, -0.6], [0.95, 0], [-0.55, 0.45], [-0.55, -0.45]]) {
      const g = stud.clone();
      g.translate(fx > 0 ? fx * toe * 0.85 : fx * heel * 1.2, -soleH * 0.4, fz * width * 0.85);
      studs.push(g.toNonIndexed());
    }
    // bande décorative : ruban oblique sur les deux côtés de la tige (du milieu du pied vers le talon)
    const strips: THREE.BufferGeometry[] = [];
    for (const zs of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(toe * 0.45, soleH * 1.6, zs * width * 0.98),
        new THREE.Vector3(toe * 0.1, upperH * 0.42, zs * width * 1.0),
        new THREE.Vector3(-heel * 0.5, upperH * 0.62, zs * width * 0.86),
      ]);
      strips.push(new THREE.TubeGeometry(curve, 16, width * 0.07, 5, false).toNonIndexed());
    }
    geo = { upper, sole, studs: mergeGeometries(studs)!, accent: mergeGeometries(strips)! };
    cleatCache.set(key, geo);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo.upper, l.materials.get('cleat_upper')!));
  g.add(new THREE.Mesh(geo.sole, l.materials.get('cleat_sole')!));
  g.add(new THREE.Mesh(geo.studs, l.materials.get('cleat_stud')!));
  g.add(new THREE.Mesh(geo.accent, l.materials.get('cleat_accent')!));
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
  readonly celeb: number;
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
    this.celeb = celebrationOf(player.id);
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
    // crampons sur les os des pieds (repère du jeu : avant = +X, haut = +Y)
    for (const side of ['Left', 'Right']) {
      const foot = this.bones[side + 'Foot'];
      if (!foot) continue;
      this.root.updateMatrixWorld(true);
      const holder = new THREE.Group();
      holder.quaternion.copy(foot.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.root.getWorldQuaternion(new THREE.Quaternion())));
      holder.scale.setScalar(1 / foot.getWorldScale(new THREE.Vector3()).x);
      foot.add(holder);
      holder.updateMatrixWorld(true);
      const ground = holder.worldToLocal(this.root.getWorldPosition(new THREE.Vector3())).y;
      const toe = findBone(this.model, side + 'ToeBase');
      const toeFwd = toe ? holder.worldToLocal(toe.getWorldPosition(new THREE.Vector3())).x : 0.12;
      const shoe = buildCleat(l, -ground, Math.max(0.08, toeFwd));
      shoe.position.y = ground;
      shoe.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = shadows)));
      holder.add(shoe);
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
      helmet.position.set(-0.008 * hs, 0.1 * hs, 0);
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
    const p = computePose(action, actionTime, speed, stride, lineman, hasBall, this.celeb);
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
    applyBodyMotion(this.body, this.downBlend, p);
    this.blob.scale.set(1 + this.downBlend * 1.3, 1, 1);
  }
}
