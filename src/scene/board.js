import * as THREE from '@iwsdk/core';
import { canvasTexture, rrect, MONO, SANS, std } from '../util.js';

// The second monitor on the desk: timer, boss mood, curses, alerts.
export class StatusBoard {
  constructor() {
    this.group = new THREE.Group();
    const dark = std(0x24262c, { roughness: 0.4, metalness: 0.3 });
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.12), dark);
    foot.position.y = 0.006;
    // a short stand, so the (scaled-up) screen stays below the partition and Gary stays visible
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.02), dark);
    neck.position.set(0, 0.07, -0.03);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.33, 0.025), dark);
    frame.position.set(0, 0.25, -0.02);
    for (const m of [foot, neck, frame]) {
      m.castShadow = true;
      this.group.add(m);
    }
    this.screen = canvasTexture(1024, 640);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.3125),
      new THREE.MeshBasicMaterial({ map: this.screen.tex, toneMapped: false })
    );
    mesh.position.set(0, 0.25, -0.007);
    this.group.add(mesh);
  }

  draw(v) {
    // Uploading a 1024px canvas is costly on Quest, so only redraw when something changed.
    const blink = v.alert ? Math.floor(performance.now() / 220) % 2 : 0;
    const sig = JSON.stringify({ ...v, timeLeft: Math.ceil(v.timeLeft), anger: Math.round(v.anger), blink });
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    const { ctx, canvas, tex } = this.screen;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#16181d';
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';

    // header
    ctx.fillStyle = '#ffb36b';
    ctx.font = `700 34px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${v.rank.toUpperCase()}  ·  SHIFT ${v.shift}`, 40, 64);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7d8597';
    ctx.font = `500 26px ${MONO}`;
    ctx.fillText(v.clock, w - 40, 62);

    if (v.mode === 'menu' || v.mode === 'results') {
      this.drawLadder(ctx, w, h, v);
    } else if (v.mode === 'tutorial') {
      this.drawTutorial(ctx, w, h, v);
    } else {
      // timer
      ctx.textAlign = 'left';
      ctx.fillStyle = v.timeLeft < 10 ? '#ff5b4d' : '#f4efe6';
      ctx.font = `800 140px ${MONO}`;
      const m = Math.floor(Math.max(0, v.timeLeft) / 60);
      const s = Math.floor(Math.max(0, v.timeLeft) % 60);
      ctx.fillText(`${m}:${String(s).padStart(2, '0')}`, 40, 230);
      ctx.fillStyle = '#7d8597';
      ctx.font = `500 24px ${SANS}`;
      ctx.fillText('UNTIL 5:00 PM', 46, 268);

      // boss mood meter
      const mx = 520;
      ctx.fillStyle = '#7d8597';
      ctx.font = `500 24px ${SANS}`;
      ctx.fillText('GARY\'S MOOD', mx, 120);
      const moodColor = v.anger < 35 ? '#36c46b' : v.anger < 70 ? '#ffbf47' : '#ff5b4d';
      ctx.fillStyle = moodColor;
      ctx.font = `700 52px ${SANS}`;
      ctx.fillText(v.mood, mx, 180);
      ctx.fillStyle = '#2b2e36';
      rrect(ctx, mx, 205, 460, 34, 17);
      ctx.fill();
      ctx.fillStyle = moodColor;
      rrect(ctx, mx, 205, Math.max(34, 460 * Math.min(1, v.anger / 100)), 34, 17);
      ctx.fill();

      // curses
      ctx.fillStyle = '#7d8597';
      ctx.font = `500 24px ${SANS}`;
      ctx.fillText('ACTIVE CURSES', 40, 340);
      let cx = 40;
      ctx.font = `700 28px ${SANS}`;
      if (!v.curses.length) {
        ctx.fillStyle = '#5fd18b';
        ctx.fillText('None yet. Enjoy it.', 40, 395);
      }
      for (const c of v.curses) {
        const tw = ctx.measureText(c).width + 36;
        ctx.fillStyle = '#3a2a1e';
        rrect(ctx, cx, 360, tw, 50, 25);
        ctx.fill();
        ctx.fillStyle = '#ffb36b';
        ctx.fillText(c, cx + 18, 395);
        cx += tw + 14;
      }
      if (v.lidClosed && !v.alert) {
        ctx.fillStyle = '#7d8597';
        ctx.font = `500 28px ${SANS}`;
        ctx.fillText(v.reopenHint, 40, 470);
      }
    }

    // message line (boss shouts, tips)
    if (v.message) {
      ctx.fillStyle = '#2b2e36';
      rrect(ctx, 30, h - 130, w - 60, 100, 18);
      ctx.fill();
      ctx.fillStyle = '#f4efe6';
      ctx.textAlign = 'left';
      ctx.font = `700 34px ${SANS}`;
      ctx.fillText(v.message.slice(0, 48), 56, h - 68);
    }

    // boss alert banner overrides everything
    if (v.alert) {
      const on = Math.floor(performance.now() / 220) % 2 === 0;
      ctx.fillStyle = on ? '#dc2626' : '#7f1d1d';
      ctx.fillRect(0, h / 2 - 120, w, 240);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `800 76px ${SANS}`;
      ctx.fillText('GARY IS COMING', w / 2, h / 2 - 10);
      ctx.font = `700 40px ${SANS}`;
      ctx.fillText(v.alertHint, w / 2, h / 2 + 60);
    }
    tex.needsUpdate = true;
  }

  // Career ladder: where you are, how far to CEO, and your records.
  drawLadder(ctx, w, h, v) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7d8597';
    ctx.font = `500 24px ${SANS}`;
    ctx.fillText('CAREER LADDER', 40, 125);
    const n = v.ladder.length;
    const top = 150;
    const rowH = 52;
    v.ladder.forEach((name, i) => {
      const rank = n - 1 - i; // CEO at the top
      const y = top + i * rowH;
      const here = rank === v.rankIndex;
      const done = rank < v.rankIndex;
      ctx.fillStyle = here ? '#ffb36b' : done ? '#2f4a3a' : '#2b2e36';
      rrect(ctx, 40, y, 330, rowH - 10, 21);
      ctx.fill();
      ctx.fillStyle = here ? '#16181d' : done ? '#8fe0ac' : '#7d8597';
      ctx.font = `700 28px ${SANS}`;
      ctx.fillText(name, 62, y + 31);
      if (here) {
        ctx.textAlign = 'right';
        ctx.fillText('YOU', 352, y + 31);
        ctx.textAlign = 'left';
      }
    });
    // records
    const rx = 430;
    ctx.fillStyle = '#7d8597';
    ctx.font = `500 24px ${SANS}`;
    ctx.fillText('BEST', rx, 190);
    ctx.fillText('DAYS NOT FIRED', rx, 330);
    ctx.fillStyle = '#f4efe6';
    ctx.font = `800 84px ${MONO}`;
    ctx.fillText(`${v.best}`, rx, 268);
    ctx.fillText(`${v.streak}`, rx, 408);
    const bestW = ctx.measureText(`${v.best}`).width;
    ctx.font = `500 26px ${MONO}`;
    ctx.fillStyle = '#7d8597';
    ctx.fillText('WPM', rx + bestW + 12, 268);
    if (v.nextCurse) {
      ctx.fillStyle = '#ffb36b';
      ctx.font = `700 26px ${SANS}`;
      ctx.fillText(`Next rank adds: ${v.nextCurse}`, rx, 470);
    }
  }

  // One big instruction at a time during the tutorial.
  drawTutorial(ctx, w, h, v) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7d8597';
    ctx.font = `500 26px ${SANS}`;
    ctx.fillText(`TRAINING  ${v.step} / ${v.steps}`, 40, 130);
    for (let i = 0; i < v.steps; i++) {
      ctx.fillStyle = i < v.step ? '#ffb36b' : '#2b2e36';
      rrect(ctx, 40 + i * 64, 150, 52, 12, 6);
      ctx.fill();
    }
    ctx.fillStyle = '#f4efe6';
    ctx.font = `800 64px ${SANS}`;
    ctx.fillText(v.instruction, 40, 280);
    if (v.instruction2) {
      ctx.fillStyle = '#d7d2c8';
      ctx.font = `500 34px ${SANS}`;
      ctx.fillText(v.instruction2, 40, 340);
    }
    ctx.fillStyle = '#7d8597';
    ctx.font = `500 24px ${SANS}`;
    ctx.fillText('Already trained? Press the red button to skip.', 40, 470);
  }
}
