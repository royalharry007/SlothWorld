import { describe, expect, it } from 'vitest';
import {
  divergenceThreshold,
  gradientStep,
  mse,
  mseGradient,
  networkForward,
  neuronForward,
  optimalWeight,
  SAMPLE_NETWORK,
  sigmoid,
} from '../shared/math';

describe('neuron', () => {
  it('computes weighted sum, bias and sigmoid exactly', () => {
    const r = neuronForward([0.5, 0.8, 0.3], [0.4, -0.6, 0.9], 0.1);
    expect(r.products).toEqual([0.2, -0.48, 0.27].map((v) => expect.closeTo(v, 10)));
    expect(r.z).toBeCloseTo(0.2 - 0.48 + 0.27 + 0.1, 10);
    expect(r.output).toBeCloseTo(1 / (1 + Math.exp(-r.z)), 12);
  });
  it('sigmoid(0) is exactly 0.5 and saturates', () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(10)).toBeGreaterThan(0.9999);
    expect(sigmoid(-10)).toBeLessThan(0.0001);
  });
  it('supports ReLU', () => {
    expect(neuronForward([1], [-2], 0, 'relu').output).toBe(0);
    expect(neuronForward([1], [2], 0.5, 'relu').output).toBe(2.5);
  });
});

describe('network forward pass', () => {
  it('each layer equals independent neuron computations', () => {
    const x = [1, 0, 1];
    const t = networkForward(x, SAMPLE_NETWORK);
    SAMPLE_NETWORK[0].weights.forEach((w, j) => {
      expect(t.activations[1][j]).toBeCloseTo(neuronForward(x, w, SAMPLE_NETWORK[0].biases[j]).output, 12);
    });
    SAMPLE_NETWORK[1].weights.forEach((w, j) => {
      expect(t.activations[2][j]).toBeCloseTo(neuronForward(t.activations[1], w, SAMPLE_NETWORK[1].biases[j]).output, 12);
    });
  });
  it('the island 2 challenge is solvable only by specific patterns', () => {
    const winners = [];
    for (let p = 0; p < 8; p++) {
      const x = [(p >> 2) & 1, (p >> 1) & 1, p & 1];
      if (networkForward(x, SAMPLE_NETWORK).activations[2][0] > 0.75) winners.push(x.join(''));
    }
    expect(winners).toEqual(['100', '101']);
  });
});

describe('loss and gradient descent', () => {
  it('gradient matches a finite difference', () => {
    for (const w of [-1, 0.5, 2, 3.7]) {
      const h = 1e-6;
      expect(mseGradient(w)).toBeCloseTo((mse(w + h) - mse(w - h)) / (2 * h), 4);
    }
  });
  it('a good learning rate reaches the arena goal (MSE < 0.05)', () => {
    let w = 0.5;
    for (let i = 0; i < 6; i++) w = gradientStep(w, 0.05);
    expect(mse(w)).toBeLessThan(0.05);
    expect(w).toBeCloseTo(optimalWeight(), 2);
  });
  it('a learning rate above the threshold diverges', () => {
    expect(divergenceThreshold()).toBeCloseTo(2 / 15, 10);
    let w = 0.5;
    const losses = [mse(w)];
    for (let i = 0; i < 4; i++) losses.push(mse((w = gradientStep(w, 0.14))));
    expect(losses[4]).toBeGreaterThan(losses[1]);
  });
});
