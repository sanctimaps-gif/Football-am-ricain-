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

  // gazon de base
  ctx.fillStyle = '#2f6b2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // bandes tondues tous les 5 yards
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#3a7d32' : '#33722c';
    ctx.fillRect(X(i * 5), Y(0), 5 * pxPerYard, FIELD.width * pxPerYard);
  }
  // bruit (texture de gazon)
  const speckles = Math.round((canvas.width * canvas.height) / 90);
  for (let i = 0; i < speckles; i++) {
    const v = Math.random();
    ctx.fillStyle = v < 0.5 ? 'rgba(20,60,20,0.18)' : 'rgba(120,170,90,0.12)';
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
  }
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
    ctx.strokeStyle = '#f4f4f0';
    ctx.lineWidth = Math.max(1, w * pxPerYard);
    ctx.beginPath();
    ctx.moveTo(X(x0), Y(y0));
    ctx.lineTo(X(x1), Y(y1));
    ctx.stroke();
  };
  // lignes de touche et de fond
  ctx.strokeStyle = '#f4f4f0';
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

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export const FIELD_MARGIN = 4;
