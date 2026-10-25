import { describe, expect, it } from 'vitest';
import { assembleBlueprint, BlueprintError } from '../shared/assemble';
import { Blueprint } from '../shared/blueprint';
import { groundQuote } from '../shared/grounding';
import { isWalkable, layoutWorld, orderLocations } from '../shared/layout';
import { SAMPLE_SOURCE } from '../shared/sampleSource';
import { SAMPLE_BLUEPRINT } from '../shared/sampleWorld';

const pages = [
  { page: 1, text: 'Photosynthesis converts light energy into chemical energy. It happens in the chloroplasts of plant cells.' },
  { page: 2, text: 'The Calvin cycle uses ATP and NADPH to fix carbon dioxide into sugars. It runs in the stroma.' },
  { page: 3, text: 'First light is absorbed. Then water is split. Next ATP is produced. Finally sugars are built.' },
];

const goodOutline = {
  title: 'Photosynthesis',
  summary: 'How plants turn light into sugar.',
  objectives: ['Explain photosynthesis'],
  concepts: [
    { name: 'Photosynthesis', summary: 'Light to chemical energy.', explanation: 'Plants convert light energy into chemical energy.', page: 1, quote: 'converts light energy into chemical energy', prerequisites: [] },
    { name: 'Calvin Cycle', summary: 'Fixes CO2 into sugar.', explanation: 'Uses ATP and NADPH.', page: 1, quote: 'fix carbon dioxide into sugars', prerequisites: ['Photosynthesis'] },
    { name: 'Dragons', summary: 'Not in the text.', explanation: 'Dragons breathe fire.', page: 9, quote: 'dragons breathe fire constantly', prerequisites: [] },
  ],
  relationships: [{ from: 'Calvin Cycle', to: 'Unknown Thing', type: 'causes', label: 'x' }],
  uncertainties: ['The text is short.'],
};

const details = (over: Record<string, unknown> = {}) => ({
  islandTitle: 'Isle',
  purpose: 'Learn it',
  objective: 'Explain it',
  biome: 'forest',
  quiz: { question: 'Where does it happen?', options: ['Chloroplasts', 'Mitochondria', 'Nucleus', 'Ribosome'], correctIndex: 0, explanation: 'See p1', page: 1, quote: 'It happens in the chloroplasts of plant cells' },
  claim: { statement: 'It needs light', supported: true, explanation: 'yes', page: 1, quote: 'converts light energy' },
  process: { hasSteps: true, prompt: 'Order', steps: ['Light absorbed', 'Water split', 'ATP produced', 'Sugars built'], page: 3, quote: 'First light is absorbed. Then water is split.' },
  beyondSource: 'none',
  ...over,
});

describe('grounding', () => {
  it('verifies, relocates, approximates and flags quotes', () => {
    expect(groundQuote('happens in the chloroplasts', 1, pages).status).toBe('verified');
    const moved = groundQuote('fix carbon dioxide into sugars', 1, pages);
    expect(moved).toMatchObject({ status: 'relocated', page: 2 });
    expect(groundQuote('The Calvin cycle uses NADPH and ATP to fix sugars from carbon dioxide', 2, pages).status).toBe('approximate');
    expect(groundQuote('dragons breathe fire constantly', 9, pages)).toMatchObject({ status: 'unverified', page: 1 });
  });
  it('every curated sample reference is verified against the sample PDF text', () => {
    const refs = [
      ...SAMPLE_BLUEPRINT.concepts.flatMap((c) => c.sourceRefs),
      ...SAMPLE_BLUEPRINT.locations.flatMap((l) => l.stations.flatMap((s) => s.sourceRefs)),
    ];
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) {
      expect(r.status, r.quote).toBe('verified');
      expect(SAMPLE_SOURCE.pages.find((p) => p.page === r.page)).toBeTruthy();
    }
  });
});

describe('assembleBlueprint', () => {
  it('builds a valid, grounded blueprint and flags unsupported content', () => {
    const { blueprint, warnings } = assembleBlueprint({ outline: goodOutline, details: [details(), details(), null], pages, sourceName: 'p.pdf', model: 'm', runtime: 'ollama' });
    expect(Blueprint.safeParse(blueprint).success).toBe(true);
    const [photo, calvin, dragons] = blueprint.concepts;
    expect(photo.support).toBe('source');
    expect(calvin.sourceRefs[0]).toMatchObject({ page: 2, status: 'relocated' });
    expect(dragons.support).toBe('unsupported');
    expect(warnings.join('\n')).toMatch(/page reference corrected from p\. 1 to p\. 2/);
    expect(warnings.join('\n')).toMatch(/1 relationship\(s\) referred to unknown concepts/);
    // Prerequisite resolved by name
    expect(blueprint.relationships).toContainEqual(expect.objectContaining({ from: 'photosynthesis', to: 'calvin-cycle', type: 'prerequisite' }));
    // Quiz answer still points at the right option after deterministic shuffling
    const quiz = blueprint.locations[0].stations.find((s) => s.type === 'quiz');
    expect(quiz && quiz.type === 'quiz' && quiz.options[quiz.correctIndex]).toBe('Chloroplasts');
    // Ordering only appears when the source has steps, and keeps its order
    const order = blueprint.locations[0].stations.find((s) => s.type === 'ordering');
    expect(order && order.type === 'ordering' && order.items[0]).toBe('Light absorbed');
    // Failed details fall back to a derived question, never an empty island
    expect(blueprint.locations[2].stations.length).toBeGreaterThan(0);
    expect(blueprint.meta.origin).toBe('ai');
  });

  it('drops malformed stations instead of rendering them', () => {
    const bad = details({ quiz: { question: 'Q', options: ['A', 'A'], correctIndex: 5, explanation: '', page: 1, quote: '' }, claim: { statement: 'x', supported: 'maybe' } });
    const { blueprint, warnings } = assembleBlueprint({ outline: goodOutline, details: [bad, bad, bad], pages, sourceName: 'p.pdf', model: 'm', runtime: 'ollama' });
    expect(blueprint.locations[0].stations.some((s) => s.type === 'quiz' && s.prompt === 'Q')).toBe(false);
    expect(warnings.some((w) => w.includes('malformed'))).toBe(true);
  });

  it('strips markup from model text and rejects empty output', () => {
    const outline = { ...goodOutline, title: '<script>alert(1)</script>Photo' };
    const { blueprint } = assembleBlueprint({ outline, details: [details()], pages, sourceName: 'p.pdf', model: 'm', runtime: 'ollama' });
    expect(blueprint.title).toBe('alert(1)Photo');
    expect(() => assembleBlueprint({ outline: { concepts: [] }, details: [], pages, sourceName: 'p.pdf', model: 'm', runtime: 'ollama' })).toThrow(BlueprintError);
  });
});

describe('layout', () => {
  it('is deterministic and respects prerequisites', () => {
    const a = layoutWorld(SAMPLE_BLUEPRINT);
    const b = layoutWorld(SAMPLE_BLUEPRINT);
    expect(a).toEqual(b);
    expect(orderLocations(SAMPLE_BLUEPRINT)).toEqual(['isle-neuron', 'isle-network', 'isle-arena']);
  });
  it('islands do not overlap and bridges connect walkable ground', () => {
    const L = layoutWorld(SAMPLE_BLUEPRINT);
    for (const i of L.islands)
      for (const j of L.islands) if (i !== j) expect(Math.hypot(i.x - j.x, i.z - j.z)).toBeGreaterThan(i.radius + j.radius);
    expect(isWalkable(L.spawn.x, L.spawn.z, L)).toBe(true);
    for (const br of L.bridges) {
      for (let t = 0; t <= 1; t += 0.05) {
        expect(isWalkable(br.ax + (br.bx - br.ax) * t, br.az + (br.bz - br.az) * t, L), `${br.id} t=${t}`).toBe(true);
      }
    }
    // Off the edge of the world is not walkable
    expect(isWalkable(L.center.x + L.extent + 20, L.center.z, L)).toBe(false);
  });
});

describe('repairs', () => {
  it('cleans step labels and page markers', async () => {
    const { cleanStep } = await import('../shared/assemble');
    expect(cleanStep('Step 1: Evaporation (Page 2): Evaporation happens when the Sun heats liquid water and turns it into vapor.')).toBe('Evaporation');
    expect(cleanStep('2. Water is split')).toBe('Water is split');
  });
  it('repairs duplicate quiz options and drops false claims that are verbatim in the source', () => {
    const d = details({
      quiz: { question: 'Where?', options: ['A) Chloroplasts', 'B) Nucleus', 'C) Nucleus', 'D) Ribosome', 'E) Golgi'], correctIndex: 0, explanation: 'x', page: 1, quote: 'happens in the chloroplasts' },
      claim: { statement: 'It happens in the chloroplasts of plant cells', supported: false, explanation: 'x', page: 1, quote: 'happens in the chloroplasts' },
    });
    const { blueprint, warnings } = assembleBlueprint({ outline: goodOutline, details: [d], pages, sourceName: 'p.pdf', model: 'm', runtime: 'ollama' });
    const quiz = blueprint.locations[0].stations.find((s) => s.type === 'quiz');
    expect(quiz?.type === 'quiz' && quiz.options).toHaveLength(4);
    expect(quiz?.type === 'quiz' && quiz.options[quiz.correctIndex]).toBe('Chloroplasts');
    expect(blueprint.locations[0].stations.some((s) => s.type === 'claim_check')).toBe(false);
    expect(warnings.some((w) => w.includes('word-for-word'))).toBe(true);
  });
});

describe('answer-key check', () => {
  it('flags quiz keys that contradict the cited passage', async () => {
    const { answerKeyConflict } = await import('../shared/grounding');
    const passage = 'The cycle is driven by energy from the Sun, which heats water at the surface, and by gravity, which pulls water back down.';
    const opts = ['The sun and its heat', 'Clouds and precipitation', 'Rivers and lakes', 'The ocean and its salt water'];
    expect(answerKeyConflict('What is the primary source of energy that powers the water cycle?', opts, 2, passage)).toBe(0);
    expect(answerKeyConflict('What is the primary source of energy that powers the water cycle?', opts, 0, passage)).toBeNull();
    const p2 = 'Evaporation happens when the Sun heats liquid water and turns it into water vapor, an invisible gas.';
    expect(answerKeyConflict('What happens to water when it evaporates?', ['It remains unchanged.', 'It becomes rain.', 'It freezes.', 'It turns into water vapor.'], 2, p2)).toBe(3);
  });
  it('keeps every curated sample quiz', async () => {
    const { answerKeyConflict } = await import('../shared/grounding');
    for (const l of SAMPLE_BLUEPRINT.locations)
      for (const s of l.stations)
        if (s.type === 'quiz') expect(answerKeyConflict(s.prompt, s.options, s.correctIndex, s.sourceRefs[0].passage ?? ''), s.id).toBeNull();
  });
});

describe('route finding and hub spots', () => {
  it('routes across every bridge in order and every waypoint is walkable', async () => {
    const { routeTo, approachPoint } = await import('../shared/layout');
    const L = layoutWorld(SAMPLE_BLUEPRINT);
    const target = approachPoint(L.spots.find((s) => s.id === 'arena-quiz')!, L);
    const route = routeTo(0, 0, target.x, target.z, L);
    expect(route.length).toBeGreaterThanOrEqual(L.bridges.length * 2 + 1);
    for (const p of route.slice(0, -1)) expect(isWalkable(p.x, p.z, L, 0)).toBe(true);
    // Straight segments between consecutive waypoints stay on walkable ground.
    let prev = { x: 0, z: 0 };
    for (const p of route) {
      for (let t = 0; t <= 1; t += 0.05) expect(isWalkable(prev.x + (p.x - prev.x) * t, prev.z + (p.z - prev.z) * t, L, 0), `leg to ${p.x.toFixed(1)},${p.z.toFixed(1)} t=${t.toFixed(2)}`).toBe(true);
      prev = p;
    }
  });
  it('places Hoot and the Review Grove on the start island without blocking the spawn', () => {
    const L = layoutWorld(SAMPLE_BLUEPRINT);
    expect(L.spots.map((s) => s.id)).toEqual(expect.arrayContaining(['hub:guide', 'hub:hoot', 'hub:review']));
    expect(isWalkable(L.spawn.x, L.spawn.z, L)).toBe(true);
  });
  it('generated worlds get a Word Bridge and a Pip lesson from verified text', () => {
    const { blueprint } = assembleBlueprint({ outline: goodOutline, details: [details(), details(), null], pages, sourceName: 'p.pdf', model: 'm', runtime: 'ollama' });
    const types = blueprint.locations.flatMap((l) => l.stations.map((s) => s.type));
    expect(types).toContain('teach_back');
    const teach = blueprint.locations[0].stations.find((s) => s.type === 'teach_back');
    if (teach?.type === 'teach_back') for (const k of teach.keyPoints) expect(pages.some((p) => p.text.includes(k.text))).toBe(true);
  });
});
