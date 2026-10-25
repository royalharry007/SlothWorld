import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome';
// Visual tour of a saved AI world JSON (from scripts/try-generate.ts): npx tsx scripts/tour-ai.ts world.json outDir
const [file, out = '.'] = process.argv.slice(2);
const world = JSON.parse(readFileSync(file, 'utf8'));
const b = await chromium.launch({ executablePath: chromePath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173');
await p.waitForFunction(() => document.body.dataset.sceneLoading === 'done', null, { timeout: 60000 });
await p.evaluate((w) => window.__slothworld!.store.getState().openWorld(w, null), world);
await p.waitForTimeout(1500);
await p.evaluate(() => window.__slothworld!.store.getState().setPanel(null));
const loc = world.blueprint.locations[1];
for (const id of [`${loc.id}:landmark`, ...loc.stations.map((s: { id: string }) => s.id)]) {
  await p.evaluate((id) => { const s = window.__slothworld!.store.getState(); s.setPanel(null); s.travelTo(id); }, id);
  await p.waitForTimeout(2200);
  await p.keyboard.press('e');
  await p.waitForTimeout(2200);
  await p.screenshot({ path: `${out}/ai-${id.replace(/[:]/g, '_')}.png` });
}
await b.close();
