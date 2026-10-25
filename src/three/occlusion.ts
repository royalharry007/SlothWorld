import type { DecorKind } from '../../shared/layout';

// Indices of decor items currently between the camera and the sloth (they fade out).
export const occluded = { current: new Set<number>() };

// Rough height and canopy radius of each decor model (world units at scale 1).
export const DECOR_DIMS: Record<DecorKind, { h: number; r: number }> = {
  fir: { h: 5.5, r: 1.6 },
  pine: { h: 5.6, r: 1.1 },
  juniper: { h: 3.3, r: 0.8 },
  broadleaf: { h: 5.2, r: 2.2 },
  blossom: { h: 4.8, r: 1.9 },
  bush: { h: 1.1, r: 1.2 },
  bush_flowering: { h: 1.1, r: 1.1 },
  shrub: { h: 1.0, r: 1.0 },
  rocks: { h: 1.4, r: 1.2 },
  boulder: { h: 1.6, r: 1.0 },
  stump: { h: 0.8, r: 0.7 },
  grass: { h: 0.6, r: 0 },
};
