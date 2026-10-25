// JSON Schemas passed to Ollama's structured-output `format` option.
// They constrain the model's output shape; the result is still re-validated and repaired
// by `assembleBlueprint` because model output is untrusted.

const str = { type: 'string' };
const int = { type: 'integer' };

export const OUTLINE_SCHEMA = {
  type: 'object',
  properties: {
    title: str,
    summary: str,
    objectives: { type: 'array', items: str },
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: str,
          summary: str,
          explanation: str,
          page: int,
          quote: str,
          prerequisites: { type: 'array', items: str },
        },
        required: ['name', 'summary', 'explanation', 'page', 'quote', 'prerequisites'],
      },
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: str,
          to: str,
          type: { type: 'string', enum: ['prerequisite', 'part_of', 'causes', 'contrasts', 'example_of', 'related'] },
          label: str,
        },
        required: ['from', 'to', 'type', 'label'],
      },
    },
    uncertainties: { type: 'array', items: str },
  },
  required: ['title', 'summary', 'objectives', 'concepts', 'relationships', 'uncertainties'],
} as const;

export const DETAILS_SCHEMA = {
  type: 'object',
  properties: {
    islandTitle: str,
    purpose: str,
    objective: str,
    biome: { type: 'string', enum: ['meadow', 'forest', 'autumn', 'snow', 'desert', 'crystal'] },
    quiz: {
      type: 'object',
      properties: {
        question: str,
        options: { type: 'array', items: str },
        correctIndex: int,
        explanation: str,
        page: int,
        quote: str,
      },
      required: ['question', 'options', 'correctIndex', 'explanation', 'page', 'quote'],
    },
    claim: {
      type: 'object',
      properties: {
        statement: str,
        supported: { type: 'boolean' },
        explanation: str,
        page: int,
        quote: str,
      },
      required: ['statement', 'supported', 'explanation', 'page', 'quote'],
    },
    process: {
      type: 'object',
      properties: {
        hasSteps: { type: 'boolean' },
        prompt: str,
        steps: { type: 'array', items: str },
        page: int,
        quote: str,
      },
      required: ['hasSteps', 'prompt', 'steps', 'page', 'quote'],
    },
    beyondSource: str,
  },
  required: ['islandTitle', 'purpose', 'objective', 'biome', 'quiz', 'claim', 'process', 'beyondSource'],
} as const;

// Loose TypeScript views of what the model returns. Every field may be missing or wrong.
export interface RawOutline {
  title?: unknown;
  summary?: unknown;
  objectives?: unknown;
  concepts?: unknown;
  relationships?: unknown;
  uncertainties?: unknown;
}

export interface RawDetails {
  islandTitle?: unknown;
  purpose?: unknown;
  objective?: unknown;
  biome?: unknown;
  quiz?: unknown;
  claim?: unknown;
  process?: unknown;
  beyondSource?: unknown;
}
