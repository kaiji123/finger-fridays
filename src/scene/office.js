import * as THREE from '@iwsdk/core';
import { canvasTexture, rrect, SANS, MONO, std, box, mergeStatic } from '../util.js';

// The office, in "office space": the player's chair is at the origin, facing -z.
// Desk top is at y = 0.74. Everything lives in one group so it can be re-centred
// around the player's head in VR, or moved onto the player's real desk in MR.
export const DESK_Y = 0.74;

function skylineTexture() {
  const { ctx, canvas, tex } = canvasTexture(2048, 512);
  const w = canvas.width;
  const h = canvas.height;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5d6fa8');
  sky.addColorStop(0.45, '#f29e6d');
  sky.addColorStop(0.75, '#ffd29a');
  sky.addColorStop(1, '#ffe7c2');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255, 236, 190, 0.9)';
  ctx.beginPath();
  ctx.arc(w * 0.66, h * 0.72, 70, 0, Math.PI * 2);
  ctx.fill();
  // two layers of buildings with lit windows
  const layer = (color, minH, maxH, winAlpha) => {
    let x = 0;
    while (x < w) {
      const bw = 60 + Math.random() * 130;
      const bh = minH + Math.random() * (maxH - minH);
      ctx.fillStyle = color;
      ctx.fillRect(x, h - bh, bw, bh);
      ctx.fillStyle = `rgba(255, 214, 140, ${winAlpha})`;
      for (let wy = h - bh + 14; wy < h - 10; wy += 22) {
        for (let wx = x + 10; wx < x + bw - 12; wx += 18) {
          if (Math.random() < 0.35) ctx.fillRect(wx, wy, 8, 11);
        }
      }
      x += bw + 6;
    }
  };
  layer('#6b5f7a', 120, 300, 0.35);
  layer('#3e3a4f', 60, 220, 0.6);
  return tex;
}

function stickyNote(text, color) {
  const { ctx, tex } = canvasTexture(256, 256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#2a2a2a';
  ctx.font = `700 40px ${SANS}`;
  ctx.textAlign = 'center';
  text.split('\n').forEach((l, i, a) => ctx.fillText(l, 128, 128 + (i - (a.length - 1) / 2) * 50));
  return new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
}

// shared by every chair and neighbouring desk so the merged shell needs fewer draw calls
let shared;
const mats = () => (shared ??= { metal: std(0x333333), screen: std(0x24262c), seat: std(0x3d4a63) });

function chair(mat) {
  const g = new THREE.Group();
  g.add(box(0.48, 0.07, 0.46, mat, { y: 0.48 }));
  g.add(box(0.46, 0.55, 0.06, mat, { y: 0.8, z: 0.22 }));
  g.add(box(0.05, 0.42, 0.05, mats().metal, { y: 0.24 }));
  g.add(box(0.5, 0.03, 0.5, mats().metal, { y: 0.03 }));
  return g;
}

function cubicle(fabric, trim, deskMat) {
  // A neighbouring cubicle facing -z: front partition, side partitions, desk, monitor, chair.
  const g = new THREE.Group();
  g.add(box(2.2, 1.25, 0.05, fabric, { y: 0.625, z: -1.15 }));
  g.add(box(2.2, 0.03, 0.07, trim, { y: 1.26, z: -1.15 }));
  for (const x of [-1.1, 1.1]) {
    g.add(box(0.05, 1.25, 1.6, fabric, { x, y: 0.625, z: -0.35 }));
    g.add(box(0.07, 0.03, 1.6, trim, { x, y: 1.26, z: -0.35 }));
  }
  g.add(box(1.6, 0.04, 0.8, deskMat, { y: DESK_Y - 0.02, z: -0.65 }));
  g.add(box(0.5, 0.32, 0.03, mats().screen, { y: DESK_Y + 0.3, z: -0.85 }));
  const c = chair(mats().seat);
  c.position.z = 0.15;
  c.rotation.y = (Math.random() - 0.5) * 0.8;
  g.add(c);
  return g;
}

export function buildOffice() {
  const office = new THREE.Group();
  // The room around the desk. Hidden in mixed reality, where the player's real room replaces it.
  const shell = new THREE.Group();
  office.add(shell);

  const fabric = std(0x8796ad, { roughness: 1 });
  const trim = std(0xb8bcc4, { roughness: 0.5, metalness: 0.3 });
  const deskMat = std(0xd9c3a0, { roughness: 0.65 });
  const wallMat = std(0xe8e2d6);

  // floor: carpet tiles
  const carpet = canvasTexture(256, 256);
  carpet.ctx.fillStyle = '#5b6474';
  carpet.ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    carpet.ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
    carpet.ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  carpet.ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  carpet.ctx.strokeRect(0, 0, 256, 256);
  carpet.tex.wrapS = carpet.tex.wrapT = THREE.RepeatWrapping;
  carpet.tex.repeat.set(30, 30);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: carpet.tex, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  shell.add(floor);

  // ceiling + light panels
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), std(0xf1efe9));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 2.8;
  shell.add(ceiling);
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xfff8ec });
  for (let x = -6; x <= 6; x += 3) {
    for (let z = -6; z <= 3; z += 3) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), panelMat);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, 2.79, z);
      shell.add(p);
    }
  }

  // far wall with windows (sunset skyline), side walls
  const farZ = -7;
  shell.add(box(30, 2.8, 0.2, wallMat, { y: 1.4, z: farZ - 0.1, shadow: false }));
  const skyline = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.7), new THREE.MeshBasicMaterial({ map: skylineTexture(), toneMapped: false }));
  skyline.position.set(0, 1.55, farZ + 0.01);
  shell.add(skyline);
  for (let x = -7; x <= 7; x += 1.75) shell.add(box(0.08, 1.8, 0.06, trim, { x, y: 1.55, z: farZ + 0.03, shadow: false }));
  shell.add(box(14.1, 0.08, 0.12, trim, { y: 0.66, z: farZ + 0.05, shadow: false }));
  shell.add(box(14.1, 0.08, 0.06, trim, { y: 2.44, z: farZ + 0.03, shadow: false }));
  for (const x of [-9, 9]) shell.add(box(0.2, 2.8, 20, wallMat, { x, y: 1.4, z: -1, shadow: false }));
  shell.add(box(30, 2.8, 0.2, wallMat, { y: 1.4, z: 4.5, shadow: false }));

  // wall clock above the windows
  const clock = canvasTexture(512, 512);
  const clockMesh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ map: clock.tex }));
  clockMesh.position.set(0, 2.55, farZ + 0.02);
  shell.add(clockMesh);
  const drawClock = (minutesPastFour) => {
    const { ctx } = clock;
    ctx.fillStyle = '#fbfaf6';
    ctx.beginPath();
    ctx.arc(256, 256, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#24262c';
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillStyle = '#24262c';
      ctx.fillRect(256 + Math.sin(a) * 200 - 6, 256 - Math.cos(a) * 200 - 20, 12, 40);
    }
    const hand = (angle, len, width, color) => {
      ctx.save();
      ctx.translate(256, 256);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.fillRect(-width / 2, -len, width, len + 20);
      ctx.restore();
    };
    const hours = 4 + minutesPastFour / 60;
    hand((hours / 12) * Math.PI * 2, 120, 18, '#24262c');
    hand((minutesPastFour / 60) * Math.PI * 2, 190, 12, '#24262c');
    hand(((minutesPastFour * 60) % 60) / 60 * Math.PI * 2, 200, 4, '#dc2626');
    clock.tex.needsUpdate = true;
  };
  drawClock(57);

  // columns
  for (const x of [-7, 7]) shell.add(box(0.5, 2.8, 0.5, wallMat, { x, y: 1.4, z: -1.0 }));

  // our cubicle
  shell.add(box(2.2, 1.25, 0.05, fabric, { y: 0.625, z: -1.15 }));
  shell.add(box(2.2, 0.03, 0.07, trim, { y: 1.26, z: -1.15 }));
  for (const x of [-1.1, 1.1]) {
    shell.add(box(0.05, 1.25, 1.75, fabric, { x, y: 0.625, z: -0.28 }));
    shell.add(box(0.07, 0.03, 1.75, trim, { x, y: 1.26, z: -0.28 }));
  }
  const desk = box(1.6, 0.04, 0.8, deskMat, { y: DESK_Y - 0.02, z: -0.65 });
  shell.add(desk);
  shell.add(box(0.03, DESK_Y - 0.04, 0.7, trim, { x: -0.78, y: (DESK_Y - 0.04) / 2, z: -0.65 }));
  shell.add(box(0.03, DESK_Y - 0.04, 0.7, trim, { x: 0.78, y: (DESK_Y - 0.04) / 2, z: -0.65 }));
  shell.add(box(1.5, 0.4, 0.02, trim, { y: 0.45, z: -1.0 }));

  // sticky notes on the front partition
  const notes = [
    ['SEND THE\nEMAIL!!', '#ffe066', -0.55, 1.08, 0.08],
    ['5PM =\nFREEDOM', '#ffa8a8', 0.5, 1.12, -0.1],
    ['gary\nbday?', '#a5d8ff', 0.68, 0.98, 0.15],
    ['DONT\nPANIC', '#b2f2bb', -0.75, 0.94, -0.12],
  ];
  for (const [t, c, x, y, r] of notes) {
    const n = stickyNote(t, c);
    n.position.set(x, y, -1.12);
    n.rotation.z = r;
    shell.add(n);
  }
  // "Employee of the month" frame on the side partition
  const eotm = canvasTexture(256, 320);
  eotm.ctx.fillStyle = '#c9a227';
  eotm.ctx.fillRect(0, 0, 256, 320);
  eotm.ctx.fillStyle = '#fff8e6';
  eotm.ctx.fillRect(14, 14, 228, 292);
  eotm.ctx.fillStyle = '#24262c';
  eotm.ctx.font = `700 24px ${SANS}`;
  eotm.ctx.textAlign = 'center';
  eotm.ctx.fillText('EMPLOYEE', 128, 54);
  eotm.ctx.fillText('OF THE MONTH', 128, 84);
  eotm.ctx.font = `500 120px ${SANS}`;
  eotm.ctx.fillText('?', 128, 220);
  eotm.ctx.font = `500 22px ${MONO}`;
  eotm.ctx.fillText('(not you)', 128, 280);
  const eotmMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), new THREE.MeshStandardMaterial({ map: eotm.tex }));
  eotmMesh.position.set(1.07, 1.0, -0.6);
  eotmMesh.rotation.y = -Math.PI / 2;
  shell.add(eotmMesh);

  // props: plant, desk lamp, pen cup
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.12, 16), std(0xc4693d));
  pot.position.set(0.66, DESK_Y + 0.06, -0.95);
  office.add(pot);
  const leafMat = std(0x3f8f4f);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), leafMat);
    leaf.scale.set(0.5, 2.2, 0.25);
    const a = (i / 9) * Math.PI * 2;
    leaf.position.set(0.66 + Math.cos(a) * 0.035, DESK_Y + 0.2, -0.95 + Math.sin(a) * 0.035);
    leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    leaf.castShadow = true;
    office.add(leaf);
  }
  const pens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 14), std(0x2b2e36));
  pens.position.set(-0.3, DESK_Y + 0.05, -1.0);
  office.add(pens);
  ['#dc2626', '#2563eb', '#16a34a'].forEach((c, i) => {
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), std(c));
    pen.position.set(-0.3 + (i - 1) * 0.012, DESK_Y + 0.12, -1.0);
    pen.rotation.z = (i - 1) * 0.15;
    office.add(pen);
  });

  // desk mug (it becomes the "coffee hand" mug)
  const deskMug = new THREE.Group();
  const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 20), std(0xffffff, { roughness: 0.3 }));
  mugBody.position.y = 0.05;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16), std(0xffffff, { roughness: 0.3 }));
  handle.position.set(0.045, 0.05, 0);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), std(0x4a2c17, { roughness: 0.2 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.092;
  deskMug.add(mugBody, handle, coffee);
  deskMug.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  deskMug.position.set(-0.52, DESK_Y, -0.45);
  office.add(deskMug);

  // the big red START button
  const button = new THREE.Group();
  button.position.set(0.42, DESK_Y, -0.4);
  const btnBase = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.03, 32), std(0x2b2e36, { roughness: 0.4 }));
  btnBase.position.y = 0.015;
  btnBase.castShadow = true;
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, emissive: 0xff2020, emissiveIntensity: 0.3 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), btnMat);
  dome.scale.y = 0.55;
  dome.position.y = 0.03;
  dome.castShadow = true;
  button.add(btnBase, dome);
  const btnLabel = canvasTexture(256, 64);
  btnLabel.ctx.fillStyle = '#f4efe6';
  btnLabel.ctx.font = `700 40px ${SANS}`;
  btnLabel.ctx.textAlign = 'center';
  btnLabel.ctx.textBaseline = 'middle';
  btnLabel.ctx.fillText('START / PAUSE', 128, 34);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.04), new THREE.MeshBasicMaterial({ map: btnLabel.tex, transparent: true }));
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, 0.002, 0.11);
  button.add(label);
  office.add(button);

  // a few neighbouring cubicles to sell the office
  const spots = [
    [-2.3, 0], [2.3, 0],
    [-2.3, -3.1], [0, -3.1], [2.3, -3.1],
    [-4.6, -3.1], [4.6, -3.1],
  ];
  for (const [x, z] of spots) {
    const c = cubicle(fabric, trim, deskMat);
    c.position.set(x, 0, z);
    shell.add(c);
  }
  // water cooler
  const cooler = new THREE.Group();
  cooler.add(box(0.32, 0.9, 0.32, std(0xeeeeee), { y: 0.45 }));
  const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x8ecae6, transparent: true, opacity: 0.7, roughness: 0.1 }));
  jug.position.y = 1.1;
  cooler.add(jug);
  cooler.position.set(-3.8, 0, -1.4);
  shell.add(cooler);

  // In mixed reality the real desk shows through; this invisible plane still catches
  // the props' shadows so they sit on it instead of floating.
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.ShadowMaterial({ opacity: 0.28 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.set(0, DESK_Y + 0.001, -0.6);
  shadowCatcher.receiveShadow = true;
  shadowCatcher.visible = false;
  office.add(shadowCatcher);

  mergeStatic(shell);

  return { office, shell, shadowCatcher, desk, deskMug, button, buttonDome: dome, buttonMat: btnMat, drawClock };
}
