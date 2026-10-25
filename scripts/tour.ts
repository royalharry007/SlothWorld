import { chromium } from 'playwright-core';
import { chromePath } from './chrome';
// Visual tour for development: npx tsx scripts/tour.ts <outDir>
const out = process.argv[2] ?? '.';
const b = await chromium.launch({ executablePath: chromePath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
await p.goto('http://localhost:5173');
await p.waitForFunction(() => document.body.dataset.sceneLoading === 'done', null, { timeout: 60000 });
await p.waitForTimeout(3000);
await p.screenshot({ path: `${out}/t0-landing.png` });
await p.click('[data-testid=explore-sample]');
await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}/t1-guide.png` });
await p.click('[data-testid=start-exploring]');
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/t2-hub.png` });
for (const id of ['neuron-lab', 'network-lab', 'loss-lab', 'neuron-quiz']) {
  await p.evaluate((id) => window.__slothworld!.store.getState().travelTo(id), id);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/t3-${id}-walk.png` });
  await p.keyboard.press('e');
  if (id === 'network-lab') { await p.click('[data-testid=send-signal]'); await p.waitForTimeout(1300); }
  else await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/t4-${id}-panel.png` });
  await p.keyboard.press('Escape');
}
await p.keyboard.press('m');
await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}/t5-overview.png` });
await p.keyboard.press('m');
await p.keyboard.press('j');
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/t6-journal.png` });
await b.close();
