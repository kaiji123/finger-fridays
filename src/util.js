import * as THREE from 'three';

export const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace";
export const SANS = "'Space Grotesk', system-ui, sans-serif";

export function canvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx, tex };
}

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

export function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
}

export function box(w, h, d, mat, { x = 0, y = 0, z = 0, shadow = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// Word-wrap text into lines of at most maxChars characters (for monospace layouts).
// Returns [{ start, text }] so callers can map each character back to its index.
export function wrapMono(text, maxChars) {
  const lines = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > start) end = space + 1;
    }
    lines.push({ start, text: text.slice(start, end) });
    start = end;
  }
  return lines;
}
