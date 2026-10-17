import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIELD, GAME_NAME } from '../core/config';
import type { Team } from '../data/types';
import { glowTexture } from './effects';
import { createFieldTexture, createGrassNormalMap, FIELD_MARGIN } from './fieldTexture';

export interface StadiumParts {
  group: THREE.Group;
  crowd: THREE.InstancedMesh;
  /** Têtes des spectateurs (suivent les sauts du corps). */
  heads: THREE.InstancedMesh;
  crowdBase: Float32Array; // y de base de chaque spectateur
  crowdCount: number;
  /** Animation des panneaux LED (défilement). */
  tick(dt: number): void;
  /** Met à jour l'écran géant (score, chrono). */
  updateScreen(text: { home: string; away: string; score: [number, number]; info: string }): void;
  dispose(): void;
}

/** Texture des panneaux LED : messages défilants aux couleurs du club. */
function ledTexture(home: Team, away: Team): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 64;
  const g = c.getContext('2d')!;
  const msgs = [
    { t: GAME_NAME.toUpperCase(), bg: '#0b1530', fg: '#c8ff3d' },
    { t: home.city.toUpperCase(), bg: home.colors.primary, fg: '#ffffff' },
    { t: 'ACADÉMIE TACTIQUE', bg: '#101010', fg: '#33e1ff' },
    { t: away.city.toUpperCase(), bg: away.colors.primary, fg: '#ffffff' },
  ];
  const w = c.width / msgs.length;
  msgs.forEach((m, i) => {
    g.fillStyle = m.bg;
    g.fillRect(i * w, 0, w, 64);
    g.fillStyle = m.fg;
    g.font = '900 40px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(m.t, i * w + w / 2, 34, w - 20);
  });
  // trame de pixels LED
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < 64; y += 3) g.fillRect(0, y, c.width, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Texture de rangées de sièges (gradins). */
function seatTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#20242a';
  g.fillRect(0, 0, 64, 64);
  const base = new THREE.Color(color);
  for (let i = 0; i < 4; i++) {
    const col = base.clone().offsetHSL(0, 0, (i % 2 ? -0.05 : 0.04));
    g.fillStyle = `#${col.getHexString()}`;
    g.fillRect(i * 16 + 2, 6, 12, 30); // dossier
    g.fillStyle = `#${col.clone().offsetHSL(0, 0, -0.12).getHexString()}`;
    g.fillRect(i * 16 + 2, 36, 12, 10); // assise
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Conversion repère simulation (yards) → monde three.js. */
export const toScene = (x: number, y: number): [number, number] => [x - FIELD.length / 2, y - FIELD.width / 2];

function goalPost(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#f2d21b', roughness: 0.45, metalness: 0.3 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.3, 10), mat);
  base.position.set(0.6, 1.65, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 8), mat);
  neck.rotation.z = Math.PI / 2;
  neck.position.set(0.15, 3.3, 0);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, FIELD.postHalfWidth * 2, 8), mat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(-0.3, FIELD.crossbarHeight, 0);
  g.add(base, neck, bar);
  for (const s of [-1, 1]) {
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 9, 8), mat);
    up.position.set(-0.3, FIELD.crossbarHeight + 4.5, s * FIELD.postHalfWidth);
    g.add(up);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.2), new THREE.MeshBasicMaterial({ color: '#ff5a1f', side: THREE.DoubleSide }));
    flag.position.set(-0.3, FIELD.crossbarHeight + 8.6, s * FIELD.postHalfWidth + 0.15);
    g.add(flag);
  }
  // protection au pied du poteau
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 10), new THREE.MeshStandardMaterial({ color: '#1d3557' }));
  pad.position.set(0.6, 0.9, 0);
  g.add(pad);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export function buildStadium(home: Team, away: Team, quality: 'low' | 'medium' | 'high', maxAniso: number): StadiumParts {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  // Terrain
  const tex = createFieldTexture(home, quality, maxAniso);
  disposables.push(tex);
  const fieldGeo = new THREE.PlaneGeometry(FIELD.length + FIELD_MARGIN * 2, FIELD.width + FIELD_MARGIN * 2);
  const fieldMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 });
  if (quality !== 'low') {
    // relief des brins d'herbe (répété) : la lumière rasante des projecteurs fait vivre la pelouse
    const normal = createGrassNormalMap(quality === 'high' ? 256 : 128);
    normal.repeat.set((FIELD.length + FIELD_MARGIN * 2) / 2.5, (FIELD.width + FIELD_MARGIN * 2) / 2.5);
    normal.anisotropy = maxAniso;
    fieldMat.normalMap = normal;
    fieldMat.normalScale.set(0.3, 0.3);
    disposables.push(normal);
  }
  const field = new THREE.Mesh(fieldGeo, fieldMat);
  field.rotation.x = -Math.PI / 2;
  field.receiveShadow = true;
  group.add(field);
  // abords (piste) autour du terrain
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(190, 120), new THREE.MeshStandardMaterial({ color: '#2b4f2a', roughness: 1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  group.add(apron);
  // poteaux
  for (const side of [-1, 1]) {
    const gp = goalPost();
    gp.position.set(side * (FIELD.length / 2), 0, 0);
    if (side < 0) gp.rotation.y = Math.PI;
    group.add(gp);
  }
  // pylônes orange aux coins des en-buts
  const pylonMat = new THREE.MeshStandardMaterial({ color: '#ff6b1a', roughness: 0.6 });
  const pylonGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
  for (const x of [10, 110, 0, 120]) {
    for (const y of [0, FIELD.width]) {
      const p = new THREE.Mesh(pylonGeo, pylonMat);
      const [sx, sz] = toScene(x, y);
      p.position.set(sx, 0.25, sz);
      group.add(p);
    }
  }
  // Bancs des équipes et zones techniques
  const benchMat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  for (const [team, x] of [[home, -12], [away, 12]] as [Team, number][]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 0.8), benchMat(team.colors.primary));
    bench.position.set(x, 0.25, FIELD.width / 2 + 7.5);
    bench.castShadow = true;
    group.add(bench);
    const back = new THREE.Mesh(new THREE.BoxGeometry(18, 1.0, 0.15), benchMat(team.colors.secondary));
    back.position.set(x, 0.8, FIELD.width / 2 + 8);
    group.add(back);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(18, 0.1, 2), benchMat('#20262e'));
    canopy.position.set(x, 2.2, FIELD.width / 2 + 7.8);
    group.add(canopy);
  }
  // Tunnel d'entrée des joueurs
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), benchMat('#1b1f24'));
  tunnel.position.set(-FIELD.length / 2 - 10, 2, 0);
  group.add(tunnel);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ color: '#05070a' }));
  mouth.position.set(-FIELD.length / 2 - 5.98, 1.5, 0);
  mouth.rotation.y = Math.PI / 2;
  group.add(mouth);

  // Tribunes (gradins en escalier) + foule instanciée
  const seatColor = home.stadium.standColor || home.colors.primary;
  const seatsTex = seatTexture(seatColor);
  disposables.push(seatsTex);
  const standMats = new Map<number, THREE.MeshStandardMaterial>();
  /** Matériau de gradin (sièges répétés selon la longueur de la tribune). */
  const standMat = (length: number) => {
    let m = standMats.get(length);
    if (!m) {
      const tx = seatsTex.clone();
      tx.repeat.set(length / 2.2, 1);
      tx.needsUpdate = true;
      disposables.push(tx);
      m = new THREE.MeshStandardMaterial({ map: quality === 'low' ? null : tx, color: quality === 'low' ? '#2a2f36' : '#ffffff', roughness: 0.85 });
      standMats.set(length, m);
    }
    return m;
  };
  const standAccent = new THREE.MeshStandardMaterial({ color: '#1b1f25', roughness: 0.8 });
  const led = ledTexture(home, away);
  disposables.push(led);
  const ledMats = new Map<number, THREE.MeshBasicMaterial>();
  const ledMat = (length: number) => {
    let m = ledMats.get(length);
    if (!m) {
      const tx = led.clone();
      tx.repeat.set(length / 40, 1);
      tx.needsUpdate = true;
      m = new THREE.MeshBasicMaterial({ map: tx, color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: true });
      ledMats.set(length, m);
    }
    return m;
  };
  const tiers = 12;
  const tierDepth = 1.6;
  const tierRise = 0.95;
  const seatSpacing = quality === 'high' ? 1.0 : quality === 'medium' ? 1.35 : 1.9;
  const crowdPositions: number[] = [];
  const addStand = (cx: number, cz: number, length: number, rotY: number, startDist: number) => {
    const sg = new THREE.Group();
    for (let t = 0; t < tiers; t++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(length, tierRise * (t + 1), tierDepth), t % 6 === 5 ? standAccent : standMat(length));
      step.position.set(0, (tierRise * (t + 1)) / 2, startDist + t * tierDepth);
      step.receiveShadow = quality === 'high';
      sg.add(step);
      for (let sx = -length / 2 + 0.6; sx < length / 2 - 0.6; sx += seatSpacing) {
        if (Math.random() < 0.12) continue; // sièges vides
        crowdPositions.push(sx + (Math.random() - 0.5) * 0.2, tierRise * (t + 1) + 0.45, startDist + t * tierDepth - 0.2, cx, cz, rotY);
      }
    }
    // panneaux LED défilants au pied de la tribune
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 1.1, 0.3), [standAccent, standAccent, standAccent, standAccent, ledMat(length), standAccent]);
    wall.rotation.y = Math.PI;
    wall.position.set(0, 0.55, startDist - 1);
    sg.add(wall);
    // toit en porte-à-faux avec rampe lumineuse (qualités moyenne et haute)
    if (quality !== 'low') {
      const depth = tiers * tierDepth + 3;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.35, depth * 0.62), new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.5, metalness: 0.4 }));
      roof.position.set(0, tierRise * tiers + 6.5, startDist + depth * 0.62);
      roof.rotation.x = -0.12;
      sg.add(roof);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.15, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.8, 3.4) }));
      strip.position.set(0, tierRise * tiers + 6.1, startDist + depth * 0.33);
      sg.add(strip);
      const back = new THREE.Mesh(new THREE.BoxGeometry(length + 2, tierRise * tiers + 6.5, 0.4), standAccent);
      back.position.set(0, (tierRise * tiers + 6.5) / 2, startDist + tiers * tierDepth + 0.3);
      sg.add(back);
    }
    sg.position.set(cx, 0, cz);
    sg.rotation.y = rotY;
    group.add(sg);
  };
  addStand(0, 0, 150, 0, FIELD.width / 2 + 13); // côté +z (derrière les bancs)
  addStand(0, 0, 150, Math.PI, FIELD.width / 2 + 13); // côté -z
  addStand(0, 0, 70, Math.PI / 2, FIELD.length / 2 + 14);
  addStand(0, 0, 70, -Math.PI / 2, FIELD.length / 2 + 14);

  const crowdCount = crowdPositions.length / 6;
  // silhouette : buste arrondi + épaules (plus naturel qu'une boîte), tête lisse
  const seg = quality === 'high' ? 8 : 6;
  const torso = new THREE.CylinderGeometry(0.2, 0.25, 0.72, seg);
  torso.translate(0, -0.06, 0);
  const shoulders = new THREE.SphereGeometry(0.26, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  shoulders.scale(1, 0.45, 0.75);
  shoulders.translate(0, 0.3, 0);
  const personGeo = mergeGeometries([torso.toNonIndexed(), shoulders.toNonIndexed()])!;
  personGeo.scale(1, 1, 0.8);
  const crowdMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const crowd = new THREE.InstancedMesh(personGeo, crowdMat, crowdCount);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, quality === 'high' ? 10 : 7, quality === 'high' ? 8 : 5), new THREE.MeshLambertMaterial({ color: '#ffffff' }), crowdCount);
  const skins = ['#f1d3bc', '#e0b291', '#c68e68', '#9c6644', '#6f4529'];
  const crowdBase = new Float32Array(crowdCount * 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const color = new THREE.Color();
  const palette = [home.colors.primary, home.colors.secondary, away.colors.primary, '#d8d8d8', '#3b3b3b', '#7b5b3a', home.colors.primary, '#a83232'];
  for (let i = 0; i < crowdCount; i++) {
    const [lx, ly, lz, cx, cz, rot] = crowdPositions.slice(i * 6, i * 6 + 6);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const wx = cx + lx * cos + lz * sin;
    const wz = cz - lx * sin + lz * cos;
    v.set(wx, ly, wz);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    m.compose(v, q, s);
    crowd.setMatrixAt(i, m);
    crowdBase[i * 3] = wx;
    crowdBase[i * 3 + 1] = ly;
    crowdBase[i * 3 + 2] = wz;
    color.set(palette[Math.floor(Math.random() * palette.length)]);
    // tons de vêtements plus naturels (moins saturés, un peu plus sombres)
    color.offsetHSL(0, -0.18, -0.06 + (Math.random() - 0.5) * 0.16);
    crowd.setColorAt(i, color);
    v.set(wx, ly + 0.62, wz);
    m.compose(v, q, s);
    heads.setMatrixAt(i, m);
    color.set(skins[Math.floor(Math.random() * skins.length)]);
    heads.setColorAt(i, color);
  }
  crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(crowd, heads);

  // Pylônes d'éclairage
  const towerMat = new THREE.MeshStandardMaterial({ color: '#3d434c', metalness: 0.5, roughness: 0.5 });
  // panneaux de projecteurs très lumineux (HDR) : ils déclenchent le halo du post-traitement
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.7, 5), fog: false });
  const glowTex = glowTexture();
  disposables.push(glowTex);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#fff3d6', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 34, 8), towerMat);
      pole.position.set(sx * 68, 17, sz * 50);
      group.add(pole);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.6), lampMat);
      panel.position.set(sx * 68, 35, sz * 50);
      panel.lookAt(0, 0, 0);
      group.add(panel);
      const glow = new THREE.Sprite(glowMat);
      glow.position.set(sx * 66, 35, sz * 48.5);
      glow.scale.set(26, 26, 1);
      group.add(glow);
    }
  }
  // Écran géant (score en direct)
  const sc = document.createElement('canvas');
  sc.width = 512;
  sc.height = 220;
  const sctx = sc.getContext('2d')!;
  const screenTex = new THREE.CanvasTexture(sc);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  disposables.push(screenTex);
  const frame = new THREE.MeshStandardMaterial({ color: '#0d1117', roughness: 0.6 });
  const screenFace = new THREE.MeshBasicMaterial({ map: screenTex, color: new THREE.Color(1.4, 1.4, 1.4) });
  const screen = new THREE.Mesh(new THREE.BoxGeometry(24, 10, 0.8), [frame, frame, frame, frame, screenFace, frame]);
  screen.position.set(FIELD.length / 2 + 38, 24, 0);
  screen.rotation.y = -Math.PI / 2;
  group.add(screen);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(1, 19, 1), towerMat);
  legs.position.set(FIELD.length / 2 + 38.5, 9.5, 0);
  group.add(legs);
  let lastScreen = '';
  const updateScreen = (x: { home: string; away: string; score: [number, number]; info: string }) => {
    const key = `${x.home}|${x.away}|${x.score.join()}|${x.info}`;
    if (key === lastScreen) return;
    lastScreen = key;
    const g = sctx;
    g.fillStyle = '#05080f';
    g.fillRect(0, 0, 512, 220);
    g.fillStyle = home.colors.primary;
    g.fillRect(0, 0, 256, 18);
    g.fillStyle = away.colors.primary;
    g.fillRect(256, 0, 256, 18);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = '900 46px "Arial Narrow", Arial, sans-serif';
    g.fillText(x.home, 128, 62);
    g.fillText(x.away, 384, 62);
    g.font = '900 96px "Arial Narrow", Arial, sans-serif';
    g.fillText(String(x.score[0]), 128, 140);
    g.fillText(String(x.score[1]), 384, 140);
    g.fillStyle = '#c8ff3d';
    g.font = '700 30px "Arial Narrow", Arial, sans-serif';
    g.fillText(x.info, 256, 198);
    screenTex.needsUpdate = true;
  };
  updateScreen({ home: home.abbr, away: away.abbr, score: [0, 0], info: GAME_NAME.toUpperCase() });

  return {
    group,
    crowd,
    heads,
    crowdBase,
    crowdCount,
    tick(dt: number) {
      ledMats.forEach((m) => {
        if (m.map) m.map.offset.x = (m.map.offset.x + dt * 0.04) % 1;
      });
    },
    updateScreen,
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      disposables.forEach((d) => d.dispose());
      ledMats.forEach((m) => m.map?.dispose());
    },
  };
}

/** Ciel de nuit : dégradé, halo des projecteurs au-dessus du stade, étoiles. */
export function buildSky(quality: 'low' | 'medium' | 'high' = 'medium'): THREE.Group {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = max(vP.y, 0.0);
        vec3 top = vec3(0.01, 0.02, 0.055);
        vec3 mid = vec3(0.04, 0.075, 0.16);
        vec3 glow = vec3(0.26, 0.28, 0.34);
        vec3 c = mix(mid, top, smoothstep(0.05, 0.5, h));
        // halo diffus de l'éclairage du stade près de l'horizon
        c += glow * exp(-h * 12.0) * 0.3;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  g.add(dome);
  if (quality !== 'low') {
    const n = quality === 'high' ? 900 : 450;
    const pos = new Float32Array(n * 3);
    let st = 99;
    const rnd = () => ((st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      const az = rnd() * Math.PI * 2;
      const el = 0.18 + rnd() * 1.3;
      pos[i * 3] = Math.cos(az) * Math.cos(el) * 380;
      pos[i * 3 + 1] = Math.sin(el) * 380;
      pos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * 380;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#cfd8ff', size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7, depthWrite: false })));
  }
  return g;
}
