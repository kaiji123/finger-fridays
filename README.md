# Finger Fridays

Typing in VR is a nightmare. So we made it your job.

A seated WebXR office game for the Meta VR Start hackathon (deadline Nov 18, 2026, 8pm GMT).
You sit in a 3D cubicle at 4:57 PM on a Friday. Poke out an overdue email on a big desk
keyboard with your fingertips, slam the laptop shut when Gary the boss walks past, and get
Promoted, Warned, or FIRED.

## Run locally

```sh
npm install
npm run dev
```

- **Desktop simulator:** click keys with the cursor finger or type on your real keyboard.
  `Enter` = big red button (start / pause / next shift), `Tab` or click the laptop = slam / open,
  arrow keys or right-drag = look around, `Esc` = pause.
- **Quest emulator (no headset):** open the dev URL with `?emulate` (uses Meta's IWER + DevUI).
- **Real Quest:** serve over HTTPS (e.g. `npx vite --host` plus a tunnel, or deploy to GitHub Pages),
  open in the Quest browser, tap ENTER VR. Hand tracking: fingertips press keys, a fast palm-down
  swipe over the laptop slams it, a palm-up flick reopens it. The desk auto-centres on your head.

## Stack

three.js + WebXR (hand tracking, controller fallback), Vite. No asset files: the office, boss, and
screens are built in code; sounds are synthesised; the boss voice uses browser text-to-speech.

## Code map

| File | What it does |
|---|---|
| `src/main.js` | Renderer, scene setup, VR entry, desk calibration, laptop-slam gesture, main loop |
| `src/game/game.js` | Shift state machine, scoring, boss anger, verdicts, career save (localStorage) |
| `src/game/data.js` | Ranks, prompts, curses, boss voice lines (tune difficulty here) |
| `src/input/press.js` | Fingertip-pokes-key logic shared by every key and button |
| `src/input/hands.js` | WebXR hands: fingertip colliders, sausage fingers, mittens, coffee mug |
| `src/input/desktop.js` | Mouse-driven cursor hand and camera for the desktop simulator |
| `src/scene/*` | Office, keyboard, laptop + screen, status monitor, Gary the boss |
| `src/audio.js` | Synth sound effects and text-to-speech |

## Done so far

- 3D cubicle office with a sunset skyline, neighbouring cubicles, wall clock that ticks to 5:00
- Big forgiving keyboard with press debounce (fires only when a fingertip crosses down through the key)
- Typing round: prompt, countdown, typos highlighted on the laptop screen, backspace, WPM
- Gary walks the aisle, peers over the partition, busts you if the laptop is open, shouts your typos
- Curses per rank: sausage fingers, reshuffle on yell, coffee hand, mittens
- Career ladder Intern → CEO with local save, streak and best WPM

## Next

- Test on a real Quest: tune key size, slam thresholds (`checkLaptopGesture` in `main.js`), desk height
- Polish: particles, key pop juice, more voice lines, onboarding pass
- Stretch: LLM boss roast, mixed-reality desk (passthrough + hit test)
