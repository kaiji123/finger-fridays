import * as THREE from 'three';
import { canvasTexture, rrect, MONO, SANS, std } from '../util.js';

// The second monitor on the desk: timer, boss mood, curses, alerts.
export class StatusBoard {
  constructor() {
    this.group = new THREE.Group();
    const dark = std(0x24262c, { roughness: 0.4, metalness: 0.3 });
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.12), dark);
    foot.position.y = 0.006;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), dark);
    neck.position.set(0, 0.11, -0.03);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.33, 0.025), dark);
    frame.position.set(0, 0.32, -0.02);
    for (const m of [foot, neck, frame]) {
      m.castShadow = true;
      this.group.add(m);
    }
    this.screen = canvasTexture(1024, 640);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.3125),
      new THREE.MeshBasicMaterial({ map: this.screen.tex, toneMapped: false })
    );
    mesh.position.set(0, 0.32, -0.007);
    this.group.add(mesh);
  }

  draw(v) {
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
      this.drawHowTo(ctx, w, h, v);
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

  drawHowTo(ctx, w, h, v) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4efe6';
    ctx.font = `700 46px ${SANS}`;
    ctx.fillText('HOW TO SURVIVE FRIDAY', 40, 140);
    ctx.font = `500 30px ${SANS}`;
    v.howTo.forEach((line, i) => {
      ctx.fillStyle = '#ffb36b';
      ctx.fillText(`${i + 1}`, 44, 205 + i * 58);
      ctx.fillStyle = '#d7d2c8';
      ctx.fillText(line, 84, 205 + i * 58);
    });
  }
}
