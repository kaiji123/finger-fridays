# Finger Fridays

Typing in VR is a nightmare. So we made it your job.

A seated, hands-first WebXR office game for the Meta VR Start hackathon (deadline Nov 18, 2026,
8pm GMT), built on Meta's **Immersive Web SDK (IWSDK)**. It's 4:57 PM on a Friday. Poke out an
overdue email on a big desk keyboard with your fingertips, slam the laptop shut when Gary the
boss walks past, and get Promoted, Warned, or FIRED.

Headset only: there is no desktop mode. On a flat screen the page is a title screen with the
VR and MR buttons (or a note to open it in the Meta Quest browser). Two ways to play:

- **VR office:** a full cubicle office that re-centres on your head.
- **MR: your real desk:** passthrough. The keyboard, laptop and button land on your real desk,
  and Gary walks in through your real room (from the door, if one is detected).

## Run locally

```sh
npm install
npm run dev        # https://localhost:5173 (IWSDK serves HTTPS and injects a Quest emulator on localhost)
```

- **Quest emulator (no headset):** on localhost, the ENTER VR OFFICE and MR buttons start an
  emulated Quest 3 session (IWER). MR uses an emulated office room with a table, walls and a door.
- **Real Quest:** open the Network URL that `npm run dev` prints (same Wi-Fi, accept the
  certificate warning), or the live link above. Hand tracking: fingertips press keys, a fast
  palm-down swipe over the laptop slams it, a palm-up flick reopens it. Controllers work too
  (a stylus on each controller is the fingertip).
- `npm run dev:managed` starts IWSDK's managed browser and agent tooling instead.

## First five minutes

New players get a hands-on training shift instead of a wall of text. Gary walks over and talks
you through it, one move at a time, with a glowing arrow on the thing to touch and a ghost hand
acting out each gesture:

1. Poke the big red button.
2. Type "hi" on the glowing keys.
3. Slam the laptop shut (Gary is looking).
4. Flip it open again.

Then the first real shift starts. Pressing the red button skips training.

## Deploy

Live at **https://icy-darkness-116f.kaigets123.workers.dev** (Cloudflare). The game is fully
static: `npm run build` writes everything to `dist/`, and that folder is what gets uploaded. It has
no runtime CDN dependencies: fonts, hand/controller models and Gary's voice clips are bundled.

Gary's voice is pre-recorded with ElevenLabs: put `ELEVENLABS_API_KEY` in `.env.local` (see
`.env.example`) and run `npm run voice`; the key never ships with the site.

## Stack

IWSDK 1.0.1 (three.js, WebXR hand tracking, scene understanding), Vite. No art files: the office,
Gary and the screens are built in code; sounds are synthesised; Gary's voice is browser
text-to-speech, always shown as a speech-bubble caption.

## Code map

| File | What it does |
|---|---|
| `iwsdk.config.json` | IWSDK project settings: XR features, scene understanding, emulator |
| `src/main.js` | IWSDK world setup, VR/MR entry, VR desk calibration, laptop-slam gesture, game system |
| `src/xr/mr-desk.js` | MR: finds the real desk (planes/meshes, or a flat palm), fits Gary's path to the room |
| `src/game/game.js` | Training, shift state machine, scoring, boss anger, verdicts, career save (localStorage) |
| `src/game/data.js` | Ranks, prompts, curses, Gary's lines (tune difficulty here) |
| `src/input/press.js` | Fingertip-pokes-key logic shared by every key and button |
| `src/input/hands.js` | Reads hand joints each XR frame: fingertip colliders, palms, mittens, coffee mug |
| `src/scene/hints.js` | Tutorial arrow, ghost-hand gesture demos, floating MR setup card |
| `src/scene/*` | Office, keyboard, laptop + screen, status monitor (career ladder), Gary |
| `src/audio.js` | Synth sound effects and text-to-speech |
| `public/input/` | Bundled hand/controller models (MIT, `@webxr-input-profiles/assets`) |

## Done so far

- IWSDK port: world, XR sessions, player rig, hand tracking and scene understanding all go through IWSDK
- 3D cubicle office with a sunset skyline, neighbouring cubicles, wall clock that ticks to 5:00
- Big forgiving keyboard with press debounce (fires only when a fingertip crosses down through the key)
- Typing round: prompt, countdown, typos highlighted on the laptop screen, backspace, WPM
- Gary walks the aisle, peers over the partition, busts you if the laptop is open, shouts your typos
- Curses per rank: reshuffle on yell, coffee hand, mittens (Intern has none)
- Career ladder Intern → CEO with local save, streak and best WPM, shown on the second monitor
- Hands-on training shift for new players
- MR desk mode with real-desk detection, a flat-palm fallback, and a room-aware Gary
- Quest performance pass: merged static meshes, 2-draw keys, cheaper shadows and foveation in XR,
  screens only re-upload when they change (~170 draw calls)

## Next

- Test on a real Quest: frame rate, key size, slam thresholds (`checkLaptopGesture` in `main.js`),
  desk placement in a few different rooms
- Polish: particles, key pop juice, more voice lines
- Stretch: LLM boss roast
