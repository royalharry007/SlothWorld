import { chromium } from 'playwright-core';
// Visual tour of the interactive features (needs the app on :8787 and, for Pip/Hoot, a model):
//   npx tsx scripts/tour2.ts <outDir>
const out = process.argv[2] ?? '.';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200));
});
const S = (n: string) => p.screenshot({ path: `${out}/${n}.png` });
const open = async (id: string) => {
  await p.evaluate((id) => {
    const s = window.__slothworld!.store.getState();
    s.setPanel(null);
    s.travelTo(id);
  }, id);
  await p.waitForFunction((id) => window.__slothworld!.store.getState().nearSpot === id, id, { timeout: 10000 });
  await p.keyboard.press('e');
  await p.waitForSelector('[data-testid=panel]');
  await p.waitForTimeout(1800);
};

await p.goto('http://127.0.0.1:8787');
await p.waitForFunction(() => document.body.dataset.sceneLoading === 'done', null, { timeout: 60000 });
await p.click('[data-testid=explore-sample]');
await p.waitForSelector('[data-testid=start-exploring]');
await p.click('[data-testid=start-exploring]');
await p.waitForTimeout(2500);
await S('n1-hub-next');

// "Walk me there": route across the bridge to the first challenge
await p.click('[data-testid=next-go]');
const t0 = Date.now();
await p
  .waitForFunction(() => window.__slothworld!.store.getState().nearSpot === 'neuron-lab', null, { timeout: 40000 })
  .then(
    () => console.log('walked to neuron-lab in', ((Date.now() - t0) / 1000).toFixed(1), 's'),
    () => console.log('walk did not arrive; nearSpot =', 'see screenshot'),
  );
await S('n2-walked');

await open('neuron-cloze');
await S('n3-cloze-empty');
await p.click('.bank .chip:has-text("amplifies")');
await p.click('.bank .chip:has-text("suppresses")');
await p.click('text=Check words');
await p.waitForTimeout(400);
await S('n4-cloze-done');

await open('neuron-teach');
await S('n5-pip-start');
await p.fill('[data-testid=teach-input]', 'A neuron takes its inputs, multiplies each by a weight and adds them up.');
await p.click('[data-testid=teach-send]');
await p.waitForSelector('.msg.pip:not(.pending) >> nth=1', { timeout: 120000 });
await p.waitForTimeout(500);
await S('n6-pip-reply');
console.log('Pip:', await p.textContent('.msg.pip:not(.pending) >> nth=1'));
await p.fill(
  '[data-testid=teach-input]',
  'Oh and there is a bias added too. Positive weights make an input matter more, negative weights push the output down, and the sigmoid squashes big sums toward 1 and very negative ones toward 0.',
);
await p.click('[data-testid=teach-send]');
await p.waitForSelector('.msg.pip:not(.pending) >> nth=2', { timeout: 120000 });
await p.waitForTimeout(500);
await S('n7-pip-done');
console.log('Pip2:', await p.textContent('.msg.pip:not(.pending) >> nth=2'), '| solved:', await p.evaluate(() => !!window.__slothworld!.store.getState().progress.completed['neuron-teach']));

await p.keyboard.press('Escape');
await p.keyboard.press('h');
await p.waitForSelector('[data-testid=hoot-input]');
await p.fill('[data-testid=hoot-input]', 'What does the bias do?');
await p.keyboard.press('Enter');
await p.waitForSelector('.msg.hoot .evidence, .msg.hoot .note', { timeout: 120000 });
await p.waitForTimeout(500);
await S('n8-hoot');
console.log('Hoot:', (await p.textContent('.msg.hoot >> nth=0'))?.slice(0, 300));

// Solve a quiz, then pretend 10 minutes passed and visit the Review Grove.
await open('neuron-quiz');
await p.click('.option:has-text("0.5")');
await p.evaluate(() => {
  const s = window.__slothworld!.store.getState();
  const r = { ...s.progress.review };
  for (const k of Object.keys(r)) r[k] = { ...r[k], due: Date.now() - 1000 };
  window.__slothworld!.store.setState({ progress: { ...s.progress, review: r } });
});
await open('hub:review');
await S('n9-grove');
await p.click('[data-testid=review-start]');
await p.waitForTimeout(600);
await S('n10-review-card');
await b.close();
