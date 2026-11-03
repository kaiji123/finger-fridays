import * as THREE from '@iwsdk/core';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, rrect, SANS, std, damp, limb, mergeStatic } from '../util.js';
import { sfx } from '../audio.js';

// Gary, Regional Manager. Walks along the aisle beyond your cubicle wall,
// stops to peer at your screen, then leaves. Faces +z (toward the player) at rotation 0.
// The path is in office space; in mixed reality it is fitted to the player's real room
// (see src/xr/mr-desk.js), so Gary comes out of one real wall and leaves through another.
export const DEFAULT_PATH = { startX: -7, endX: 7, aisleZ: -2.25, floorY: 0 };
const SPEED = 2.0;
const INSPECT_TIME = 2.4;
const HIP = 0.8;
const BUBBLE_W = 1.6; // metres; the bubble's left edge (its tail) sits just right of his head
const BUBBLE_X = 0.16 + BUBBLE_W / 2;

function wrap(ctx, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// ---- shape helpers ----

// A smooth solid of revolution from [radius, y] pairs (bottom to top), optionally squashed.
function smooth(profile, n = 28) {
  return new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(n);
}

function lathe(profile, mat, segs = 24, { sx = 1, sz = 1, smoothN = 0 } = {}) {
  const pts = smoothN ? smooth(profile, smoothN) : profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, segs);
  geo.scale(sx, 1, sz);
  return new THREE.Mesh(geo, mat);
}

function interp(profile, y) {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    if (y <= y1 && y >= y0) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  }
  return 0;
}

// Torso: pear-shaped, widest at the belly, with a forward paunch.
const TORSO = [[0, -0.07], [0.2, -0.07], [0.235, 0.0], [0.258, 0.1], [0.265, 0.2], [0.255, 0.3], [0.238, 0.4], [0.226, 0.48], [0.218, 0.55], [0.198, 0.6], [0.15, 0.645], [0.09, 0.665], [0, 0.672]];
const SX = 0.95;
const SZ = 0.78;
const T_Y0 = -0.07;
const T_Y1 = 0.672;
const torsoR = (y) => interp(TORSO, y);
const paunch = (y) => 0.065 * Math.exp(-(((y - 0.19) / 0.15) ** 2));

function jacketGeometry() {
  const geo = new THREE.LatheGeometry(TORSO.map(([r, y]) => new THREE.Vector2(r, y)), 48, Math.PI);
  geo.scale(SX, 1, SZ);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const r = torsoR(y);
    const front = r > 0 ? Math.max(0, pos.getZ(i) / (r * SZ)) : 0;
    pos.setZ(i, pos.getZ(i) + paunch(y) * front ** 1.5);
    // texture rows follow height, so the painted details land where we expect
    uv.setY(i, (y - T_Y0) / (T_Y1 - T_Y0));
  }
  geo.computeVertexNormals();
  return geo;
}

// Suit front painted onto the jacket: shirt V, tie, collar points, lapels, buttons, pockets.
function jacketTexture() {
  const W = 1024;
  const H = 1024;
  const { ctx, tex } = canvasTexture(W, H);
  const at = (x, y) => {
    const r = Math.max(torsoR(y), 0.1);
    return [(0.5 + x / (2 * Math.PI * SX * r)) * W, (1 - (y - T_Y0) / (T_Y1 - T_Y0)) * H];
  };
  const poly = (pts, fill, stroke) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](...at(x, y)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  };
  const SUIT = '#5d6d8a';
  const SUIT_DARK = '#4a5872';
  const LINE = '#3a4559';
  ctx.fillStyle = SUIT;
  ctx.fillRect(0, 0, W, H);

  // shirt V: from the collar down to a point above the belly
  const vEdge = (side) => {
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const y = 0.68 - (k / 12) * 0.36;
      const hw = 0.075 * Math.min(1, (y - 0.32) / 0.28);
      pts.push([side * hw, y]);
    }
    return pts;
  };
  const V = [...vEdge(-1), ...vEdge(1).reverse()];
  poly(V, '#f3f2ec');
  ctx.save();
  poly(V);
  ctx.clip();
  // tie, widening as it goes down
  poly([[-0.018, 0.62], [0.018, 0.62], [0.034, 0.36], [0, 0.32], [-0.034, 0.36]], '#c0262d');
  poly([[-0.006, 0.6], [0.006, 0.6], [0.012, 0.36], [-0.012, 0.36]], '#d63a40');
  // collar points either side of the knot
  for (const s of [-1, 1]) poly([[s * 0.075, 0.68], [s * 0.012, 0.635], [s * 0.05, 0.575]], '#ffffff', '#d9d8d0');
  ctx.restore();

  // lapels
  for (const s of [-1, 1]) {
    poly([[s * 0.075, 0.66], [s * 0.13, 0.6], [s * 0.112, 0.535], [s * 0.135, 0.52], [s * 0.01, 0.3], [s * 0.003, 0.32], ...vEdge(s).slice(1, -1).reverse()], SUIT_DARK, LINE);
  }
  // front opening below the buttons, curving away over the hips
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(...at(0, 0.3));
    for (let k = 1; k <= 10; k++) {
      const t = k / 10;
      ctx.lineTo(...at(s * 0.11 * t * t, 0.3 - t * 0.37));
    }
    ctx.stroke();
  }
  // buttons
  for (const y of [0.24, 0.12]) {
    const [cx, cy] = at(0.004, y);
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  // hip pockets and a breast pocket with a red pocket square
  for (const s of [-1, 1]) poly([[s * 0.1, 0.075], [s * 0.22, 0.07], [s * 0.22, 0.05], [s * 0.1, 0.055]], SUIT_DARK, LINE);
  poly([[0.1, 0.47], [0.115, 0.5], [0.13, 0.475], [0.15, 0.495], [0.16, 0.465]], '#c0262d');
  poly([[0.095, 0.47], [0.17, 0.46], [0.17, 0.452], [0.095, 0.462]], SUIT_DARK, LINE);
  // side seams and a touch of shading toward the back
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.3, 'rgba(0,0,0,0)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  tex.needsUpdate = true;
  return tex;
}

// Sleeve: shoulder cap down to the wrist, slightly tapered.
function sleeveGeometry() {
  return new THREE.LatheGeometry(
    [[0, -0.55], [0.05, -0.55], [0.056, -0.5], [0.062, -0.3], [0.07, -0.1], [0.073, 0], [0.06, 0.045], [0.03, 0.065], [0, 0.068]].map(([r, y]) => new THREE.Vector2(r, y)),
    20
  );
}

// Head: an egg with jowls (widest just below the eyes).
const HEAD = [[0, -0.11], [0.09, -0.105], [0.14, -0.075], [0.16, -0.02], [0.16, 0.04], [0.153, 0.1], [0.135, 0.17], [0.098, 0.225], [0.05, 0.255], [0, 0.262]];
const HEAD_SZ = 0.97;
const faceZ = (x, y) => Math.sqrt(Math.max(0, interp(HEAD, y) ** 2 - x * x)) * HEAD_SZ;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export class Boss {
  constructor() {
    this.group = new THREE.Group();
    this.path = { ...DEFAULT_PATH };
    this.group.position.set(this.path.startX, this.path.floorY, this.path.aisleZ);
    this.state = 'off'; // off | approach | inspect | leave | verdict
    this.t = 0;
    this.walkPhase = 0;
    this.anger = 0;
    this.listeners = [];

    const skin = std(0xf0c4a0, { roughness: 0.5 });
    this.skinMat = skin;
    const shirt = std(0xf3f2ec);
    const pants = std(0x4f586b);
    const dark = std(0x3a2a20, { roughness: 0.35 });
    const frame = std(0x1d1d1f, { roughness: 0.3 });
    const hairMat = std(0x6b5440, { roughness: 0.9 });

    // ---- legs: smooth tapered trousers and rounded shoes ----
    this.legs = [-0.1, 0.1].map((x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, HIP, 0);
      const leg = lathe([[0, -HIP + 0.07], [0.078, -HIP + 0.07], [0.084, -0.42], [0.096, -0.15], [0.1, 0], [0, 0.02]], pants, 20);
      const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.08, 0.27, 3, 0.035), dark);
      shoe.position.set(0, -HIP + 0.04, 0.045);
      pivot.add(leg, shoe);
      this.group.add(pivot);
      return pivot;
    });

    // ---- body: one pear-shaped jacket with a painted shirt V, tie, lapels and buttons ----
    this.body = new THREE.Group();
    this.body.position.y = HIP;
    this.group.add(this.body);
    const hips = lathe([[0, -0.14], [0.17, -0.14], [0.21, -0.06], [0.215, 0.02], [0, 0.04]], pants, 24, { sz: 0.8 });
    const jacket = new THREE.Mesh(jacketGeometry(), new THREE.MeshStandardMaterial({ map: jacketTexture(), roughness: 0.8 }));
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.088, 0.06, 20, 1, true), shirt);
    collar.position.y = 0.67;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), std(0xb3202a, { roughness: 0.5 }));
    knot.scale.set(1, 1.15, 0.6);
    knot.position.set(0, 0.62, 0.135);
    this.body.add(hips, jacket, collar, knot);

    // name badge, sitting on the chest
    const badge = canvasTexture(256, 96);
    badge.ctx.fillStyle = '#fff';
    rrect(badge.ctx, 0, 0, 256, 96, 10);
    badge.ctx.fill();
    badge.ctx.fillStyle = '#c0262d';
    badge.ctx.font = `700 44px ${SANS}`;
    badge.ctx.textAlign = 'center';
    badge.ctx.fillText('GARY', 128, 50);
    badge.ctx.fillStyle = '#333';
    badge.ctx.font = `500 22px ${SANS}`;
    badge.ctx.fillText('REGIONAL MANAGER', 128, 82);
    const badgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.0375), new THREE.MeshBasicMaterial({ map: badge.tex }));
    const bAng = -0.62;
    const bR = torsoR(0.47);
    badgeMesh.position.set(Math.sin(bAng) * bR * SX + 0, 0.47, Math.cos(bAng) * bR * SZ + 0.006);
    badgeMesh.rotation.set(-0.12, bAng * 0.75, 0);
    this.body.add(badgeMesh);

    // ---- arms: one smooth sleeve each, hanging just clear of the belly ----
    const sleeveMat = std(0x56647f);
    this.arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.232, 0.53, 0);
      const arm = new THREE.Group();
      arm.rotation.z = side * 0.2;
      const sleeve = new THREE.Mesh(sleeveGeometry(), sleeveMat);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), shirt);
      cuff.position.y = -0.555;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), skin);
      hand.scale.set(0.75, 1.2, 0.95);
      hand.position.set(0, -0.62, 0.01);
      const thumb = limb([side * -0.02, -0.59, 0.035], [side * -0.025, -0.635, 0.05], 0.016, skin);
      arm.add(sleeve, cuff, hand, thumb);
      pivot.add(arm);
      this.body.add(pivot);
      return pivot;
    });
    // coffee mug in his right hand, naturally
    const mugMat = std(0xffffff, { roughness: 0.3 });
    const mug = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 16), mugMat);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 14), mugMat);
    handle.position.x = -0.045;
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), std(0x4a2c17, { roughness: 0.2 }));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.046;
    mug.add(cup, handle, coffee);
    mug.position.set(0.0, -0.66, 0.07);
    this.arms[1].children[0].add(mug);

    // ---- head: one jowly egg, bald on top with a fringe of hair ----
    this.head = new THREE.Group();
    this.head.position.y = 0.76;
    this.body.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.1, 16), skin);
    neck.position.y = -0.1;
    const skull = lathe(HEAD, skin, 36, { sz: HEAD_SZ, smoothN: 30 });
    this.head.add(neck, skull);
    // fringe: soft tufts wrapping round the back of the head, ear to ear
    for (let i = 0; i <= 8; i++) {
      const ang = Math.PI * 0.62 + (i / 8) * Math.PI * 0.76; // from one temple, round the back, to the other
      const y = 0.06 - Math.sin((i / 8) * Math.PI) * 0.035;
      const r = interp(HEAD, y) - 0.004;
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), hairMat);
      tuft.scale.set(0.058, 0.05, 0.034);
      tuft.position.set(Math.sin(ang) * r, y, Math.cos(ang) * r * HEAD_SZ);
      tuft.rotation.y = ang;
      this.head.add(tuft);
    }
    const cheekMat = new THREE.MeshBasicMaterial({ color: 0xe8746a, transparent: true, opacity: 0.4, depthWrite: false });
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), skin);
      ear.scale.set(0.45, 1, 0.7);
      ear.position.set(side * 0.163, 0.035, -0.005);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.026, 18), cheekMat);
      cheek.position.set(side * 0.092, -0.005, faceZ(side * 0.092, -0.005) + 0.002);
      cheek.rotation.y = side * 0.62;
      this.head.add(ear, cheek);
    }

    // eyes behind chunky rectangular glasses
    const eyeMat = std(0x161616, { roughness: 0.2 });
    const whiteMat = std(0xffffff, { roughness: 0.3 });
    const lensShape = roundedRect(0.074, 0.056, 0.016);
    lensShape.holes.push(roundedRect(0.058, 0.04, 0.01));
    const lensGeo = new THREE.ExtrudeGeometry(lensShape, { depth: 0.006, bevelEnabled: false, curveSegments: 4 });
    for (const x of [-0.055, 0.055]) {
      const z = faceZ(x, 0.065);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), whiteMat);
      white.scale.set(1, 1.05, 0.55);
      white.position.set(x, 0.065, z - 0.004);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), eyeMat);
      eye.position.set(x, 0.062, z + 0.008);
      const lens = new THREE.Mesh(lensGeo, frame);
      lens.position.set(x, 0.065, 0.168);
      lens.rotation.y = x > 0 ? 0.12 : -0.12;
      this.head.add(white, eye, lens);
    }
    const bridge = limb([-0.018, 0.07, 0.171], [0.018, 0.07, 0.171], 0.005, frame);
    const temples = [-1, 1].map((side) => limb([side * 0.092, 0.075, 0.16], [side * 0.157, 0.065, 0.0], 0.0045, frame));
    this.head.add(bridge, ...temples);
    this.brows = [-0.055, 0.055].map((x) => {
      const geo = new THREE.CapsuleGeometry(0.011, 0.045, 4, 8);
      geo.rotateZ(Math.PI / 2);
      const b = new THREE.Mesh(geo, hairMat);
      b.position.set(x, 0.118, faceZ(x, 0.118) + 0.012);
      this.head.add(b);
      return b;
    });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), std(0xeaa58a, { roughness: 0.45 }));
    nose.scale.set(0.9, 0.85, 1);
    nose.position.set(0, 0.015, 0.162);
    // big push-broom moustache
    const tache = new THREE.Group();
    for (const side of [-1, 1]) tache.add(limb([0, 0, 0], [side * 0.058, -0.022, -0.016], 0.019, hairMat));
    tache.position.set(0, -0.022, 0.153);
    this.mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.032, 4, 8).rotateZ(Math.PI / 2), std(0x5a1a1a));
    this.mouth.position.set(0, -0.062, faceZ(0, -0.062) - 0.002);
    this.head.add(nose, tache, this.mouth);

    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    // Each body part moves as one piece, so bake its meshes together (far fewer draw
    // calls on Quest). The brows and mouth animate, so they stay separate.
    for (const part of [...this.legs, ...this.arms.map((a) => a.children[0])]) mergeStatic(part);
    mergeStatic(this.body, { shallow: true });
    mergeStatic(this.head, { shallow: true, skip: [...this.brows, this.mouth] });

    // speech bubble
    this.bubble = canvasTexture(1024, 512);
    this.bubbleSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubble.tex, transparent: true, depthTest: false }));
    this.bubbleSprite.scale.set(BUBBLE_W, BUBBLE_W / 2, 1);
    // beside his head rather than above it, so it stays in view (it is his caption)
    this.bubbleSprite.position.set(BUBBLE_X, 1.72, 0);
    this.bubbleSprite.renderOrder = 10;
    this.bubbleSprite.visible = false;
    this.group.add(this.bubbleSprite);
    this.bubbleT = 0;
  }

  on(fn) {
    this.listeners.push(fn);
  }

  emit(type) {
    for (const fn of this.listeners) fn(type);
  }

  get busy() {
    return this.state !== 'off';
  }

  setPath(path) {
    this.path = { ...DEFAULT_PATH, ...path };
    this.group.position.y = this.path.floorY;
    this.group.position.z = this.path.aisleZ;
    if (this.state === 'off') this.group.position.x = this.path.startX;
  }

  walkBy() {
    this.state = 'approach';
    this.group.position.x = this.path.startX;
    this.stopAfter = false;
  }

  // Walk over for the end-of-shift verdict and stay there.
  comeForVerdict() {
    if (this.state === 'off') this.group.position.x = this.path.startX;
    this.state = 'approach';
    this.stopAfter = true;
  }

  dismiss() {
    if (this.state === 'off') return;
    this.state = 'leave';
  }

  reset() {
    this.state = 'off';
    this.group.position.x = this.path.startX;
    this.bubbleSprite.visible = false;
  }

  // Caption bubble beside his head: big, wrapped text so it reads from the desk (~2.4m away).
  say(text, seconds = 3) {
    const { ctx, canvas, tex } = this.bubble;
    const W = canvas.width;
    const H = canvas.height;
    const TAIL = 70; // room on the left for the tail pointing at his head
    const PAD = 36;
    const maxW = W - TAIL - PAD * 2;
    // biggest size (down to a floor) that fits in three lines
    let size = 88;
    let lines;
    for (; size >= 56; size -= 4) {
      ctx.font = `700 ${size}px ${SANS}`;
      lines = wrap(ctx, text, maxW);
      if (lines.length <= 3) break;
    }
    const lineH = size * 1.15;
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const bw = Math.min(W - TAIL, textW + PAD * 2);
    const bh = lines.length * lineH + PAD * 1.5;
    const by = (H - bh) / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 6;
    rrect(ctx, TAIL, by, bw, bh, 44);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(TAIL + 4, H / 2 - 30);
    ctx.lineTo(8, H / 2 + 22);
    ctx.lineTo(TAIL + 4, H / 2 + 22);
    ctx.fill();
    ctx.fillStyle = this.anger > 70 ? '#c0262d' : '#24262c';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, TAIL + (bw - ctx.measureText(l).width) / 2, by + PAD * 0.75 + lineH * (i + 0.5)));
    tex.needsUpdate = true;
    this.bubbleSprite.visible = true;
    this.bubbleT = seconds;
  }

  setAnger(a) {
    this.anger = a;
  }

  update(dt, frozen = false) {
    // off-stage he is hidden: in a small real room his starting point can be in plain view
    this.group.visible = this.state !== 'off';
    // keep the bubble to Gary's right as seen by the player, whichever way he faces
    const ry = this.group.rotation.y;
    this.bubbleSprite.position.x = Math.cos(ry) * BUBBLE_X;
    this.bubbleSprite.position.z = Math.sin(ry) * BUBBLE_X;
    // face reacts to mood
    const k = Math.min(1, this.anger / 100);
    this.skinMat.color.setRGB(0.94, 0.77 - k * 0.4, 0.63 - k * 0.4);
    this.brows[0].rotation.z = damp(this.brows[0].rotation.z, -k * 0.6, 6, dt);
    this.brows[1].rotation.z = damp(this.brows[1].rotation.z, k * 0.6, 6, dt);
    this.mouth.scale.y = 1 + k * 3;

    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.bubbleSprite.visible = false;
    }
    if (frozen || this.state === 'off') return;

    const p = this.group.position;
    let walking = false;
    const dirIn = Math.sign(-this.path.startX) || 1;
    const dirOut = Math.sign(this.path.endX) || 1;
    if (this.state === 'approach') {
      walking = true;
      p.x = dirIn > 0 ? Math.min(0, p.x + SPEED * dt) : Math.max(0, p.x - SPEED * dt);
      this.group.rotation.y = damp(this.group.rotation.y, dirIn * Math.PI / 2, 10, dt);
      if (p.x === 0) {
        this.state = this.stopAfter ? 'verdict' : 'inspect';
        this.t = 0;
        this.emit(this.state === 'verdict' ? 'arrived' : 'inspect');
      }
    } else if (this.state === 'inspect' || this.state === 'verdict') {
      this.t += dt;
      this.group.rotation.y = damp(this.group.rotation.y, 0, 8, dt);
      this.body.rotation.x = damp(this.body.rotation.x, 0.18, 4, dt); // leans in to peer
      if (this.state === 'inspect' && this.t > INSPECT_TIME) {
        this.state = 'leave';
        this.emit('inspectEnd');
      }
    } else if (this.state === 'leave') {
      walking = true;
      this.body.rotation.x = damp(this.body.rotation.x, 0, 6, dt);
      this.group.rotation.y = damp(this.group.rotation.y, dirOut * Math.PI / 2, 8, dt);
      p.x += dirOut * SPEED * dt;
      if (Math.abs(p.x) > Math.abs(this.path.endX)) {
        this.state = 'off';
        this.emit('gone');
      }
    }

    if (walking) {
      const before = Math.sin(this.walkPhase);
      this.walkPhase += dt * 7;
      const s = Math.sin(this.walkPhase);
      if (Math.sign(before) !== Math.sign(s)) sfx.step(Math.max(0.2, 1 - Math.abs(p.x) / 7));
      this.legs[0].rotation.x = s * 0.5;
      this.legs[1].rotation.x = -s * 0.5;
      this.arms[0].rotation.x = -s * 0.4;
      this.arms[1].rotation.x = s * 0.4;
      this.body.position.y = HIP + Math.abs(Math.cos(this.walkPhase)) * 0.03;
    } else {
      for (const l of [...this.legs, ...this.arms]) l.rotation.x = damp(l.rotation.x, 0, 8, dt);
      // angry arm wave while in a mood
      if (this.bubbleSprite.visible && this.anger > 50) this.arms[0].rotation.x = -1.6 + Math.sin(performance.now() / 90) * 0.4;
    }
  }
}
