import * as THREE from '@iwsdk/core';
import { canvasTexture, rrect, SANS, limb } from '../util.js';

// Show-don't-tell guides for the tutorial and mixed-reality setup:
//   arrow      a bobbing arrow over the next thing to touch
//   ghostHand  a see-through hand acting out a gesture (slam the laptop, flip it open, press flat)
//   panel      a small floating card for the few moments when there is no desk to show text on

const GLOW = 0xff9a3c;

function buildArrow() {
  const mat = new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false });
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.05, 20), mat);
  head.rotation.x = Math.PI; // point down
  head.position.y = 0.025;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 12), mat);
  shaft.position.y = 0.08;
  g.add(head, shaft);
  g.traverse((o) => (o.renderOrder = 20));
  g.visible = false;
  return g;
}

function buildGhostHand() {
  // Palm-down right hand, fingers pointing -z, origin at the palm centre.
  const mat = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.025, 0.09), mat);
  g.add(palm);
  [-0.03, -0.01, 0.01, 0.03].forEach((x, i) => {
    const len = [0.07, 0.08, 0.075, 0.06][i];
    g.add(limb([x, 0, -0.045], [x, -0.005, -0.045 - len], 0.009, mat, 8));
  });
  g.add(limb([0.045, 0, 0.02], [0.075, -0.005, -0.03], 0.011, mat, 8));
  g.traverse((o) => {
    o.castShadow = false;
    o.renderOrder = 19;
  });
  g.visible = false;
  return g;
}

function buildPanel() {
  const card = canvasTexture(1024, 384);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.225),
    new THREE.MeshBasicMaterial({ map: card.tex, transparent: true, depthTest: false, toneMapped: false })
  );
  mesh.renderOrder = 30;
  mesh.visible = false;
  return { mesh, card };
}

export class Hints {
  constructor(scene) {
    this.arrow = buildArrow();
    this.ghost = buildGhostHand();
    this.panel = buildPanel();
    scene.add(this.arrow, this.ghost, this.panel.mesh);
    this.target = null; // () => Vector3 in world space
    this.gesture = null; // { kind, anchorMatrix: () => Matrix4, localPos }
    this.t = 0;
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();
  }

  pointAt(getWorldPos) {
    this.target = getWorldPos;
    this.arrow.visible = !!getWorldPos;
  }

  // kind: 'slam' | 'flip' | 'flat'. anchorMatrix() returns the office matrixWorld;
  // localPos is where the gesture happens in office space.
  showGesture(kind, anchorMatrix, localPos) {
    this.gesture = kind ? { kind, anchorMatrix, localPos: localPos.clone() } : null;
    this.ghost.visible = !!kind;
    this.t = 0;
  }

  clear() {
    this.pointAt(null);
    this.showGesture(null);
  }

  // Floating card 0.75m in front of the head, slightly below eye level.
  showPanel(title, body, head) {
    const { ctx, canvas, tex } = this.panel.card;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(22, 24, 29, 0.92)';
    rrect(ctx, 0, 0, w, h, 40);
    ctx.fill();
    ctx.fillStyle = '#ffb36b';
    ctx.font = `700 64px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, w / 2, 120);
    ctx.fillStyle = '#f4efe6';
    ctx.font = `500 44px ${SANS}`;
    ctx.fillText(body, w / 2, 250);
    tex.needsUpdate = true;
    if (head) this.placePanel(head);
    this.panel.mesh.visible = true;
  }

  placePanel(head) {
    // head: { pos: Vector3, yaw: number }
    const m = this.panel.mesh;
    m.position.set(head.pos.x - Math.sin(head.yaw) * 0.75, head.pos.y - 0.12, head.pos.z - Math.cos(head.yaw) * 0.75);
    m.rotation.set(0, head.yaw, 0);
  }

  hidePanel() {
    this.panel.mesh.visible = false;
  }

  update(dt) {
    this.t += dt;
    if (this.target) {
      const p = this.target(this._v);
      if (p) {
        this.arrow.position.copy(p);
        this.arrow.position.y += 0.015 + Math.abs(Math.sin(this.t * 4)) * 0.03;
        this.arrow.rotation.y += dt * 2;
      }
    }
    const g = this.gesture;
    if (g) {
      // loop: 1.4s of motion then a short rest
      const u = (this.t % 1.8) / 1.4;
      const k = Math.min(u, 1);
      let y = 0;
      let roll = 0;
      let opacity = 0.6;
      if (g.kind === 'slam') {
        // fast palm-down swipe onto the lid
        const e = k < 0.5 ? 0 : Math.min(1, (k - 0.5) / 0.25);
        y = 0.22 - e * e * 0.2;
      } else if (g.kind === 'flip') {
        // palm turns up and lifts
        roll = Math.min(1, k / 0.6) * Math.PI;
        y = 0.04 + Math.max(0, (k - 0.5) / 0.5) * 0.18;
      } else if (g.kind === 'flat') {
        // lay the hand flat on the desk and hold
        y = Math.max(0, 0.18 * (1 - k * 1.6));
      }
      if (u > 1) opacity = 0.6 * Math.max(0, 1 - (u - 1) * 3);
      this.ghost.traverse((o) => {
        if (o.material) o.material.opacity = opacity;
      });
      this._v.copy(g.localPos);
      this._v.y += y;
      // tilted toward the player so they see the back of the hand, not its edge
      this._m.compose(this._v, this._q.setFromEuler(this._e.set(g.kind === 'flat' ? 0.15 : 0.7, 0, roll)), this._s.set(1.3, 1.3, 1.3));
      this._m.premultiply(g.anchorMatrix());
      this._m.decompose(this.ghost.position, this.ghost.quaternion, this.ghost.scale);
    }
  }
}
