import * as THREE from '@iwsdk/core';
import { createSystem, XRPlane, XRMesh } from '@iwsdk/core';
import { DESK_Y } from '../scene/office.js';
import { DEFAULT_PATH } from '../scene/boss.js';
import { LINES } from '../game/data.js';

// Mixed reality: the game moves onto the player's real desk and Gary walks through
// their real room.
//
// 1. Find the desk. IWSDK scene understanding reports the room's planes and meshes;
//    we take the table-height horizontal surface in front of the player.
// 2. If the room has no usable table (no room setup, or a plain surface), the player
//    lays a hand flat on their desk for a second and we use the palm height instead.
// 3. Fit Gary's path to the room: he walks in front of the nearest real wall ahead of
//    the desk, comes out of a side wall (or the door, if one is detected) and leaves
//    through the opposite wall.

// Gives the desk logic access to the planes and meshes IWSDK detects.
export class RoomSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {}

const SEARCH_SECONDS = 3.5;
const PALM_HOLD = 1.0;

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);

export class MRDesk {
  constructor({ office, room, hints, say, onPlaced }) {
    this.office = office; // { office, shell, ... } from buildOffice
    this.room = room; // RoomSystem instance
    this.hints = hints;
    this.say = say;
    this.onPlaced = onPlaced;
    this.state = 'off'; // off | searching | palm | placed
    this.t = 0;
    this.hold = 0;
    this.pathTimer = 0;
    this.head = { pos: new THREE.Vector3(), yaw: 0 };
    this.source = '';
  }

  start() {
    this.fitted = false;
    this.state = 'searching';
    this.t = 0;
    this.hold = 0;
    this.office.office.visible = false;
  }

  stop() {
    this.state = 'off';
    this.hints.hidePanel();
    this.hints.showGesture(null);
  }

  // ---- room queries ----

  planes() {
    const out = [];
    for (const e of this.room.queries.planes.entities) {
      const plane = e.getValue(XRPlane, '_plane');
      const obj = e.object3D;
      if (!plane || !obj) continue;
      obj.updateMatrixWorld();
      out.push({
        plane,
        label: (plane.semanticLabel || '').toLowerCase(),
        orientation: plane.orientation,
        pos: new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld),
        // an XRPlane's local +Y is its normal
        normal: new THREE.Vector3(0, 1, 0).applyQuaternion(obj.getWorldQuaternion(_q)).normalize(),
      });
    }
    return out;
  }

  // Top of a table-like surface in front of the player, in world space, or null.
  findTable() {
    const head = this.head.pos;
    let best = null;
    const consider = (y, x, z, label) => {
      const below = head.y - y;
      if (below < 0.15 || below > 0.95) return;
      const dist = Math.hypot(x - head.x, z - head.z);
      if (dist > 1.6) return;
      const score = dist + (label === 'table' || label === 'desk' ? -1 : 0);
      if (!best || score < best.score) best = { y, score, label };
    };
    for (const p of this.planes()) {
      if (p.orientation !== 'horizontal' && Math.abs(p.normal.y) < 0.9) continue;
      if (p.label === 'floor' || p.label === 'ceiling') continue;
      consider(p.pos.y, p.pos.x, p.pos.z, p.label);
    }
    for (const e of this.room.queries.meshes.entities) {
      const label = (e.getValue(XRMesh, 'semanticLabel') || '').toLowerCase();
      if (label !== 'table' && label !== 'desk') continue;
      const max = e.getVectorView(XRMesh, 'max');
      const min = e.getVectorView(XRMesh, 'min');
      const obj = e.object3D;
      if (!obj) continue;
      obj.updateMatrixWorld();
      _p.set((min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2).applyMatrix4(obj.matrixWorld);
      consider(_p.y, _p.x, _p.z, label);
    }
    return best;
  }

  // ---- placement ----

  place(tableY, source) {
    const { office } = this.office;
    const yaw = this.head.yaw;
    office.rotation.set(0, yaw, 0);
    // keyboard ~0.58m ahead of the eyes, like the VR desk, but at the real desk height
    const eye = new THREE.Vector3(0, 0, 0.18).applyAxisAngle(Y, yaw);
    office.position.set(this.head.pos.x - eye.x, tableY - DESK_Y, this.head.pos.z - eye.z);
    office.updateMatrixWorld(true);
    office.visible = true;
    this.state = 'placed';
    this.source = source;
    this.hints.hidePanel();
    this.hints.showGesture(null);
    this.fitPath();
    this.onPlaced?.(source);
  }

  // Fit Gary's walk to the real room (office space).
  fitPath() {
    const boss = this.office.boss;
    // never move Gary mid-walk; the next walk picks up the new path
    if (!boss || (boss.busy && this.fitted)) return;
    this.fitted = true;
    const { office } = this.office;
    office.updateMatrixWorld(true);
    _inv.copy(office.matrixWorld).invert();
    _q.copy(office.quaternion).invert();
    const walls = [];
    let floorY = null;
    let door = null;
    for (const p of this.planes()) {
      const lp = p.pos.clone().applyMatrix4(_inv);
      const ln = p.normal.clone().applyQuaternion(_q);
      if (Math.abs(ln.y) > 0.7) {
        if (p.label === 'floor' || (lp.y < DESK_Y - 0.4 && (floorY === null || lp.y < floorY))) floorY = lp.y;
        continue;
      }
      walls.push({ p: lp, n: ln, label: p.label });
      if (p.label === 'door') door = lp;
    }
    const hit = (origin, dir) => {
      let t = Infinity;
      for (const w of walls) {
        const denom = w.n.dot(dir);
        if (Math.abs(denom) < 0.3) continue;
        const s = _n.copy(w.p).sub(origin).dot(w.n) / denom;
        if (s > 0.2 && s < t) t = s;
      }
      return t;
    };
    const path = { ...DEFAULT_PATH, floorY: floorY ?? 0 };
    const front = hit(_o.set(0, 1, -0.65), _d.set(0, 0, -1));
    // at least ~0.75 m past the laptop (z -0.74), so his belly and lean clear the lid,
    // even if that puts him a little into a very close wall
    if (front !== Infinity) path.aisleZ = -0.65 - THREE.MathUtils.clamp(front - 0.4, 0.85, 1.6);
    const left = hit(_o.set(0, 1, path.aisleZ), _d.set(-1, 0, 0));
    const right = hit(_o.set(0, 1, path.aisleZ), _d.set(1, 0, 0));
    const L = THREE.MathUtils.clamp(left, 1.2, 7);
    const R = THREE.MathUtils.clamp(right, 1.2, 7);
    // enter from the door side when there is one, otherwise from the left
    if (door && door.x > 0) {
      path.startX = R;
      path.endX = -L;
    } else {
      path.startX = -L;
      path.endX = R;
    }
    boss.setPath(path);
  }

  // ---- per frame ----

  update(dt, { headPos, headYaw, palms }) {
    if (this.state === 'off') return;
    this.head.pos.copy(headPos);
    this.head.yaw = headYaw;
    this.t += dt;

    if (this.state === 'searching') {
      const table = this.findTable();
      if (table) {
        this.place(table.y, table.label === 'table' || table.label === 'desk' ? 'table' : 'surface');
        return;
      }
      if (this.t > 0.6) this.hints.showPanel('Finding your desk…', 'Look down at the desk in front of you.', this.head);
      if (this.t > SEARCH_SECONDS) {
        this.state = 'palm';
        this.hold = 0;
        this.hints.showPanel('Show me your desk', 'Lay one hand flat on it and hold still.', this.head);
        this.say?.(LINES.mr.palm);
        // demo the gesture just above where the desk probably is
        const m = new THREE.Matrix4().makeRotationY(headYaw).setPosition(headPos.x, headPos.y - 0.55, headPos.z);
        const local = new THREE.Vector3(0.06, 0.05, -0.55);
        this.hints.showGesture('flat', () => m, local);
      }
    } else if (this.state === 'palm') {
      // a late-arriving table still wins
      const table = this.findTable();
      if (table) {
        this.place(table.y, 'table');
        return;
      }
      let still = false;
      for (const p of palms) {
        if (!p.isHand || !p.normal) continue;
        const below = headPos.y - p.pos.y;
        const near = Math.hypot(p.pos.x - headPos.x, p.pos.z - headPos.z) < 0.9;
        if (p.normal.y < -0.75 && p.vel.length() < 0.08 && below > 0.2 && below < 0.95 && near) {
          still = true;
          this.palmY = p.pos.y;
        }
      }
      this.hold = still ? this.hold + dt : 0;
      if (this.hold > PALM_HOLD) this.place(this.palmY - 0.02, 'palm');
    } else if (this.state === 'placed') {
      // rooms fill in over time; keep Gary's path up to date
      this.pathTimer -= dt;
      if (this.pathTimer <= 0) {
        this.pathTimer = 2;
        this.fitPath();
      }
    }
  }
}
