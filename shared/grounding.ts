import type { RefStatus, SourcePage } from './blueprint';

// Checks model-supplied quotes against the text we actually extracted from the PDF.
// The passage shown to learners always comes from the extraction, never from the model.

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[‘’“”]/g, "'")
    .replace(/-\s+/g, '') // join words hyphenated across line breaks
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (s: string) => normalize(s).split(' ').filter(Boolean);

// Split a page into sentence-like passages (keeps the original text for display).
export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

// Fraction of quote tokens covered by the longest run of consecutive quote tokens found in the page.
function longestRunCoverage(quoteToks: string[], pageNorm: string): number {
  if (!quoteToks.length) return 0;
  let best = 0;
  for (let start = 0; start < quoteToks.length && quoteToks.length - start > best; start++) {
    let end = start + 1;
    while (end <= quoteToks.length && pageNorm.includes(quoteToks.slice(start, end).join(' '))) end++;
    best = Math.max(best, end - 1 - start);
  }
  return best / quoteToks.length;
}

function overlap(a: string[], b: Set<string>): number {
  if (!a.length) return 0;
  return a.filter((t) => b.has(t)).length / a.length;
}

const STOP = new Set('the a an of to and or in on for is are was were be by with as at that this it its from into than then these those which can may also not'.split(' '));
const content = (toks: string[]) => toks.filter((t) => t.length > 2 && !STOP.has(t));

export interface GroundResult {
  page: number;
  status: RefStatus;
  passage?: string;
}

// Find the best supporting sentence on a page (for display around a verified quote).
function bestSentence(quoteToks: string[], pageText: string): string | undefined {
  const qs = new Set(content(quoteToks));
  let best: string | undefined;
  let bestScore = 0;
  for (const s of sentences(pageText)) {
    const sc = overlap(content(tokens(s)), qs) * 0.5 + overlap([...qs], new Set(tokens(s)));
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  return best && best.length > 600 ? best.slice(0, 600) + '…' : best;
}

export function groundQuote(quote: string, claimedPage: number, pages: SourcePage[]): GroundResult {
  const q = tokens(quote);
  const normPages = pages.map((p) => ({ page: p.page, text: p.text, norm: normalize(p.text) }));
  const VERIFY = 0.8;
  const claimed = normPages.find((p) => p.page === claimedPage);

  // 1. Quote (nearly) verbatim on the claimed page.
  if (claimed && q.length >= 3 && longestRunCoverage(q, claimed.norm) >= VERIFY) {
    return { page: claimedPage, status: 'verified', passage: bestSentence(q, claimed.text) };
  }
  // 2. Verbatim on a different page -> correct the page number.
  if (q.length >= 3) {
    for (const p of normPages) {
      if (p !== claimed && longestRunCoverage(q, p.norm) >= VERIFY) {
        return { page: p.page, status: 'relocated', passage: bestSentence(q, p.text) };
      }
    }
  }
  // 3. Not verbatim: look for a strongly overlapping sentence anywhere (claimed page preferred).
  const qc = content(q);
  if (qc.length >= 3) {
    let best: GroundResult | undefined;
    let bestScore = 0;
    for (const p of normPages) {
      for (const s of sentences(p.text)) {
        const st = new Set(content(tokens(s)));
        const score = overlap(qc, st) + (p.page === claimedPage ? 0.05 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = { page: p.page, status: 'approximate', passage: s.length > 600 ? s.slice(0, 600) + '…' : s };
        }
      }
    }
    if (best && bestScore >= 0.6) return best;
  }
  // 4. Nothing found. Keep the page only if it exists.
  const pageExists = pages.some((p) => p.page === claimedPage);
  return { page: pageExists ? claimedPage : pages[0]?.page ?? 1, status: 'unverified' };
}

// Find pages most related to a set of terms — used to give the model relevant context.
export function relevantPages(terms: string, pages: SourcePage[], limit = 3): number[] {
  const t = new Set(content(tokens(terms)));
  return pages
    .map((p) => {
      const pt = content(tokens(p.text));
      const hits = pt.filter((w) => t.has(w)).length;
      return { page: p.page, score: hits / Math.sqrt(pt.length + 20) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.page);
}

// Crude stemming so "heats"/"heat" and "evaporates"/"evaporate" match.
const stem = (t: string) => (t.length > 4 ? t.replace(/(ing|ed|es|s)$/, '') : t);

/**
 * Answer-key check for multiple-choice questions. Scores each option by how many of its content
 * words (ignoring words already in the question) appear in the verified source passage. Returns the
 * index of an option that matches the passage clearly better than the keyed answer, or null.
 */
export function answerKeyConflict(question: string, options: string[], correctIndex: number, passage: string): number | null {
  const q = new Set(content(tokens(question)).map(stem));
  const p = new Set(content(tokens(passage)).map(stem));
  const score = (o: string) => content(tokens(o)).map(stem).filter((t) => !q.has(t) && p.has(t)).length;
  const scores = options.map(score);
  let best = 0;
  scores.forEach((s, i) => {
    if (s > scores[best]) best = i;
  });
  return best !== correctIndex && scores[best] >= 1 && scores[best] > scores[correctIndex] ? best : null;
}

/** Most relevant source sentences for a free-text question (used by Professor Hoot, with or without a model). */
export function findPassages(question: string, pages: SourcePage[], limit = 3): { page: number; text: string; score: number }[] {
  const q = new Set(content(tokens(question)).map(stem));
  if (!q.size) return [];
  const out: { page: number; text: string; score: number }[] = [];
  for (const p of pages)
    for (const s of sentences(p.text)) {
      const st = new Set(content(tokens(s)).map(stem));
      const hits = [...q].filter((t) => st.has(t)).length;
      if (hits) out.push({ page: p.page, text: s.length > 400 ? s.slice(0, 400) + '…' : s, score: hits / Math.sqrt(st.size + 4) });
    }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
