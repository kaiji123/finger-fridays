// Records Gary's lines with ElevenLabs into public/voice/, plus a manifest the game reads.
//
//   npm run voice            record new or changed lines (existing clips are kept)
//   npm run voice -- --force re-record everything (e.g. after changing the voice)
//
// Needs ELEVENLABS_API_KEY in .env.local. The key is only used here, on your machine;
// the game ships the finished MP3s, never the key.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { LINES, VOICE } from '../src/game/data.js';

try {
  process.loadEnvFile('.env.local');
} catch {
  // fall back to the real environment
}
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pqHfZKP75CvOlQylNhV4'; // "Bill": older American male
const MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_v3';
const FORCE = process.argv.includes('--force');
const OUT = 'public/voice';
if (!KEY) {
  console.error('Missing ELEVENLABS_API_KEY in .env.local');
  process.exit(1);
}

// Every line Gary can say, with the group it belongs to (for its mood).
const lines = [];
for (const [group, value] of Object.entries(LINES)) {
  if (Array.isArray(value)) value.forEach((text) => lines.push({ group, text }));
  else for (const [k, text] of Object.entries(value)) lines.push({ group: `${group}.${k}`, text });
}

const expressive = MODEL === 'eleven_v3'; // older models would read the [tags] out loud
const settings = expressive
  ? { stability: 0.5, similarity_boost: 0.8 } // v3: "creative"-leaning stability
  : { stability: 0.35, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true };

mkdirSync(OUT, { recursive: true });
const manifest = { voice: VOICE_ID, model: MODEL, lines: {} };
let made = 0;
for (const { group, text } of lines) {
  const spoken = (VOICE.spoken[text] || text).replace(/"/g, '');
  const mood = expressive ? VOICE.mood[group] || '' : '';
  const input = `${mood} ${spoken}`.trim();
  const file = `${createHash('sha1').update(`${VOICE_ID}|${MODEL}|${input}`).digest('hex').slice(0, 12)}.mp3`;
  manifest.lines[text] = file;
  if (existsSync(`${OUT}/${file}`) && !FORCE) continue;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text: input, model_id: MODEL, voice_settings: settings }),
  });
  if (!res.ok) {
    console.error(`Failed (${res.status}) on "${input}": ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  writeFileSync(`${OUT}/${file}`, Buffer.from(await res.arrayBuffer()));
  made++;
  console.log(`recorded  ${input}`);
}

// drop clips for lines that no longer exist
const keep = new Set(Object.values(manifest.lines));
for (const f of readdirSync(OUT)) if (f.endsWith('.mp3') && !keep.has(f)) rmSync(`${OUT}/${f}`);
writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${made} recorded, ${lines.length - made} already up to date. Voice ${VOICE_ID}, model ${MODEL}.`);
