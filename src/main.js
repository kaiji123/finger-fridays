import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { buildOffice, DESK_Y } from './scene/office.js';
import { Keyboard, KEY_TOP } from './scene/keyboard.js';
import { Laptop } from './scene/laptop.js';
import { StatusBoard } from './scene/board.js';
import { Boss } from './scene/boss.js';
import { PressSystem } from './input/press.js';
import { XRHands } from './input/hands.js';
import { DesktopInput } from './input/desktop.js';
import { Game } from './game/game.js';
import { initAudio } from './audio.js';

async function start() {
  // Optional Quest emulator for testing VR without a headset: add ?emulate to the URL.
  if (new URLSearchParams(location.search).has('emulate')) {
    const { XRDevice, metaQuest3 } = await import('iwer');
    const { DevUI } = await import('@iwer/devui');
    const device = new XRDevice(metaQuest3);
    device.installRuntime({ forceInstall: true });
    device.primaryInputMode = 'hand';
    new DevUI(device);
  }
  try {
    await document.fonts.load("500 40px 'JetBrains Mono'");
    await document.fonts.load("700 40px 'Space Grotesk'");
  } catch {
    // fall back to system fonts
  }

  // ---- renderer / scene ----
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  document.body.appendChild(renderer.domElement);
  document.getElementById('loading').remove();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8cfc0);
  scene.fog = new THREE.Fog(0xd8cfc0, 9, 22);

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.02, 60);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x4a5262, 1.1));
  const sun = new THREE.DirectionalLight(0xffc28a, 2.0);
  sun.position.set(-1.5, 4.5, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -3;
  sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -3;
  sun.shadow.camera.far = 15;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const fill = new THREE.PointLight(0xfff0d8, 2.5, 4, 1.5);
  fill.position.set(0.2, 2.2, 0.2);

  // ---- world ----
  const world = buildOffice();
  const { office } = world;
  scene.add(office);
  office.add(sun, sun.target, fill);

  // the wall clock only needs a redraw when its second hand moves
  let lastClock = -1;
  world.drawClockThrottled = (m) => {
    const q = Math.round(m * 60);
    if (q !== lastClock) {
      lastClock = q;
      world.drawClock(m);
    }
  };

  const keyboard = new Keyboard();
  keyboard.group.position.set(-0.04, DESK_Y, -0.4);
  office.add(keyboard.group);

  const laptop = new Laptop();
  laptop.group.position.set(0, DESK_Y, -0.74);
  office.add(laptop.group);

  const board = new StatusBoard();
  board.group.position.set(-0.58, DESK_Y, -0.92);
  board.group.rotation.y = 0.42;
  office.add(board.group);

  const boss = new Boss();
  office.add(boss.group);

  const xrHands = new XRHands(renderer, scene);
  const isXR = () => renderer.xr.isPresenting;

  // ---- game ----
  let desktop;
  const game = new Game({
    keyboard, laptop, board, boss, office: world, isXR,
    onShake: (amount) => { if (desktop) desktop.shake = Math.max(desktop.shake, amount); },
  });

  const presses = new PressSystem();
  keyboard.registerPresses(presses, (key) => game.keyPressed(key));
  presses.add({
    frame: world.button, mesh: world.buttonDome, x: 0, z: 0, w: 0.1, d: 0.1,
    top: 0.063, travel: 0.012, onPress: () => game.pressButton(),
  });

  desktop = new DesktopInput({
    camera, dom: renderer.domElement, scene,
    targets: { keys: keyboard.meshes, laptop: laptop.meshes },
    planeY: DESK_Y + KEY_TOP,
    onLaptopClick: () => game.toggleLid(),
  });
  const deskCam = { x: 0, y: 1.22, z: 0.18, pitch: -0.27 };

  // ---- desktop keyboard ----
  const physical = new Set('abcdefghijklmnopqrstuvwxyz,.?');
  window.addEventListener('keydown', (e) => {
    initAudio();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const look = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
    if (look) {
      desktop.look[look] = true;
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (k === 'Tab') {
      e.preventDefault();
      game.toggleLid();
    } else if (k === 'Enter') {
      game.pressButton();
    } else if (k === 'Escape') {
      game.pause();
    } else if (k === ' ') {
      e.preventDefault();
      game.physicalKey(' ');
    } else if (k === 'Backspace') {
      e.preventDefault();
      game.physicalKey('\b');
    } else if (physical.has(k.toLowerCase())) {
      game.physicalKey(k.toLowerCase());
    }
  });
  window.addEventListener('keyup', (e) => {
    const look = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    if (look) desktop.look[look] = false;
  });
  window.addEventListener('pointerdown', () => initAudio());

  const hud = document.getElementById('hud');
  document.getElementById('hudToggle').addEventListener('click', (e) => {
    hud.classList.toggle('min');
    e.target.textContent = hud.classList.contains('min') ? 'show help' : 'hide help';
  });

  // ---- VR ----
  const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] });
  document.body.appendChild(vrButton);

  // In VR, move the whole office so the desk sits in front of the player's head.
  let calibrateIn = -1;
  const calibrate = () => {
    const xrCam = renderer.xr.getCamera();
    const head = new THREE.Vector3();
    xrCam.getWorldPosition(head);
    const dir = new THREE.Vector3();
    xrCam.getWorldDirection(dir);
    const yaw = Math.atan2(-dir.x, -dir.z);
    office.rotation.set(0, yaw, 0);
    // eye sits 0.46m above the desk and 0.12m behind the chair origin
    const eye = new THREE.Vector3(0, deskCam.y, deskCam.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    office.position.copy(head).sub(eye);
    office.updateMatrixWorld(true);
  };
  renderer.xr.addEventListener('sessionstart', () => {
    initAudio();
    calibrateIn = 8; // wait a few frames for a stable head pose
    hud.style.display = 'none';
    game.redraw();
    const space = renderer.xr.getReferenceSpace();
    space?.addEventListener?.('reset', () => (calibrateIn = 2));
  });
  renderer.xr.addEventListener('sessionend', () => {
    office.position.set(0, 0, 0);
    office.rotation.set(0, 0, 0);
    xrHands.hideAll();
    hud.style.display = '';
    game.pause();
    game.redraw();
  });

  // Laptop gesture: fast palm-down slam over the laptop closes it, palm-up flick opens it.
  const local = new THREE.Vector3();
  const vLocal = new THREE.Vector3();
  const nLocal = new THREE.Vector3();
  const officeQuatInv = new THREE.Quaternion();
  function checkLaptopGesture(palms) {
    officeQuatInv.copy(office.quaternion).invert();
    for (const p of palms) {
      local.copy(p.pos);
      office.worldToLocal(local);
      const inZone = Math.abs(local.x) < 0.35 && local.z < -0.52 && local.z > -1.05 && local.y > DESK_Y && local.y < DESK_Y + 0.5;
      if (!inZone) continue;
      vLocal.copy(p.vel).applyQuaternion(officeQuatInv);
      const ny = p.normal ? nLocal.copy(p.normal).applyQuaternion(officeQuatInv).y : null;
      if (laptop.isOpen && vLocal.y < -0.9 && (ny === null || ny < -0.3)) game.setLid(false);
      else if (!laptop.isOpen && vLocal.y > 0.6 && (ny === null || ny > 0.3)) game.setLid(true);
    }
  }

  // ---- loop ----
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  game.redraw();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();
    const xr = renderer.xr.isPresenting;
    let fingers;

    if (xr) {
      if (calibrateIn > 0 && --calibrateIn === 0) calibrate();
      xrHands.update(dt, game.curses);
      fingers = xrHands.fingers;
      checkLaptopGesture(xrHands.palms);
      desktop.hand.visible = false;
      desktop.coffeeHand.visible = false;
    } else {
      desktop.hand.visible = true;
      desktop.setCurses(game.curses);
      desktop.update(dt, deskCam);
      fingers = [desktop.finger];
    }

    presses.update(fingers, now);
    game.update(dt);
    keyboard.update(dt);
    laptop.update(dt);
    world.buttonDome.position.y = 0.03 - presses.items[presses.items.length - 1].depth;
    renderer.render(scene, camera);
  });

  // handy for debugging in the console
  window.ff = { game, scene, camera, renderer, desktop, keyboard, laptop, boss };
}

start();
