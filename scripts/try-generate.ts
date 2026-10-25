import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { chatJson, ensureModel } from '../server/ollama';
import { extractPages } from '../server/pdf';
import { generateWorld } from '../server/pipeline';

// CLI: run the real PDF -> world pipeline against the local model and save the result.
//   npx tsx scripts/try-generate.ts public/samples/the-water-cycle.pdf out.json
const [file, out = 'generated-world.json', rawOut] = process.argv.slice(2);
const raws: unknown[] = [];
const llm: typeof chatJson = async (o) => {
  const r = await chatJson(o);
  raws.push(r);
  if (rawOut) writeFileSync(rawOut, JSON.stringify(raws, null, 2));
  return r;
};
const t0 = Date.now();
const { pages } = await extractPages(readFileSync(file));
await ensureModel();
for await (const ev of generateWorld(pages, basename(file), new AbortController().signal, llm)) {
  const t = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
  if (ev.type === 'stage') console.log(`${t}s  [${ev.stage}] ${ev.message}`);
  if (ev.type === 'done') {
    writeFileSync(out, JSON.stringify(ev.world, null, 2));
    const bp = ev.world.blueprint;
    console.log(`${t}s  done: "${bp.title}" — ${bp.concepts.length} concepts, ${bp.locations.reduce((s, l) => s + l.stations.length, 0)} stations`);
    for (const c of bp.concepts) console.log(`   - ${c.name} [${c.support}] refs: ${c.sourceRefs.map((r) => `p${r.page}:${r.status}`).join(', ')}`);
    for (const l of bp.locations) console.log(`   * ${l.title}: ${l.stations.map((s) => `${s.type}${s.grounded ? '' : '(ungrounded)'}`).join(', ')}`);
    console.log('   warnings:', ev.warnings);
  }
}
