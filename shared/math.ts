// Small, real neural-network math used by the sample world's interactive islands.
// Everything the 3D scene shows is computed here — no faked numbers.

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const relu = (z: number) => Math.max(0, z);

export type Activation = 'sigmoid' | 'relu';
export const activate = (z: number, a: Activation) => (a === 'sigmoid' ? sigmoid(z) : relu(z));

// ---------- Island 1: a single neuron ----------

export interface NeuronResult {
  products: number[]; // w_i * x_i
  z: number; // weighted sum + bias
  output: number; // activation(z)
}

export function neuronForward(inputs: number[], weights: number[], bias: number, act: Activation = 'sigmoid'): NeuronResult {
  if (inputs.length !== weights.length) throw new Error('inputs and weights must have the same length');
  const products = inputs.map((x, i) => x * weights[i]);
  const z = products.reduce((s, p) => s + p, 0) + bias;
  return { products, z, output: activate(z, act) };
}

// ---------- Island 2: a small feed-forward network ----------

export interface Layer {
  weights: number[][]; // weights[j][i] = weight from input i to neuron j
  biases: number[];
}

export interface ForwardTrace {
  activations: number[][]; // activations[0] = inputs, then one array per layer
  sums: number[][]; // pre-activation z per layer
  contributions: number[][][]; // contributions[l][j][i] = w_ji * a_i flowing into layer l neuron j
}

export function networkForward(inputs: number[], layers: Layer[], act: Activation = 'sigmoid'): ForwardTrace {
  const activations: number[][] = [inputs.slice()];
  const sums: number[][] = [];
  const contributions: number[][][] = [];
  let a = inputs;
  for (const layer of layers) {
    const contrib = layer.weights.map((row) => row.map((w, i) => w * a[i]));
    const z = contrib.map((c, j) => c.reduce((s, v) => s + v, 0) + layer.biases[j]);
    const out = z.map((v) => activate(v, act));
    contributions.push(contrib);
    sums.push(z);
    activations.push(out);
    a = out;
  }
  return { activations, sums, contributions };
}

// The sample network: 3 inputs -> 4 hidden -> 2 outputs.
// Hand-picked weights so different input patterns produce clearly different outputs.
export const SAMPLE_NETWORK: Layer[] = [
  {
    weights: [
      [2.0, -1.5, 0.5],
      [-1.0, 2.5, -0.5],
      [0.8, 0.8, 0.8],
      [-2.0, -0.5, 2.2],
    ],
    biases: [-0.5, -0.8, -1.0, 0.2],
  },
  {
    weights: [
      [2.4, -1.8, 0.6, -1.2],
      [-1.6, 2.2, 0.4, 1.8],
    ],
    biases: [-0.3, -1.2],
  },
];

// ---------- Island 3: learning a single weight by gradient descent ----------

export interface Point {
  x: number;
  y: number;
}

// Hours of practice -> skill score (scaled). True relation is roughly y = 2x.
export const SAMPLE_DATA: Point[] = [
  { x: 1, y: 2.1 },
  { x: 2, y: 3.9 },
  { x: 3, y: 6.2 },
  { x: 4, y: 7.8 },
];

export const predict = (w: number, x: number) => w * x;

export function mse(w: number, data: Point[] = SAMPLE_DATA): number {
  return data.reduce((s, p) => s + (predict(w, p.x) - p.y) ** 2, 0) / data.length;
}

// dL/dw for L = mean((w x - y)^2)  =>  (2/n) * sum((w x - y) * x)
export function mseGradient(w: number, data: Point[] = SAMPLE_DATA): number {
  return (2 / data.length) * data.reduce((s, p) => s + (predict(w, p.x) - p.y) * p.x, 0);
}

export function gradientStep(w: number, learningRate: number, data: Point[] = SAMPLE_DATA): number {
  return w - learningRate * mseGradient(w, data);
}

// Closed-form optimum for a no-bias linear model: w* = sum(xy) / sum(x^2)
export function optimalWeight(data: Point[] = SAMPLE_DATA): number {
  const sxy = data.reduce((s, p) => s + p.x * p.y, 0);
  const sxx = data.reduce((s, p) => s + p.x * p.x, 0);
  return sxy / sxx;
}

// Gradient descent on this quadratic diverges when lr > 2 / L'' where L'' = 2 * mean(x^2).
export function divergenceThreshold(data: Point[] = SAMPLE_DATA): number {
  const meanX2 = data.reduce((s, p) => s + p.x * p.x, 0) / data.length;
  return 2 / (2 * meanX2);
}
