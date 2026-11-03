// Synthesised sound effects, and Gary's voice: recorded ElevenLabs clips (public/voice,
// made by `npm run voice`), with browser text-to-speech as the fallback.

let ctx = null;
let master = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startAmbience();
  preloadVoice();
}

function env(node, gain, attack, dur) {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  node.connect(g);
  g.connect(master);
  return g;
}

function noise(dur, { freq = 2000, q = 1, type = 'bandpass', gain = 0.3, attack = 0.002, delay = 0 } = {}) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f);
  env(f, gain, attack, dur);
  src.start(ctx.currentTime + delay, Math.random() * 0.5, dur + 0.05);
}

function tone(freq, dur, { type = 'sine', gain = 0.2, slideTo = null, attack = 0.005, delay = 0 } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = type;
  const t = ctx.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function startAmbience() {
  // Quiet office hum: low filtered noise plus a fluorescent-light buzz.
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 400;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  src.connect(f).connect(g).connect(master);
  src.start();
  const hum = ctx.createOscillator();
  hum.frequency.value = 120;
  const hg = ctx.createGain();
  hg.gain.value = 0.006;
  hum.connect(hg).connect(master);
  hum.start();
}

export const sfx = {
  key() {
    noise(0.035, { freq: 3500, q: 0.7, gain: 0.35 });
    tone(220 + Math.random() * 40, 0.03, { type: 'square', gain: 0.03 });
  },
  wrong() { tone(160, 0.16, { type: 'sawtooth', gain: 0.07, slideTo: 110 }); },
  dead() { noise(0.05, { freq: 600, gain: 0.2 }); },
  button() { tone(520, 0.08, { type: 'triangle', gain: 0.2 }); tone(780, 0.12, { type: 'triangle', gain: 0.18, delay: 0.07 }); },
  slam() {
    noise(0.3, { freq: 260, type: 'lowpass', gain: 1.0 });
    tone(110, 0.35, { slideTo: 38, gain: 0.6 });
    noise(0.08, { freq: 2500, gain: 0.25, delay: 0.02 });
  },
  open() { noise(0.2, { freq: 900, q: 2, gain: 0.12 }); tone(300, 0.15, { slideTo: 600, gain: 0.05 }); },
  step(vol = 1) { noise(0.09, { freq: 180, type: 'lowpass', gain: 0.5 * vol }); },
  alarm() { tone(880, 0.1, { type: 'square', gain: 0.08 }); tone(660, 0.1, { type: 'square', gain: 0.08, delay: 0.13 }); },
  beep(high = false) { tone(high ? 1320 : 880, high ? 0.35 : 0.12, { type: 'sine', gain: 0.2 }); },
  stamp() { noise(0.2, { freq: 150, type: 'lowpass', gain: 0.9 }); tone(70, 0.3, { slideTo: 35, gain: 0.5 }); },
  promoted() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', gain: 0.18, delay: i * 0.1 })); },
  fired() { [392, 311, 233, 155].forEach((f, i) => tone(f, 0.35, { type: 'sawtooth', gain: 0.08, delay: i * 0.18 })); },
  shuffle() { for (let i = 0; i < 8; i++) noise(0.03, { freq: 2000 + i * 300, gain: 0.2, delay: i * 0.03 }); },
};

let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => /en-(US|GB)/i.test(v.lang) && /male|david|daniel|george|guy|fred/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null
  );
}
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
}

// ---- Gary's recorded voice ----

const VOICE_BASE = `${import.meta.env.BASE_URL}voice/`;
let clips = null; // [{ text, file, match }]
const decoded = new Map(); // file -> Promise<AudioBuffer>
let speaking = null;

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
fetch(`${VOICE_BASE}manifest.json`)
  .then((r) => (r.ok ? r.json() : null))
  .then((m) => {
    if (!m) return;
    // lines with {word}/{phrase} match whatever got filled in at runtime
    clips = Object.entries(m.lines).map(([text, file]) => ({
      text,
      file,
      match: text.includes('{') ? new RegExp(`^${text.split(/\{\w+\}/).map(escapeRe).join('[\\s\\S]*?')}$`) : null,
    }));
    preloadVoice();
  })
  .catch(() => {});

function clipFor(text) {
  if (!clips) return null;
  const hit = clips.find((c) => (c.match ? c.match.test(text) : c.text === text));
  return hit ? hit.file : null;
}

function loadClip(file) {
  if (!decoded.has(file)) {
    const p = fetch(VOICE_BASE + file)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b));
    p.catch(() => decoded.delete(file));
    decoded.set(file, p);
  }
  return decoded.get(file);
}

// Decode every clip once audio is unlocked, so lines play instantly in the headset.
function preloadVoice() {
  if (!ctx || !clips) return;
  for (const c of clips) loadClip(c.file).catch(() => {});
}

function stopSpeaking() {
  try {
    speaking?.src?.stop();
  } catch {
    // already finished
  }
  speaking = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export function say(text, opts = {}) {
  const file = clipFor(text);
  if (!file || !ctx) {
    speakSynth(text, opts);
    return;
  }
  stopSpeaking();
  const token = {};
  speaking = token;
  loadClip(file)
    .then((buf) => {
      if (speaking !== token) return; // a newer line already started
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 1.4;
      src.connect(g).connect(master);
      src.start();
      token.src = src;
    })
    .catch(() => speakSynth(text, opts));
}

// Fallback: the browser's built-in speech.
function speakSynth(text, { angry = false } = {}) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    voice = voice || pickVoice();
    if (voice) u.voice = voice;
    u.pitch = angry ? 0.6 : 0.8;
    u.rate = angry ? 1.15 : 1.0;
    u.volume = 1;
    speechSynthesis.speak(u);
  } catch {
    // Speech is a nice-to-have; the speech bubble still shows the line.
  }
}
