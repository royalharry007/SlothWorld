import { z } from 'zod';
import type { RefStatus, SourcePage } from '../shared/blueprint';
import { groundQuote, normalize } from '../shared/grounding';
import { chatJson, type ChatJsonOptions } from './ollama';

// The two in-world characters. Each is a narrow, role-prompted model call whose output is
// validated and checked against the PDF in code before the learner sees it.

type Llm = (o: ChatJsonOptions) => Promise<unknown>;

const clean = (v: unknown, max: number) =>
  (typeof v === 'string' ? v : '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const STOP = new Set('the a an of to and or in on for is are was were be by with as at that this it its from into than then these those which can may also not you your'.split(' '));
const stems = (s: string) =>
  new Set(
    normalize(s)
      .split(' ')
      .filter((t) => t.length > 2 && !STOP.has(t))
      .map((t) => (t.length > 4 ? t.replace(/(ing|ed|es|s)$/, '') : t)),
  );

// ---------------- Pip: the learner teaches a curious baby sloth ----------------

export const TeachRequest = z.object({
  conceptName: z.string().min(1).max(80),
  keyPoints: z.array(z.string().min(1).max(600)).min(1).max(4),
  explanation: z.string().min(1).max(2000),
  attempt: z.number().int().min(1).max(20).default(1),
});
export type TeachRequest = z.infer<typeof TeachRequest>;

export interface TeachResult {
  covered: number[]; // indices of key points the explanation conveys
  misconception: string; // '' when none
  reply: string; // Pip's words
}

const TEACH_SCHEMA = {
  type: 'object',
  properties: {
    covered: { type: 'array', items: { type: 'integer' } },
    misconception: { type: 'string' },
    reply: { type: 'string' },
  },
  required: ['covered', 'misconception', 'reply'],
};

export async function teachPip(req: TeachRequest, signal: AbortSignal, llm: Llm = chatJson): Promise<TeachResult> {
  const words = req.explanation.trim().split(/\s+/).length;
  if (words < 6) {
    return { covered: [], misconception: '', reply: `Ooh, tell me more! Can you explain ${req.conceptName} in a couple of sentences, like you would to a friend?` };
  }
  const numbered = req.keyPoints.map((k, i) => `${i}: ${k}`).join('\n');
  const raw = (await llm({
    system: `You are Pip, a curious, kind baby sloth who is learning from the user. You only know the KEY IDEAS listed below, copied from the user's study document.
Judge the user's explanation fairly: a key idea counts as covered if the explanation conveys its meaning, even in different words. Do not count ideas that are only hinted at.
If the explanation states something that contradicts a key idea, describe that misconception in one short sentence; otherwise use an empty string.
Write "reply" as Pip, max 45 words: thank them warmly for one specific thing they said, then, if any idea is missing, ask ONE curious question that would lead them toward a missing idea WITHOUT stating it. If all ideas are covered, celebrate and summarise in one sentence.
Never add facts that are not in the key ideas. Output JSON only.`,
    user: `Topic: ${req.conceptName}\n\nKEY IDEAS:\n${numbered}\n\nUSER'S EXPLANATION (attempt ${req.attempt}):\n"""${req.explanation.slice(0, 2000)}"""`,
    schema: TEACH_SCHEMA,
    temperature: 0.2,
    signal,
  })) as Record<string, unknown>;

  // Accept a "covered" claim only if the explanation shares real vocabulary with that key idea,
  // so an empty or off-topic answer can't be credited by an over-generous model.
  const exp = stems(req.explanation);
  const nameStems = stems(req.conceptName);
  const covered = [...new Set(Array.isArray(raw.covered) ? raw.covered : [])]
    .filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < req.keyPoints.length)
    .filter((i) => {
      // at least two shared content words, covering at least a fifth of the idea's vocabulary
      const key = [...stems(req.keyPoints[i])].filter((t) => !nameStems.has(t));
      const shared = key.filter((t) => exp.has(t)).length;
      return shared >= 2 && shared / Math.max(1, key.length) >= 0.2;
    })
    .sort((a, b) => a - b);
  const all = covered.length === req.keyPoints.length;
  let reply = clean(raw.reply, 400) || 'Thank you! Can you tell me a bit more?';
  // Once every idea is covered Pip celebrates instead of asking another question.
  if (all && reply.includes('?')) reply = `Ooh, I get it now! ${req.conceptName} finally makes sense to me. Thank you for being so patient!`;
  return { covered, misconception: clean(raw.misconception, 300), reply };
}

// ---------------- Professor Hoot: answers only from the PDF ----------------

export const AskRequest = z.object({
  question: z.string().min(3).max(400),
  topic: z.string().max(120).default(''),
  pages: z.array(z.object({ page: z.number().int().min(1), text: z.string().max(20000) })).min(1).max(4),
});
export type AskRequest = z.infer<typeof AskRequest>;

export interface AskResult {
  inSource: boolean;
  answer: string;
  quote?: { text: string; page: number; status: RefStatus; passage?: string };
}

const ASK_SCHEMA = {
  type: 'object',
  properties: {
    inSource: { type: 'boolean' },
    answer: { type: 'string' },
    page: { type: 'integer' },
    quote: { type: 'string' },
  },
  required: ['inSource', 'answer', 'page', 'quote'],
};

export async function askHoot(req: AskRequest, signal: AbortSignal, llm: Llm = chatJson): Promise<AskResult> {
  const pages: SourcePage[] = req.pages.map((p) => ({ page: p.page, text: p.text.slice(0, 6000) }));
  const excerpt = pages.map((p) => `[Page ${p.page}]\n${p.text}`).join('\n\n');
  const raw = (await llm({
    system: `You are Professor Hoot, a patient owl tutor. Answer the learner's question using ONLY the document excerpts provided.
If the excerpts do not contain the answer, set inSource=false and say briefly what the document does cover instead. Never use outside knowledge.
If they do, set inSource=true, answer in at most 70 friendly, simple words, and copy one exact supporting sentence fragment (8-25 words) into "quote" with its page number.
Output JSON only.`,
    user: `${req.topic ? `The learner is studying: ${req.topic}\n\n` : ''}DOCUMENT EXCERPTS:\n${excerpt}\n\nQUESTION: ${req.question}`,
    schema: ASK_SCHEMA,
    temperature: 0.2,
    signal,
  })) as Record<string, unknown>;

  // Small models sometimes leak field names into the prose ("Source=false. ..."): strip that residue.
  const answer = clean(raw.answer, 600).replace(/^\s*(in\s*)?source\s*[=:]\s*(true|false)[.,:;]?\s*/i, '');
  const inSource = raw.inSource === true;
  if (!inSource) return { inSource: false, answer: answer || 'I couldn’t find that in your document.' };
  const quote = clean(raw.quote, 400);
  const page = Number.isInteger(raw.page) ? (raw.page as number) : pages[0].page;
  if (!quote) return { inSource: true, answer };
  const g = groundQuote(quote, page, pages);
  return { inSource: true, answer, quote: { text: quote, page: g.page, status: g.status, passage: g.passage } };
}
