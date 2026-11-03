import * as THREE from 'three';
import { std, damp, clamp } from '../util.js';
import { SAUSAGE_R, MITTEN_R } from './hands.js';

// Desktop simulator: the mouse drives a cartoon pointing hand whose fingertip is a real
// collider, so clicking a key "pokes" it exactly the way a tracked fingertip would.
// Physical keyboard typing is also supported (mapped through the 3D keyboard's layout,
// so reshuffles and curses still apply).

const HOVER = 0.04;
const PRESS = -0.016;

export class DesktopInput {
  constructor({ camera, dom, scene, targets, planeY, onLaptopClick }) {
    this.camera = camera;
    this.dom = dom;
    this.targets = targets; // { keys: Mesh[], button: Object3D, laptop: Mesh[] }
    this.planeY = planeY; // world Y of the key tops
    this.onLaptopClick = onLaptopClick;
    this.finger = { pos: new THREE.Vector3(0, planeY + HOVER, -0.4), prev: new THREE.Vector3(), radius: 0.009, active: true, wasActive: true };
    this.ndc = new THREE.Vector2(0, -0.4);
    this.ray = new THREE.Raycaster();
    this.down = false;
    this.holdT = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.look = { left: false, right: false, up: false, down: false };
    this.dragging = false;
    this.shake = 0;
    this.enabled = true;
    this.hovering = null;
    this.curseKey = '';

    this.hand = this.buildHand();
    scene.add(this.hand);
    this.coffeeHand = this.buildCoffeeHand();
    camera.add(this.coffeeHand);

    dom.addEventListener('pointermove', (e) => this.onMove(e));
    dom.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.dragging = false;
      else this.down = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  buildHand() {
    const g = new THREE.Group();
    this.skin = std(0xe8a88a, { roughness: 0.6 });
    // index finger runs from the tip (group origin) up and back toward the palm
    this.fingerDir = new THREE.Vector3(0, 0.75, 0.66).normalize();
    this.fingerMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.07, 6, 12), this.skin);
    this.fingerMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.fingerDir);
    this.fingerMesh.position.copy(this.fingerDir).multiplyScalar(0.045);
    g.add(this.fingerMesh);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.095), this.skin);
    palm.position.set(0.018, 0.1, 0.1);
    palm.rotation.x = -0.6;
    // curled fingers
    for (let i = 0; i < 3; i++) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), this.skin);
      k.scale.set(1, 1, 1.4);
      k.position.set(-0.018 + i * 0.022, -0.025, -0.035);
      palm.add(k);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.04, 6, 10), this.skin);
    thumb.position.set(-0.04, 0.0, -0.01);
    thumb.rotation.set(0.3, 0, 0.9);
    palm.add(thumb);
    g.add(palm);
    this.mittenMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), std(0xc0262d, { roughness: 1 }));
    this.mittenMesh.scale.set(0.06, 0.05, 0.09);
    this.mittenMesh.position.set(0.01, 0.06, 0.06);
    this.mittenMesh.rotation.x = -0.6;
    this.mittenMesh.visible = false;
    g.add(this.mittenMesh);
    this.palmMesh = palm;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  buildCoffeeHand() {
    // shown bottom-left of the view when the left hand is "holding coffee"
    const g = new THREE.Group();
    const white = std(0xffffff, { roughness: 0.3 });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 20), white);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), std(0x4a2c17));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.045;
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), std(0xe8a88a));
    fist.scale.set(1, 0.9, 1.1);
    fist.position.set(0.05, -0.01, 0);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.25, 16), std(0x4f6fae));
    sleeve.position.set(0.09, -0.08, 0.06);
    sleeve.rotation.z = 0.9;
    g.add(mug, coffee, fist, sleeve);
    g.position.set(-0.2, -0.17, -0.38);
    g.visible = false;
    return g;
  }

  setNdc(e) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  onMove(e) {
    if (this.dragging) {
      this.yaw = clamp(this.yaw - e.movementX * 0.004, -1.4, 1.4);
      this.pitch = clamp(this.pitch - e.movementY * 0.004, -0.6, 0.9);
      return;
    }
    this.setNdc(e);
  }

  onDown(e) {
    if (!this.enabled) return;
    if (e.button === 2) {
      this.dragging = true;
      return;
    }
    if (e.button !== 0) return;
    this.setNdc(e);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects(this.targets.laptop, false)[0];
    const keyHit = this.ray.intersectObjects(this.targets.keys, false)[0];
    if (hit && (!keyHit || hit.distance < keyHit.distance)) {
      this.onLaptopClick();
      return;
    }
    this.down = true;
    this.holdT = 0.12; // even a very quick click pokes all the way down
  }

  setCurses(curses) {
    const mittens = curses.has('mittens');
    const sausage = curses.has('sausage');
    this.finger.radius = mittens ? MITTEN_R : sausage ? SAUSAGE_R : 0.009;
    const key = `${mittens}${sausage}`;
    if (key !== this.curseKey) {
      this.curseKey = key;
      this.fingerMesh.geometry.dispose();
      this.fingerMesh.geometry = new THREE.CapsuleGeometry(sausage ? SAUSAGE_R : 0.009, sausage ? 0.06 : 0.07, 6, 12);
      this.fingerMesh.visible = !mittens;
      this.palmMesh.visible = !mittens;
      this.mittenMesh.visible = mittens;
    }
    this.coffeeHand.visible = curses.has('coffee');
  }

  update(dt, base) {
    // camera: base pose plus look offsets and shake
    const look = this.look;
    this.yaw = clamp(this.yaw + ((look.left ? 1 : 0) - (look.right ? 1 : 0)) * dt * 1.5, -1.4, 1.4);
    this.pitch = clamp(this.pitch + ((look.up ? 1 : 0) - (look.down ? 1 : 0)) * dt * 1.2, -0.6, 0.9);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake * 0.02;
    this.camera.position.set(base.x + (Math.random() - 0.5) * sh, base.y + (Math.random() - 0.5) * sh, base.z);
    this.camera.rotation.set(base.pitch + this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();

    // where is the cursor on the key plane?
    this.ray.setFromCamera(this.ndc, this.camera);
    const r = this.ray.ray;
    const f = this.finger;
    f.prev.copy(f.pos);
    if (Math.abs(r.direction.y) > 1e-4) {
      const t = (this.planeY - r.origin.y) / r.direction.y;
      if (t > 0 && t < 4) {
        const x = r.origin.x + r.direction.x * t;
        const z = r.origin.z + r.direction.z * t;
        this.holdT = Math.max(0, this.holdT - dt);
        const pressing = this.down || this.holdT > 0;
        const y = this.planeY + (pressing ? PRESS + f.radius : HOVER + f.radius);
        f.pos.x = damp(f.pos.x, x, 30, dt);
        f.pos.z = damp(f.pos.z, z, 30, dt);
        f.pos.y = damp(f.pos.y, y, pressing ? 45 : 25, dt);
      }
    }
    this.hand.position.copy(f.pos);
    this.hand.position.y -= f.radius - 0.009;
    const laptopHover = this.ray.intersectObjects(this.targets.laptop, false)[0];
    this.dom.style.cursor = laptopHover ? 'pointer' : 'none';
  }
}
