import * as THREE from 'three';
import { canvasTexture, rrect, SANS, std, damp } from '../util.js';
import { sfx } from '../audio.js';

// Gary, Regional Manager. Walks along the aisle beyond your cubicle wall,
// stops to peer at your screen, then leaves. Faces +z (toward the player) at rotation 0.
const AISLE_Z = -2.25;
const START_X = -7;
const END_X = 7;
const SPEED = 2.0;
const INSPECT_TIME = 2.4;

export class Boss {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(START_X, 0, AISLE_Z);
    this.state = 'off'; // off | approach | inspect | leave | verdict
    this.t = 0;
    this.walkPhase = 0;
    this.anger = 0;
    this.listeners = [];

    const skin = std(0xf0c4a0);
    this.skinMat = skin;
    const shirt = std(0xf2f2ee);
    const pants = std(0x2f3540);
    const jacket = std(0x4b5568);
    const dark = std(0x2a2522);

    const hip = 0.92;
    this.legs = [-0.09, 0.09].map((x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, hip, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, hip - 0.04, 0.17), pants);
      leg.position.y = -(hip - 0.04) / 2;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.28), dark);
      shoe.position.set(0, -hip + 0.035, 0.05);
      pivot.add(leg, shoe);
      this.group.add(pivot);
      return pivot;
    });

    this.body = new THREE.Group();
    this.body.position.y = hip;
    this.group.add(this.body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), shirt);
    belly.scale.set(1, 0.9, 0.85);
    belly.position.set(0, 0.2, 0.04);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.56, 0.28), jacket);
    torso.position.y = 0.36;
    const shirtFront = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.02), shirt);
    shirtFront.position.set(0, 0.38, 0.142);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.015), std(0xc0262d));
    tie.position.set(0, 0.42, 0.155);
    this.body.add(belly, torso, shirtFront, tie);

    // name badge
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
    badgeMesh.position.set(0.15, 0.5, 0.141);
    this.body.add(badgeMesh);

    this.arms = [-0.3, 0.3].map((x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.6, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.14), jacket);
      arm.position.y = -0.27;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), skin);
      hand.position.y = -0.58;
      pivot.add(arm, hand);
      this.body.add(pivot);
      return pivot;
    });
    // coffee mug in his right hand, naturally
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 16), std(0xffffff));
    mug.position.set(0, -0.6, 0.06);
    this.arms[1].add(mug);

    this.head = new THREE.Group();
    this.head.position.y = 0.78;
    this.body.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 12), skin);
    neck.position.y = -0.1;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 20), skin);
    skull.scale.set(1, 1.1, 1);
    skull.position.y = 0.06;
    this.head.add(neck, skull);
    // bald on top, hair on the sides
    const hairMat = std(0x5a4636);
    for (const x of [-0.13, 0.13]) {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), hairMat);
      hair.scale.set(0.6, 1, 1.4);
      hair.position.set(x, 0.05, -0.03);
      this.head.add(hair);
    }
    const eyeMat = std(0x111111, { roughness: 0.2 });
    for (const x of [-0.05, 0.05]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.027, 12, 10), std(0xffffff));
      white.position.set(x, 0.09, 0.13);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), eyeMat);
      eye.position.set(x, 0.09, 0.152);
      this.head.add(white, eye);
    }
    this.brows = [-0.05, 0.05].map((x) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), hairMat);
      b.position.set(x, 0.135, 0.145);
      this.head.add(b);
      return b;
    });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), skin);
    nose.position.set(0, 0.05, 0.155);
    const tache = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.02), hairMat);
    tache.position.set(0, 0.015, 0.15);
    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), std(0x6b2020));
    this.mouth.position.set(0, -0.015, 0.145);
    this.head.add(nose, tache, this.mouth);

    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });

    // speech bubble
    this.bubble = canvasTexture(768, 256);
    this.bubbleSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubble.tex, transparent: true, depthTest: false }));
    this.bubbleSprite.scale.set(1.1, 0.367, 1);
    this.bubbleSprite.position.y = 2.12;
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

  walkBy() {
    this.state = 'approach';
    this.group.position.x = START_X;
    this.stopAfter = false;
  }

  // Walk over for the end-of-shift verdict and stay there.
  comeForVerdict() {
    if (this.state === 'off') this.group.position.x = START_X;
    this.state = 'approach';
    this.stopAfter = true;
  }

  dismiss() {
    if (this.state === 'off') return;
    this.state = 'leave';
  }

  reset() {
    this.state = 'off';
    this.group.position.x = START_X;
    this.bubbleSprite.visible = false;
  }

  say(text, seconds = 3) {
    const { ctx, canvas, tex } = this.bubble;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.font = `700 54px ${SANS}`;
    let size = 54;
    while (ctx.measureText(text).width > w - 80 && size > 28) {
      size -= 2;
      ctx.font = `700 ${size}px ${SANS}`;
    }
    ctx.fillStyle = '#fff';
    rrect(ctx, 8, 8, w - 16, h - 70, 40);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 30, h - 64);
    ctx.lineTo(w / 2, h - 10);
    ctx.lineTo(w / 2 + 30, h - 64);
    ctx.fill();
    ctx.fillStyle = this.anger > 70 ? '#c0262d' : '#24262c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, (h - 62) / 2 + 4);
    tex.needsUpdate = true;
    this.bubbleSprite.visible = true;
    this.bubbleT = seconds;
  }

  setAnger(a) {
    this.anger = a;
  }

  update(dt, frozen = false) {
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
    if (this.state === 'approach') {
      walking = true;
      p.x = Math.min(0, p.x + SPEED * dt);
      this.group.rotation.y = damp(this.group.rotation.y, Math.PI / 2, 10, dt);
      if (p.x >= 0) {
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
      this.group.rotation.y = damp(this.group.rotation.y, Math.PI / 2, 8, dt);
      p.x += SPEED * dt;
      if (p.x > END_X) {
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
      this.body.position.y = 0.92 + Math.abs(Math.cos(this.walkPhase)) * 0.03;
    } else {
      for (const l of [...this.legs, ...this.arms]) l.rotation.x = damp(l.rotation.x, 0, 8, dt);
      // angry arm wave while in a mood
      if (this.bubbleSprite.visible && this.anger > 50) this.arms[0].rotation.x = -1.6 + Math.sin(performance.now() / 90) * 0.4;
    }
  }
}
