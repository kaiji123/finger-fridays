import * as THREE from '@iwsdk/core';

// Shared "poke a physical button with a fingertip" logic, used by every key and button.
//
// A finger is { pos, prev, radius, active }: a sphere in world space.
// A pressable is a rectangle in its frame's local XZ plane with a top surface at `top`.
// A press fires only when a fingertip crosses DOWN through (top - travel) while over the key,
// so a finger resting on a key or sliding between keys does not type.
// Fat fingers reach further sideways, so sausage fingers hit neighbouring keys by design.

const NORMAL_TIP = 0.01;
const _lp = new THREE.Vector3();
const _pp = new THREE.Vector3();

export class PressSystem {
  constructor() {
    this.items = [];
    this._inv = new Map();
  }

  add(item) {
    const it = {
      travel: 0.008,
      restY: item.mesh ? item.mesh.position.y : 0,
      down: false,
      depth: 0,
      lastPress: 0,
      enabled: () => true,
      ...item,
    };
    this.items.push(it);
    return it;
  }

  update(fingers, now) {
    this._inv.clear();
    for (const it of this.items) {
      let inv = this._inv.get(it.frame);
      if (!inv) {
        it.frame.updateWorldMatrix(true, false);
        inv = it.frame.matrixWorld.clone().invert();
        this._inv.set(it.frame, inv);
      }
      const enabled = it.enabled();
      let depth = 0;
      let pressed = false;
      for (const f of fingers) {
        if (!f.active) continue;
        _lp.copy(f.pos).applyMatrix4(inv);
        _pp.copy(f.prev).applyMatrix4(inv);
        const reach = Math.max(0, f.radius - NORMAL_TIP);
        const dx = Math.max(Math.abs(_lp.x - it.x) - it.w / 2, 0);
        const dz = Math.max(Math.abs(_lp.z - it.z) - it.d / 2, 0);
        if (Math.hypot(dx, dz) > reach) continue;
        const bottom = _lp.y - f.radius;
        const prevBottom = _pp.y - f.radius;
        if (bottom < it.top - 0.08) continue; // way below: hand is under the desk
        depth = Math.max(depth, it.top - bottom);
        const threshold = it.top - it.travel;
        if (enabled && !it.down && prevBottom >= threshold && bottom < threshold && now - it.lastPress > 90) {
          pressed = true;
        }
      }
      if (pressed) {
        it.down = true;
        it.lastPress = now;
        it.onPress(it);
      } else if (it.down && depth < 0.003) {
        it.down = false;
      }
      it.depth = Math.min(Math.max(depth, 0), it.travel + 0.004);
    }
  }
}
