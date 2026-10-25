import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { chromium, type Page } from 'playwright-core';
import { Blueprint, type World } from '../shared/blueprint';
import { isWalkable, type WorldLayout } from '../shared/layout';
import { gradientStep, mse, networkForward, neuronForward, SAMPLE_NETWORK } from '../shared/math';

// End-to-end acceptance checks against the running app (dev or production build).
//   npm run e2e                      -> http://localhost:5173 (npm run dev must be running)
//   npm run e2e -- http://127.0.0.1:8787 --skip-ai
const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173';
const SKIP_AI = args.includes('--skip-ai');
const SHOTS = 'docs/screenshots';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(SHOTS, { recursive: true });

const results: { name: string; ok: boolean; detail?: string }[] = [];
let currentCheck = 'setup';
async function check(name: string, fn: () => Promise<string | void>) {
  currentCheck = name.split(' ')[0];
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? undefined });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message });
    console.log(`  ✗ ${name} — ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: false });
const page = await ctx.newPage();
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(`[${currentCheck}] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(`[${currentCheck}] ${m.text()}`);
});

// Record WebGL context loss so rendering failures can be told apart from code errors.
await page.addInitScript(() => {
  window.addEventListener(
    'webglcontextlost',
    () => console.error('[webgl] context lost'),
    true,
  );
});

const store = <T>(p: Page, fn: string) => p.evaluate(fn) as Promise<T>;
const state = <T>(p: Page, expr: string) => store<T>(p, `(() => { const s = window.__slothworld.store.getState(); return ${expr}; })()`);
const sceneReady = (p: Page) => p.waitForFunction(() => document.body.dataset.sceneLoading === 'done', null, { timeout: 90_000 });
const shot = (p: Page, name: string) => p.screenshot({ path: `${SHOTS}/${name}.png` });
const openSpot = async (p: Page, id: string) => {
  await p.evaluate((id) => {
    const s = window.__slothworld!.store.getState();
    s.setPanel(null);
    s.travelTo(id);
  }, id);
  await p.waitForFunction((id) => window.__slothworld!.store.getState().nearSpot === id, id, { timeout: 10_000 });
  await p.keyboard.press('e');
  await p.waitForSelector('[data-testid=panel]');
};
const progressText = (p: Page) => p.textContent('[data-testid=progress]');

console.log(`\nSlothWorld end-to-end checks against ${BASE}\n`);

// ---------------------------------------------------------------- landing
await check('1. Landing page renders identity, tagline, both entry points and AI status', async () => {
  await page.goto(BASE);
  await sceneReady(page);
  await page.waitForTimeout(2500);
  const text = await page.textContent('.landing');
  for (const s of ['SlothWorld', 'Stop rereading.', 'Start exploring.', 'Explore the sample world', 'Create a world from a PDF', 'Gemma']) assert(text?.includes(s), `missing "${s}"`);
  await page.waitForSelector('.ai-status .dot:not(.dot-off), .ai-status:has-text("isn’t running")', { timeout: 8000 });
  await shot(page, '01-landing');
  return (await page.textContent('.ai-status'))?.trim().slice(0, 90);
});

// ---------------------------------------------------------------- sample world offline
await check('2. Sample world loads with the API blocked (no inference or network needed)', async () => {
  const p2 = await ctx.newPage();
  await p2.route('**/api/**', (r) => r.abort());
  await p2.goto(BASE);
  await sceneReady(p2);
  await p2.click('[data-testid=explore-sample]');
  await p2.waitForSelector('[data-testid=panel]');
  const origin = await state<string>(p2, 's.world.blueprint.meta.origin');
  assert(origin === 'curated', `origin ${origin}`);
  const status = await p2.textContent('.hud-title');
  assert(status?.includes('curated sample'), 'HUD should label the curated sample');
  await p2.close();
  return 'curated sample opened while /api was unreachable';
});

// ---------------------------------------------------------------- navigation
await check('3. Navigation: keyboard movement, collision with world edge, interaction prompt', async () => {
  await page.click('[data-testid=explore-sample]');
  await page.waitForSelector('[data-testid=panel]');
  await page.waitForTimeout(2500);
  await shot(page, '02-guide');
  await page.click('[data-testid=start-exploring]');
  const start = await store<{ x: number; z: number }>(page, '({ x: window.__slothworld.player.current.x, z: window.__slothworld.player.current.z })');
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.keyboard.up('w');
  const after = await store<{ x: number; z: number }>(page, '({ x: window.__slothworld.player.current.x, z: window.__slothworld.player.current.z })');
  const moved = Math.hypot(after.x - start.x, after.z - start.z);
  assert(moved > 2, `only moved ${moved.toFixed(2)}`);
  // Walk sideways into the void for a long time: we must stay on walkable ground.
  await page.keyboard.down('a');
  await page.waitForTimeout(5000);
  await page.keyboard.up('a');
  const layout = await state<WorldLayout>(page, 's.layout');
  const edge = await store<{ x: number; z: number }>(page, '({ x: window.__slothworld.player.current.x, z: window.__slothworld.player.current.z })');
  assert(isWalkable(edge.x, edge.z, layout, 0), `fell off the world at ${edge.x.toFixed(1)},${edge.z.toFixed(1)}`);
  await shot(page, '03-hub');
  await page.evaluate(() => window.__slothworld!.store.getState().travelTo('neuron-lab'));
  await page.waitForSelector('[data-testid=interact-prompt]', { timeout: 10_000 });
  const prompt = await page.textContent('[data-testid=interact-prompt]');
  assert(prompt?.includes('Tinker with the neuron'), `prompt was "${prompt}"`);
  await page.waitForTimeout(1500);
  await shot(page, '04-island1-arrival');
  return `walked ${moved.toFixed(1)} units, stopped at the edge, prompt "${prompt?.trim()}"`;
});

// ---------------------------------------------------------------- neuron
await check('4. Neuron lab: displayed values equal the real neuron computation', async () => {
  await page.keyboard.press('e');
  await page.waitForSelector('[data-testid=panel] >> text=Neuron Machine');
  const cases = [
    { inputs: [0.5, 0.8, 0.3], weights: [0.4, -0.6, 0.9], bias: 0.1 },
    { inputs: [1, 0.25, 0.6], weights: [1.5, -2, 0.7], bias: -0.4 },
  ];
  for (const c of cases) {
    await page.evaluate((c) => window.__slothworld!.store.getState().setNeuron(c), c);
    const r = neuronForward(c.inputs, c.weights, c.bias);
    const math = (await page.textContent('.math'))!;
    assert(math.includes(r.z.toFixed(2)) && math.includes(r.output.toFixed(3)), `expected z=${r.z.toFixed(2)} out=${r.output.toFixed(3)} in "${math}"`);
  }
  // Real UI input: keyboard on the w1 slider changes the output exactly as the math says.
  await page.focus('#w0');
  await page.keyboard.press('ArrowRight');
  const n = await state<{ inputs: number[]; weights: number[]; bias: number }>(page, 's.neuron');
  assert(Math.abs(n.weights[0] - 1.6) < 1e-9, `slider did not step w1 (got ${n.weights[0]})`);
  const r = neuronForward(n.inputs, n.weights, n.bias);
  assert((await page.textContent('.math'))!.includes(r.output.toFixed(3)), 'output not updated after slider input');
  await page.waitForTimeout(800);
  await shot(page, '05-neuron-lab');
  // Challenge: fire, quiet, balance.
  for (const c of [
    { inputs: [1, 1, 1], weights: [2, 2, 2], bias: 1 },
    { inputs: [1, 1, 1], weights: [-2, -2, -2], bias: -1 },
    { inputs: [1, 1, 1], weights: [0, 0, 0], bias: 0 },
  ])
    await page.evaluate((c) => window.__slothworld!.store.getState().setNeuron(c), c);
  const done = await state<boolean>(page, "!!s.progress.completed['neuron-lab']");
  assert(done, 'neuron challenge not completed');
  return `z and sigmoid output match for ${cases.length} settings + slider input; challenge completes (${await progressText(page)})`;
});

await check('4b. Quiz and claim feedback on Island 1', async () => {
  await openSpot(page, 'neuron-quiz');
  await page.click('.option:has-text("It depends on the weights")');
  assert(await page.isVisible('.feedback.bad'), 'no negative feedback');
  await page.click('.option:has-text("0.5")');
  assert(await page.isVisible('.feedback.good'), 'no positive feedback');
  assert((await page.textContent('.feedback.good'))!.includes('sigmoid(0)'), 'missing explanation');
  await shot(page, '06-quiz-feedback');
  await openSpot(page, 'neuron-claim');
  await page.click('.option:has-text("Not supported")');
  assert(await page.isVisible('.feedback.good'), 'claim feedback missing');
  return (await progressText(page))!;
});

// ---------------------------------------------------------------- network
await check('5. Network lab: signal propagates and results match the forward pass', async () => {
  await openSpot(page, 'network-lab');
  // set inputs to 1,0,0 using the real toggle buttons
  const inputs = await state<number[]>(page, 's.network.inputs');
  const want = [1, 0, 0];
  for (let i = 0; i < 3; i++) if (inputs[i] !== want[i]) await page.click(`.toggles .toggle >> nth=${i}`);
  await page.click('[data-testid=send-signal]');
  await page.waitForTimeout(1100);
  const midText = await page.textContent('[data-testid=send-signal]');
  assert(midText?.includes('travelling'), 'button should show the signal travelling');
  assert(!(await page.isVisible('table.data')), 'results should not be shown before the signal arrives');
  await shot(page, '07-network-propagating');
  await page.waitForTimeout(2200);
  const t = networkForward(want, SAMPLE_NETWORK);
  const table = (await page.textContent('table.data'))!;
  for (const v of t.activations[1]) assert(table.includes(v.toFixed(2)), `hidden ${v.toFixed(2)} missing`);
  assert(table.includes(t.activations[2][0].toFixed(3)) && table.includes(t.activations[2][1].toFixed(3)), 'outputs mismatch');
  await page.waitForTimeout(500);
  const done = await state<boolean>(page, "!!s.progress.completed['network-lab']");
  assert(done, 'output A > 0.75 should complete the challenge');
  await shot(page, '08-network-result');
  return `A=${t.activations[2][0].toFixed(3)} B=${t.activations[2][1].toFixed(3)}; results revealed only after propagation`;
});

await check('5b. Ordering challenge can be solved with the arrow buttons', async () => {
  await openSpot(page, 'network-order');
  const correct = await state<string[]>(page, "s.world.blueprint.locations[1].stations.find(x => x.id === 'network-order').items");
  await page.click('text=Check order');
  assert(await page.isVisible('.feedback.bad'), 'shuffled order should be wrong');
  for (let target = 0; target < correct.length; target++) {
    const texts = await page.$$eval('.order-list .txt', (els) => els.map((e) => e.textContent));
    let pos = texts.indexOf(correct[target]);
    while (pos > target) {
      await page.click(`.order-list li >> nth=${pos} >> button[aria-label^="Move"] >> nth=0`);
      pos--;
    }
  }
  await page.click('text=Check order');
  assert(await page.isVisible('.feedback.good'), 'correct order not accepted');
  return (await progressText(page))!;
});

// ---------------------------------------------------------------- loss
await check('6. Learning arena: gradient steps update the real MSE and reach the goal', async () => {
  await openSpot(page, 'loss-lab');
  let w = 0.5;
  for (let i = 0; i < 5; i++) {
    await page.click('[data-testid=gd-step]');
    w = gradientStep(w, 0.05);
  }
  const table = (await page.textContent('table.data'))!;
  assert(table.includes(mse(w).toFixed(3)), `expected MSE ${mse(w).toFixed(3)} in table`);
  const sw = await state<number>(page, 's.loss.w');
  assert(Math.abs(sw - w) < 1e-12, `w ${sw} vs expected ${w}`);
  assert(await state<boolean>(page, "!!s.progress.completed['loss-lab']"), 'loss goal not completed');
  await page.waitForTimeout(1200);
  await shot(page, '09-loss-converged');
  // Too-large learning rate makes the loss grow.
  await page.click('text=Reset w to 0.5');
  await page.click('.seg button:has-text("0.14")');
  await page.click('[data-testid=gd-step]');
  await page.click('[data-testid=gd-step]');
  await page.waitForSelector('.toast:has-text("The loss went up!")');
  await page.waitForTimeout(900);
  await shot(page, '10-loss-overshoot');
  return `5 steps at lr 0.05 → MSE ${mse(w).toFixed(4)}; lr 0.14 diverges`;
});

// ---------------------------------------------------------------- interactive cast
await check('13. "Walk me there" routes the sloth across bridges to the next challenge', async () => {
  // Start from open ground on the start island (next to an object the "Press E" prompt replaces the guide).
  await page.evaluate(() => {
    const s = window.__slothworld!.store.getState();
    s.setPanel(null);
    window.__slothworld!.store.setState({ teleport: { x: s.layout!.spawn.x, z: s.layout!.spawn.z, facing: s.layout!.spawn.facing, nonce: Date.now() } });
  });
  await page.waitForSelector('[data-testid=next-go]', { timeout: 10_000 });
  const target = await page.evaluate(() => {
    const s = window.__slothworld!.store.getState();
    return s.layout!.islands.find((i) => i.kind === 'concept' && s.world!.blueprint.locations.find((l) => l.id === i.locationId)!.stations.some((st) => !s.progress.completed[st.id]))!.id;
  });
  await page.click('[data-testid=next-go]');
  await page.waitForFunction((t) => window.__slothworld!.store.getState().currentIsland === t, target, { timeout: 60_000 });
  return `walked from the start island to ${target}`;
});

await check('14. Word Bridge: fill a real PDF sentence', async () => {
  await openSpot(page, 'neuron-cloze');
  await page.click('.bank .chip:has-text("squashes")');
  await page.click('.bank .chip:has-text("suppresses")');
  await page.click('text=Check words');
  assert(await page.isVisible('.feedback.bad'), 'wrong word accepted');
  await page.click('.blank >> nth=0');
  await page.click('.bank .chip:has-text("amplifies")');
  await page.click('text=Check words');
  assert(await page.isVisible('.feedback.good'), 'correct words rejected');
  assert(await page.isVisible('.evidence'), 'evidence should appear after answering');
  await shot(page, '22-word-bridge');
  return 'wrong word flagged, correct words accepted, evidence shown afterwards';
});

await check('15. Teach Pip: partial explanation gets a nudge, full explanation teaches Pip', async () => {
  await openSpot(page, 'neuron-teach');
  await page.fill('[data-testid=teach-input]', 'A neuron takes its inputs, multiplies each by a weight and adds them up.');
  await page.click('[data-testid=teach-send]');
  await page.waitForFunction(() => document.querySelectorAll('.msg.pip:not(.pending)').length >= 2 || !!document.querySelector('.ideas .hint-box'), null, { timeout: 180_000 });
  if (await page.isVisible('.ideas .hint-box')) {
    for (const box of await page.$$('.ideas input[type=checkbox]')) await box.check();
    await page.waitForSelector('.feedback.good');
    return 'no model available: self-check mode used';
  }
  const first = (await page.textContent('.ideas-head b'))!;
  assert(!first.includes('3 of 3'), `partial explanation over-credited: ${first}`);
  const nudge = (await page.textContent('.msg.pip:not(.pending) >> nth=1'))!;
  await page.fill(
    '[data-testid=teach-input]',
    'There is also a bias added to the weighted sum. Positive weights amplify an input and negative weights suppress it, and the sigmoid turns big positive sums into outputs near 1 and big negative sums into outputs near 0.',
  );
  await page.click('[data-testid=teach-send]');
  await page.waitForSelector('.feedback.good:has-text("Pip gets it")', { timeout: 180_000 });
  await shot(page, '23-teach-pip');
  return `after the partial try: "${first}"; Pip asked: "${nudge.replace('🦥', '').slice(0, 80)}…"; the full explanation solved it`;
});

await check('16. Professor Hoot answers from the PDF with a verified quote, and refuses off-document questions', async () => {
  await page.keyboard.press('Escape');
  await page.keyboard.press('h');
  await page.fill('[data-testid=hoot-input]', 'What does the bias do?');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.msg.hoot .evidence, .msg.hoot .note', { timeout: 180_000 });
  if (await page.isVisible('.msg.hoot .note:has-text("asleep")')) {
    assert(await page.isVisible('.passages li'), 'offline Hoot should still show PDF passages');
    return 'no model: Hoot showed matching PDF passages';
  }
  const ev = (await page.textContent('.msg.hoot .evidence'))!;
  assert(/verified|corrected|closest/i.test(ev), `quote status missing: ${ev}`);
  await page.fill('[data-testid=hoot-input]', 'Who invented convolutional neural networks?');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.msg.hoot').length >= 2 && !document.querySelector('.msg.hoot .thinking'), null, { timeout: 180_000 });
  const second = (await page.textContent('.msg.hoot >> nth=1'))!;
  assert(/not covered|doesn.t|does not|isn.t|no information|not mention/i.test(second), `Hoot should refuse: ${second}`);
  await shot(page, '24-hoot');
  return `"${ev.slice(0, 70)}…" | off-document: "${second.replace('🦉', '').slice(0, 70)}…"`;
});

await check('17. Review Grove: solved challenges come back for spaced recall', async () => {
  await page.keyboard.press('Escape');
  const scheduled = await page.evaluate(() => Object.keys(window.__slothworld!.store.getState().progress.review).length);
  assert(scheduled >= 3, `expected solved challenges to be scheduled, got ${scheduled}`);
  await page.evaluate(() => {
    const s = window.__slothworld!.store.getState();
    const r = { ...s.progress.review };
    for (const k of Object.keys(r)) r[k] = { ...r[k], due: Date.now() - 1000 };
    window.__slothworld!.store.setState({ progress: { ...s.progress, review: r } });
  });
  await openSpot(page, 'hub:review');
  await page.click('[data-testid=review-start]');
  const first = await page.evaluate(() => {
    const s = window.__slothworld!.store.getState();
    return Object.entries(s.progress.review).sort((a, b) => a[1].step - b[1].step || a[1].due - b[1].due)[0][0];
  });
  const st = await page.evaluate((id) => {
    for (const l of window.__slothworld!.store.getState().world!.blueprint.locations) for (const x of l.stations) if (x.id === id) return x;
    return null;
  }, first);
  assert(st, 'review card not found');
  if (st.type === 'quiz') await page.click(`.option >> nth=${st.correctIndex}`);
  else if (st.type === 'claim_check') await page.click(`.option:has-text("${st.supported ? 'Supported' : 'Not supported'}")`);
  else if (st.type === 'cloze') {
    for (const b of st.blanks) await page.click(`.bank .chip:text-is("${b.answer}")`);
    await page.click('text=Check words');
  }
  await page.waitForSelector('[data-testid=review-next]');
  await shot(page, '25-review-grove');
  const after = await page.evaluate((id) => window.__slothworld!.store.getState().progress.review[id], first);
  assert(after.step === 1 && after.due > Date.now() + 23 * 3_600_000, `expected next review in about a day, got ${JSON.stringify(after)}`);
  await page.keyboard.press('Escape');
  return `${scheduled} challenges scheduled; a first-try recall moved "${first}" to the 1-day step`;
});

// ---------------------------------------------------------------- source refs
await check('9. Source references: concept panel + highlighted passage on the cited page', async () => {
  // Sample islands have a lab at their centre; the concept is one click away from the lab panel.
  await openSpot(page, 'neuron-lab');
  await page.click('text=About this island’s concept');
  await page.waitForSelector('[data-testid=panel] >> text=From the source');
  const verified = await page.$$eval('.evidence', (els) => els.length);
  assert(verified >= 3, 'expected 3 evidence passages');
  await shot(page, '11-concept-panel');
  await page.click('.evidence >> nth=1 >> text=Open page 1');
  await page.waitForSelector('[data-testid=page-text] mark');
  const mark = await page.textContent('[data-testid=page-text] mark');
  assert(mark?.includes('bias shifts the result'), `highlight was "${mark}"`);
  assert((await page.textContent('.panel-head h2'))?.includes('Page 1 of 4'), 'wrong page');
  await shot(page, '12-source-viewer');
  return `highlighted: "${mark?.slice(0, 50)}…"`;
});

// ---------------------------------------------------------------- journal / overview / persistence
await check('Journal (non-3D navigation) and world map overview', async () => {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('j');
  await page.waitForSelector('[data-testid=journal]');
  await page.waitForTimeout(600);
  await shot(page, '13-journal');
  await page.click('.isle-card >> nth=2 >> text=Travel here');
  await page.waitForFunction(() => window.__slothworld!.store.getState().currentIsland === 'isle-arena', null, { timeout: 8000 });
  await page.keyboard.press('m');
  await page.waitForTimeout(3000);
  await shot(page, '14-world-map');
  await page.keyboard.press('m');
  return 'journal travel reached Island 3; map toggles';
});

await check('Exit keeps progress; reload restores it from local storage', async () => {
  const before = await progressText(page);
  await page.click('button:has-text("Exit")');
  await page.waitForSelector('[data-testid=explore-sample]');
  await page.reload();
  await sceneReady(page);
  await page.click('[data-testid=explore-sample]');
  await page.waitForSelector('[data-testid=progress]');
  const after = await progressText(page);
  assert(before === after, `${before} → ${after}`);
  return after!;
});

// ---------------------------------------------------------------- responsive
await check('12. Usable at common laptop sizes (1280×720, 1024×640)', async () => {
  for (const [w, h] of [
    [1280, 720],
    [1024, 640],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await openSpot(page, 'loss-lab');
    await page.waitForTimeout(800);
    const box = (await page.locator('[data-testid=panel]').boundingBox())!;
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= h, `panel overflows at ${w}x${h}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow, 'horizontal page scroll');
    await shot(page, `15-panel-${w}x${h}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  return 'panel within viewport, no horizontal scroll';
});

// ---------------------------------------------------------------- upload validation
async function scannedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 2; i++) doc.addPage([595, 842]).drawRectangle({ x: 50, y: 50, width: 400, height: 600 });
  return Buffer.from(await doc.save());
}
async function tinyTextPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText('Hi.', { x: 50, y: 700, font: f, size: 12 });
  return Buffer.from(await doc.save());
}

await check('7. Upload rejects invalid input with clear, actionable messages', async () => {
  await page.click('button:has-text("Exit")');
  await page.click('[data-testid=open-upload]');
  const cases: [string, string, Buffer, RegExp][] = [
    ['notes.txt', 'text/plain', Buffer.from('just text'), /not a PDF/],
    ['fake.pdf', 'application/pdf', Buffer.from('this is not really a pdf'), /not a PDF/],
    ['scan.pdf', 'application/pdf', await scannedPdf(), /scanned|OCR/],
    ['empty.pdf', 'application/pdf', Buffer.alloc(0), /empty/],
  ];
  const seen: string[] = [];
  for (const [name, mimeType, buffer, re] of cases) {
    await page.setInputFiles('[data-testid=pdf-input]', { name, mimeType, buffer });
    await page.waitForSelector('[data-testid=upload-error]', { timeout: 30_000 });
    const msg = (await page.textContent('[data-testid=upload-error]'))!;
    assert(re.test(msg), `${name}: "${msg}"`);
    seen.push(`${name}: ${msg.replace('Couldn’t build that world', '').slice(0, 60)}…`);
  }
  await shot(page, '16-upload-error-scanned');
  return seen.join(' | ');
});

// ---------------------------------------------------------------- model failure modes (separate server instances)
async function startServer(port: number, env: Record<string, string>) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(port), ...env }, stdio: 'pipe' });
  for (let i = 0; i < 240; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('test server did not start');
}
async function postPdf(port: number, buf: Buffer) {
  const r = await fetch(`http://127.0.0.1:${port}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/pdf', 'x-filename': 'x.pdf' }, body: new Uint8Array(buf) });
  return (await r.text())
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
}

await check('10. Model failures produce clear errors (missing model, runtime offline)', async () => {
  const pdf = readFileSync('public/samples/the-water-cycle.pdf');
  const a = await startServer(8791, { SLOTH_MODEL: 'no-such-model:1b' });
  const b = await startServer(8792, { OLLAMA_URL: 'http://127.0.0.1:9' });
  try {
    const ea = (await postPdf(8791, pdf)).at(-1);
    assert(ea.type === 'error' && ea.code === 'MODEL_MISSING' && /ollama pull/.test(ea.hint), JSON.stringify(ea));
    const eb = (await postPdf(8792, pdf)).at(-1);
    assert(eb.type === 'error' && eb.code === 'UNREACHABLE' && /sample world works/.test(eb.hint), JSON.stringify(eb));
    const ec = (await postPdf(8792, await tinyTextPdf())).at(-1);
    assert(ec.type === 'error' && ec.code === 'NO_TEXT', `tiny pdf: ${JSON.stringify(ec)}`);
    return `${ea.code}: "${ea.hint}" | ${eb.code}`;
  } finally {
    a.kill();
    b.kill();
  }
});

// ---------------------------------------------------------------- real AI generation
if (!SKIP_AI) {
  await check('7/8/9. Real PDF → validated AI world (Gemma via Ollama), page refs attached', async () => {
    const t0 = Date.now();
    await page.setInputFiles('[data-testid=pdf-input]', 'public/samples/the-water-cycle.pdf');
    await page.waitForSelector('.stages li.active', { timeout: 30_000 });
    await page.waitForTimeout(4000);
    await shot(page, '17-generating');
    await page.waitForFunction(() => window.__slothworld!.store.getState().screen === 'world' || !!document.querySelector('[data-testid=upload-error]'), null, { timeout: 400_000 });
    if (await page.isVisible('[data-testid=upload-error]')) throw new Error(`generation failed: ${await page.textContent('[data-testid=upload-error]')}`);
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const world = await state<World>(page, 's.world');
    const parsed = Blueprint.safeParse(world.blueprint);
    assert(parsed.success, 'blueprint failed schema validation in the browser');
    const bp = world.blueprint;
    assert(bp.meta.origin === 'ai' && bp.meta.model, 'should be labelled AI-generated with a model');
    assert(bp.concepts.length >= 2, 'too few concepts');
    const pages = world.source.pages.map((p) => p.page);
    for (const c of bp.concepts) for (const r of c.sourceRefs) assert(pages.includes(r.page), `ref p.${r.page} not in document`);
    const verified = bp.concepts.flatMap((c) => c.sourceRefs).filter((r) => r.status === 'verified' || r.status === 'relocated');
    for (const r of verified) {
      const text = world.source.pages.find((p) => p.page === r.page)!.text.replace(/\s+/g, ' ');
      assert(!r.passage || text.includes(r.passage.replace(/…$/, '').replace(/\s+/g, ' ').slice(0, 40)), `passage not on p.${r.page}`);
    }
    await sceneReady(page);
    await page.waitForTimeout(3500);
    await shot(page, '18-ai-world-guide');
    await page.click('[data-testid=start-exploring]');
    const firstLoc = bp.locations.find((l) => l.id === world.blueprint.locations[0].id)!;
    await openSpot(page, firstLoc.stations[0].id);
    await page.waitForTimeout(1500);
    await shot(page, '19-ai-world-station');
    await page.keyboard.press('Escape');
    await page.keyboard.press('j');
    await page.waitForTimeout(800);
    await shot(page, '20-ai-world-journal');
    await page.keyboard.press('Escape');
    await page.keyboard.press('m');
    await page.waitForTimeout(3500);
    await shot(page, '21-ai-world-map');
    return `${secs}s: "${bp.title}" — ${bp.concepts.length} concepts, ${bp.locations.reduce((s, l) => s + l.stations.length, 0)} stations, ${verified.length}/${bp.concepts.length} concept quotes verified, ${bp.meta.warnings.length} validation notes`;
  });
}

await check('11. No critical runtime errors in the browser console', async () => {
  const critical = pageErrors.filter((e) => !/GPU stall|THREE\.Clock|Failed to load resource: the server responded with a status of 4\d\d/.test(e));
  assert(critical.length === 0, critical.slice(0, 3).join(' | '));
  return `${pageErrors.length} messages, 0 critical`;
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — FAILED: ${failed.map((f) => f.name).join('; ')}` : ''}\n`);
process.exit(failed.length ? 1 : 0);
