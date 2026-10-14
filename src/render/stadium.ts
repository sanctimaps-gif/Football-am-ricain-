import * as THREE from 'three';
import { FIELD } from '../core/config';
import type { Team } from '../data/types';
import { createFieldTexture, FIELD_MARGIN } from './fieldTexture';

export interface StadiumParts {
  group: THREE.Group;
  crowd: THREE.InstancedMesh;
  crowdBase: Float32Array; // y de base de chaque spectateur
  crowdCount: number;
  dispose(): void;
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
  const fieldMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  const field = new THREE.Mesh(fieldGeo, fieldMat);
  field.rotation.x = -Math.PI / 2;
  field.receiveShadow = true;
  group.add(field);
  // abords (piste) autour du terrain
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(190, 120), new THREE.MeshStandardMaterial({ color: '#24502a', roughness: 1 }));
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
  const standMat = new THREE.MeshStandardMaterial({ color: '#2a2f36', roughness: 0.9 });
  const standAccent = new THREE.MeshStandardMaterial({ color: home.stadium.standColor, roughness: 0.8 });
  const tiers = 12;
  const tierDepth = 1.6;
  const tierRise = 0.95;
  const seatSpacing = quality === 'high' ? 1.0 : quality === 'medium' ? 1.35 : 1.9;
  const crowdPositions: number[] = [];
  const addStand = (cx: number, cz: number, length: number, rotY: number, startDist: number) => {
    const sg = new THREE.Group();
    for (let t = 0; t < tiers; t++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(length, tierRise * (t + 1), tierDepth), t % 4 === 3 ? standAccent : standMat);
      step.position.set(0, (tierRise * (t + 1)) / 2, startDist + t * tierDepth);
      step.receiveShadow = quality === 'high';
      sg.add(step);
      for (let sx = -length / 2 + 0.6; sx < length / 2 - 0.6; sx += seatSpacing) {
        if (Math.random() < 0.12) continue; // sièges vides
        crowdPositions.push(sx + (Math.random() - 0.5) * 0.2, tierRise * (t + 1) + 0.45, startDist + t * tierDepth - 0.2, cx, cz, rotY);
      }
    }
    // mur avant (panneaux publicitaires)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 1.4, 0.3), new THREE.MeshStandardMaterial({ color: home.colors.primary, emissive: home.colors.primary, emissiveIntensity: 0.25 }));
    wall.position.set(0, 0.7, startDist - 1);
    sg.add(wall);
    sg.position.set(cx, 0, cz);
    sg.rotation.y = rotY;
    group.add(sg);
  };
  addStand(0, 0, 150, 0, FIELD.width / 2 + 13); // côté +z (derrière les bancs)
  addStand(0, 0, 150, Math.PI, FIELD.width / 2 + 13); // côté -z
  addStand(0, 0, 70, Math.PI / 2, FIELD.length / 2 + 14);
  addStand(0, 0, 70, -Math.PI / 2, FIELD.length / 2 + 14);

  const crowdCount = crowdPositions.length / 6;
  const personGeo = new THREE.BoxGeometry(0.55, 0.9, 0.35);
  const crowdMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const crowd = new THREE.InstancedMesh(personGeo, crowdMat, crowdCount);
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
    color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
    crowd.setColorAt(i, color);
  }
  crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(crowd);

  // Pylônes d'éclairage
  const towerMat = new THREE.MeshStandardMaterial({ color: '#3d434c', metalness: 0.5, roughness: 0.5 });
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fffbe6' });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 34, 8), towerMat);
      pole.position.set(sx * 68, 17, sz * 50);
      group.add(pole);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.6), lampMat);
      panel.position.set(sx * 68, 35, sz * 50);
      panel.lookAt(0, 0, 0);
      group.add(panel);
    }
  }
  // Écran géant
  const screen = new THREE.Mesh(new THREE.BoxGeometry(24, 10, 0.8), new THREE.MeshStandardMaterial({ color: '#0d1117', emissive: '#16304f', emissiveIntensity: 0.6 }));
  screen.position.set(FIELD.length / 2 + 38, 24, 0);
  screen.rotation.y = -Math.PI / 2;
  group.add(screen);

  return {
    group,
    crowd,
    crowdBase,
    crowdCount,
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      disposables.forEach((d) => d.dispose());
    },
  };
}

/** Ciel en dégradé (sphère inversée). */
export function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const top = new THREE.Color('#0b1a33');
  const bottom = new THREE.Color('#3b5a86');
  const colors: number[] = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 400;
    const c = bottom.clone().lerp(top, Math.max(0, Math.min(1, y * 1.6 + 0.1)));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
}
