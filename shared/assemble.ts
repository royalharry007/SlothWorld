import {
  Blueprint,
  type Biome,
  type Concept,
  type Location,
  type RelationType,
  type Relationship,
  type SourcePage,
  type SourceRef,
  type Station,
} from './blueprint';
import type { RawDetails, RawOutline } from './aiSchemas';
import { answerKeyConflict, groundQuote, normalize } from './grounding';
import { buildCloze, buildKeyPoints } from './activities';
import { seededShuffle, slugify } from './rand';

// Turns untrusted model output into a validated Blueprint.
// Repairs what it safely can, drops what it can't, and records every change as a warning
// that the learner can see.

export const MAX_CONCEPTS = 6;
const BIOMES: Biome[] = ['meadow', 'forest', 'autumn', 'snow', 'desert', 'crystal'];
const REL_TYPES: RelationType[] = ['prerequisite', 'part_of', 'causes', 'contrasts', 'example_of', 'related'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  const s = String(v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
};
const strList = (v: unknown, max: number, limit: number): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, limit) : [];
const int = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

export interface AssembleInput {
  outline: RawOutline;
  details: (RawDetails | null)[]; // one entry per accepted concept, in order (null = generation failed)
  pages: SourcePage[];
  sourceName: string;
  model: string;
  runtime: string;
  maxConcepts?: number;
}

export class BlueprintError extends Error {
  constructor(
    message: string,
    public issues: string[] = [],
  ) {
    super(message);
  }
}

function ref(quote: string, page: number, pages: SourcePage[], warnings: string[], what: string): SourceRef | null {
  if (!quote) {
    warnings.push(`${what}: the model gave no supporting quote.`);
    return null;
  }
  const g = groundQuote(quote, page, pages);
  if (g.status === 'relocated') warnings.push(`${what}: page reference corrected from p. ${page} to p. ${g.page}.`);
  if (g.status === 'approximate') warnings.push(`${what}: quote was not verbatim; linked to the closest matching passage on p. ${g.page}.`);
  if (g.status === 'unverified') warnings.push(`${what}: quote could not be found in the PDF — marked as unverified.`);
  return { page: g.page, quote, status: g.status, passage: g.passage };
}

// "Step 1: Evaporation (Page 2): Evaporation happens when..." -> "Evaporation"
export function cleanStep(raw: string): string {
  let s = raw
    .replace(/^\s*(step\s*)?\d+\s*[.):-]\s*/i, '')
    .replace(/\(\s*(page|p\.)\s*\d+\s*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const colon = s.indexOf(':');
  if (colon > 0 && colon <= 48 && s.length > 70) s = s.slice(0, colon).trim();
  return s.length > 140 ? s.slice(0, 139).trimEnd() + '…' : s;
}

const groundedStatus = (r: SourceRef | null) => !!r && r.status !== 'unverified';

// Normalised concept outline extracted from the raw model output (exported for the server pipeline).
export interface OutlineConcept {
  name: string;
  summary: string;
  explanation: string;
  page: number;
  quote: string;
  prerequisites: string[];
}

export function cleanOutlineConcepts(outline: RawOutline, maxConcepts = MAX_CONCEPTS): OutlineConcept[] {
  const raw = Array.isArray(outline.concepts) ? outline.concepts : [];
  const seen = new Set<string>();
  const out: OutlineConcept[] = [];
  for (const c of raw) {
    if (!isObj(c)) continue;
    const name = str(c.name, 80);
    const key = normalize(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const explanation = str(c.explanation, 1400) || str(c.summary, 1400);
    const summary = str(c.summary, 240) || (explanation.split(/(?<=\.)\s/)[0] ?? '').slice(0, 240);
    if (!explanation || !summary) continue;
    out.push({
      name,
      summary,
      explanation,
      page: int(c.page, 1),
      quote: str(c.quote, 400),
      prerequisites: strList(c.prerequisites, 80, 6),
    });
    if (out.length >= maxConcepts) break;
  }
  return out;
}

function findConceptId(name: string, concepts: Concept[]): string | undefined {
  const n = normalize(name);
  if (!n) return undefined;
  return (
    concepts.find((c) => normalize(c.name) === n)?.id ??
    concepts.find((c) => normalize(c.name).includes(n) || n.includes(normalize(c.name)))?.id
  );
}

export function assembleBlueprint(input: AssembleInput): { blueprint: Blueprint; warnings: string[] } {
  const { outline, pages } = input;
  const warnings: string[] = [];
  const cleaned = cleanOutlineConcepts(outline, input.maxConcepts);
  if (cleaned.length === 0) throw new BlueprintError('The model did not return any usable concepts.', ['concepts: empty or invalid']);

  const title = str(outline.title, 120) || input.sourceName.replace(/\.pdf$/i, '');
  const worldId = `ai-${slugify(title, 40)}-${Date.now().toString(36)}`;

  // ---- Concepts ----
  const usedIds = new Set<string>();
  const concepts: Concept[] = cleaned.map((c) => {
    let id = slugify(c.name, 40);
    while (usedIds.has(id)) id = `${id.slice(0, 44)}-${usedIds.size}`;
    usedIds.add(id);
    const r = ref(c.quote, c.page, pages, warnings, `Concept "${c.name}"`);
    const support = !r || r.status === 'unverified' ? 'unsupported' : r.status === 'approximate' ? 'interpretation' : 'source';
    return { id, name: c.name, summary: c.summary, explanation: c.explanation, sourceRefs: r ? [r] : [], support } as Concept;
  });

  // ---- Relationships (explicit + prerequisites), dropping anything that doesn't resolve ----
  const relationships: Relationship[] = [];
  const relKey = new Set<string>();
  const addRel = (fromName: string, toName: string, type: RelationType, label: string) => {
    const from = findConceptId(fromName, concepts);
    const to = findConceptId(toName, concepts);
    if (!from || !to || from === to) return false;
    const key = `${from}>${to}`;
    if (relKey.has(key) || relKey.has(`${to}>${from}`)) return true;
    relKey.add(key);
    relationships.push({ from, to, type, label: label || type.replace('_', ' ') });
    return true;
  };
  cleaned.forEach((c) => c.prerequisites.forEach((p) => addRel(p, c.name, 'prerequisite', 'needed for')));
  let droppedRels = 0;
  for (const r of Array.isArray(outline.relationships) ? outline.relationships : []) {
    if (!isObj(r)) continue;
    const type = REL_TYPES.includes(r.type as RelationType) ? (r.type as RelationType) : 'related';
    if (!addRel(str(r.from, 80), str(r.to, 80), type, str(r.label, 80))) droppedRels++;
  }
  if (droppedRels) warnings.push(`${droppedRels} relationship(s) referred to unknown concepts and were dropped.`);

  // ---- Locations & stations ----
  let prevBiome: Biome | null = null;
  const usedClozeSentences = new Set<string>();
  const locations: Location[] = concepts.map((concept, i) => {
    const d = input.details[i];
    const stations: Station[] = [];
    const sid = (kind: string) => `${concept.id}-${kind}`;
    let purpose = `Understand ${concept.name}.`;
    let objective = `Explain ${concept.name} in your own words.`;
    let islandTitle = concept.name;
    let biome: Biome = BIOMES[i % BIOMES.length];

    if (d && isObj(d)) {
      islandTitle = str(d.islandTitle, 80) || islandTitle;
      purpose = str(d.purpose, 300) || purpose;
      objective = str(d.objective, 240) || objective;
      if (BIOMES.includes(d.biome as Biome)) biome = d.biome as Biome;
      const beyond = str(d.beyondSource, 600);
      if (beyond && !/^(none|n\/a|no|nothing)\.?$/i.test(beyond)) concept.beyondSource = beyond;

      // Quiz
      if (isObj(d.quiz)) {
        const q = d.quiz;
        const prompt = str(q.question, 300);
        const allOpts = strList(q.options, 160, 8).map((o) => o.replace(/^\(?[A-Da-d1-4][).:]\s+/, ''));
        const rawCi = int(q.correctIndex, -1);
        // Keep the correct option, drop duplicates, cap at four options.
        let opts: string[] = [];
        let ci = -1;
        if (rawCi >= 0 && rawCi < allOpts.length) {
          const correct = allOpts[rawCi];
          const others = allOpts.filter((o, k) => k !== rawCi && normalize(o) !== normalize(correct));
          const distinct = others.filter((o, k) => others.findIndex((x) => normalize(x) === normalize(o)) === k).slice(0, 3);
          opts = [correct, ...distinct];
          ci = 0;
        }
        const r = prompt && opts.length >= 2 && ci === 0 ? ref(str(q.quote, 400), int(q.page, concept.sourceRefs[0]?.page ?? 1), pages, warnings, `Quiz on "${concept.name}"`) : null;
        // The model's answer key must agree with the PDF passage it cites; otherwise drop the quiz.
        // The key must also agree with the model's own explanation (small models sometimes contradict themselves).
        const passageConflict = r?.passage && r.status !== 'unverified' ? answerKeyConflict(prompt, opts, 0, r.passage) : null;
        const explanationConflict = r ? answerKeyConflict(prompt, opts, 0, str(q.explanation, 600)) : null;
        if (passageConflict !== null) {
          warnings.push(`Quiz on "${concept.name}" was dropped: its answer key disagreed with the cited PDF passage (which supports “${opts[passageConflict]}”).`);
        } else if (explanationConflict !== null) {
          warnings.push(`Quiz on "${concept.name}" was dropped: its answer key contradicted its own explanation (which supports “${opts[explanationConflict]}”).`);
        } else if (prompt && opts.length >= 2 && ci === 0) {
          // Shuffle deterministically so the answer is not always in the same slot.
          const order = seededShuffle(opts.map((_, k) => k), sid('quiz'));
          stations.push({
            type: 'quiz',
            id: sid('quiz'),
            prompt,
            options: order.map((k) => opts[k]),
            correctIndex: order.indexOf(ci),
            explanation: str(q.explanation, 600) || 'See the source passage.',
            sourceRefs: r ? [r] : [],
            grounded: groundedStatus(r),
          });
        } else warnings.push(`Quiz on "${concept.name}" was malformed (options or answer index) and was dropped.`);
      }

      // Claim check
      if (isObj(d.claim)) {
        const c = d.claim;
        const claim = str(c.statement, 300);
        const verbatimInSource = claim.split(' ').length >= 6 && pages.some((p) => normalize(p.text).includes(normalize(claim)));
        if (claim && c.supported === false && verbatimInSource) {
          warnings.push(`Claim check on "${concept.name}" was labelled false but appears word-for-word in the PDF — dropped.`);
        } else if (claim && typeof c.supported === 'boolean') {
          const r = ref(str(c.quote, 400), int(c.page, concept.sourceRefs[0]?.page ?? 1), pages, warnings, `Claim check on "${concept.name}"`);
          stations.push({
            type: 'claim_check',
            id: sid('claim'),
            claim,
            supported: c.supported,
            explanation: str(c.explanation, 600) || 'See the source passage.',
            sourceRefs: r ? [r] : [],
            grounded: groundedStatus(r),
          });
        } else warnings.push(`Claim check on "${concept.name}" was malformed and was dropped.`);
      }

      // Ordering — only when the source actually describes a sequence.
      if (isObj(d.process) && d.process.hasSteps === true) {
        const p = d.process;
        const steps = strList(p.steps, 400, 6).map(cleanStep).filter(Boolean);
        const distinct = [...new Set(steps.map(normalize))].length === steps.length;
        if (steps.length >= 3 && distinct) {
          const r = ref(str(p.quote, 400), int(p.page, concept.sourceRefs[0]?.page ?? 1), pages, warnings, `Sequence on "${concept.name}"`);
          stations.push({
            type: 'ordering',
            id: sid('order'),
            prompt: str(p.prompt, 300) || `Put the steps of ${concept.name} in order.`,
            items: steps,
            explanation: `The source describes these steps in this order.`,
            sourceRefs: r ? [r] : [],
            grounded: groundedStatus(r),
          });
        }
      }
    } else {
      warnings.push(`Island details for "${concept.name}" could not be generated; using a simpler concept island.`);
    }

    // Fallback: a question derived deterministically from validated concept summaries (no new claims).
    if (stations.length === 0 && concepts.length >= 2) {
      const others = concepts.filter((c) => c.id !== concept.id).slice(0, 3);
      const opts = [concept.summary, ...others.map((o) => o.summary)];
      const order = seededShuffle(opts.map((_, k) => k), sid('identify'));
      stations.push({
        type: 'quiz',
        id: sid('identify'),
        prompt: `Which description matches "${concept.name}"?`,
        options: order.map((k) => opts[k]),
        correctIndex: order.indexOf(0),
        explanation: `This is the summary of ${concept.name} given on this island.`,
        sourceRefs: concept.sourceRefs,
        grounded: concept.support === 'source',
      });
    }
    if (stations.length === 0) {
      stations.push({
        type: 'claim_check',
        id: sid('claim'),
        claim: concept.summary,
        supported: concept.support !== 'unsupported',
        explanation: concept.support !== 'unsupported' ? 'The linked passage supports this summary.' : 'This summary could not be matched to the PDF text.',
        sourceRefs: concept.sourceRefs,
        grounded: concept.support === 'source',
      });
    }

    // Code-built activities from verified PDF sentences: a Word Bridge and Pip's key ideas.
    const verifiedRefs = [...concept.sourceRefs, ...stations.flatMap((st) => st.sourceRefs)].filter((r) => r.status !== 'unverified' && r.passage);
    const cloze = buildCloze(verifiedRefs.map((r) => r.passage!), concept.name, pages, sid('cloze'), 2, usedClozeSentences);
    if (cloze) {
      const r = verifiedRefs.find((x) => x.passage!.includes(cloze.sentence.slice(0, 40)))!;
      stations.push({ type: 'cloze', id: sid('cloze'), ...cloze, sourceRefs: [r], grounded: true });
    }
    const keyPoints = buildKeyPoints(verifiedRefs);
    if (keyPoints.length) {
      stations.push({ type: 'teach_back', id: sid('teach'), conceptName: concept.name, keyPoints, sourceRefs: [], grounded: true });
    }

    if (i > 0 && prevBiome === biome) biome = BIOMES[(BIOMES.indexOf(biome) + 1 + (i % 3)) % BIOMES.length];
    prevBiome = biome;
    return { id: `isle-${concept.id}`, conceptId: concept.id, title: islandTitle, purpose, objective, biome, stations };
  });

  // A final review station built only from validated data: match each concept to its summary.
  if (concepts.length >= 3) {
    const last = locations[locations.length - 1];
    if (last.stations.length < 7) {
      last.stations.push({
        type: 'matching',
        id: 'review-matching',
        prompt: 'Review: match each concept you explored to its description.',
        pairs: concepts.slice(0, 5).map((c) => ({ term: c.name, definition: c.summary })),
        explanation: 'Each description is the summary shown on that concept’s island.',
        sourceRefs: [],
        grounded: concepts.every((c) => c.support === 'source'),
      });
    }
  }

  const unsupported = concepts.filter((c) => c.support === 'unsupported').length;
  if (unsupported) warnings.push(`${unsupported} concept(s) could not be matched to the PDF text and are flagged as unsupported.`);

  const candidate = {
    version: 1,
    id: worldId,
    title,
    summary: str(outline.summary, 800) || `A world built from ${input.sourceName}.`,
    objectives: strList(outline.objectives, 240, 6).length ? strList(outline.objectives, 240, 6) : concepts.slice(0, 4).map((c) => `Understand ${c.name}.`),
    concepts,
    relationships: relationships.slice(0, 16),
    locations,
    uncertainties: strList(outline.uncertainties, 300, 8),
    meta: {
      origin: 'ai',
      model: input.model,
      runtime: input.runtime,
      sourceName: input.sourceName.slice(0, 200),
      pageCount: pages.length,
      generatedAt: new Date().toISOString(),
      warnings: warnings.slice(0, 30),
    },
  };

  const parsed = Blueprint.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new BlueprintError('The generated blueprint failed validation.', issues);
  }
  return { blueprint: parsed.data, warnings };
}
