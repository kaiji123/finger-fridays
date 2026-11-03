import * as THREE from '@iwsdk/core';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

// A capsule running from point a to point b (arrays [x, y, z]): fingers, arms, legs.
const _up = new THREE.Vector3(0, 1, 0);
export function limb(a, b, r, mat, segs = 12) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(len, 0.0001), 6, segs), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, dir.normalize());
  m.castShadow = true;
  return m;
}

// Bake every static mesh under `root` into one mesh per material. The office shell is
// ~150 boxes and planes; merged it is a handful of draw calls, which matters on Quest.
const KEEP = ['position', 'normal', 'uv'];
// shallow: only direct children (sub-groups animate on their own); skip: meshes to leave alone.
export function mergeStatic(root, { shallow = false, skip = [] } = {}) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const meshes = [];
  const take = (o) => {
    if (o.isMesh && !o.isSprite && !Array.isArray(o.material) && !skip.includes(o)) meshes.push(o);
  };
  if (shallow) root.children.forEach(take);
  else root.traverse(take);
  const buckets = new Map();
  const toLocal = new THREE.Matrix4();
  for (const m of meshes) {
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mesh: m, geos: [] }));
    const g = m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
    g.clearGroups();
    g.applyMatrix4(toLocal.multiplyMatrices(inv, m.matrixWorld));
    b.geos.push(g);
  }
  for (const m of meshes) m.removeFromParent();
  for (const { mesh, geos } of buckets.values()) {
    const indexed = geos.every((g) => g.index);
    const merged = mergeGeometries(indexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    if (!merged) continue;
    const out = new THREE.Mesh(merged, mesh.material);
    out.castShadow = mesh.castShadow;
    out.receiveShadow = mesh.receiveShadow;
    out.renderOrder = mesh.renderOrder;
    root.add(out);
  }
}
