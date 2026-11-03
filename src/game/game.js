import * as THREE from '@iwsdk/core';
import { RANKS, CURSES, LINES, pick, fill } from './data.js';
import { DESK_Y } from '../scene/office.js';
import { sfx, say } from '../audio.js';
import { rand, clamp } from '../util.js';

const SAVE_KEY = 'finger-fridays-save-v1';

function loadSave() {
  const fallback = { rank: 0, streak: 0, best: 0, shifts: 0, tutorialDone: false };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
  } catch {
    return fallback;
  }
}

function storeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // progress just won't persist (private mode etc.)
  }
}

export class Game {
  constructor({ keyboard, laptop, board, boss, office, hints }) {
    this.hints = hints;
    this.tut = null;
    this.keyboard = keyboard;
    this.laptop = laptop;
    this.board = board;
    this.boss = boss;
    this.office = office;
    this.save = loadSave();
    this.state = 'menu'; // menu | tutorial | countdown | playing | paused | results
    this.curses = new Set();
    this.prompt = '';
    this.typed = '';
    this.anger = 10;
    this.typos = 0;
    this.message = '';
    this.messageT = 0;
    this.lastShout = 0;
    this.lastLidToggle = 0;
    this.result = null;
    this.boardTimer = 0;
    this.time = 0;
    boss.on((e) => this.onBossEvent(e));
  }

  get rank() {
    return RANKS[this.save.rank];
  }

  get mood() {
    return this.anger < 35 ? 'Surprisingly calm' : this.anger < 70 ? 'Annoyed' : 'FURIOUS';
  }

  // ---- inputs ----

  pressButton() {
    sfx.button();
    if (this.state === 'menu' && !this.save.tutorialDone) this.startTutorial();
    else if (this.state === 'tutorial') this.finishTutorial();
    else if (this.state === 'menu' || this.state === 'results') this.startShift();
    else if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
    this.redraw();
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.redraw();
    }
  }

  setLid(open) {
    if (this.state === 'results' || this.state === 'countdown') return;
    if (this.time - this.lastLidToggle < 0.5) return;
    if (!this.laptop.setOpen(open)) return;
    this.lastLidToggle = this.time;
    if (open) sfx.open();
    else sfx.slam();
    if (this.state === 'tutorial') this.tutorialLid(open);
    this.redraw();
  }

  // A 3D key was poked (by a fingertip, a mitten, the coffee mug or a controller stylus).
  keyPressed(key) {
    // modifier keys are scenery: they click but do not type
    if (key.dead) {
      sfx.key();
      return;
    }
    if (this.state === 'tutorial') {
      this.tutorialKey(key);
      return;
    }
    if (this.state !== 'playing') {
      sfx.key();
      return;
    }
    if (!this.laptop.isOpen) {
      sfx.dead();
      this.flashMessage('The laptop is closed, genius.');
      return;
    }
    sfx.key();
    if (key.char === '\b') {
      this.typed = this.typed.slice(0, -1);
      this.redraw();
      return;
    }
    const i = this.typed.length;
    const want = this.prompt[i];
    this.typed += key.char;
    if (key.char.toLowerCase() === want.toLowerCase()) {
      this.keyboard.flash(key, '#b7ebc6');
      if (want === ' ' || i === this.prompt.length - 1) this.wordFinished(i);
    } else {
      this.typos++;
      this.anger = clamp(this.anger + 3, 0, 100);
      this.keyboard.flash(key, '#ffb4ab');
      sfx.wrong();
      if (key.char === ' ' || want === ' ') this.wordFinished(i);
    }
    if (this.typed.length >= this.prompt.length) this.endShift('done');
    this.redraw();
  }

  wordFinished(endIndex) {
    // find the word that just ended and compare it with the prompt
    const start = this.prompt.lastIndexOf(' ', endIndex - 1) + 1;
    const end = this.prompt[endIndex] === ' ' ? endIndex : endIndex + 1;
    const got = this.typed.slice(start, end).trim();
    const want = this.prompt.slice(start, end).trim();
    if (!got) return;
    if (got.toLowerCase() === want.toLowerCase()) {
      this.anger = clamp(this.anger - 1.5, 0, 100);
      return;
    }
    if (this.time - this.lastShout > 7 && Math.random() < 0.6) {
      this.lastShout = this.time;
      const line = fill(pick(LINES.typo), { word: got.replace(/[,.?]/g, '') || got });
      this.bossYell(line, false);
    }
  }

  // ---- first-shift training ----
  // Teaches the three hand moves by doing them, one at a time, with Gary talking you
  // through it: poke the button, poke two glowing keys, slam the lid, flip it open.

  // The player is at the desk (page loaded, VR desk calibrated, or MR desk placed).
  ready() {
    if (this.state === 'menu' && !this.save.tutorialDone) {
      this.hints.pointAt(this.hintTarget('button'));
      if (!this.boss.busy) this.boss.comeForVerdict();
    }
    this.redraw();
  }

  hintTarget(what, key) {
    if (what === 'button') return (v) => this.office.button.localToWorld(v.set(0, 0.06, 0));
    if (what === 'key') return (v) => key.mesh.localToWorld(v.set(0, 0.02, 0));
    if (what === 'lidOpen') return (v) => this.laptop.group.localToWorld(v.set(0, 0.36, -0.2));
    return (v) => this.laptop.group.localToWorld(v.set(0, 0.06, -0.05));
  }

  startTutorial() {
    this.state = 'tutorial';
    this.tut = { step: 'type', doneT: 0, lastWrong: -9 };
    this.prompt = 'hi';
    this.typed = '';
    this.typos = 0;
    this.anger = 10;
    this.curses = new Set();
    this.keyboard.reset();
    this.laptop.setOpen(true);
    if (!this.boss.busy) this.boss.comeForVerdict();
    this.tutSay(LINES.tutorial.type);
    this.tutorialHints();
  }

  tutSay(line) {
    this.boss.setAnger(20);
    this.boss.say(line, 4);
    say(line);
  }

  tutorialHints() {
    const step = this.tut?.step;
    const officeMatrix = () => this.office.office.matrixWorld;
    this.hints.clear();
    if (step === 'type') {
      const key = this.keyboard.keyForSlot(this.prompt[this.typed.length]);
      this.keyboard.setGuide(key);
      this.hints.pointAt(this.hintTarget('key', key));
      return;
    }
    this.keyboard.setGuide(null);
    if (step === 'slam') {
      this.hints.pointAt(this.hintTarget('lidOpen'));
      this.hints.showGesture('slam', officeMatrix, new THREE.Vector3(0.05, DESK_Y + 0.26, -0.84));
    } else if (step === 'open') {
      this.hints.pointAt(this.hintTarget('lidClosed'));
      this.hints.showGesture('flip', officeMatrix, new THREE.Vector3(0.05, DESK_Y + 0.09, -0.66));
    }
  }

  tutorialKey(key) {
    const t = this.tut;
    sfx.key();
    if (t.step !== 'type' || key.char === '\b') return;
    if (!this.laptop.isOpen) {
      this.flashMessage('Open the laptop first.');
      return;
    }
    const want = this.prompt[this.typed.length];
    if (key.char === want) {
      this.typed += key.char;
      this.keyboard.flash(key, '#b7ebc6');
      if (this.typed === this.prompt) {
        t.step = 'slam';
        this.tutSay(LINES.tutorial.slam);
        sfx.alarm();
      }
    } else {
      this.keyboard.flash(key, '#ffb4ab');
      sfx.wrong();
      if (this.time - t.lastWrong > 4) {
        t.lastWrong = this.time;
        this.tutSay(LINES.tutorial.wrongKey);
      }
    }
    this.tutorialHints();
    this.redraw();
  }

  tutorialLid(open) {
    const t = this.tut;
    if (t.step === 'slam' && !open) {
      t.step = 'open';
      this.tutSay(LINES.tutorial.open);
    } else if (t.step === 'open' && open) {
      t.step = 'done';
      t.doneT = 3;
      this.tutSay(LINES.tutorial.done);
      sfx.promoted();
      this.save.tutorialDone = true;
      storeSave(this.save);
    }
    this.tutorialHints();
  }

  // Done (or skipped with the red button): straight into the first real shift.
  finishTutorial() {
    this.save.tutorialDone = true;
    storeSave(this.save);
    this.tut = null;
    this.hints.clear();
    this.keyboard.setGuide(null);
    this.startShift();
  }

  tutorialView() {
    const step = this.tut.step;
    const v = { mode: 'tutorial', steps: 4 };
    if (step === 'type') {
      Object.assign(v, { step: 2, instruction: `Type: ${this.prompt.toUpperCase()}`, instruction2: 'Poke the glowing keys.' });
    } else if (step === 'slam') {
      Object.assign(v, { step: 3, instruction: 'SLAM THE LAPTOP!', instruction2: 'Palm down, fast, onto the lid.' });
    } else if (step === 'open') {
      Object.assign(v, { step: 4, instruction: 'Open it again', instruction2: 'Flip your palm up over the laptop.' });
    } else {
      Object.assign(v, { step: 4, instruction: "You're hired!", instruction2: 'Real shift starting…' });
    }
    return v;
  }

  // ---- shift lifecycle ----

  startShift() {
    const rank = this.rank;
    this.hints.clear();
    this.prompt = pick(rank.prompts);
    this.typed = '';
    this.typos = 0;
    this.anger = 10;
    this.curses = new Set(rank.curses);
    this.timeLeft = rank.time;
    this.elapsed = 0;
    this.countdown = 3.2;
    this.lastBeep = 4;
    this.result = null;
    this.message = '';
    this.state = 'countdown';
    this.save.shifts++;
    this.keyboard.reset();
    this.laptop.setOpen(true);
    this.boss.dismiss();
    this.nextBossAt = rand(...rank.bossGap) * 0.8;
    this.office.deskMug.visible = !this.curses.has('coffee');
    this.redraw();
  }

  endShift(reason) {
    const correct = [...this.typed].filter((c, i) => c.toLowerCase() === this.prompt[i].toLowerCase()).length;
    const accuracy = this.typed.length ? correct / this.typed.length : 0;
    const done = correct / this.prompt.length;
    const minutes = Math.max(this.elapsed, 1) / 60;
    const wpm = Math.round(correct / 5 / minutes);

    let verdict;
    if (reason === 'fired' || done < 0.4 || this.anger >= 85) verdict = 'FIRED';
    else if (done >= 0.85 && this.anger < 70) verdict = 'PROMOTED';
    else verdict = 'WARNING';

    const before = this.rank.name;
    if (verdict === 'PROMOTED') {
      this.save.rank = Math.min(RANKS.length - 1, this.save.rank + 1);
      this.save.streak++;
    } else if (verdict === 'FIRED') {
      this.save.rank = Math.max(0, this.save.rank - 1);
      this.save.streak = 0;
    } else {
      this.save.streak++;
    }
    this.save.best = Math.max(this.save.best, wpm);
    storeSave(this.save);

    // boss quotes your worst typo back at you
    const phrase = this.typoPhrase();
    const reasonText = {
      fired: 'Gary lost it. Completely.',
      time: '5:00 PM. Time is up.',
      done: 'Email sent. Gary is reading it now…',
    }[reason];
    const after = this.rank.name;
    const rankLine =
      after === before
        ? verdict === 'PROMOTED' ? `You are already the ${after}. Nowhere left to climb.` : `You stay ${after}.`
        : verdict === 'PROMOTED' ? `${before} → ${after}` : `Demoted: ${before} → ${after}`;

    this.result = {
      verdict, wpm, typos: this.typos, reason: reasonText, rankLine,
      accuracy: Math.round(accuracy * 100), done: Math.round(done * 100),
      line: fill(pick(LINES[verdict.toLowerCase()]), { phrase: phrase || 'This email' }),
    };
    this.state = 'results';
    this.laptop.setOpen(true);
    this.office.deskMug.visible = true;
    this.curses = new Set();
    this.boss.comeForVerdict();
    sfx.stamp();
    if (verdict === 'PROMOTED') sfx.promoted();
    if (verdict === 'FIRED') sfx.fired();
    this.redraw();
  }

  typoPhrase() {
    const words = this.prompt.split(' ');
    const typedWords = this.typed.split(' ');
    for (let k = 0; k < typedWords.length && k < words.length; k++) {
      if (typedWords[k] && typedWords[k].toLowerCase() !== words[k].toLowerCase()) {
        const phrase = [...words.slice(Math.max(0, k - 2), k), typedWords[k]].join(' ');
        return phrase.charAt(0).toUpperCase() + phrase.slice(1);
      }
    }
    return '';
  }

  // ---- boss ----

  bossYell(line, angry = true) {
    this.boss.setAnger(this.anger);
    if (this.boss.busy) this.boss.say(line, 3);
    this.flashMessage(`GARY: "${line}"`);
    say(line, { angry });
    if (this.curses.has('reshuffle')) {
      this.keyboard.reshuffle();
      sfx.shuffle();
    }
  }

  onBossEvent(type) {
    if (type === 'inspect' && this.state === 'playing') {
      this.busted = false;
      this.checkBusted();
    } else if (type === 'inspectEnd' && this.state === 'playing') {
      if (!this.busted) {
        const line = pick(LINES.cleared);
        this.boss.say(line, 2.5);
        say(line);
        this.anger = clamp(this.anger - 5, 0, 100);
      }
    } else if (type === 'gone' && (this.state === 'playing' || this.state === 'paused')) {
      this.nextBossAt = this.elapsed + rand(...this.rank.bossGap);
    } else if (type === 'arrived' && this.state === 'menu' && !this.save.tutorialDone) {
      this.tutSay(LINES.tutorial.greet);
    } else if (type === 'arrived' && this.state === 'results') {
      this.boss.setAnger(this.result.verdict === 'FIRED' ? 100 : this.result.verdict === 'WARNING' ? 60 : 10);
      this.boss.say(this.result.line, 6);
      say(this.result.line, { angry: this.result.verdict === 'FIRED' });
    }
  }

  checkBusted() {
    if (this.busted || !this.laptop.isOpen) return;
    this.busted = true;
    this.anger = clamp(this.anger + 22, 0, 100);
    this.bossYell(pick(LINES.busted), true);
    sfx.alarm();
  }

  flashMessage(text, seconds = 3) {
    this.message = text;
    this.messageT = seconds;
  }

  // ---- per frame ----

  update(dt) {
    this.time += dt;
    if (this.messageT > 0) {
      this.messageT -= dt;
      if (this.messageT <= 0) this.message = '';
    }
    const paused = this.state === 'paused';
    this.boss.setAnger(this.state === 'results' ? this.boss.anger : this.anger);
    this.boss.update(dt, paused);

    if (this.state === 'tutorial' && this.tut.step === 'done') {
      this.tut.doneT -= dt;
      if (this.tut.doneT <= 0) this.finishTutorial();
    }
    this.hints.update(dt);

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastBeep && n > 0 && n <= 3) {
        this.lastBeep = n;
        sfx.beep(false);
      }
      if (this.countdown <= 0) {
        this.state = 'playing';
        sfx.beep(true);
      }
    } else if (this.state === 'playing') {
      this.elapsed += dt;
      this.timeLeft -= dt;
      if (!this.boss.busy && this.elapsed >= this.nextBossAt && this.timeLeft > 6) {
        this.boss.walkBy();
        sfx.alarm();
      }
      if (this.boss.state === 'inspect') this.checkBusted();
      if (this.anger >= 100) this.endShift('fired');
      else if (this.timeLeft <= 0) this.endShift('time');
    }

    // the wall clock creeps from 4:57 to 5:00 during a shift
    const progress = this.state === 'playing' || paused ? 1 - this.timeLeft / this.rank.time : this.state === 'results' ? 1 : 0;
    this.office.drawClockThrottled(57 + progress * 3);

    // pulse the big red button when it's the thing to press
    const wantsButton = this.state === 'menu' || this.state === 'results' || paused;
    this.office.buttonMat.emissiveIntensity = wantsButton ? 0.4 + 0.4 * Math.sin(this.time * 6) : 0.15;

    // screens animate (caret blink, alert flash), so redraw ~15 times a second
    this.boardTimer -= dt;
    if (this.boardTimer <= 0) {
      this.boardTimer = 1 / 15;
      this.redraw();
    }
  }

  // What the strip behind the keyboard shows.
  tickerView() {
    const ORANGE = '#ff8a3d';
    if (this.state === 'menu') return { text: 'POKE THE RED BUTTON', color: ORANGE };
    if (this.state === 'countdown') return { text: `GET READY... ${Math.max(1, Math.ceil(this.countdown))}`, color: ORANGE };
    if (this.state === 'results') return { text: this.result?.verdict || '', color: this.result?.verdict === 'FIRED' ? '#ff6b6b' : '#5fcf86' };
    if (this.state === 'paused') return { text: 'PAUSED: POKE THE RED BUTTON' };
    if (this.state === 'tutorial' && this.tut?.step !== 'type') return { text: this.tutorialView().instruction.toUpperCase(), color: ORANGE };
    if (!this.laptop.isOpen) return { text: 'LAPTOP CLOSED: FLIP IT OPEN', color: ORANGE };
    return { prompt: this.prompt, typed: this.typed };
  }

  redraw() {
    const minutes = (this.typed.length / 5) / Math.max(this.elapsed || 0, 1) * 60;
    const curseNames = [...this.curses].map((c) => CURSES[c].name);
    let laptopView;
    if (this.state === 'menu') {
      laptopView = {
        mode: 'menu', rank: this.rank.name, best: this.save.best, streak: this.save.streak,
        hint: 'Poke the button with your finger.',
      };
    } else if (this.state === 'countdown') {
      laptopView = {
        mode: 'countdown', count: Math.max(1, Math.ceil(this.countdown)),
        curseLine: curseNames.length ? `Today's curse: ${curseNames.join(' + ')}` : 'No curses today. Enjoy it while it lasts.',
      };
    } else if (this.state === 'results') {
      laptopView = { mode: 'results', ...this.result };
    } else if (this.state === 'tutorial') {
      laptopView = { mode: 'email', prompt: this.prompt, typed: this.typed, typos: 0, wpm: 0, paused: false };
    } else {
      laptopView = {
        mode: 'email', prompt: this.prompt, typed: this.typed, typos: this.typos,
        wpm: Math.round(minutes), paused: this.state === 'paused',
      };
    }
    this.laptop.draw(laptopView);
    this.keyboard.drawTicker(this.tickerView());

    const alert = (this.state === 'playing' || this.state === 'paused') && (this.boss.state === 'approach' || this.boss.state === 'inspect');
    const next = RANKS[this.save.rank + 1];
    const nextCurse = next ? next.curses.filter((c) => !this.rank.curses.includes(c)).map((c) => CURSES[c].name).join(' + ') : '';
    const view = {
      mode: this.state,
      rank: this.rank.name,
      shift: this.save.shifts,
      clock: 'FRI 4:57 PM',
      timeLeft: this.timeLeft ?? this.rank.time,
      anger: this.anger,
      mood: this.mood,
      curses: curseNames,
      alert: alert && this.laptop.isOpen,
      alertHint: 'SLAM THE LAPTOP SHUT! (palm down, fast)',
      lidClosed: !this.laptop.isOpen,
      reopenHint: 'Flip your palm up over the laptop to reopen it.',
      message: this.message,
      ladder: RANKS.map((r) => r.name).reverse(),
      rankIndex: this.save.rank,
      best: this.save.best,
      streak: this.save.streak,
      nextCurse,
    };
    if (this.state === 'tutorial') Object.assign(view, this.tutorialView(), { message: '' });
    this.board.draw(view);
  }
}
