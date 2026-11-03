import * as THREE from '@iwsdk/core';
import { World, SessionMode, ReferenceSpaceType, createSystem } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/800.css';
import { buildOffice, DESK_Y } from './scene/office.js';
import { Keyboard } from './scene/keyboard.js';
import { Laptop } from './scene/laptop.js';
import { StatusBoard } from './scene/board.js';
import { Boss } from './scene/boss.js';
import { Hints } from './scene/hints.js';
import { PressSystem } from './input/press.js';
import { XRHands, serveInputModelsLocally } from './input/hands.js';
import { MRDesk, RoomSystem } from './xr/mr-desk.js';
import { Game } from './game/game.js';
import { initAudio, say } from './audio.js';

// Built on Meta's Immersive Web SDK (IWSDK): it owns the renderer, the XR session, the
// player rig, hand tracking and scene understanding. The game runs as one IWSDK system.
// It is headset-only: the flat page is a title screen with a still view of the office
// behind the VR / MR buttons, and nothing runs until an XR session starts.

const BG = new THREE.Color(0xd8cfc0);
const DESK_CAM = { x: 0, y: 1.22, z: 0.18, pitch: -0.27 }; // seated eye position in office space

async function start() {
  try {
    await document.fonts.load("500 40px 'JetBrains Mono'");
    await document.fonts.load("700 40px 'Space Grotesk'");
  } catch {
    // fall back to system fonts
  }

  const world = await World.create(document.getElementById('scene-container'), projectOptions);
  const { scene, camera, renderer } = world;
  document.getElementById('loading').remove();
  serveInputModelsLocally();

  // ---- rendering ----
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.background = BG;
  const fog = new THREE.Fog(0xd8cfc0, 9, 22);
  scene.fog = fog;

  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x4a5262, 1.1));
  const sun = new THREE.DirectionalLight(0xffc28a, 2.0);
  sun.position.set(-1.5, 4.5, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, far: 15 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const fill = new THREE.PointLight(0xfff0d8, 2.5, 4, 1.5);
  fill.position.set(0.2, 2.2, 0.2);

  // ---- the office ----
  const kit = buildOffice();
  const { office, shell, shadowCatcher } = kit;
  office.add(sun, sun.target, fill);

  // the wall clock only needs a redraw when its second hand moves
  let lastClock = -1;
  kit.drawClockThrottled = (m) => {
    const q = Math.round(m * 60);
    if (q !== lastClock) {
      lastClock = q;
      kit.drawClock(m);
    }
  };

  const keyboard = new Keyboard();
  keyboard.group.position.set(-0.04, DESK_Y, -0.4);
  const laptop = new Laptop();
  laptop.group.position.set(0, DESK_Y, -0.74);
  // second monitor: angled in and kept within ~25° of centre so it stays in a narrow field of view
  const board = new StatusBoard();
  board.group.position.set(-0.5, DESK_Y, -0.86);
  board.group.rotation.y = 0.5;
  const boss = new Boss();
  kit.boss = boss;

  // Every piece is an IWSDK entity, parented under the office (which moves as one in XR).
  const officeEntity = world.createTransformEntity(office, { parent: world.sceneEntity, persistent: true });
  for (const obj of [keyboard.group, laptop.group, board.group, boss.group, kit.button]) {
    world.createTransformEntity(obj, { parent: officeEntity, persistent: true });
  }

  const hints = new Hints(scene);
  const xrHands = new XRHands(world);
  const isXR = () => renderer.xr.isPresenting;

  // ---- game ----
  const game = new Game({ keyboard, laptop, board, boss, office: kit, hints });

  const presses = new PressSystem();
  keyboard.registerPresses(presses, (key) => game.keyPressed(key));
  const buttonPress = presses.add({
    frame: kit.button, mesh: kit.buttonDome, x: 0, z: 0, w: 0.1, d: 0.1,
    top: 0.063, travel: 0.012, onPress: () => game.pressButton(),
  });

  // the still title-screen view: seated at the desk, looking at the laptop
  const titleView = () => {
    camera.position.set(DESK_CAM.x, DESK_CAM.y, DESK_CAM.z);
    camera.rotation.set(DESK_CAM.pitch, 0, 0);
  };
  titleView();

  // ---- XR: VR office or MR desk ----
  world.registerSystem(RoomSystem);
  const mrDesk = new MRDesk({
    office: kit, room: world.getSystem(RoomSystem), hints, say,
    onPlaced: () => game.ready(),
  });

  let xrMode = null; // 'vr' | 'mr' while a session runs
  const landing = document.getElementById('landing');
  const vrButton = document.getElementById('enterVR');
  const mrButton = document.getElementById('enterMR');
  const noXR = document.getElementById('noXR');
  const supported = (mode) => (navigator.xr ? navigator.xr.isSessionSupported(mode).catch(() => false) : Promise.resolve(false));
  Promise.all([supported('immersive-vr'), supported('immersive-ar')]).then(([vr, ar]) => {
    vrButton.hidden = !vr;
    mrButton.hidden = !ar;
    noXR.hidden = vr || ar;
  });
  vrButton.addEventListener('click', () => {
    initAudio();
    xrMode = 'vr';
    world.launchXR({
      sessionMode: SessionMode.ImmersiveVR,
      referenceSpace: ReferenceSpaceType.LocalFloor,
      features: { handTracking: true },
    });
  });
  mrButton.addEventListener('click', () => {
    initAudio();
    xrMode = 'mr';
    world.launchXR({
      sessionMode: SessionMode.ImmersiveAR,
      referenceSpace: ReferenceSpaceType.LocalFloor,
      features: { handTracking: true, planeDetection: true, meshDetection: true, anchors: true },
    });
  });

  const head = { pos: new THREE.Vector3(), dir: new THREE.Vector3(), yaw: 0 };
  const readHead = () => {
    const xrCam = renderer.xr.getCamera();
    xrCam.getWorldPosition(head.pos);
    xrCam.getWorldDirection(head.dir);
    head.yaw = Math.atan2(-head.dir.x, -head.dir.z);
  };

  // VR: move the whole office so the desk sits in front of the player's head.
  let calibrateIn = -1;
  const calibrate = () => {
    readHead();
    office.rotation.set(0, head.yaw, 0);
    const eye = new THREE.Vector3(0, DESK_CAM.y, DESK_CAM.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), head.yaw);
    office.position.copy(head.pos).sub(eye);
    office.updateMatrixWorld(true);
    game.ready();
  };

  // Quest-friendly rendering while in a headset: cheaper shadows and foveation.
  const setHeadsetQuality = (on) => {
    sun.shadow.mapSize.setScalar(on ? 1024 : 2048);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    renderer.shadowMap.type = on ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.shadowMap.needsUpdate = true;
    if (on) renderer.xr.setFoveation?.(1);
  };

  renderer.xr.addEventListener('sessionstart', () => {
    initAudio();
    landing.style.display = 'none';
    setHeadsetQuality(true);
    if (xrMode === 'mr') {
      // the player's real room replaces the office shell
      scene.background = null;
      scene.fog = null;
      shell.visible = false;
      shadowCatcher.visible = true;
      readHead();
      mrDesk.start();
    } else {
      xrMode = 'vr';
      calibrateIn = 8; // wait a few frames for a stable head pose
      const space = renderer.xr.getReferenceSpace();
      space?.addEventListener?.('reset', () => (calibrateIn = 2));
    }
    game.pause();
    game.redraw();
  });
  renderer.xr.addEventListener('sessionend', () => {
    xrMode = null;
    mrDesk.stop();
    scene.background = BG;
    scene.fog = fog;
    shell.visible = true;
    shadowCatcher.visible = false;
    office.visible = true;
    office.position.set(0, 0, 0);
    office.rotation.set(0, 0, 0);
    boss.setPath({});
    xrHands.hideAll();
    hints.hidePanel();
    setHeadsetQuality(false);
    landing.style.display = '';
    titleView();
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

  // ---- the game loop, as an IWSDK system ----
  function step(dt) {
    if (!isXR()) return; // title screen: the office is a still backdrop
    const frame = renderer.xr.getFrame?.();
    if (frame) xrHands.readFrame(frame);
    if (calibrateIn > 0 && --calibrateIn === 0) calibrate();
    xrHands.update(dt, game.curses);
    if (xrMode === 'mr') {
      readHead();
      mrDesk.update(dt, { headPos: head.pos, headYaw: head.yaw, palms: xrHands.palms });
    }
    if (office.visible) checkLaptopGesture(xrHands.palms);

    presses.update(office.visible ? xrHands.fingers : [], performance.now());
    game.update(dt);
    keyboard.update(dt);
    laptop.update(dt);
    kit.buttonDome.position.y = 0.03 - buttonPress.depth;
  }

  class GameSystem extends createSystem({}) {
    update(delta) {
      step(Math.min(delta, 0.05));
    }
  }
  world.registerSystem(GameSystem);

  // game.ready() runs once the desk is placed in the headset (calibrate / MR placement)
  game.redraw();

  // handy for debugging in the console
  window.ff = { world, game, scene, camera, renderer, keyboard, laptop, boss, hints, mrDesk, xrHands, kit };
}

start();
