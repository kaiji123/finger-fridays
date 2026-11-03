import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { std } from '../util.js';

// WebXR hand tracking (with a controller fallback).
// Produces fingertip colliders for the press system and palm data for the laptop-slam gesture.
// Hand curses change what the colliders are:
//   sausage: fingertips swell; coffee: left hand holds a mug (the mug is the collider);
//   mittens: all fingers merge into one fat blob.

const TYPING_TIPS = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip'];
const ALL_TIPS = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
const DISTAL = {
  'thumb-tip': 'thumb-phalanx-distal',
  'index-finger-tip': 'index-finger-phalanx-distal',
  'middle-finger-tip': 'middle-finger-phalanx-distal',
  'ring-finger-tip': 'ring-finger-phalanx-distal',
  'pinky-finger-tip': 'pinky-finger-phalanx-distal',
};
export const SAUSAGE_R = 0.022;
export const MITTEN_R = 0.034;
const MUG_R = 0.045;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

function makeFinger() {
  return { pos: new THREE.Vector3(), prev: new THREE.Vector3(), radius: 0.008, active: false, wasActive: false };
}

function makeMug() {
  const g = new THREE.Group();
  const white = std(0xffffff, { roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 20), white);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16), white);
  handle.position.x = 0.045;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), std(0x4a2c17, { roughness: 0.2 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.042;
  g.add(body, handle, coffee);
  return g;
}

export class XRHands {
  constructor(renderer, scene) {
    const factory = new XRHandModelFactory();
    const skin = std(0xe8a88a, { roughness: 0.6 });
    const sausageGeo = new THREE.SphereGeometry(1, 16, 12);
    const mittenMat = std(0xc0262d, { roughness: 1 });

    this.slots = [0, 1].map((i) => {
      const hand = renderer.xr.getHand(i);
      const grip = renderer.xr.getControllerGrip(i);
      scene.add(hand, grip);
      const model = factory.createHandModel(hand, 'mesh');
      hand.add(model);

      const stylus = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.1, 10), std(0xffb36b));
      stylus.rotation.x = -Math.PI / 2;
      stylus.position.set(0, -0.02, -0.06);
      stylus.visible = false;
      grip.add(stylus);

      const sausages = ALL_TIPS.map(() => {
        const s = new THREE.Mesh(sausageGeo, skin);
        s.visible = false;
        scene.add(s);
        return s;
      });
      const mitten = new THREE.Group();
      const mitBody = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mittenMat);
      mitBody.scale.set(0.055, 0.035, 0.085);
      const mitThumb = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mittenMat);
      mitThumb.scale.set(0.02, 0.02, 0.04);
      mitThumb.position.set(-0.05, 0, 0.0);
      mitten.add(mitBody, mitThumb);
      mitten.visible = false;
      scene.add(mitten);
      const mug = makeMug();
      mug.visible = false;
      scene.add(mug);

      const slot = {
        i, hand, grip, model, stylus, sausages, mitten, mitThumb, mug,
        connected: false, isHand: false, handedness: null,
        fingers: [makeFinger(), makeFinger(), makeFinger()],
        palm: new THREE.Vector3(), prevPalm: new THREE.Vector3(), vel: new THREE.Vector3(),
        normal: new THREE.Vector3(), hasNormal: false, tracked: false,
      };
      hand.addEventListener('connected', (e) => {
        slot.connected = true;
        slot.isHand = !!e.data.hand;
        slot.handedness = e.data.handedness;
        slot.tracked = false;
      });
      hand.addEventListener('disconnected', () => {
        slot.connected = false;
        slot.tracked = false;
      });
      return slot;
    });
  }

  get fingers() {
    return this.slots.flatMap((s) => s.fingers);
  }

  get palms() {
    return this.slots.filter((s) => s.tracked).map((s) => ({ pos: s.palm, vel: s.vel, normal: s.hasNormal ? s.normal : null }));
  }

  hideAll() {
    for (const s of this.slots) {
      s.sausages.forEach((m) => (m.visible = false));
      s.mitten.visible = false;
      s.mug.visible = false;
      s.stylus.visible = false;
      s.fingers.forEach((f) => (f.active = false));
    }
  }

  update(dt, curses) {
    for (const s of this.slots) {
      for (const f of s.fingers) {
        f.wasActive = f.active;
        f.prev.copy(f.pos);
        f.active = false;
      }
      s.sausages.forEach((m) => (m.visible = false));
      s.mitten.visible = false;
      s.mug.visible = false;
      s.stylus.visible = false;
      s.model.visible = true;
      if (!s.connected) {
        s.tracked = false;
        continue;
      }

      const coffee = curses.has('coffee') && s.handedness === 'left';
      const mittens = curses.has('mittens');
      const sausage = curses.has('sausage');
      s.prevPalm.copy(s.palm);
      const J = s.hand.joints;

      if (s.isHand && J['index-finger-tip'] && J['wrist']) {
        const wrist = J['wrist'].position;
        s.palm.copy(J['middle-finger-metacarpal'].position);
        _a.subVectors(J['index-finger-metacarpal'].position, wrist);
        _b.subVectors(J['pinky-finger-metacarpal'].position, wrist);
        s.normal.crossVectors(_a, _b).normalize();
        if (s.handedness === 'left') s.normal.negate();
        s.hasNormal = true;

        if (coffee) {
          // mug held in front of the palm, kept upright
          s.mug.visible = true;
          s.mug.position.copy(s.palm).addScaledVector(s.normal, 0.06);
          s.mug.quaternion.setFromAxisAngle(UP, Math.atan2(_a.x, _a.z));
          const f = s.fingers[0];
          f.active = true;
          f.radius = MUG_R;
          f.pos.copy(s.mug.position).y -= 0.03;
        } else if (mittens) {
          s.model.visible = false;
          // one blob between the fingertips and the palm
          _c.set(0, 0, 0);
          for (const t of ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip']) _c.add(J[t].position);
          _c.multiplyScalar(1 / 3).lerp(s.palm, 0.35);
          const f = s.fingers[0];
          f.active = true;
          f.radius = MITTEN_R;
          f.pos.copy(_c);
          // orient the mitten: forward = palm -> fingers, up = back of hand
          const fwd = _a.subVectors(_c, wrist).normalize();
          const up = _b.copy(s.normal).negate();
          const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
          up.crossVectors(fwd, side);
          _m.makeBasis(side, up, fwd);
          s.mitten.visible = true;
          s.mitten.position.copy(_c).lerp(s.palm, 0.2);
          s.mitten.quaternion.setFromRotationMatrix(_m);
          s.mitThumb.position.x = s.handedness === 'left' ? 0.05 : -0.05;
        } else {
          TYPING_TIPS.forEach((t, k) => {
            const f = s.fingers[k];
            f.active = true;
            f.radius = sausage ? SAUSAGE_R : Math.max(J[t].jointRadius || 0.008, 0.008);
            f.pos.copy(J[t].position);
          });
        }
        if (sausage && !mittens) {
          ALL_TIPS.forEach((t, k) => {
            if (coffee) return;
            const m = s.sausages[k];
            const tip = J[t].position;
            const dir = _c.subVectors(tip, J[DISTAL[t]].position).normalize();
            m.visible = true;
            m.scale.set(SAUSAGE_R, SAUSAGE_R * 1.9, SAUSAGE_R);
            m.position.copy(tip).addScaledVector(dir, -SAUSAGE_R * 0.9);
            m.quaternion.setFromUnitVectors(UP, dir);
          });
        }
      } else if (!s.isHand) {
        // controller: a little stylus on the controller acts as the fingertip
        s.stylus.visible = !coffee;
        s.palm.setFromMatrixPosition(s.grip.matrixWorld);
        s.hasNormal = false;
        const f = s.fingers[0];
        if (coffee) {
          s.mug.visible = true;
          s.mug.position.copy(s.palm);
          f.radius = MUG_R;
          f.pos.copy(s.palm).y -= 0.03;
        } else {
          f.radius = mittens ? MITTEN_R : sausage ? SAUSAGE_R : 0.01;
          f.pos.set(0, -0.02, -0.11).applyMatrix4(s.grip.matrixWorld);
        }
        f.active = true;
      } else {
        s.tracked = false;
        continue;
      }

      if (!s.tracked) {
        s.prevPalm.copy(s.palm);
        s.vel.set(0, 0, 0);
      }
      s.tracked = true;
      _a.subVectors(s.palm, s.prevPalm).divideScalar(Math.max(dt, 1 / 120));
      s.vel.lerp(_a, 0.5);
      // fingers that just appeared must not register a press on their first frame
      for (const f of s.fingers) if (f.active && !f.wasActive) f.prev.copy(f.pos);
    }
  }
}
