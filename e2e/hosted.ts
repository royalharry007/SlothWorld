import { chromium } from 'playwright-core';
import { chromePath } from '../scripts/chrome';
import { Blueprint, type World } from '../shared/blueprint';

// Checks for the hosted (Render) configuration. Start the server like the container does, e.g.:
//   NODE_ENV=production PORT=8788 SLOTH_HOSTED=1 SLOTH_MODEL=gemma3:1b SLOTH_NUM_GPU=0 SLOTH_NUM_THREAD=2 \
//   SLOTH_MAX_CONCEPTS=4 SLOTH_NUM_CTX=4096 SLOTH_RATE_LIMIT_PER_HOUR=1 npx tsx server/index.ts
//   npx tsx e2e/hosted.ts http://127.0.0.1:8788
const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const CHROME = chromePath();
let failed = 0;
const check = async (name: string, fn: () => Promise<string>) => {
  const t0 = Date.now();
  try {
    console.log(`  ✓ ${name} — ${await fn()} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name} — ${(e as Error).message}`);
  }
};

const b = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message));
console.log(`\nHosted-mode checks against ${BASE}\n`);

await check('Health reports hosted mode, model and rate limit', async () => {
  const h = await (await fetch(`${BASE}/api/health`)).json();
  if (!h.hosted || !h.ollama.modelAvailable || h.limits.perHour !== 1) throw new Error(JSON.stringify(h));
  return `hosted, ${h.ollama.model}, ${h.limits.perHour}/hour`;
});

await check('Landing and upload dialog use server-side privacy wording', async () => {
  await p.goto(BASE);
  await p.waitForFunction(() => document.body.dataset.sceneLoading === 'done', null, { timeout: 90_000 });
  await p.waitForSelector('.ai-status:has-text("on this SlothWorld server")');
  const landing = (await p.textContent('.landing'))!;
  if (landing.includes('never leaves this computer')) throw new Error('local-only privacy claim shown in hosted mode');
  await p.click('[data-testid=open-upload]');
  await p.waitForSelector('.dialog .sub:has-text("not sent to any AI company")');
  await p.screenshot({ path: 'docs/screenshots/22-hosted-upload.png' });
  return 'no "never leaves this computer" claim';
});

await check('CPU-only gemma3:1b generates a validated world through the UI (keep-alive pings handled)', async () => {
  await p.setInputFiles('[data-testid=pdf-input]', 'public/samples/the-water-cycle.pdf');
  await p.waitForSelector('.hint-box:has-text("3–6 minutes")');
  await p.waitForFunction(() => window.__slothworld!.store.getState().screen === 'world' || !!document.querySelector('[data-testid=upload-error]'), null, { timeout: 1_200_000, polling: 2000 });
  if (await p.isVisible('[data-testid=upload-error]')) throw new Error(`${await p.textContent('[data-testid=upload-error]')}`);
  const w = (await p.evaluate(() => window.__slothworld!.store.getState().world)) as World;
  if (!Blueprint.safeParse(w.blueprint).success) throw new Error('blueprint invalid');
  await p.waitForTimeout(3000);
  await p.screenshot({ path: 'docs/screenshots/23-hosted-gemma3-world.png' });
  const bp = w.blueprint;
  return `"${bp.title}" by ${bp.meta.model}: ${bp.concepts.length} islands, ${bp.locations.reduce((s, l) => s + l.stations.length, 0)} stations, ${bp.meta.warnings.length} validation notes`;
});

await check('Second world within the hour is rate-limited with a clear message', async () => {
  await p.click('button:has-text("Exit")');
  await p.click('[data-testid=open-upload]');
  await p.setInputFiles('[data-testid=pdf-input]', 'public/samples/how-neural-networks-learn.pdf');
  await p.waitForSelector('[data-testid=upload-error]', { timeout: 30_000 });
  const msg = (await p.textContent('[data-testid=upload-error]'))!;
  if (!/per hour/.test(msg)) throw new Error(msg);
  return msg.replace('Couldn’t build that world', '').slice(0, 90) + '…';
});

await check('No page errors', async () => {
  if (errors.length) throw new Error(errors.join(' | '));
  return '0';
});

await b.close();
console.log(failed ? `\n${failed} check(s) failed\n` : '\nAll hosted-mode checks passed\n');
process.exit(failed ? 1 : 0);
