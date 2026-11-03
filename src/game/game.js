import * as THREE from 'three';
import { RANKS, CURSES, LINES, pick, fill } from './data.js';
import { sfx, say } from '../audio.js';
import { rand, clamp } from '../util.js';

const SAVE_KEY = 'finger-fridays-save-v1';
const LEFT_HAND_SLOTS = 'qwertasdfgzxcvb';

function loadSave() {
  const fallback = { rank: 0, streak: 0, best: 0, shifts: 0 };
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
  constructor({ keyboard, laptop, board, boss, office, isXR, onShake }) {
    this.keyboard = keyboard;
    this.laptop = laptop;
    this.board = board;
    this.boss = boss;
    this.office = office;
    this.isXR = isXR;
    this.onShake = onShake;
    this.save = loadSave();
    this.state = 'menu'; // menu | countdown | playing | paused | results
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
    if (this.state === 'menu' || this.state === 'results') this.startShift();
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

  toggleLid() {
    this.setLid(!this.laptop.isOpen);
  }

  setLid(open) {
    if (this.state === 'results' || this.state === 'countdown') return;
    if (this.time - this.lastLidToggle < 0.5) return;
    if (!this.laptop.setOpen(open)) return;
    this.lastLidToggle = this.time;
    if (open) sfx.open();
    else {
      sfx.slam();
      this.onShake(0.6);
    }
    this.redraw();
  }

  // A 3D key was poked (by a fingertip, the mouse finger, or a physical key).
  keyPressed(key) {
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

  // Physical keyboard (desktop). Maps through the 3D layout so curses apply.
  physicalKey(ch) {
    let key = this.keyboard.keyForSlot(ch);
    if (!key) return;
    if (this.state === 'playing' && this.curses.has('coffee') && LEFT_HAND_SLOTS.includes(ch)) {
      sfx.dead();
      this.flashMessage('Left hand is holding coffee! Click those keys.');
      return;
    }
    // fat fingers sometimes hit the neighbouring key
    const fat = this.curses.has('mittens') ? 0.3 : this.curses.has('sausage') ? 0.12 : 0;
    if (this.state === 'playing' && Math.random() < fat) {
      const near = this.keyboard.keys
        .filter((k) => k !== key && Math.abs(k.z - key.z) < 0.01 && Math.abs(k.x - key.x) < 0.05)
        .concat([key]);
      key = pick(near);
    }
    this.keyboard.tap(key);
    this.keyPressed(key);
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

  // ---- shift lifecycle ----

  startShift() {
    const rank = this.rank;
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
    this.onShake(angry ? 0.5 : 0.2);
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

  redraw() {
    const xr = this.isXR();
    const minutes = (this.typed.length / 5) / Math.max(this.elapsed || 0, 1) * 60;
    const curseNames = [...this.curses].map((c) => CURSES[c].name);
    let laptopView;
    if (this.state === 'menu') {
      laptopView = {
        mode: 'menu', rank: this.rank.name, best: this.save.best, streak: this.save.streak,
        hint: xr ? 'Poke the button with your finger.' : 'Click the button, or press Enter.',
      };
    } else if (this.state === 'countdown') {
      laptopView = { mode: 'countdown', count: Math.max(1, Math.ceil(this.countdown)), curseLine: `Today's curse: ${curseNames.join(' + ')}` };
    } else if (this.state === 'results') {
      laptopView = { mode: 'results', ...this.result };
    } else {
      laptopView = {
        mode: 'email', prompt: this.prompt, typed: this.typed, typos: this.typos,
        wpm: Math.round(minutes), paused: this.state === 'paused',
      };
    }
    this.laptop.draw(laptopView);

    const alert = (this.state === 'playing' || this.state === 'paused') && (this.boss.state === 'approach' || this.boss.state === 'inspect');
    this.board.draw({
      mode: this.state,
      rank: this.rank.name,
      shift: this.save.shifts,
      clock: 'FRI 4:57 PM',
      timeLeft: this.timeLeft ?? this.rank.time,
      anger: this.anger,
      mood: this.mood,
      curses: curseNames,
      alert: alert && this.laptop.isOpen,
      alertHint: xr ? 'SLAM THE LAPTOP SHUT! (palm down, fast)' : 'SLAM THE LAPTOP! (Tab or click it)',
      lidClosed: !this.laptop.isOpen,
      reopenHint: xr ? 'Flip your palm up over the laptop to reopen it.' : 'Press Tab or click the laptop to reopen it.',
      message: this.message,
      howTo: xr
        ? [
            'Poke the red button to clock in.',
            'Copy the email with your fingertips.',
            'Gary walks by: SLAM the laptop (palm down).',
            'Flip your palm up over it to reopen.',
            'Promoted, warned, or FIRED. Climb to CEO.',
          ]
        : [
            'Click the red button (or Enter) to clock in.',
            'Click keys or type to copy the email.',
            'Gary walks by: SLAM the laptop (Tab).',
            'Press Tab again to reopen it.',
            'Promoted, warned, or FIRED. Climb to CEO.',
          ],
    });
  }
}
