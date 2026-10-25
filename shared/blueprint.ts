import { z } from 'zod';

// The world blueprint is the ONLY thing the model influences. It is plain data:
// the renderer maps each field onto a fixed set of reusable components.
// No HTML, scripts or free-form "game logic" is accepted from the model.

const text = (max: number) => z.string().trim().min(1).max(max);

export const RefStatus = z.enum(['verified', 'relocated', 'approximate', 'unverified', 'curated']);
export type RefStatus = z.infer<typeof RefStatus>;

export const SourceRef = z.object({
  page: z.number().int().min(1),
  quote: text(400),
  // Set by the validator after checking the quote against the extracted PDF text.
  status: RefStatus.default('unverified'),
  // Verbatim passage taken from OUR extraction (never from the model) when matched.
  passage: z.string().max(1200).optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

// Where a statement comes from — shown to the learner as a badge.
export const Support = z.enum(['source', 'interpretation', 'unsupported']);
export type Support = z.infer<typeof Support>;

export const Concept = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,48}$/),
  name: text(80),
  summary: text(240),
  explanation: text(1400),
  // Extra explanation the model added that goes beyond the PDF. Always flagged in the UI.
  beyondSource: z.string().max(600).optional(),
  sourceRefs: z.array(SourceRef).max(4),
  support: Support.default('interpretation'),
});
export type Concept = z.infer<typeof Concept>;

export const RelationType = z.enum(['prerequisite', 'part_of', 'causes', 'contrasts', 'example_of', 'related']);
export type RelationType = z.infer<typeof RelationType>;

export const Relationship = z.object({
  from: z.string(),
  to: z.string(),
  type: RelationType,
  label: text(80),
});
export type Relationship = z.infer<typeof Relationship>;

// ---- Stations: the controlled set of interaction types ----

const stationBase = {
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  sourceRefs: z.array(SourceRef).max(3).default([]),
  // false when the answer could not be confirmed from the PDF text.
  grounded: z.boolean().default(false),
};

export const QuizStation = z.object({
  ...stationBase,
  type: z.literal('quiz'),
  prompt: text(300),
  options: z.array(text(160)).min(2).max(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: text(600),
});

export const ClaimStation = z.object({
  ...stationBase,
  type: z.literal('claim_check'),
  claim: text(300),
  supported: z.boolean(),
  explanation: text(600),
});

export const OrderingStation = z.object({
  ...stationBase,
  type: z.literal('ordering'),
  prompt: text(300),
  items: z.array(text(140)).min(3).max(6), // stored in the correct order
  explanation: text(600),
});

export const MatchingStation = z.object({
  ...stationBase,
  type: z.literal('matching'),
  prompt: text(300),
  pairs: z.array(z.object({ term: text(80), definition: text(240) })).min(2).max(5),
  explanation: text(600),
});

// Word Bridge: fill the key terms back into a real sentence from the PDF. Built by code, not the model.
export const ClozeStation = z.object({
  ...stationBase,
  type: z.literal('cloze'),
  sentence: text(600), // verbatim source sentence
  blanks: z.array(z.object({ start: z.number().int().min(0), end: z.number().int().min(1), answer: text(60) })).min(1).max(3),
  bank: z.array(text(60)).min(2).max(8), // answers + distractors
});

// Teach Pip: the learner explains the concept; key ideas are verbatim PDF sentences.
export const TeachStation = z.object({
  ...stationBase,
  type: z.literal('teach_back'),
  conceptName: text(80),
  keyPoints: z.array(z.object({ text: text(600), page: z.number().int().min(1) })).min(1).max(4),
});

// Hand-built simulations, used by the curated sample world only.
export const LabStation = z.object({
  ...stationBase,
  type: z.enum(['neuron_lab', 'network_lab', 'loss_lab']),
  prompt: text(300),
});

export const Station = z.discriminatedUnion('type', [QuizStation, ClaimStation, OrderingStation, MatchingStation, ClozeStation, TeachStation, LabStation]);
export type Station = z.infer<typeof Station>;
export type StationType = Station['type'];

export const Biome = z.enum(['meadow', 'forest', 'autumn', 'snow', 'desert', 'crystal']);
export type Biome = z.infer<typeof Biome>;

export const Location = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  conceptId: z.string(),
  title: text(80),
  purpose: text(300), // the educational purpose of this island
  objective: text(240),
  biome: Biome,
  stations: z.array(Station).min(1).max(7),
});
export type Location = z.infer<typeof Location>;

export const Blueprint = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]{1,80}$/),
  title: text(120),
  summary: text(800),
  objectives: z.array(text(240)).min(1).max(6),
  concepts: z.array(Concept).min(1).max(8),
  relationships: z.array(Relationship).max(16),
  locations: z.array(Location).min(1).max(8),
  uncertainties: z.array(text(300)).max(8),
  meta: z.object({
    origin: z.enum(['curated', 'ai']),
    model: z.string().optional(),
    runtime: z.string().optional(),
    sourceName: z.string().max(200),
    pageCount: z.number().int().min(0),
    generatedAt: z.string(),
    warnings: z.array(z.string().max(300)).max(30),
  }),
});
export type Blueprint = z.infer<typeof Blueprint>;

export interface SourcePage {
  page: number;
  text: string;
}

export interface SourceDoc {
  name: string;
  pages: SourcePage[];
}

// A world as stored and rendered: validated blueprint + the extracted source text.
export interface World {
  blueprint: Blueprint;
  source: SourceDoc;
}
