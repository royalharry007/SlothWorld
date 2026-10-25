import { DETAILS_SCHEMA, OUTLINE_SCHEMA, type RawDetails, type RawOutline } from '../shared/aiSchemas';
import { assembleBlueprint, BlueprintError, cleanOutlineConcepts, type OutlineConcept } from '../shared/assemble';
import type { SourcePage, World } from '../shared/blueprint';
import { relevantPages, sentences } from '../shared/grounding';
import { layoutWorld } from '../shared/layout';
import { chatJson, type ChatJsonOptions, ModelError, MODEL } from './ollama';

// PDF text -> outline (model) -> island details per concept (model) -> repair + grounding -> validated blueprint.

export type Stage = 'extract' | 'outline' | 'details' | 'validate' | 'layout';
export type ProgressEvent =
  | { type: 'stage'; stage: Stage; message: string; progress: number }
  | { type: 'done'; world: World; warnings: string[] }
  | { type: 'error'; code: string; message: string; hint?: string };

export type Llm = (o: ChatJsonOptions) => Promise<unknown>;

const SYSTEM = `You are the world architect of SlothWorld, a game that turns documents into explorable learning islands.
Rules:
- Use ONLY information found in the provided document text. Never invent facts.
- Every "quote" must be copied word-for-word from the page you cite (8 to 25 consecutive words).
- Every "page" must be the number shown in the [Page N] marker where that quote appears.
- If the document does not explain something, say so in "uncertainties" instead of guessing.
- Write in clear, friendly, plain language for a student.
- Output JSON only.`;

const OUTLINE_BUDGET = 14_000;
const DETAIL_BUDGET = 6_000;
// Fewer islands = faster worlds on small CPU-only hosts (e.g. SLOTH_MAX_CONCEPTS=4 on Render).
const MAX_ISLANDS = Math.min(6, Math.max(2, Number(process.env.SLOTH_MAX_CONCEPTS || 6)));

// Fit the document into the budget by sampling sentences evenly from every page.
export function documentDigest(pages: SourcePage[], budget: number): string {
  const total = pages.reduce((s, p) => s + p.text.length, 0);
  if (total <= budget) return pages.map((p) => `[Page ${p.page}]\n${p.text}`).join('\n\n');
  const perPage = Math.max(300, Math.floor(budget / pages.length));
  return pages
    .map((p) => {
      const ss = sentences(p.text);
      if (p.text.length <= perPage || ss.length === 0) return `[Page ${p.page}]\n${p.text.slice(0, perPage)}`;
      const keep: string[] = [];
      let used = 0;
      const stride = Math.max(1, Math.round(p.text.length / perPage));
      for (let i = 0; i < ss.length && used < perPage; i += stride) {
        keep.push(ss[i]);
        used += ss[i].length;
      }
      return `[Page ${p.page}]\n${keep.join(' … ')}`;
    })
    .join('\n\n');
}

function conceptContext(c: OutlineConcept, pages: SourcePage[]): string {
  const ids = [...new Set([c.page, ...relevantPages(`${c.name} ${c.summary} ${c.explanation}`, pages, 3)])];
  const chosen = pages.filter((p) => ids.includes(p.page));
  return documentDigest(chosen.length ? chosen : pages.slice(0, 2), DETAIL_BUDGET);
}

export async function* generateWorld(pages: SourcePage[], sourceName: string, signal: AbortSignal, llm: Llm = chatJson): AsyncGenerator<ProgressEvent> {
  const digest = documentDigest(pages, OUTLINE_BUDGET);

  yield { type: 'stage', stage: 'outline', message: `Gemma is reading ${pages.length} page${pages.length > 1 ? 's' : ''} and mapping the key concepts…`, progress: 0.15 };
  const outlinePrompt = `Document: "${sourceName}" (${pages.length} pages)

${digest}

Task: design the concept map for a learning world about this document.
- concepts: the ${MAX_ISLANDS <= 4 ? `${MAX_ISLANDS}` : `4 to ${MAX_ISLANDS}`} most important ideas a learner must understand, ordered from foundational to advanced.
  For each: name (2-5 words), summary (one sentence), explanation (2-4 plain sentences based on the text),
  page (where it is explained), quote (exact words from that page), prerequisites (names of other concepts in your list that must be learned first, or []).
- relationships: links between concept names. type is one of prerequisite, part_of, causes, contrasts, example_of, related. label is 2-5 words.
- objectives: 3 to 5 learning objectives starting with a verb.
- uncertainties: important things the document leaves unclear or does not cover (may be empty).
- title: a short title for the document; summary: 2 sentences.`;

  let outline: RawOutline | null = null;
  for (let attempt = 0; attempt < 2 && !outline; attempt++) {
    try {
      const raw = (await llm({ system: SYSTEM, user: outlinePrompt, schema: OUTLINE_SCHEMA, temperature: attempt ? 0.5 : 0.2, signal })) as RawOutline;
      if (cleanOutlineConcepts(raw, MAX_ISLANDS).length >= 2) outline = raw;
    } catch (e) {
      if (e instanceof ModelError && e.code !== 'BAD_OUTPUT') throw e;
    }
  }
  if (!outline) throw new ModelError('BAD_OUTPUT', 'The model could not produce a usable concept map for this document (tried twice).', 'Try again, or try a PDF with clearer headings and explanatory text.');

  const concepts = cleanOutlineConcepts(outline, MAX_ISLANDS);
  const details: (RawDetails | null)[] = [];
  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i];
    yield { type: 'stage', stage: 'details', message: `Designing island ${i + 1} of ${concepts.length}: “${c.name}”`, progress: 0.3 + (0.55 * i) / concepts.length };
    const prompt = `Document excerpt (from "${sourceName}"):

${conceptContext(c, pages)}

Concept: ${c.name} — ${c.summary}

Design one island of the learning game for this concept, using only the excerpt:
- islandTitle: evocative name, max 5 words. purpose: one sentence on what the learner will understand. objective: one sentence starting with a verb.
- biome: pick the one that best fits the mood of the concept.
- quiz: a multiple-choice question answerable from the excerpt. Exactly 4 distinct options, one correct. correctIndex is 0-3.
  explanation says why the answer is right. page and quote: exact words from the excerpt that support the answer.
- claim: ${
      i % 2 === 1
        ? 'a FALSE statement: take a fact from the excerpt and change one important detail so that the excerpt clearly contradicts it. Set supported=false. explanation says what the excerpt really says.'
        : 'a TRUE statement in your own words that the excerpt clearly supports. Set supported=true. explanation says where the excerpt says it.'
    } page; quote: exact words from the excerpt that decide it.
- process: if the excerpt describes an ordered sequence of steps or stages for this concept, hasSteps=true and list 3-6 short steps in the correct order with page and quote.
  Otherwise hasSteps=false, steps=[] and empty prompt/quote.
- beyondSource: if your explanations add anything that is NOT stated in the excerpt, describe it in one sentence; otherwise an empty string.`;
    try {
      details.push((await llm({ system: SYSTEM, user: prompt, schema: DETAILS_SCHEMA, signal })) as RawDetails);
    } catch (e) {
      if (e instanceof ModelError && (e.code === 'ABORTED' || e.code === 'UNREACHABLE')) throw e;
      details.push(null); // the assembler gives this island a simpler, derived station
    }
  }

  yield { type: 'stage', stage: 'validate', message: 'Checking every quote and page number against the PDF…', progress: 0.88 };
  let assembled;
  try {
    assembled = assembleBlueprint({ outline, details, pages, sourceName, model: MODEL, runtime: process.env.SLOTH_HOSTED === '1' ? 'Ollama on the SlothWorld server' : 'Ollama on this computer', maxConcepts: MAX_ISLANDS });
  } catch (e) {
    if (e instanceof BlueprintError) throw new ModelError('BAD_OUTPUT', `${e.message} ${e.issues.slice(0, 3).join('; ')}`, 'Try generating again — small models sometimes produce invalid structures.');
    throw e;
  }

  yield { type: 'stage', stage: 'layout', message: 'Raising islands and building bridges…', progress: 0.95 };
  layoutWorld(assembled.blueprint); // throws if the blueprint cannot be laid out
  yield { type: 'done', world: { blueprint: assembled.blueprint, source: { name: sourceName, pages } }, warnings: assembled.warnings };
}
