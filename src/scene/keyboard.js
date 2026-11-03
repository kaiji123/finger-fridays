import * as THREE from 'three';
import { canvasTexture, rrect, MONO, SANS, std, damp } from '../util.js';

// A big, forgiving desk keyboard. Keys are 4.2cm wide (a real keyboard is ~1.8cm).
const P = 0.046; // key pitch
const K = 0.042; // key size
const KEY_H = 0.018;
const PLATE_H = 0.012;
export const KEY_TOP = PLATE_H + KEY_H;

const LAYOUT = [
  { z: -0.069, off: -0.025, keys: 'qwertyuiop' },
  { z: -0.023, off: -0.011, keys: 'asdfghjkl' },
  { z: 0.023, off: 0.003, keys: 'zxcvbnm,.?' },
];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function drawLabel(key, highlight = null) {
  const { ctx, canvas, tex } = key.label;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = highlight || key.base;
  rrect(ctx, 0, 0, w, h, 18);
  ctx.fill();
  // subtle top-face bevel
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = g;
  rrect(ctx, 6, 6, w - 12, h - 12, 14);
  ctx.fill();
  ctx.fillStyle = key.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (key.char === ' ') {
    ctx.font = `700 46px ${SANS}`;
    ctx.fillText('SPACE', w / 2, h / 2 + 2);
  } else if (key.char === '\b') {
    ctx.font = `700 46px ${SANS}`;
    ctx.fillText('⌫ BACK', w / 2, h / 2 + 2);
  } else {
    ctx.font = `800 84px ${MONO}`;
    ctx.fillText(key.char.toUpperCase(), w / 2, h / 2 + 4);
  }
  tex.needsUpdate = true;
}

export class Keyboard {
  constructor() {
    this.group = new THREE.Group();
    this.keys = [];
    this.meshes = [];

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, PLATE_H, 0.215),
      std(0x2b2e36, { roughness: 0.5, metalness: 0.2 })
    );
    plate.position.y = PLATE_H / 2;
    plate.castShadow = plate.receiveShadow = true;
    this.group.add(plate);
    this.plate = plate;

    const sideMat = std(0xe9e4da, { roughness: 0.6 });
    const makeKey = (char, x, z, w = K, d = K, opts = {}) => {
      const isWide = w > K * 1.2;
      const label = canvasTexture(isWide ? 384 : 128, 128);
      const top = new THREE.MeshStandardMaterial({ map: label.tex, roughness: 0.55 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, KEY_H, d), [sideMat, sideMat, top, sideMat, sideMat, sideMat]);
      mesh.position.set(x, PLATE_H + KEY_H / 2, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      const key = {
        char, slot: char, x, z, w, d, mesh, label, topMat: top,
        base: opts.base || '#f3eee4', ink: opts.ink || '#24262c',
        flash: 0, flashColor: null, flip: 0,
      };
      mesh.userData.key = key;
      drawLabel(key);
      this.keys.push(key);
      this.meshes.push(mesh);
      return key;
    };

    for (const row of LAYOUT) {
      [...row.keys].forEach((c, i) => makeKey(c, (i - 4.5) * P + row.off, row.z));
    }
    makeKey('\b', 0.2445, -0.069, 0.075, K, { base: '#ffb36b' });
    makeKey(' ', -0.02, 0.069, 0.27, K);
  }

  get letterKeys() {
    return this.keys.filter((k) => LETTERS.includes(k.slot));
  }

  keyForSlot(slot) {
    return this.keys.find((k) => k.slot === slot);
  }

  // Register every key with the press system.
  registerPresses(presses, onKey) {
    for (const key of this.keys) {
      key.press = presses.add({
        frame: this.group, mesh: key.mesh, x: key.x, z: key.z, w: key.w, d: key.d,
        top: KEY_TOP, travel: 0.008, onPress: () => onKey(key),
      });
    }
  }

  flash(key, color) {
    key.flash = 1;
    key.flashColor = color;
    drawLabel(key, color);
  }

  // Visual-only press for physical-keyboard typing.
  tap(key) {
    key.tapT = 0.12;
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
      let sink = k.press ? k.press.depth : 0;
      if (k.tapT > 0) {
        k.tapT -= dt;
        sink = Math.max(sink, 0.01);
      }
      k.mesh.position.y = damp(k.mesh.position.y, PLATE_H + KEY_H / 2 - sink, 40, dt);
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
