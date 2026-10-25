import { describe, expect, it } from 'vitest';
import { buildCloze, buildKeyPoints, sameWord } from '../shared/activities';
import { findPassages } from '../shared/grounding';
import { SAMPLE_SOURCE } from '../shared/sampleSource';
import { SAMPLE_BLUEPRINT } from '../shared/sampleWorld';
import { askHoot, teachPip } from '../server/tutor';

const keyPoints = [
  'The neuron adds the weighted inputs together and then adds a bias.',
  'A large positive weight amplifies the input, a negative weight suppresses it.',
];
const sig = new AbortController().signal;

describe('Pip (teach-back)', () => {
  it('does not trust a model that credits an off-topic explanation', async () => {
    const flattering = async () => ({ covered: [0, 1], misconception: '', reply: 'Amazing, you covered everything!' });
    const r = await teachPip({ conceptName: 'The Artificial Neuron', keyPoints, explanation: 'I like pizza and sloths are very cute animals indeed.', attempt: 1 }, sig, flattering);
    expect(r.covered).toEqual([]);
  });

  it('accepts credit when the explanation really shares the idea', async () => {
    const llm = async () => ({ covered: [0, 1, 7, -1], misconception: '', reply: 'Thanks! What does a bias do?' });
    const r = await teachPip(
      { conceptName: 'The Artificial Neuron', keyPoints, explanation: 'It adds up the weighted inputs and a bias. Positive weights amplify an input and negative weights suppress it.', attempt: 1 },
      sig,
      llm,
    );
    expect(r.covered).toEqual([0, 1]); // out-of-range indices dropped
    expect(r.reply).not.toContain('?'); // everything covered: Pip celebrates instead of asking again
  });

  it('asks for more without calling the model when the explanation is too short', async () => {
    let called = false;
    const r = await teachPip({ conceptName: 'X', keyPoints, explanation: 'weights', attempt: 1 }, sig, async () => {
      called = true;
      return {};
    });
    expect(called).toBe(false);
    expect(r.covered).toEqual([]);
  });

  it('strips markup from model text', async () => {
    const r = await teachPip(
      { conceptName: 'X', keyPoints, explanation: 'The neuron adds weighted inputs and a bias together carefully.', attempt: 1 },
      sig,
      async () => ({ covered: [], misconception: '<b>bold</b>', reply: '<script>x</script>Hello' }),
    );
    expect(r.reply).toBe('xHello');
    expect(r.misconception).toBe('bold');
  });
});

describe('Professor Hoot (grounded Q&A)', () => {
  const pages = SAMPLE_SOURCE.pages.slice(0, 2);
  it('verifies the quote against the PDF', async () => {
    const r = await askHoot({ question: 'What does the bias do?', topic: '', pages }, sig, async () => ({ inSource: true, answer: 'It shifts z.', page: 2, quote: 'The bias shifts the result up or down' }));
    expect(r.quote).toMatchObject({ status: 'relocated', page: 1 });
  });
  it('flags a fabricated quote as unverified', async () => {
    const r = await askHoot({ question: 'What is a CNN?', topic: '', pages }, sig, async () => ({ inSource: true, answer: 'A CNN uses filters.', page: 1, quote: 'convolutional layers slide learned filters across images' }));
    expect(r.quote?.status).toBe('unverified');
  });
  it('passes through "not in the document" without a quote', async () => {
    const r = await askHoot({ question: 'Who invented it?', topic: '', pages }, sig, async () => ({ inSource: false, answer: 'The document does not say.', page: 1, quote: '' }));
    expect(r).toEqual({ inSource: false, answer: 'The document does not say.' });
  });
  it('finds relevant passages without any model', () => {
    const hits = findPassages('what does the bias do', SAMPLE_SOURCE.pages);
    expect(hits[0].text).toContain('bias');
    expect(hits[0].page).toBe(1);
  });
});

describe('Word Bridge and key ideas', () => {
  it('builds a cloze from a verified sentence with distractors that are not answers', () => {
    const c = buildCloze(
      ['To reduce the loss, we move the weight a small step in the opposite direction: new weight = old weight - learning rate x gradient.'],
      'Gradient Descent',
      SAMPLE_SOURCE.pages,
      'seed',
    )!;
    expect(c).toBeTruthy();
    for (const b of c.blanks) expect(c.sentence.slice(b.start, b.end)).toBe(b.answer);
    expect(c.bank.length).toBeGreaterThan(c.blanks.length);
    const answers = c.blanks.map((b) => b.answer.toLowerCase());
    for (const w of c.bank.filter((w) => !answers.includes(w.toLowerCase()))) expect(c.sentence.toLowerCase()).not.toContain(` ${w.toLowerCase()} `);
  });
  it('is deterministic', () => {
    const args = [SAMPLE_SOURCE.pages[2].text.split('. ').slice(0, 4), 'The Loss', SAMPLE_SOURCE.pages, 's'] as const;
    expect(buildCloze([...args[0]], args[1], args[2], args[3])).toEqual(buildCloze([...args[0]], args[1], args[2], args[3]));
  });
  it('every curated Word Bridge answer appears in its sentence and Pip ideas are verbatim', () => {
    for (const l of SAMPLE_BLUEPRINT.locations)
      for (const s of l.stations) {
        if (s.type === 'cloze') for (const b of s.blanks) expect(s.sentence.slice(b.start, b.end)).toBe(b.answer);
        if (s.type === 'teach_back') {
          expect(s.keyPoints.length).toBe(3);
          for (const k of s.keyPoints) expect(SAMPLE_SOURCE.pages.find((p) => p.page === k.page)!.text).toContain(k.text);
        }
      }
  });
  it('skips unverified references for key ideas', () => {
    expect(buildKeyPoints([{ page: 1, quote: 'made up text here ok', status: 'unverified' }])).toEqual([]);
    expect(sameWord('Bias', 'bias')).toBe(true);
  });
});

describe('Hoot output cleanup', () => {
  it('strips leaked field names from the answer', async () => {
    const r = await askHoot({ question: 'Who invented it?', topic: '', pages: SAMPLE_SOURCE.pages.slice(0, 1) }, sig, async () => ({ inSource: false, answer: 'Source=false. The document does not say.', page: 1, quote: '' }));
    expect(r.answer).toBe('The document does not say.');
  });
});
