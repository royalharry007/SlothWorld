import type { World } from '../shared/blueprint';

export interface HealthInfo {
  ok: boolean;
  hosted?: boolean;
  ollama: { reachable: boolean; url: string; model: string; modelAvailable: boolean; installed: string[] };
  limits: { maxBytes: number; maxPages: number; perHour?: number };
}

export async function fetchHealth(): Promise<HealthInfo | null> {
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    return (await r.json()) as HealthInfo;
  } catch {
    return null;
  }
}

export type GenEvent =
  | { type: 'stage'; stage: 'extract' | 'outline' | 'details' | 'validate' | 'layout'; message: string; progress: number }
  | { type: 'done'; world: World; warnings: string[] }
  | { type: 'error'; code: string; message: string; hint?: string };

// Streams newline-delimited progress events from the local server.
export async function generateWorld(file: File, onEvent: (e: GenEvent) => void, signal: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/pdf', 'x-filename': encodeURIComponent(file.name).slice(0, 200) },
      body: file,
      signal,
    });
  } catch (e) {
    if (signal.aborted) return;
    onEvent({ type: 'error', code: 'NO_SERVER', message: 'Could not reach the SlothWorld server.', hint: 'Start it with “npm run dev” (or “npm start” after building) and try again.' });
    return;
  }
  if (!res.body) {
    onEvent({ type: 'error', code: 'NO_SERVER', message: `Server responded with ${res.status}.` });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as GenEvent | { type: 'ping' };
        if (ev.type === 'ping') continue; // keep-alive
        if (ev.type !== 'stage') finished = true;
        onEvent(ev);
      }
    }
  } catch (e) {
    if (signal.aborted) return;
    onEvent({ type: 'error', code: 'STREAM', message: 'The connection to the server was interrupted.', hint: 'Check that the server is still running and try again.' });
    return;
  }
  if (!finished && !signal.aborted) onEvent({ type: 'error', code: 'STREAM', message: 'The server stopped before the world was finished.', hint: 'Check the server console for errors.' });
}

// ---- In-world tutors ----

export type TutorError = { error: string; message: string; hint?: string };

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T | TutorError> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(180_000) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return (j as TutorError) ?? { error: 'HTTP', message: `Server responded with ${r.status}.` };
    return j as T;
  } catch {
    return { error: 'NO_SERVER', message: 'Could not reach the SlothWorld server.' };
  }
}

export const isTutorError = (x: unknown): x is TutorError => typeof x === 'object' && x !== null && 'error' in x;

export interface TeachReply {
  covered: number[];
  misconception: string;
  reply: string;
}
export const teachPip = (body: { conceptName: string; keyPoints: string[]; explanation: string; attempt: number }) => postJson<TeachReply>('/api/tutor/teach', body);

export interface HootReply {
  inSource: boolean;
  answer: string;
  quote?: { text: string; page: number; status: 'verified' | 'relocated' | 'approximate' | 'unverified' | 'curated'; passage?: string };
}
export const askHoot = (body: { question: string; topic: string; pages: { page: number; text: string }[] }) => postJson<HootReply>('/api/tutor/ask', body);
