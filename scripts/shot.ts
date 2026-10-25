import { chromium } from 'playwright-core';
// Ad-hoc screenshot helper: npx tsx scripts/shot.ts <url> <out.png> [w] [h] [waitMs]
const [url, out, w = '1440', h = '900', wait = '6000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(url);
await p.waitForFunction(() => document.body.dataset.sceneLoading === 'done', null, { timeout: 60000 }).catch(() => console.log('scene not done'));
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
await b.close();
