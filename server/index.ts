import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureModel, health, ModelError } from './ollama';
import { extractPages, MAX_PAGES, MAX_PDF_BYTES, PdfError } from './pdf';
import { generateWorld, type ProgressEvent } from './pipeline';
import { AskRequest, askHoot, TeachRequest, teachPip } from './tutor';
import { z } from 'zod';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1'; // local only by default: documents never leave this machine
// SLOTH_HOSTED=1 when deployed for other people (e.g. on Render): PDFs are then processed on this
// server rather than on the visitor's own machine, and the UI says so.
const HOSTED = process.env.SLOTH_HOSTED === '1';
// Generations allowed per visitor IP per hour (0 = unlimited). Protects a shared server's CPU and credit.
const RATE_LIMIT = Number(process.env.SLOTH_RATE_LIMIT_PER_HOUR || 0);
const recent = new Map<string, number[]>();
let busy = false;

app.disable('x-powered-by');
if (HOSTED) app.set('trust proxy', 1); // real client IPs behind the host's load balancer

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, hosted: HOSTED, ollama: await health(), limits: { maxBytes: MAX_PDF_BYTES, maxPages: MAX_PAGES, perHour: RATE_LIMIT, tutorPerHour: TUTOR_LIMIT } });
});

function rateLimited(ip: string): boolean {
  if (!RATE_LIMIT) return false;
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  recent.set(ip, hits);
  return hits.length >= RATE_LIMIT;
}

app.post('/api/generate', express.raw({ type: '*/*', limit: MAX_PDF_BYTES + 1024 }), async (req, res) => {
  let rawName = String(req.header('x-filename') || 'document.pdf');
  try {
    rawName = decodeURIComponent(rawName);
  } catch {
    /* keep as-is */
  }
  const name = rawName
    .replace(/[^\w .()-]/g, '')
    .slice(0, 120);
  const body: Uint8Array = Buffer.isBuffer(req.body) ? req.body : new Uint8Array();

  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  const send = (e: ProgressEvent) => res.write(JSON.stringify(e) + '\n');

  if (busy) {
    send({ type: 'error', code: 'BUSY', message: 'Another world is being generated right now.', hint: 'Wait a few minutes and try again — the model handles one document at a time.' });
    return res.end();
  }
  const ip = req.ip ?? 'unknown';
  if (rateLimited(ip)) {
    send({ type: 'error', code: 'RATE_LIMITED', message: `This demo server allows ${RATE_LIMIT} new world${RATE_LIMIT > 1 ? 's' : ''} per hour per visitor.`, hint: 'Your saved worlds and the sample world still work. Try again later, or run SlothWorld on your own computer for unlimited worlds.' });
    return res.end();
  }
  busy = true;
  const ctrl = new AbortController();
  // Keep slow CPU-only generations alive through proxies that close idle connections.
  const heartbeat = setInterval(() => res.write(JSON.stringify({ type: 'ping' }) + '\n'), 15_000);
  res.on('close', () => {
    clearInterval(heartbeat);
    if (!res.writableEnded) ctrl.abort();
  });

  try {
    send({ type: 'stage', stage: 'extract', message: `Reading “${name}”…`, progress: 0.03 });
    const { pages, totalPages, truncated } = await extractPages(body);
    send({ type: 'stage', stage: 'extract', message: `Extracted text from ${pages.length} page${pages.length > 1 ? 's' : ''}${truncated ? ` (first ${MAX_PAGES} of ${totalPages})` : ''}.`, progress: 0.08 });
    await ensureModel();
    if (RATE_LIMIT) recent.get(ip)!.push(Date.now()); // only count documents that reach the model
    for await (const ev of generateWorld(pages, name, ctrl.signal)) {
      if (ev.type === 'done' && truncated) ev.warnings.unshift(`Only the first ${MAX_PAGES} of ${totalPages} pages were used.`);
      if (ev.type === 'done' && truncated) ev.world.blueprint.meta.warnings.unshift(`Only the first ${MAX_PAGES} of ${totalPages} pages were used.`);
      send(ev);
    }
  } catch (e) {
    if (e instanceof PdfError || e instanceof ModelError) send({ type: 'error', code: e.code, message: e.message, hint: e.hint });
    else {
      console.error('[generate] unexpected error', e);
      send({ type: 'error', code: 'INTERNAL', message: 'Something went wrong while building the world.', hint: 'Check the server console for details and try again.' });
    }
  } finally {
    clearInterval(heartbeat);
    busy = false;
    res.end();
  }
});

// ---- In-world tutors (Pip and Professor Hoot): short, validated model calls ----
const TUTOR_LIMIT = Number(process.env.SLOTH_TUTOR_LIMIT_PER_HOUR || 0);
const tutorHits = new Map<string, number[]>();
const tutorJson = express.json({ limit: '200kb' });

async function tutorRoute<T>(req: express.Request, res: express.Response, schema: z.ZodType<T>, run: (body: T, signal: AbortSignal) => Promise<unknown>) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST', message: 'That request was malformed.' });
  if (TUTOR_LIMIT) {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const hits = (tutorHits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (hits.length >= TUTOR_LIMIT) return res.status(429).json({ error: 'RATE_LIMITED', message: 'The tutors need a rest. Try again in a little while.' });
    hits.push(now);
    tutorHits.set(ip, hits);
  }
  const ctrl = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ctrl.abort();
  });
  try {
    await ensureModel();
    res.json(await run(parsed.data, ctrl.signal));
  } catch (e) {
    if (e instanceof ModelError) res.status(503).json({ error: e.code, message: e.message, hint: e.hint });
    else {
      console.error('[tutor] unexpected error', e);
      res.status(500).json({ error: 'INTERNAL', message: 'The tutor got confused. Please try again.' });
    }
  }
}

app.post('/api/tutor/teach', tutorJson, (req, res) => tutorRoute(req, res, TeachRequest, teachPip));
app.post('/api/tutor/ask', tutorJson, (req, res) => tutorRoute(req, res, AskRequest, askHoot));

// Body-parser errors (e.g. file too large) as readable JSON lines.
app.use((err: Error & { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large') {
    res.status(413).type('application/x-ndjson').send(JSON.stringify({ type: 'error', code: 'TOO_LARGE', message: 'The file is larger than 15 MB.', hint: 'Split the PDF or export only the chapter you are studying.' }) + '\n');
    return;
  }
  next(err);
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, HOST, () => {
  console.log(`SlothWorld API listening on http://${HOST}:${PORT}${process.env.NODE_ENV === 'production' ? ' (serving the built app)' : ''}`);
});
