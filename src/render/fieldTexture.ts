import * as THREE from 'three';
import { FIELD, GAME_NAME } from '../core/config';
import type { Team } from '../data/types';

/** Génère la texture du terrain : bandes de gazon, lignes, numéros, hash marks, en-buts. */
export function createFieldTexture(home: Team, quality: 'low' | 'medium' | 'high', maxAniso = 4): THREE.CanvasTexture {
  const pxPerYard = quality === 'high' ? 28 : quality === 'medium' ? 20 : 13;
  const marginYd = 4; // bordure de gazon autour du terrain
  const totalW = FIELD.length + marginYd * 2;
  const totalH = FIELD.width + marginYd * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(totalW * pxPerYard);
  canvas.height = Math.round(totalH * pxPerYard);
  const ctx = canvas.getContext('2d')!;
  const X = (yd: number) => (yd + marginYd) * pxPerYard;
  const Y = (yd: number) => (yd + marginYd) * pxPerYard;

  // gazon : bruit multi-échelle (touffes, irrégularités), bandes de tonte alternées, usure entre les hash marks
  paintGrass(ctx, canvas.width, canvas.height, pxPerYard, X, Y);
  // en-buts
  const ez = (x0: number, label: string, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(X(x0), Y(0), 10 * pxPerYard, FIELD.width * pxPerYard);
    ctx.save();
    ctx.translate(X(x0 + 5), Y(FIELD.width / 2));
    ctx.rotate(x0 < 60 ? -Math.PI / 2 : Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `900 ${Math.round(5.4 * pxPerYard)}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), 0, 0, FIELD.width * pxPerYard * 0.9);
    ctx.restore();
  };
  ez(0, home.name, home.colors.primary);
  ez(110, GAME_NAME, '#1a2433');

  const line = (x0: number, y0: number, x1: number, y1: number, w = 0.13) => {
    ctx.strokeStyle = 'rgba(244,244,236,0.9)';
    ctx.lineWidth = Math.max(1, w * pxPerYard);
    ctx.beginPath();
    ctx.moveTo(X(x0), Y(y0));
    ctx.lineTo(X(x1), Y(y1));
    ctx.stroke();
  };
  // lignes de touche et de fond
  ctx.strokeStyle = 'rgba(246,246,240,0.95)';
  ctx.lineWidth = 0.35 * pxPerYard;
  ctx.strokeRect(X(0), Y(0), FIELD.length * pxPerYard, FIELD.width * pxPerYard);
  // lignes de but (plus épaisses)
  line(10, 0, 10, FIELD.width, 0.3);
  line(110, 0, 110, FIELD.width, 0.3);
  // lignes tous les 5 yards
  for (let yd = 15; yd <= 105; yd += 5) line(yd, 0, yd, FIELD.width, 0.13);
  // hash marks tous les yards
  const hashTop = FIELD.width / 2 - FIELD.hashOffset;
  const hashBot = FIELD.width / 2 + FIELD.hashOffset;
  for (let yd = 11; yd < 110; yd++) {
    if (yd % 5 === 0) continue;
    line(yd, 0.2, yd, 0.9, 0.1);
    line(yd, FIELD.width - 0.9, yd, FIELD.width - 0.2, 0.1);
    line(yd, hashTop - 0.35, yd, hashTop + 0.35, 0.1);
    line(yd, hashBot - 0.35, yd, hashBot + 0.35, 0.1);
  }
  // marques des conversions à 2 points
  line(12, FIELD.width / 2 - 0.5, 12, FIELD.width / 2 + 0.5, 0.12);
  line(108, FIELD.width / 2 - 0.5, 108, FIELD.width / 2 + 0.5, 0.12);
  // numéros
  ctx.fillStyle = '#f4f4f0';
  ctx.font = `700 ${Math.round(2.0 * pxPerYard)}px "Arial Narrow", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let yd = 20; yd <= 100; yd += 10) {
    const label = String(yd <= 60 ? yd - 10 : 110 - yd);
    for (const [yy, rot] of [[FIELD.width - 9, 0], [9, Math.PI]] as [number, number][]) {
      ctx.save();
      ctx.translate(X(yd), Y(yy));
      ctx.rotate(rot);
      ctx.fillText(label.split('').join(' '), 0, 0);
      ctx.restore();
    }
  }
  // logo central
  ctx.save();
  ctx.translate(X(60), Y(FIELD.width / 2));
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = home.colors.primary;
  ctx.beginPath();
  ctx.arc(0, 0, 4.2 * pxPerYard, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.4 * pxPerYard;
  ctx.strokeStyle = home.colors.secondary;
  ctx.stroke();
  ctx.fillStyle = home.colors.secondary;
  ctx.font = `900 ${Math.round(4.6 * pxPerYard)}px "Arial Black", Arial, sans-serif`;
  ctx.fillText(home.logo.glyph, 0, pxPerYard * 0.3);
  ctx.restore();

  // la peinture laisse voir le gazon : léger grain par-dessus les lignes et les zones peintes
  grainOverlay(ctx, canvas.width, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export const FIELD_MARGIN = 4;

/** Bruit de valeur lissé (déterministe) pour le gazon. */
function valueNoise(w: number, h: number, cell: number, seed: number): Float32Array {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh);
  let st = seed >>> 0 || 1;
  for (let i = 0; i < grid.length; i++) {
    st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
    grid[i] = st / 4294967296;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < w; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const sx = fx * fx * (3 - 2 * fx);
      const a = grid[y0 * gw + x0];
      const b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0];
      const d = grid[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

function paintGrass(ctx: CanvasRenderingContext2D, w: number, h: number, ppy: number, X: (yd: number) => number, Y: (yd: number) => number): void {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const big = valueNoise(w, h, Math.max(8, ppy * 6), 11);
  const mid = valueNoise(w, h, Math.max(3, ppy * 1.2), 23);
  const fieldX0 = X(0);
  const fieldX1 = X(120);
  const fieldY0 = Y(0);
  const fieldY1 = Y(53.3);
  const hashA = Y(53.3 / 2 - 3.1);
  const hashB = Y(53.3 / 2 + 3.1);
  let st = 7;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      st = (Math.imul(st, 1103515245) + 12345) >>> 0;
      const fine = (st >>> 8) / 16777216;
      // bande de tonte (5 yards) : clair / foncé
      const inField = x >= fieldX0 && x < fieldX1 && y >= fieldY0 && y < fieldY1;
      const band = inField ? (Math.floor((x - fieldX0) / (5 * ppy)) % 2 === 0 ? 1 : -1) : 0;
      // usure : zone centrale entre les hash marks, plus marquée près du milieu du terrain
      const midField = 1 - Math.min(1, Math.abs(x - (fieldX0 + fieldX1) / 2) / ((fieldX1 - fieldX0) * 0.42));
      const wear = inField && y > hashA && y < hashB ? Math.max(0, big[i] - 0.45) * 0.9 * (0.35 + midField * 0.65) : 0;
      const v = (big[i] - 0.5) * 0.16 + (mid[i] - 0.5) * 0.12 + (fine - 0.5) * 0.12 + band * 0.05;
      let r = 44 + v * 90;
      let g = 92 + v * 130;
      let b = 42 + v * 60;
      // usure : vers un vert-jaune terne et terre
      r += wear * 70;
      g += wear * 18;
      b += wear * 20;
      d[i * 4] = Math.max(0, Math.min(255, r));
      d[i * 4 + 1] = Math.max(0, Math.min(255, g));
      d[i * 4 + 2] = Math.max(0, Math.min(255, b));
      d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Grain léger appliqué à toute la texture (peinture et gazon mêlés). */
function grainOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const n = Math.round((w * h) / 30);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(10,40,10,0.10)' : 'rgba(255,255,255,0.035)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

/** Carte de normales du gazon (brins), répétée sur le terrain pour le relief fin sous la lumière. */
export function createGrassNormalMap(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const hgt = valueNoise(size, size, 3, 91);
  const fine = valueNoise(size, size, 1.3, 57);
  const H = (x: number, y: number) => {
    const xx = (x + size) % size;
    const yy = (y + size) % size;
    return hgt[yy * size + xx] * 0.6 + fine[yy * size + xx] * 0.4;
  };
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 3.2;
      const dy = (H(x, y + 1) - H(x, y - 1)) * 3.2;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  return t;
}
