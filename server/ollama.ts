// Minimal client for a local Ollama runtime. Nothing leaves the machine.

export const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
export const MODEL = process.env.SLOTH_MODEL || 'gemma4:e2b-it-qat';
const CALL_TIMEOUT_MS = Number(process.env.SLOTH_CALL_TIMEOUT_MS || 240_000);
const NUM_CTX = Number(process.env.SLOTH_NUM_CTX || 8192);
// SLOTH_NUM_GPU=0 forces CPU-only inference (e.g. on hosts without a GPU, or to simulate one).
const NUM_GPU = process.env.SLOTH_NUM_GPU !== undefined ? Number(process.env.SLOTH_NUM_GPU) : undefined;
// Only "thinking" models accept the think flag; it is switched off for speed.
// SLOTH_NUM_THREAD limits CPU threads (match the host's cores).
const NUM_THREAD = process.env.SLOTH_NUM_THREAD ? Number(process.env.SLOTH_NUM_THREAD) : undefined;
const THINKING_MODEL = /gemma4|qwen3|deepseek-r1/i.test(MODEL);

export class ModelError extends Error {
  constructor(
    public code: 'UNREACHABLE' | 'MODEL_MISSING' | 'TIMEOUT' | 'BAD_OUTPUT' | 'RUNTIME' | 'ABORTED',
    message: string,
    public hint?: string,
  ) {
    super(message);
  }
}

export interface Health {
  reachable: boolean;
  url: string;
  model: string;
  modelAvailable: boolean;
  installed: string[];
}

export async function health(): Promise<Health> {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    const j = (await r.json()) as { models?: { name: string }[] };
    const installed = (j.models ?? []).map((m) => m.name);
    return { reachable: true, url: OLLAMA_URL, model: MODEL, modelAvailable: installed.includes(MODEL), installed };
  } catch {
    return { reachable: false, url: OLLAMA_URL, model: MODEL, modelAvailable: false, installed: [] };
  }
}

export async function ensureModel() {
  const h = await health();
  if (!h.reachable)
    throw new ModelError('UNREACHABLE', `The local Ollama runtime is not reachable at ${OLLAMA_URL}.`, 'Install Ollama from ollama.com, start it, then try again. The sample world works without it.');
  if (!h.modelAvailable)
    throw new ModelError('MODEL_MISSING', `The model "${MODEL}" is not installed in Ollama.`, `Run:  ollama pull ${MODEL}   (≈4.3 GB), or set SLOTH_MODEL to a model you already have.`);
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new ModelError('BAD_OUTPUT', 'The model returned malformed JSON.');
  }
}

export interface ChatJsonOptions {
  system: string;
  user: string;
  schema: object;
  temperature?: number;
  signal?: AbortSignal;
}

export async function chatJson({ system, user, schema, temperature = 0.2, signal }: ChatJsonOptions): Promise<unknown> {
  const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: combined,
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        ...(THINKING_MODEL ? { think: false } : {}),
        format: schema,
        keep_alive: '15m',
        options: { temperature, num_ctx: NUM_CTX, num_predict: 3000, ...(NUM_GPU !== undefined ? { num_gpu: NUM_GPU } : {}), ...(NUM_THREAD ? { num_thread: NUM_THREAD } : {}) },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (e) {
    if (signal?.aborted) throw new ModelError('ABORTED', 'Generation was cancelled.');
    if (timeout.aborted) throw new ModelError('TIMEOUT', `The model took longer than ${Math.round(CALL_TIMEOUT_MS / 1000)} s to answer.`, 'Try a shorter PDF, close other GPU-heavy apps, or raise SLOTH_CALL_TIMEOUT_MS.');
    throw new ModelError('UNREACHABLE', `Lost connection to Ollama: ${(e as Error).message}`, 'Check that Ollama is still running.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ModelError('RUNTIME', `Ollama returned an error (${res.status}): ${body.slice(0, 200)}`, 'If the message mentions memory, close other apps or use a smaller model.');
  }
  const j = (await res.json()) as { message?: { content?: string } };
  return parseJson(j.message?.content ?? '');
}
