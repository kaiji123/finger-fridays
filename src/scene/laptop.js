import * as THREE from '@iwsdk/core';
import { canvasTexture, rrect, wrapMono, MONO, SANS, std, damp } from '../util.js';

const W = 0.44;
const D = 0.29;
const OPEN = -0.32;
const CLOSED = Math.PI / 2 - 0.035;

export class Laptop {
  constructor() {
    this.group = new THREE.Group();
    this.isOpen = true;
    this.angle = OPEN;
    this.vel = 0;

    const shell = std(0x9aa0aa, { roughness: 0.35, metalness: 0.6 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.022, D), shell);
    base.position.y = 0.011;
    base.castShadow = base.receiveShadow = true;
    this.group.add(base);
    // little fake keyboard area + sticker on the base
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.002, D * 0.5), std(0x1f2228));
    deck.position.set(0, 0.0225, -0.03);
    this.group.add(deck);

    this.pivot = new THREE.Group();
    this.pivot.position.set(0, 0.022, -D / 2);
    this.group.add(this.pivot);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(W, D, 0.012), shell);
    lid.position.set(0, D / 2, -0.006);
    lid.castShadow = true;
    this.pivot.add(lid);
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.01, D - 0.01), std(0x111317, { roughness: 0.3 }));
    bezel.position.set(0, D / 2, 0.0005);
    this.pivot.add(bezel);

    // Company logo on the back of the lid
    const logo = canvasTexture(256, 256);
    logo.ctx.fillStyle = '#ffffff';
    logo.ctx.font = `700 150px ${SANS}`;
    logo.ctx.textAlign = 'center';
    logo.ctx.textBaseline = 'middle';
    logo.ctx.fillText('f.', 128, 120);
    const logoMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 0.08),
      new THREE.MeshBasicMaterial({ map: logo.tex, transparent: true, opacity: 0.8 })
    );
    logoMesh.position.set(0, D / 2, -0.0125);
    logoMesh.rotation.y = Math.PI;
    this.pivot.add(logoMesh);

    this.screen = canvasTexture(1200, 780);
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.screen.tex, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.03, D - 0.03), this.screenMat);
    screen.position.set(0, D / 2 + 0.003, 0.001);
    this.pivot.add(screen);

    this.meshes = [base, lid, screen, bezel];
    for (const m of this.meshes) m.userData.laptop = true;
    this.pivot.rotation.x = this.angle;
  }

  setOpen(open) {
    if (open === this.isOpen) return false;
    this.isOpen = open;
    this.vel = open ? -4 : 14; // slams are fast, opening is gentle
    return true;
  }

  update(dt) {
    const target = this.isOpen ? OPEN : CLOSED;
    if (this.isOpen) {
      this.angle = damp(this.angle, target, 8, dt);
    } else {
      // closing: accelerate into the base, then bounce
      this.vel += 60 * dt;
      this.angle += this.vel * dt;
      if (this.angle > CLOSED) {
        this.angle = CLOSED;
        this.vel = -Math.abs(this.vel) * 0.25;
        if (Math.abs(this.vel) < 0.4) this.vel = 0;
      }
    }
    this.pivot.rotation.x = this.angle;
    this.screenMat.color.setScalar(this.angle > 1.2 ? 0.1 : 1);
  }

  // ---- screen drawing ----
  draw(view) {
    // Only re-upload the screen texture when something visible changed.
    const now = performance.now();
    const phase = view.mode === 'menu' ? Math.floor(now / 200) : view.mode === 'email' ? Math.floor(now / 400) % 2 : 0;
    const sig = JSON.stringify(view) + phase;
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    const { ctx, canvas, tex } = this.screen;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#f7f4ee';
    ctx.fillRect(0, 0, w, h);
    if (view.mode === 'menu') this.drawMenu(ctx, w, h, view);
    else if (view.mode === 'countdown') this.drawCountdown(ctx, w, h, view);
    else if (view.mode === 'results') this.drawResults(ctx, w, h, view);
    else this.drawEmail(ctx, w, h, view);
    tex.needsUpdate = true;
  }

  drawChrome(ctx, w, title) {
    ctx.fillStyle = '#2b2e36';
    ctx.fillRect(0, 0, w, 64);
    ['#ff6b5b', '#ffbf47', '#36c46b'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(36 + i * 34, 32, 11, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#e9e4da';
    ctx.font = `500 28px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 150, 33);
  }

  drawMenu(ctx, w, h, v) {
    this.drawChrome(ctx, w, 'FingerOS — Welcome');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8590c';
    ctx.font = `700 92px ${SANS}`;
    ctx.fillText('Finger Fridays', w / 2, 190);
    ctx.fillStyle = '#4a4f5c';
    ctx.font = `500 34px ${SANS}`;
    ctx.fillText('Friday, 4:57 PM. One overdue email. Then freedom.', w / 2, 262);
    ctx.fillStyle = '#24262c';
    ctx.font = `700 46px ${SANS}`;
    ctx.fillText(`Rank: ${v.rank}`, w / 2, 370);
    ctx.font = `500 32px ${MONO}`;
    ctx.fillStyle = '#4a4f5c';
    ctx.fillText(`Best ${v.best} WPM  ·  ${v.streak} days without getting fired`, w / 2, 430);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
    ctx.fillStyle = `rgba(220, 38, 38, ${0.75 + pulse * 0.25})`;
    rrect(ctx, w / 2 - 380, 520, 760, 110, 55);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 44px ${SANS}`;
    ctx.fillText('Press the big red button →', w / 2, 577);
    ctx.fillStyle = '#7a8090';
    ctx.font = `500 26px ${SANS}`;
    ctx.fillText(v.hint, w / 2, 700);
  }

  drawCountdown(ctx, w, h, v) {
    this.drawChrome(ctx, w, 'FingerOS — Clocking in…');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8590c';
    ctx.font = `800 300px ${MONO}`;
    ctx.fillText(String(v.count), w / 2, h / 2 + 10);
    ctx.fillStyle = '#4a4f5c';
    ctx.font = `500 34px ${SANS}`;
    ctx.fillText(v.curseLine, w / 2, h - 90);
  }

  drawEmail(ctx, w, h, v) {
    this.drawChrome(ctx, w, 'Mail — New Message (UNSENT since Monday)');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `500 28px ${SANS}`;
    ctx.fillStyle = '#7a8090';
    ctx.fillText('To:', 40, 112);
    ctx.fillText('Subject:', 40, 152);
    ctx.fillStyle = '#24262c';
    ctx.fillText('everyone@megacorp.biz', 160, 112);
    ctx.fillText('RE: RE: RE: URGENT (please read)', 160, 152);
    ctx.fillStyle = '#d8d2c6';
    ctx.fillRect(40, 176, w - 80, 2);

    const fontSize = 46;
    ctx.font = `500 ${fontSize}px ${MONO}`;
    const cw = ctx.measureText('M').width;
    const maxChars = Math.floor((w - 80) / cw);
    const lines = wrapMono(v.prompt, maxChars);
    const lineH = fontSize * 1.55;
    const top = 250;
    const blink = Math.floor(performance.now() / 400) % 2 === 0;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const y = top + li * lineH;
      for (let j = 0; j < line.text.length; j++) {
        const i = line.start + j;
        const x = 40 + j * cw;
        const want = v.prompt[i];
        if (i < v.typed.length) {
          const got = v.typed[i];
          if (got.toLowerCase() === want.toLowerCase()) {
            ctx.fillStyle = '#1d6b3a';
            ctx.fillText(want, x, y);
          } else {
            ctx.fillStyle = 'rgba(220, 38, 38, 0.18)';
            ctx.fillRect(x, y - fontSize * 0.85, cw, fontSize * 1.1);
            ctx.fillStyle = '#dc2626';
            ctx.fillText(got === ' ' ? '_' : got, x, y);
          }
        } else {
          ctx.fillStyle = '#a8a397';
          ctx.fillText(want, x, y);
        }
        if (i === v.typed.length && blink) {
          ctx.fillStyle = '#e8590c';
          ctx.fillRect(x - 2, y - fontSize * 0.85, 4, fontSize * 1.05);
        }
      }
    }
    // footer: progress + live stats
    const p = v.typed.length / v.prompt.length;
    ctx.fillStyle = '#e4ded2';
    rrect(ctx, 40, h - 70, w - 80, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#e8590c';
    rrect(ctx, 40, h - 70, Math.max(16, (w - 80) * p), 16, 8);
    ctx.fill();
    ctx.fillStyle = '#4a4f5c';
    ctx.font = `500 26px ${MONO}`;
    ctx.fillText(`${v.wpm} WPM   ${v.typos} typos`, 40, h - 90);
    if (v.paused) {
      ctx.fillStyle = 'rgba(30, 32, 38, 0.82)';
      ctx.fillRect(0, 64, w, h - 64);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `700 90px ${SANS}`;
      ctx.fillText('PAUSED', w / 2, h / 2);
      ctx.font = `500 34px ${SANS}`;
      ctx.fillText('Press the red button to get back to work', w / 2, h / 2 + 70);
    }
  }

  drawResults(ctx, w, h, v) {
    this.drawChrome(ctx, w, 'HR Portal — Performance Review');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const color = { PROMOTED: '#1d8a4a', WARNING: '#d97706', FIRED: '#dc2626' }[v.verdict];
    ctx.save();
    ctx.translate(w / 2, 190);
    ctx.rotate(-0.06);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    rrect(ctx, -300, -75, 600, 150, 16);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `800 110px ${SANS}`;
    ctx.fillText(v.verdict, 0, 6);
    ctx.restore();
    ctx.fillStyle = '#24262c';
    ctx.font = `500 34px ${SANS}`;
    ctx.fillText(v.reason, w / 2, 320);
    const stats = [
      [v.wpm, 'WPM'],
      [`${v.accuracy}%`, 'ACCURACY'],
      [v.typos, 'TYPOS'],
      [`${v.done}%`, 'SENT'],
    ];
    stats.forEach(([val, label], i) => {
      const x = w / 2 + (i - 1.5) * 260;
      ctx.fillStyle = '#24262c';
      ctx.font = `800 72px ${MONO}`;
      ctx.fillText(String(val), x, 430);
      ctx.fillStyle = '#7a8090';
      ctx.font = `500 24px ${SANS}`;
      ctx.fillText(label, x, 490);
    });
    ctx.fillStyle = '#4a4f5c';
    ctx.font = `500 32px ${SANS}`;
    ctx.fillText(v.rankLine, w / 2, 580);
    ctx.fillStyle = '#e8590c';
    ctx.font = `700 34px ${SANS}`;
    ctx.fillText('Press the red button for your next shift', w / 2, 680);
  }
}
