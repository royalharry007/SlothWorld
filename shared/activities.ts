import type { SourcePage, SourceRef } from './blueprint';
import { normalize, sentences } from './grounding';
import { seededShuffle } from './rand';

// Activities built deterministically from verified PDF text: no model involved, so they are always grounded.

const STOP = new Set(
  'the a an of to and or in on for is are was were be by with as at that this it its from into than then these those which can may also not when what each every their there they them some most more such other only very how its our your his her has have had been being does did will would could should about after before over under between through during while because small large tiny huge many much often common same different first final long short high good best just like make makes made used using called describes moving known even still well'.split(
    ' ',
  ),
);

const wordRe = /[A-Za-z][A-Za-z'-]*[A-Za-z]/g;

// Words from a running header/footer (first line of most pages), e.g. the document title.
function headerWords(pages: SourcePage[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of pages) {
    const first = p.text.split('\n')[0] ?? '';
    for (const w of new Set([...first.matchAll(wordRe)].map((m) => m[0].toLowerCase()))) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return new Set(pages.length >= 2 ? [...counts].filter(([, c]) => c >= Math.ceil(pages.length * 0.6)).map(([w]) => w) : []);
}

// How often each word appears across the document: recurring terms are the key vocabulary.
export function termFrequencies(pages: SourcePage[]): Map<string, number> {
  const header = headerWords(pages);
  const f = new Map<string, number>();
  for (const p of pages) for (const m of p.text.matchAll(wordRe)) {
    const w = m[0].toLowerCase();
    if (w.length < 4 || STOP.has(w) || header.has(w)) continue;
    f.set(w, (f.get(w) ?? 0) + 1);
  }
  return f;
}

const stem = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s)$/, '');

export interface ClozeData {
  sentence: string;
  blanks: { start: number; end: number; answer: string }[];
  bank: string[];
}

/**
 * Word Bridge: blank out the most "key-term-like" words of a verified source sentence.
 * Prefers recurring document vocabulary, skips the concept's own name words (too easy) and the first word.
 */
export function buildCloze(passages: string[], conceptName: string, pages: SourcePage[], seed: string, maxBlanks = 2, used = new Set<string>()): ClozeData | null {
  const freq = termFrequencies(pages);
  const nameWords = new Set(normalize(conceptName).split(' '));
  const candidates = passages
    .flatMap((p) => sentences(p))
    .map((s) => s.replace(/…$/, '').trim())
    .filter((s) => {
      const n = s.split(/\s+/).length;
      return n >= 8 && n <= 40;
    });
  for (const sentence of candidates) {
    if (used.has(normalize(sentence))) continue;
    const all = [...sentence.matchAll(wordRe)].map((m) => ({ w: m[0], start: m.index!, end: m.index! + m[0].length }));
    const stemCount = new Map<string, number>();
    for (const x of all) stemCount.set(stem(x.w), (stemCount.get(stem(x.w)) ?? 0) + 1);
    const words = all.filter(
      // skip the first word, short/stop words, the concept's own name, and words repeated in the sentence (the repeat would give it away)
      (x, i) => i > 0 && x.w.length >= 4 && !STOP.has(x.w.toLowerCase()) && !nameWords.has(x.w.toLowerCase()) && stemCount.get(stem(x.w)) === 1 && freq.has(x.w.toLowerCase()),
    );
    const scored = words
      .map((x) => ({ ...x, score: (freq.get(x.w.toLowerCase()) ?? 0) * 2 + Math.min(x.w.length, 12) / 4 }))
      .sort((a, b) => b.score - a.score);
    const chosen: typeof scored = [];
    for (const c of scored) {
      if (chosen.length >= maxBlanks) break;
      if (chosen.some((o) => o.w.toLowerCase() === c.w.toLowerCase() || Math.abs(o.start - c.start) < 12)) continue;
      chosen.push(c);
    }
    if (!chosen.length) continue;
    chosen.sort((a, b) => a.start - b.start);
    const answerStems = new Set(chosen.map((c) => stem(c.w)));
    const inSentence = new Set(all.map((x) => stem(x.w)));
    const distractors = [...freq.entries()]
      .filter(([w]) => !answerStems.has(stem(w)) && !inSentence.has(stem(w)) && !nameWords.has(w) && w.length >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([w]) => w);
    const picked = seededShuffle(distractors, seed).slice(0, Math.max(2, 4 - chosen.length));
    if (picked.length < 1) continue;
    used.add(normalize(sentence));
    return {
      sentence,
      blanks: chosen.map((c) => ({ start: c.start, end: c.end, answer: c.w })),
      bank: seededShuffle([...chosen.map((c) => c.w), ...picked], seed + ':bank'),
    };
  }
  return null;
}

/** Pip's key ideas: distinct verified source sentences about the concept (max 3). */
export function buildKeyPoints(refs: SourceRef[]): { text: string; page: number }[] {
  const out: { text: string; page: number }[] = [];
  for (const r of refs) {
    if (r.status === 'unverified' || !r.passage) continue;
    const t = r.passage.replace(/…$/, '').trim();
    if (t.split(/\s+/).length < 5) continue;
    if (out.some((o) => normalize(o.text) === normalize(t) || normalize(o.text).includes(normalize(t)) || normalize(t).includes(normalize(o.text)))) continue;
    out.push({ text: t.slice(0, 600), page: r.page });
    if (out.length >= 3) break;
  }
  return out;
}

/** Normalised answer comparison for Word Bridge blanks. */
export const sameWord = (a: string, b: string) => normalize(a) === normalize(b);
