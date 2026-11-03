import * as THREE from '@iwsdk/core';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, SANS, MONO, std, damp } from '../util.js';

// A big, forgiving desk keyboard. Keys are 4.2cm wide (a real keyboard is ~1.8cm).
// Modelled on a retro mechanical board (reference: Keychron K8 retro, Das Keyboard):
// tapered keycaps with dished tops, sculpted rows, cream letters with grey modifiers and
// one red accent key, small clean legends, all sitting in a rounded aluminium case.
const U = 0.046; // key pitch (one "unit")
const GAP = 0.004;
const KEY_H = 0.016;
const PLATE_H = 0.016; // top of the plate the keys sit on
const RIM = 0.014;
export const KEY_TOP = PLATE_H + KEY_H;

// Rows from back (z < 0) to front. Each entry: [slot, width in units, style].
// Single characters type; named keys (tab, shift...) are decorative and just click.
const ROWS = [
  { z: -0.069, lift: 0.004, tilt: 0.1, keys: [['tab', 1.5, 'mod'], ...'qwertyuiop', ['\b', 2.5, 'accent']] },
  { z: -0.023, lift: 0.002, tilt: 0.05, keys: [['caps', 1.75, 'mod'], ...'asdfghjkl', ['enter', 3.25, 'mod']] },
  { z: 0.023, lift: 0, tilt: 0, keys: [['shift', 2.25, 'mod'], ...'zxcvbnm,.?', ['shift', 1.75, 'mod']] },
  { z: 0.069, lift: 0, tilt: -0.06, keys: [['ctrl', 1.75, 'mod'], ['alt', 1.5, 'mod'], [' ', 7.5], ['alt', 1.5, 'mod'], ['ctrl', 1.75, 'mod']] },
];
const WIDTH_U = 14;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const GUIDE = '#ffd166'; // the key the tutorial wants next
const STYLES = {
  alpha: { base: '#f1ece2', ink: '#2a2c31', side: 0xe0d9cc },
  mod: { base: '#bdb9b0', ink: '#2a2c31', side: 0xa8a49b },
  accent: { base: '#d6524a', ink: '#fff6ee', side: 0xbc443d },
};

function drawLabel(key, highlight = null) {
  const { ctx, canvas, tex } = key.label;
  const { width: w, height: h } = canvas;
  ctx.fillStyle = highlight || (key.guide ? GUIDE : key.base);
  ctx.fillRect(0, 0, w, h);
  // dished top: a little darker toward the middle
  const g = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = key.ink;
  ctx.textBaseline = 'middle';
  if (key.char === ' ') {
    // plain spacebar with a small grip line, like the reference
    ctx.fillStyle = 'rgba(42,44,49,0.35)';
    ctx.fillRect(w / 2 - 34, h * 0.5 - 2, 68, 4);
  } else if (key.char === '\b') {
    ctx.textAlign = 'left';
    ctx.font = `700 48px ${SANS}`;
    ctx.fillText('⌫ back', 18, h * 0.42);
  } else if (key.dead) {
    ctx.textAlign = 'left';
    ctx.font = `600 38px ${SANS}`;
    ctx.fillText(key.char, 16, h * 0.36);
  } else {
    ctx.textAlign = 'center';
    ctx.font = `700 80px ${SANS}`;
    ctx.fillText(key.char.toUpperCase(), w / 2, h * 0.47);
    // homing bars
    if (key.slot === 'f' || key.slot === 'j') {
      ctx.fillStyle = 'rgba(42,44,49,0.45)';
      ctx.fillRect(w / 2 - 16, h * 0.86, 32, 6);
    }
  }
  tex.needsUpdate = true;
}

// ---- keycap shape ----

// Points around a rounded rectangle, counter-clockwise seen from above.
function ring(hw, hd, r, cx, cz, y, seg = 4) {
  const pts = [];
  const corners = [[hw - r, -hd + r, -Math.PI / 2], [hw - r, hd - r, 0], [-hw + r, hd - r, Math.PI / 2], [-hw + r, -hd + r, Math.PI]];
  for (const [ox, oz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + ox + Math.cos(a) * r, y, cz + oz + Math.sin(a) * r]);
    }
  }
  return pts.reverse();
}

function buildGeo(verts, uvs, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Make sure triangles face the way we want (up for the top, outward for the sides).
function orient(idx, verts, wantUp) {
  const out = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromArray(verts[idx[i]]);
    b.fromArray(verts[idx[i + 1]]);
    c.fromArray(verts[idx[i + 2]]);
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    const centre = a.clone().add(b).add(c).divideScalar(3);
    const ok = wantUp ? n.y > 0 : n.x * centre.x + n.z * centre.z > -1e-9 || n.y > 0;
    out.push(...(ok ? [idx[i], idx[i + 1], idx[i + 2]] : [idx[i], idx[i + 2], idx[i + 1]]));
  }
  return out;
}

// A tapered keycap with a softened top edge and a shallow dish, centred on its origin.
// Two material groups: 0 = labelled top face, 1 = sides.
const capCache = new Map();
function capGeometry(w, d) {
  const id = `${w.toFixed(4)}x${d.toFixed(4)}`;
  if (capCache.has(id)) return capCache.get(id);
  const H = KEY_H / 2;
  const inX = 0.0055;
  const inFront = 0.0075; // the front face slopes more, so the top sits slightly back
  const inBack = 0.0035;
  const hwT = w / 2 - inX;
  const hdT = (d - inFront - inBack) / 2;
  const czT = -(inFront - inBack) / 2;
  // base, just under the top edge (softens it), and the top outline
  const rings = [
    ring(w / 2, d / 2, 0.006, 0, 0, -H),
    ring(hwT + 0.0012, hdT + 0.0012, 0.0055, 0, czT * 0.85, H - 0.0016),
    ring(hwT, hdT, 0.005, 0, czT, H),
  ];
  const n = rings[0].length;

  // sides
  const sv = rings.flat();
  const suv = sv.map(() => [0, 0]);
  let sidx = [];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = r * n + i, b = r * n + j, c = (r + 1) * n + i, e = (r + 1) * n + j;
      sidx.push(a, b, e, a, e, c);
    }
  }
  sidx = orient(sidx, sv, false);
  const sides = buildGeo(sv, suv, sidx);

  // dished top: concentric rings sinking toward the middle
  const DISH = 0.0014;
  const tv = [];
  const steps = [1, 0.7, 0.4];
  for (const sc of steps) {
    for (const [x, , z] of rings[2]) {
      const px = x * sc;
      const pz = czT + (z - czT) * sc;
      tv.push([px, H - DISH * (1 - sc * sc), pz]);
    }
  }
  tv.push([0, H - DISH, czT]);
  const tuv = tv.map(([x, , z]) => [(x + hwT) / (2 * hwT), (czT + hdT - z) / (2 * hdT)]);
  let tidx = [];
  for (let r = 0; r < steps.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = r * n + i, b = r * n + j, c = (r + 1) * n + i, e = (r + 1) * n + j;
      tidx.push(a, b, e, a, e, c);
    }
  }
  const centre = tv.length - 1;
  const last = (steps.length - 1) * n;
  for (let i = 0; i < n; i++) tidx.push(last + i, last + ((i + 1) % n), centre);
  tidx = orient(tidx, tv, true);
  const top = buildGeo(tv, tuv, tidx);

  const geo = mergeGeometries([top, sides], true);
  geo.userData.topAspect = hwT / hdT;
  capCache.set(id, geo);
  return geo;
}

// Case: a darker plate inside a rounded aluminium rim.
function buildCase() {
  const W = WIDTH_U * U + RIM * 2;
  const D = ROWS.length * U + RIM * 2;
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new RoundedBoxGeometry(W, PLATE_H, D, 3, 0.006), std(0x8f8c86, { roughness: 0.6, metalness: 0.2 }));
  plate.position.y = PLATE_H / 2;
  const outer = new THREE.Shape();
  const r = 0.012;
  outer.moveTo(-W / 2 + r, -D / 2);
  outer.lineTo(W / 2 - r, -D / 2);
  outer.quadraticCurveTo(W / 2, -D / 2, W / 2, -D / 2 + r);
  outer.lineTo(W / 2, D / 2 - r);
  outer.quadraticCurveTo(W / 2, D / 2, W / 2 - r, D / 2);
  outer.lineTo(-W / 2 + r, D / 2);
  outer.quadraticCurveTo(-W / 2, D / 2, -W / 2, D / 2 - r);
  outer.lineTo(-W / 2, -D / 2 + r);
  outer.quadraticCurveTo(-W / 2, -D / 2, -W / 2 + r, -D / 2);
  const hole = new THREE.Path();
  const iw = W / 2 - RIM + 0.002;
  const id = D / 2 - RIM + 0.002;
  hole.moveTo(-iw, -id);
  hole.lineTo(-iw, id);
  hole.lineTo(iw, id);
  hole.lineTo(iw, -id);
  hole.lineTo(-iw, -id);
  outer.holes.push(hole);
  const rimGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 6 });
  rimGeo.rotateX(-Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, std(0xd3d0c9, { roughness: 0.4, metalness: 0.35 }));
  rim.position.y = PLATE_H + 0.002;
  plate.castShadow = rim.castShadow = true;
  plate.receiveShadow = rim.receiveShadow = true;
  g.add(plate, rim);
  return g;
}

export class Keyboard {
  constructor() {
    this.group = new THREE.Group();
    this.keys = [];
    this.meshes = [];
    this.group.add(buildCase());
    this.buildTicker();

    const sideMats = Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, std(v.side, { roughness: 0.6 })]));
    const makeKey = (slot, x, z, units, style, row) => {
      const w = units * U - GAP;
      const d = U - GAP;
      const geo = capGeometry(w, d);
      const ch = 128;
      const label = canvasTexture(Math.min(1024, Math.round(ch * geo.userData.topAspect)), ch);
      const top = new THREE.MeshStandardMaterial({ map: label.tex, roughness: 0.55 });
      const mesh = new THREE.Mesh(geo, [top, sideMats[style]]);
      const restY = PLATE_H + KEY_H / 2 + row.lift;
      mesh.position.set(x, restY, z);
      mesh.rotation.x = row.tilt;
      // keys only receive shadows: dozens of extra shadow draws are not worth it on Quest
      mesh.receiveShadow = true;
      this.group.add(mesh);
      const key = {
        char: slot, slot, x, z, w, d, mesh, label, topMat: top, restY,
        top: KEY_TOP + row.lift, dead: slot.length > 1,
        base: STYLES[style].base, ink: STYLES[style].ink,
        flash: 0, flashColor: null, flip: 0,
      };
      mesh.userData.key = key;
      drawLabel(key);
      this.keys.push(key);
      this.meshes.push(mesh);
      return key;
    };

    for (const row of ROWS) {
      let x = (-WIDTH_U / 2) * U;
      for (const k of row.keys) {
        const [slot, units, style] = typeof k === 'string' ? [k, 1, 'alpha'] : [k[0], k[1], k[2] || 'alpha'];
        makeKey(slot, x + (units * U) / 2, row.z, units, style, row);
        x += units * U;
      }
    }
  }

  // Text strip behind the top row (like a laptop Touch Bar, angled up at the player):
  // the next stretch of the email in big letters, right where the eyes already are.
  buildTicker() {
    const W = WIDTH_U * U + RIM * 2;
    const D = ROWS.length * U + RIM * 2;
    const DEPTH = 0.075;
    const TILT = 0.8;
    const housing = new THREE.Mesh(new RoundedBoxGeometry(W, 0.02, DEPTH, 3, 0.007), std(0xd3d0c9, { roughness: 0.4, metalness: 0.35 }));
    housing.rotation.x = TILT;
    housing.position.set(0, 0.034, -D / 2 - (DEPTH * Math.cos(TILT)) / 2 + 0.002);
    housing.castShadow = true;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, DEPTH - 0.012), std(0x0b0c0f, { roughness: 0.15, metalness: 0.2 }));
    glass.rotation.x = -Math.PI / 2;
    glass.position.y = 0.0101;
    this.ticker = canvasTexture(2048, 198);
    const text = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, (W - 0.04) * (198 / 2048)), new THREE.MeshBasicMaterial({ map: this.ticker.tex, transparent: true, toneMapped: false }));
    text.rotation.x = -Math.PI / 2;
    text.position.y = 0.0103;
    housing.add(glass, text);
    this.group.add(housing);
    this.tickerSig = '';
  }

  // view: { prompt, typed } while typing, or { text, color } for a short message
  drawTicker(view) {
    const sig = JSON.stringify(view);
    if (sig === this.tickerSig) return;
    this.tickerSig = sig;
    const { ctx, canvas, tex } = this.ticker;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    if (!view.prompt) {
      ctx.textAlign = 'center';
      ctx.font = `700 104px ${SANS}`;
      ctx.fillStyle = view.color || '#f4efe6';
      ctx.fillText(view.text || '', w / 2, h / 2 + 4);
      tex.needsUpdate = true;
      return;
    }
    const { prompt, typed } = view;
    ctx.font = `700 140px ${MONO}`;
    const cw = ctx.measureText('M').width;
    const visible = Math.floor((w - 40) / cw);
    const cursor = typed.length;
    // keep a few typed letters on the left for context, the rest is what comes next
    const start = Math.max(0, Math.min(cursor - 5, prompt.length - visible));
    ctx.textAlign = 'center';
    for (let k = 0; k < visible; k++) {
      const i = start + k;
      if (i >= prompt.length) break;
      const x = 20 + k * cw + cw / 2;
      const want = prompt[i];
      if (i < cursor) {
        const got = typed[i];
        const ok = got.toLowerCase() === want.toLowerCase();
        if (!ok) {
          ctx.fillStyle = 'rgba(220, 38, 38, 0.55)';
          ctx.fillRect(x - cw / 2, 18, cw, h - 36);
        }
        ctx.fillStyle = ok ? '#5fcf86' : '#ffd0cc';
        ctx.fillText(got === ' ' ? (ok ? ' ' : '_') : got, x, h / 2 + 6);
      } else if (i === cursor) {
        ctx.fillStyle = '#ff8a3d';
        ctx.fillRect(x - cw / 2 + 2, 14, cw - 4, h - 28);
        ctx.fillStyle = '#14161b';
        ctx.fillText(want === ' ' ? '␣' : want, x, h / 2 + 6);
      } else {
        ctx.fillStyle = want === ' ' ? 'rgba(244,239,230,0.3)' : '#f4efe6';
        ctx.fillText(want === ' ' ? '·' : want, x, h / 2 + 6);
      }
    }
    tex.needsUpdate = true;
  }

  get letterKeys() {
    return this.keys.filter((k) => k.slot.length === 1 && LETTERS.includes(k.slot));
  }

  keyForSlot(slot) {
    return this.keys.find((k) => k.slot === slot);
  }

  // Register every key with the press system.
  registerPresses(presses, onKey) {
    for (const key of this.keys) {
      key.press = presses.add({
        frame: this.group, mesh: key.mesh, x: key.x, z: key.z, w: key.w, d: key.d,
        top: key.top, travel: 0.008, onPress: () => onKey(key),
      });
    }
  }

  // Light up one key as the next one to press (tutorial). null clears it.
  setGuide(key) {
    for (const k of this.keys) {
      if (k.guide && k !== key) {
        k.guide = false;
        drawLabel(k);
      }
    }
    if (key && !key.guide) {
      key.guide = true;
      drawLabel(key);
    }
  }

  flash(key, color) {
    key.flash = 1;
    key.flashColor = color;
    drawLabel(key, color);
  }

  reset() {
    for (const k of this.keys) {
      if (k.char !== k.slot) {
        k.char = k.slot;
        drawLabel(k);
      }
    }
  }

  reshuffle() {
    const letters = this.letterKeys;
    const chars = letters.map((k) => k.char);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    letters.forEach((k, i) => {
      k.pendingChar = chars[i];
      k.flip = 1;
      k.flipDelay = Math.random() * 0.25;
    });
  }

  update(dt) {
    for (const k of this.keys) {
      const sink = k.press ? k.press.depth : 0;
      k.mesh.position.y = damp(k.mesh.position.y, k.restY - sink, 40, dt);
      if (k.flash > 0) {
        k.flash -= dt * 3;
        if (k.flash <= 0) drawLabel(k);
      }
      if (k.flip > 0) {
        if (k.flipDelay > 0) {
          k.flipDelay -= dt;
          continue;
        }
        const before = k.flip;
        k.flip = Math.max(0, k.flip - dt * 3);
        // flip the key over, swap its label halfway through
        k.mesh.rotation.z = (1 - k.flip) * Math.PI * 2;
        k.mesh.position.y += Math.sin((1 - k.flip) * Math.PI) * 0.03;
        if (before > 0.5 && k.flip <= 0.5 && k.pendingChar) {
          k.char = k.pendingChar;
          k.pendingChar = null;
          drawLabel(k);
        }
        if (k.flip === 0) k.mesh.rotation.z = 0;
      }
    }
  }
}
