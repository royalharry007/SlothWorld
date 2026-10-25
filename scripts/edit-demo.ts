import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome';

// Assembles the demo video from recorded clips (shotNN.*) and voice lines (voNN.*).
//   npx tsx scripts/edit-demo.ts [recordingDir]      (default: ./recording)
// Output: <dir>/output/slothworld-demo.mp4, pip.gif, hoot.gif, neuron.gif, cover.png

const DIR = resolve(process.argv[2] ?? 'recording');
const OUT = join(DIR, 'output');
const WORK = join(OUT, 'work');
mkdirSync(WORK, { recursive: true });

const W = 1920;
const H = 1080;
const FPS = 30;
const BG = '#1b2230';
const TIMELAPSE_SHOT = 11;

// Short on-screen captions (lower left). Shot 11 gets an automatic "real time" caption.
const CAPTIONS: Record<number, string> = {
  2: 'Gemma, an open model, running locally',
  6: 'Teach Pip: learning by teaching',
  9: 'Professor Hoot answers only from your PDF',
  10: 'Word Bridge: real sentences from your PDF',
  13: 'Every quote is checked against the PDF',
  14: 'Review Grove: spaced review',
};

const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const duration = (file: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
const find = (prefix: string, n: number) => {
  const name = `${prefix}${String(n).padStart(2, '0')}.`;
  const f = readdirSync(DIR).find((x) => x.toLowerCase().startsWith(name));
  return f ? join(DIR, f) : null;
};

// ---------- 1. Render the title card and caption images with the app's own font ----------
// Fonts are embedded as data URLs: a blank page may not load fonts from file paths.
const dataFont = (f: string) => `data:font/woff;base64,${readFileSync(resolve('node_modules/@fontsource/fredoka/files', f)).toString('base64')}`;
const font = dataFont('fredoka-latin-700-normal.woff');
const fontMid = dataFont('fredoka-latin-500-normal.woff');
const logo = readFileSync(resolve('public/favicon.svg'), 'utf8');
const css = `@font-face{font-family:F;src:url(${font})}@font-face{font-family:FM;src:url(${fontMid})}*{margin:0;box-sizing:border-box}`;

async function renderImages(timelapseCaption: string | null) {
  const b = await chromium.launch({ executablePath: chromePath() });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  // Title card (also used as the DEV cover image).
  await p.setContent(`<style>${css}
    body{width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;
      background:linear-gradient(180deg,#5b86b5 0%,#f3d3b0 75%,#e8d3c0 100%);font-family:F;color:#1f2a3a}
    .logo svg{width:220px;height:220px;filter:drop-shadow(0 12px 30px rgba(0,0,0,.25))}
    h1{font-size:150px;letter-spacing:-2px} h2{font-size:58px;color:#fff;text-shadow:0 3px 14px rgba(0,0,0,.25)}
    h2 em{font-style:normal;color:#ffe08a} p{font-family:FM;font-size:34px;color:#2b3445} .url{font-size:40px;color:#1f2a3a;background:rgba(255,255,255,.75);padding:10px 28px;border-radius:999px}
  </style><div class="logo">${logo}</div><h1>SlothWorld</h1><h2>Stop rereading. <em>Start exploring.</em></h2>
  <p>Built with Gemma · Hacktoberfest 2026 · Week 3: Slow and Steady</p><div class="url">github.com/royalharry007/SlothWorld</div>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(OUT, 'cover.png') });
  // Captions: a soft pill, transparent background.
  const captions: Record<number, string> = { ...CAPTIONS };
  if (timelapseCaption) captions[TIMELAPSE_SHOT] = timelapseCaption;
  for (const [n, text] of Object.entries(captions)) {
    await p.setContent(`<style>${css}body{background:transparent}
      .c{display:inline-block;margin:0 0 0 0;padding:16px 30px;border-radius:999px;background:rgba(255,248,236,.94);color:#1f2a3a;
      font-family:F;font-size:40px;box-shadow:0 10px 30px rgba(0,0,0,.25)}</style><span class="c" id="c">🦥 ${text}</span>`);
    await p.evaluate(() => document.fonts.ready);
    await p.locator('#c').screenshot({ path: join(WORK, `cap${n}.png`), omitBackground: true });
  }
  await b.close();
}

// ---------- 2. Build one uniform segment per shot ----------
const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${BG},fps=${FPS},format=yuv420p`;

interface Seg {
  n: number;
  file: string;
  length: number;
}

function buildSegment(n: number, clip: string, voice: string | null): Seg {
  const C = duration(clip);
  const V = voice ? duration(voice) : 0;
  const lead = 0.4; // voice starts slightly after the cut
  let length: number;
  let speed = 1;
  if (n === TIMELAPSE_SHOT) {
    length = Math.max(V + lead + 1.0, 10);
    speed = Math.max(1, C / length);
  } else if (V > 0) {
    // keep the action, but trim long dead time after the voice ends; hold the last frame if the voice runs longer
    length = Math.min(Math.max(C, V + lead + 0.8), V + lead + 3.5);
  } else length = C;

  const out = join(WORK, `seg${String(n).padStart(2, '0')}.mp4`);
  const cap = join(WORK, `cap${n}.png`);
  const hasCap = existsSync(cap);
  const vChain = [
    speed > 1 ? `setpts=PTS/${speed.toFixed(4)}` : 'setpts=PTS-STARTPTS',
    fit,
    `tpad=stop_mode=clone:stop_duration=${Math.max(0, length - C / speed + 0.5).toFixed(2)}`,
    `trim=0:${length.toFixed(3)}`,
    'setpts=PTS-STARTPTS',
    `fade=t=in:st=0:d=0.2`,
    `fade=t=out:st=${(length - 0.2).toFixed(3)}:d=0.2`,
  ].join(',');
  const inputs = ['-i', clip];
  if (voice) inputs.push('-i', voice);
  if (hasCap) inputs.push('-loop', '1', '-i', cap);
  const capIdx = voice ? 2 : 1;
  let filter = `[0:v]${vChain}[base]`;
  filter += hasCap
    ? `;[${capIdx}:v]format=rgba,fade=t=in:st=0.3:d=0.4:alpha=1,fade=t=out:st=${Math.max(0.8, length - 0.6).toFixed(2)}:d=0.4:alpha=1[cap];[base][cap]overlay=60:H-h-60:shortest=1[v]`
    : `;[base]null[v]`;
  filter += voice
    ? `;[1:a]aresample=48000,adelay=${Math.round(lead * 1000)}:all=1,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad,atrim=0:${length.toFixed(3)},afade=t=out:st=${(length - 0.15).toFixed(3)}:d=0.15[a]`
    : `;anullsrc=r=48000:cl=stereo,atrim=0:${length.toFixed(3)}[a]`;
  ff([...inputs, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', length.toFixed(3), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', out]);
  return { n, file: out, length };
}

function titleSegment(): Seg {
  const out = join(WORK, 'seg99-title.mp4');
  const length = 5;
  ff(['-loop', '1', '-i', join(OUT, 'cover.png'), '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-filter_complex', `[0:v]${fit},fade=t=in:st=0:d=0.6[v]`, '-map', '[v]', '-map', '1:a', '-t', String(length), '-c:v', 'libx264', '-crf', '18', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', out]);
  return { n: 99, file: out, length };
}

function gif(seg: Seg | undefined, name: string, from: 'start' | 'end', seconds = 7) {
  if (!seg) return;
  const start = from === 'end' ? Math.max(0, seg.length - seconds) : 0;
  const palette = join(WORK, `${name}-palette.png`);
  const f = `fps=12,scale=960:-1:flags=lanczos`;
  ff(['-ss', start.toFixed(2), '-t', String(seconds), '-i', seg.file, '-vf', `${f},palettegen=stats_mode=diff`, palette]);
  ff(['-ss', start.toFixed(2), '-t', String(seconds), '-i', seg.file, '-i', palette, '-lavfi', `${f}[x];[x][1:p]paletteuse=dither=bayer:bayer_scale=4`, join(OUT, `${name}.gif`)]);
}

// ---------- 3. Run ----------
const shots: { n: number; clip: string; voice: string | null }[] = [];
const missing: string[] = [];
for (let n = 1; n <= 15; n++) {
  const clip = find('shot', n);
  const voice = find('vo', n);
  if (!clip) missing.push(`shot${String(n).padStart(2, '0')}`);
  else shots.push({ n, clip, voice });
  if (clip && !voice) console.log(`note: no voice for shot ${n}; it will be silent`);
}
if (missing.length) console.log(`note: missing ${missing.join(', ')}; those shots are skipped`);
if (!shots.length) throw new Error(`No shotNN clips found in ${DIR}`);

const tl = shots.find((s) => s.n === TIMELAPSE_SHOT);
let tlCaption: string | null = null;
if (tl) {
  const real = Math.round(duration(tl.clip));
  tlCaption = `Sped up · real time on a MacBook: ${real >= 90 ? `${Math.round(real / 6) / 10} min` : `${real} s`}`;
}
await renderImages(tlCaption);

const segs = shots.map((s) => {
  process.stdout.write(`shot ${String(s.n).padStart(2, '0')}… `);
  const seg = buildSegment(s.n, s.clip, s.voice);
  console.log(`${seg.length.toFixed(1)} s`);
  return seg;
});
segs.push(titleSegment());

const list = join(WORK, 'concat.txt');
writeFileSync(list, segs.map((s) => `file '${s.file.replace(/\\/g, '/')}'`).join('\n'));
const final = join(OUT, 'slothworld-demo.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);

gif(segs.find((s) => s.n === 8), 'pip', 'end');
gif(segs.find((s) => s.n === 9), 'hoot', 'end');
gif(segs.find((s) => s.n === 5), 'neuron', 'start', 8);

const total = segs.reduce((t, s) => t + s.length, 0);
console.log(`\nDone: ${final} (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')})`);
console.log(`GIFs and cover.png are in ${OUT}`);
