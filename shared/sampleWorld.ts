import { Blueprint, type SourceRef, type World } from './blueprint';
import { buildKeyPoints } from './activities';
import { groundQuote } from './grounding';
import { SAMPLE_SOURCE } from './sampleSource';

// The curated sample world. Hand-written (NOT AI-generated) and labelled as such in the UI.
// Its quotes go through the same grounding check as AI output, so the page links are real.

function ref(page: number, quote: string): SourceRef {
  const g = groundQuote(quote, page, SAMPLE_SOURCE.pages);
  return { page: g.page, quote, status: g.status, passage: g.passage };
}

// Hand-picked Word Bridge: blank chosen words of a verified guide sentence.
function cloze(id: string, page: number, sentence: string, answers: string[], distractors: string[]) {
  const blanks = answers.map((a) => {
    const start = sentence.indexOf(a);
    if (start < 0) throw new Error(`cloze answer "${a}" not in sentence`);
    return { start, end: start + a.length, answer: a };
  });
  return { type: 'cloze', id, sentence, blanks, bank: [...answers, ...distractors].sort(), sourceRefs: [ref(page, sentence)], grounded: true };
}

const teach = (id: string, conceptName: string, quotes: [number, string][]) => ({
  type: 'teach_back',
  id,
  conceptName,
  keyPoints: buildKeyPoints(quotes.map(([p, q]) => ref(p, q))),
  sourceRefs: [],
  grounded: true,
});

const raw = {
  version: 1,
  id: 'sample-neural-networks',
  title: 'How Neural Networks Learn',
  summary:
    'Walk from a single artificial neuron, across a living network, into the Learning Arena where a model improves itself by gradient descent. Every number you see is computed live.',
  objectives: [
    'Explain how weights, a bias and an activation function produce a neuron’s output.',
    'Trace a signal through a feedforward network during the forward pass.',
    'Use mean squared error to measure how wrong a prediction is.',
    'Reduce the loss with gradient descent and see why the learning rate matters.',
  ],
  concepts: [
    {
      id: 'artificial-neuron',
      name: 'The Artificial Neuron',
      summary: 'Multiplies each input by a weight, adds a bias, and squashes the result with an activation function.',
      explanation:
        'A neuron computes z = w1·x1 + w2·x2 + w3·x3 + b. Positive weights amplify an input, negative weights suppress it, and weights near zero ignore it. The bias shifts z up or down. The sigmoid activation then turns z into an output between 0 and 1: large positive z → close to 1, large negative z → close to 0, and z = 0 → exactly 0.5.',
      sourceRefs: [
        ref(1, 'a large positive weight amplifies the input, a negative weight suppresses it'),
        ref(1, 'The bias shifts the result up or down'),
        ref(1, 'z = 0 gives exactly 0.5'),
      ],
      support: 'source',
    },
    {
      id: 'forward-pass',
      name: 'The Forward Pass',
      summary: 'Signals flow one way through layers: each neuron takes every output from the previous layer.',
      explanation:
        'Neurons are stacked in layers: input, hidden and output. During the forward pass each hidden neuron receives every output from the previous layer, computes its own weighted sum plus bias, applies its activation and passes the result on. The signal along a connection is weight × incoming activation, which is why some connections glow brighter than others.',
      beyondSource:
        'The specific weights in this network were hand-picked for the demo so that different input patterns light up different outputs. They were not learned from data.',
      sourceRefs: [
        ref(2, 'information flows in one direction: from the inputs, through the hidden layers, to the outputs'),
        ref(2, 'each neuron in a layer receives the outputs of every neuron in the previous layer'),
        ref(2, 'The strength of the signal along each connection is the product of a weight and the activation that feeds into it'),
      ],
      support: 'source',
    },
    {
      id: 'learning-from-loss',
      name: 'Learning from Loss',
      summary: 'The loss measures how wrong predictions are; gradient descent steps the weight downhill to reduce it.',
      explanation:
        'Mean squared error averages the squared differences between predictions and targets, so big mistakes cost much more than small ones. Plotting loss against a weight gives a valley. The gradient says which way is uphill, so gradient descent moves the weight the opposite way: w ← w − learning rate × gradient. Too small a learning rate crawls; too large overshoots the valley floor and the loss can grow.',
      beyondSource:
        'The arena uses a one-weight model (prediction = w × x) with no bias so the loss curve is a single valley you can walk along. Real networks have millions of weights and use backpropagation to get every gradient.',
      sourceRefs: [
        ref(3, 'the average of the squared differences between predictions and targets'),
        ref(3, 'the curve often looks like a valley, and the best weight sits at the bottom of the valley'),
        ref(4, 'new weight = old weight - learning rate x gradient'),
        ref(4, 'each step can overshoot the bottom of the valley, and the loss may grow instead of shrink'),
      ],
      support: 'source',
    },
  ],
  relationships: [
    { from: 'artificial-neuron', to: 'forward-pass', type: 'prerequisite', label: 'neurons form layers' },
    { from: 'forward-pass', to: 'learning-from-loss', type: 'prerequisite', label: 'predictions get scored' },
    { from: 'artificial-neuron', to: 'learning-from-loss', type: 'related', label: 'weights are what learn' },
  ],
  locations: [
    {
      id: 'isle-neuron',
      conceptId: 'artificial-neuron',
      title: 'Island 1 · The Neuron',
      purpose: 'Feel how each weight, the bias and the activation shape a single neuron’s output.',
      objective: 'Drive the neuron to fire, go quiet, and sit exactly on the fence (0.5).',
      biome: 'meadow',
      stations: [
        { type: 'neuron_lab', id: 'neuron-lab', prompt: 'Tune the weights, bias and inputs of a real neuron.', sourceRefs: [ref(1, 'z = w1*x1 + w2*x2 + ... + wn*xn + b')], grounded: true },
        {
          type: 'quiz',
          id: 'neuron-quiz',
          prompt: 'A neuron’s weighted sum plus bias comes out as z = 0. What does its sigmoid output equal?',
          options: ['0', '0.5', '1', 'It depends on the weights'],
          correctIndex: 1,
          explanation: 'sigmoid(0) = 1 / (1 + e⁰) = 1 / 2 = 0.5. Once z is known, the weights no longer matter — the output depends only on z.',
          sourceRefs: [ref(1, 'z = 0 gives exactly 0.5')],
          grounded: true,
        },
        {
          type: 'claim_check',
          id: 'neuron-claim',
          claim: 'Giving an input a negative weight makes that input push the neuron’s output up.',
          supported: false,
          explanation: 'The opposite: a negative weight suppresses its input. The bigger that input gets, the lower z (and the output) goes.',
          sourceRefs: [ref(1, 'a negative weight suppresses it')],
          grounded: true,
        },
        cloze('neuron-cloze', 1, 'A weight measures how strongly an input influences the neuron: a large positive weight amplifies the input, a negative weight suppresses it, and a weight near zero means the input is mostly ignored.', ['amplifies', 'suppresses'], ['squashes', 'doubles']),
        teach('neuron-teach', 'The Artificial Neuron', [
          [1, 'The neuron adds the weighted inputs together and then adds a bias'],
          [1, 'a large positive weight amplifies the input, a negative weight suppresses it'],
          [1, 'Large positive values of z give outputs close to 1, large negative values give outputs close to 0'],
        ]),
      ],
    },
    {
      id: 'isle-network',
      conceptId: 'forward-pass',
      title: 'Island 2 · The Network',
      purpose: 'See a signal propagate layer by layer and how individual connections carry different strengths.',
      objective: 'Find an input pattern that makes Output A fire above 0.75.',
      biome: 'forest',
      stations: [
        { type: 'network_lab', id: 'network-lab', prompt: 'Set the three inputs, send a signal and watch it travel.', sourceRefs: [ref(2, 'This one-way flow is called the forward pass')], grounded: true },
        {
          type: 'ordering',
          id: 'network-order',
          prompt: 'Put one neuron’s job during the forward pass in order.',
          items: [
            'Receive the outputs of every neuron in the previous layer',
            'Multiply each incoming value by its weight',
            'Add the weighted values and the bias',
            'Apply the activation function',
            'Send the output to the next layer',
          ],
          explanation: 'Receive → weigh → sum with bias → activate → pass on. This is exactly the single neuron from Island 1, repeated for every neuron in every layer.',
          sourceRefs: [ref(2, 'computes its own weighted sum plus bias, applies its activation function, and sends its output to the next layer')],
          grounded: true,
        },
        {
          type: 'quiz',
          id: 'network-quiz',
          prompt: 'Why do different hidden neurons light up for different input patterns?',
          options: [
            'Each hidden neuron has its own weights',
            'Hidden neurons are activated at random',
            'Only one hidden neuron may be active at a time',
            'The input layer chooses which neuron to use',
          ],
          correctIndex: 0,
          explanation: 'Every hidden neuron weighs the same inputs differently, so each one responds to a different pattern.',
          sourceRefs: [ref(2, 'Because every hidden neuron has its own weights, different neurons respond to different patterns in the input')],
          grounded: true,
        },
        cloze('network-cloze', 2, 'The strength of the signal along each connection is the product of a weight and the activation that feeds into it.', ['product', 'activation'], ['sum', 'bias']),
        teach('network-teach', 'The Forward Pass', [
          [2, 'information flows in one direction: from the inputs, through the hidden layers, to the outputs'],
          [2, 'each neuron in a layer receives the outputs of every neuron in the previous layer'],
          [2, 'different neurons respond to different patterns in the input'],
        ]),
      ],
    },
    {
      id: 'isle-arena',
      conceptId: 'learning-from-loss',
      title: 'Island 3 · The Learning Arena',
      purpose: 'Measure error with mean squared error and reduce it by stepping down the loss valley.',
      objective: 'Bring the loss below 0.05 — and find out what a too-large learning rate does.',
      biome: 'autumn',
      stations: [
        { type: 'loss_lab', id: 'loss-lab', prompt: 'Adjust the weight or take gradient steps to fit the data.', sourceRefs: [ref(4, 'new weight = old weight - learning rate x gradient')], grounded: true },
        {
          type: 'quiz',
          id: 'arena-quiz',
          prompt: 'With a learning rate of 0.14 the ball flew out of the valley and the loss grew. Why?',
          options: [
            'Each step overshot the bottom of the valley by more than it gained',
            'The gradient was zero, so the weight stopped moving',
            'The data points changed between steps',
            'A larger learning rate always finds the minimum faster',
          ],
          correctIndex: 0,
          explanation:
            'For this data the loss curve’s steepness means any learning rate above 2/15 ≈ 0.133 overshoots further each step, so the weight swings wider and the loss grows. 0.05 converges in a few steps; 0.01 converges slowly.',
          sourceRefs: [ref(4, 'If it is too large, each step can overshoot the bottom of the valley, and the loss may grow instead of shrink')],
          grounded: true,
        },
        {
          type: 'claim_check',
          id: 'arena-claim',
          claim: 'A mean squared error of zero means every prediction matches its target exactly.',
          supported: true,
          explanation: 'Squared differences are never negative, so their average can only be zero when every single difference is zero.',
          sourceRefs: [ref(3, 'A loss of zero means every prediction matches its target exactly')],
          grounded: true,
        },
        cloze('arena-cloze', 3, 'Squaring makes every error positive and penalizes large errors more than small ones.', ['positive', 'large'], ['negative', 'zero']),
        teach('arena-teach', 'Learning from Loss', [
          [3, 'a loss function measures how far the prediction is from the target'],
          [4, 'we move the weight a small step in the opposite direction'],
          [4, 'If it is too large, each step can overshoot the bottom of the valley'],
        ]),
      ],
    },
  ],
  uncertainties: ['The guide does not cover how backpropagation computes gradients in detail, so SlothWorld only mentions it.'],
  meta: {
    origin: 'curated',
    sourceName: 'how-neural-networks-learn.pdf',
    pageCount: SAMPLE_SOURCE.pages.length,
    generatedAt: '2026-10-25T00:00:00.000Z',
    warnings: [],
  },
};

export const SAMPLE_BLUEPRINT: Blueprint = Blueprint.parse(raw);
export const SAMPLE_WORLD: World = { blueprint: SAMPLE_BLUEPRINT, source: SAMPLE_SOURCE };
