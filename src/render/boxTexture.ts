import * as THREE from 'three';
import type { Prize } from '../sim/catalog';

// Generic coloured prize boxes drawn on canvases — no product images.

const PX = 2600; // texture pixels per metre

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Rotates a canvas a quarter turn (landscape ↔ portrait). */
function quarter(src: HTMLCanvasElement) {
  const [c, ctx] = canvas(src.height, src.width);
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return c;
}

function gradient(ctx: CanvasRenderingContext2D, p: Prize, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, p.colors.bg);
  g.addColorStop(1, p.colors.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, maxW: number) {
  ctx.fillStyle = color;
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y, maxW);
}

function front(p: Prize) {
  const [c, ctx] = canvas(p.w * PX, p.h * PX);
  const w = c.width, h = c.height;
  gradient(ctx, p, w, h);
  // Scattered stars
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 14; i++) {
    star(ctx, (((i * 97) % 100) / 100) * w, (((i * 61) % 100) / 100) * h, w * 0.05);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Header band
  ctx.fillStyle = p.colors.accent;
  ctx.fillRect(0, 0, w, h * 0.09);
  label(ctx, 'PRIZE', w / 2, h * 0.047, h * 0.05, '#ffffff', w * 0.9);
  // Clear "window" panel with a big star
  const wx = w * 0.12, wy = h * 0.15, ww = w * 0.76, wh = h * 0.58;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.roundRect(wx, wy, ww, wh, w * 0.06);
  ctx.fill();
  ctx.strokeStyle = p.colors.accent;
  ctx.lineWidth = w * 0.015;
  ctx.stroke();
  ctx.fillStyle = p.colors.accent;
  star(ctx, w / 2, wy + wh * 0.5, Math.min(ww, wh) * 0.32);
  ctx.fill();
  // Title + size
  label(ctx, p.title.toUpperCase(), w / 2, h * 0.81, h * 0.045, p.colors.ink, w * 0.9);
  label(ctx, `SIZE ${p.size}`, w / 2, h * 0.88, h * 0.032, p.colors.ink, w * 0.9);
  ctx.fillStyle = p.colors.ink;
  ctx.fillRect(0, h * 0.94, w, h * 0.06);
  label(ctx, 'NOT FOR SALE · PRIZE ONLY', w / 2, h * 0.97, h * 0.022, '#ffffff', w * 0.92);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = w * 0.018;
  ctx.strokeRect(0, 0, w, h);
  return c;
}

function back(p: Prize) {
  const [c, ctx] = canvas(p.w * PX, p.h * PX);
  const w = c.width, h = c.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = p.colors.bg;
  ctx.fillRect(0, 0, w, h * 0.55);
  ctx.fillStyle = p.colors.accent;
  star(ctx, w / 2, h * 0.27, w * 0.25);
  ctx.fill();
  ctx.fillStyle = p.colors.ink;
  ctx.textAlign = 'left';
  ctx.font = `700 ${h * 0.03}px system-ui`;
  ctx.fillText(p.title, w * 0.08, h * 0.63);
  ctx.font = `400 ${h * 0.02}px system-ui`;
  [`Box ${Math.round(p.w * 100)} × ${Math.round(p.d * 100)} × ${Math.round(p.h * 100)} cm`, `${Math.round(p.mass * 1000)} g`, 'Ages 15+', 'Prize item — not for sale'].forEach((l, i) =>
    ctx.fillText(l, w * 0.08, h * (0.7 + i * 0.035)),
  );
  barcode(ctx, w * 0.55, h * 0.88, w * 0.38, h * 0.07);
  return c;
}

function barcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#111';
  let cx = x + w * 0.05;
  for (let i = 0; cx < x + w * 0.95; i++) {
    const bw = (((i * 7919) % 3) + 1) * w * 0.006;
    if (i % 2 === 0) ctx.fillRect(cx, y + h * 0.12, bw, h * 0.76);
    cx += bw;
  }
}

/** Long side panel (landscape: box height runs left→right). */
function side(p: Prize) {
  const [c, ctx] = canvas(p.h * PX, p.d * PX);
  const w = c.width, h = c.height;
  gradient(ctx, p, w, h);
  ctx.fillStyle = p.colors.accent;
  ctx.fillRect(w * 0.88, 0, w * 0.12, h);
  label(ctx, p.title.toUpperCase(), w * 0.44, h * 0.42, h * 0.2, p.colors.ink, w * 0.8);
  label(ctx, `SIZE ${p.size}`, w * 0.44, h * 0.68, h * 0.13, p.colors.ink, w * 0.8);
  return c;
}

/** Base end — caution sticker (faces the player on the rods). */
function baseEnd(p: Prize) {
  const [c, ctx] = canvas(p.w * PX, p.d * PX);
  const w = c.width, h = c.height;
  ctx.fillStyle = p.colors.bg;
  ctx.fillRect(0, 0, w, h);
  const sx = w * 0.08, sy = h * 0.15, sw = w * 0.84, sh = h * 0.7;
  ctx.fillStyle = '#fff';
  ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(sx, sy, sw, sh * 0.22);
  ctx.fillStyle = '#d0101e';
  ctx.font = `900 ${sh * 0.15}px system-ui`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚠ CAUTION', sx + sw * 0.04, sy + sh * 0.11);
  ctx.fillStyle = '#333';
  ctx.font = `500 ${sh * 0.085}px system-ui`;
  ['Small parts. Ages 15+.', 'Prize item — not for sale.'].forEach((l, i) => ctx.fillText(l, sx + sw * 0.04, sy + sh * (0.42 + i * 0.16), sw * 0.55));
  barcode(ctx, sx + sw * 0.64, sy + sh * 0.32, sw * 0.32, sh * 0.5);
  return c;
}

function topEnd(p: Prize) {
  const [c, ctx] = canvas(p.w * PX, p.d * PX);
  const w = c.width, h = c.height;
  ctx.fillStyle = p.colors.accent;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  star(ctx, w * 0.5, h * 0.42, h * 0.22);
  ctx.fill();
  label(ctx, `SIZE ${p.size}`, w / 2, h * 0.8, h * 0.13, '#ffffff', w * 0.9);
  return c;
}

export type BoxPose = 'lying' | 'standing';

const canvases = new Map<string, Record<string, HTMLCanvasElement>>();
const cache = new Map<string, THREE.Material[]>();

function faces(p: Prize) {
  let f = canvases.get(p.id);
  if (!f) {
    f = { front: front(p), back: back(p), side: side(p), base: baseEnd(p), top: topEnd(p) };
    canvases.set(p.id, f);
  }
  return f;
}

/**
 * Materials in BoxGeometry face order (+x, -x, +y, -y, +z, -z).
 * 'lying'    geometry is (W, D, H): front art faces up, box top toward -z, base end toward +z.
 * 'standing' geometry is (W, H, D): front art faces +z.
 */
export function prizeMaterials(p: Prize, pose: BoxPose): THREE.Material[] {
  const key = p.id + pose;
  let m = cache.get(key);
  if (m) return m;
  const f = faces(p);
  const mk = (c: HTMLCanvasElement) =>
    new THREE.MeshPhysicalMaterial({ map: tex(c), roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const fr = mk(f.front), bk = mk(f.back);
  if (pose === 'lying') {
    const sd = mk(f.side);
    m = [sd, sd, fr, bk, mk(f.base), mk(f.top)];
  } else {
    const sd = mk(quarter(f.side));
    m = [sd, sd, mk(f.top), mk(f.base), fr, bk];
  }
  cache.set(key, m);
  return m;
}

/** Portrait thumbnail used in the HUD's prize card and history. */
const thumbs = new Map<string, string>();
export function prizeThumb(p: Prize): string {
  let t = thumbs.get(p.id);
  if (!t) {
    t = faces(p).front.toDataURL('image/jpeg', 0.85);
    thumbs.set(p.id, t);
  }
  return t;
}
