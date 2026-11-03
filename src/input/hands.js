import * as THREE from '@iwsdk/core';
import { AssetManager } from '@iwsdk/core';
import { std } from '../util.js';

// WebXR hand tracking on IWSDK (with a controller fallback).
// IWSDK draws the hands and tracks the input sources; this file reads the raw joint poses
// each XR frame and turns them into fingertip colliders for the press system and palm
// data for the laptop-slam gesture. Hand curses change what the colliders are:
//   coffee: the left hand holds a mug (the mug is the collider);
//   mittens: all fingers merge into one fat blob.

const TYPING_TIPS = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip'];
const JOINTS = [
  'wrist', 'index-finger-metacarpal', 'middle-finger-metacarpal', 'pinky-finger-metacarpal',
  'ring-finger-tip', ...TYPING_TIPS,
];
export const MITTEN_R = 0.034;
const MUG_R = 0.045;

// IWSDK fetches hand and controller models from a CDN. We ship copies (MIT, from
// @webxr-input-profiles/assets, see public/input/LICENSE.md) and serve those instead,
// so the game does not depend on the CDN being up during judging.
const PROFILE_CDN = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/';
const BUNDLED = new Set(
  ['generic-hand', 'meta-quest-touch-plus', 'oculus-touch-v3'].flatMap((p) => [`${p}/left.glb`, `${p}/right.glb`])
);
export function serveInputModelsLocally() {
  const load = AssetManager.loadGLTF.bind(AssetManager);
  AssetManager.loadGLTF = (urlOrKey, key) => {
    if (key == null && typeof urlOrKey === 'string' && urlOrKey.startsWith(PROFILE_CDN)) {
      const file = urlOrKey.slice(PROFILE_CDN.length);
      // cache under the CDN address so IWSDK finds it on the next request too
      if (BUNDLED.has(file)) return load(`${import.meta.env.BASE_URL}input/${file}`, urlOrKey);
    }
    return load(urlOrKey, key);
  };
}

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
  constructor(world) {
    this.world = world;
    const mittenMat = std(0xc0262d, { roughness: 1 });
    const scene = world.scene;

    this.slots = ['left', 'right'].map((handedness) => {
      const grip = world.player.gripSpaces[handedness];
      const stylus = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.1, 10), std(0xffb36b));
      stylus.rotation.x = -Math.PI / 2;
      stylus.position.set(0, -0.02, -0.06);
      stylus.visible = false;
      grip.add(stylus);

      const mitten = new THREE.Group();
      const mitBody = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mittenMat);
      mitBody.scale.set(0.055, 0.035, 0.085);
      const mitThumb = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mittenMat);
      mitThumb.scale.set(0.02, 0.02, 0.04);
      mitThumb.position.set(handedness === 'left' ? 0.05 : -0.05, 0, 0);
      mitten.add(mitBody, mitThumb);
      mitten.visible = false;
      scene.add(mitten);
      const mug = makeMug();
      mug.visible = false;
      scene.add(mug);

      return {
        handedness, grip, stylus, mitten, mug,
        source: null, isHand: false, handOK: false, modelShown: true,
        joints: Object.fromEntries(JOINTS.map((j) => [j, { pos: new THREE.Vector3(), r: 0.008 }])),
        fingers: [makeFinger(), makeFinger(), makeFinger()],
        palm: new THREE.Vector3(), prevPalm: new THREE.Vector3(), vel: new THREE.Vector3(),
        normal: new THREE.Vector3(), hasNormal: false, tracked: false,
      };
    });
    this.byHand = { left: this.slots[0], right: this.slots[1] };
  }

  // Read joint poses straight from the current XR frame. Called from the game system
  // each frame before update(), so presses use this frame's fingertips.
  readFrame(frame) {
    const ref = this.world.renderer.xr.getReferenceSpace();
    if (!ref) return;
    const player = this.world.player.matrixWorld;
    for (const s of this.slots) s.source = null;
    for (const src of frame.session.inputSources) {
      const s = this.byHand[src.handedness];
      if (!s) continue;
      s.source = src;
      s.isHand = !!src.hand;
      if (!src.hand) continue;
      let ok = true;
      for (const name of JOINTS) {
        const space = src.hand.get(name);
        const pose = space && frame.getJointPose(space, ref);
        if (!pose) {
          ok = false;
          break;
        }
        const p = pose.transform.position;
        const j = s.joints[name];
        j.pos.set(p.x, p.y, p.z).applyMatrix4(player);
        j.r = pose.radius || 0.008;
      }
      s.handOK = ok;
    }
  }

  get fingers() {
    return this.slots.flatMap((s) => s.fingers);
  }

  get palms() {
    return this.slots.filter((s) => s.tracked).map((s) => ({ pos: s.palm, vel: s.vel, normal: s.hasNormal ? s.normal : null, isHand: s.isHand }));
  }

  // Show or hide IWSDK's hand model (mittens and the coffee mug replace it).
  showModel(s, show) {
    if (s.modelShown === show) return;
    const visual = this.world.input.xr.visualAdapters.hand[s.handedness]?.visual;
    if (!visual) return;
    visual.toggle(show);
    s.modelShown = show;
  }

  hideAll() {
    for (const s of this.slots) {
      s.mitten.visible = false;
      s.mug.visible = false;
      s.stylus.visible = false;
      s.fingers.forEach((f) => (f.active = false));
      s.tracked = false;
    }
  }

  update(dt, curses) {
    for (const s of this.slots) {
      for (const f of s.fingers) {
        f.wasActive = f.active;
        f.prev.copy(f.pos);
        f.active = false;
      }
      s.mitten.visible = false;
      s.mug.visible = false;
      s.stylus.visible = false;
      if (!s.source) {
        s.tracked = false;
        continue;
      }

      const coffee = curses.has('coffee') && s.handedness === 'left';
      const mittens = curses.has('mittens');
      s.prevPalm.copy(s.palm);
      const J = s.joints;

      if (s.isHand && s.handOK) {
        this.showModel(s, !coffee && !mittens);
        const wrist = J['wrist'].pos;
        s.palm.copy(J['middle-finger-metacarpal'].pos);
        _a.subVectors(J['index-finger-metacarpal'].pos, wrist);
        _b.subVectors(J['pinky-finger-metacarpal'].pos, wrist);
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
          // one blob between the fingertips and the palm
          _c.set(0, 0, 0);
          for (const t of ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip']) _c.add(J[t].pos);
          _c.multiplyScalar(1 / 3).lerp(s.palm, 0.35);
          const f = s.fingers[0];
          f.active = true;
          f.radius = MITTEN_R;
          f.pos.copy(_c);
          // orient the mitten: forward = palm -> fingers, up = back of hand
          const fwd = _a.subVectors(_c, wrist).normalize();
          const up = _b.copy(s.normal).negate();
          const side = _c.crossVectors(up, fwd).normalize();
          up.crossVectors(fwd, side);
          _m.makeBasis(side, up, fwd);
          s.mitten.visible = true;
          s.mitten.position.copy(f.pos).lerp(s.palm, 0.2);
          s.mitten.quaternion.setFromRotationMatrix(_m);
        } else {
          TYPING_TIPS.forEach((t, k) => {
            const f = s.fingers[k];
            f.active = true;
            f.radius = Math.max(J[t].r, 0.008);
            f.pos.copy(J[t].pos);
          });
        }
      } else if (!s.isHand) {
        // controller: a little stylus on the controller acts as the fingertip
        s.grip.updateMatrixWorld();
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
          f.radius = mittens ? MITTEN_R : 0.01;
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
