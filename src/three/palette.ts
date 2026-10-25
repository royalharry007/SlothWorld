import type { Biome } from '../../shared/blueprint';

// One restrained palette for the whole world.
export const PALETTE = {
  skyTop: '#5b86b5',
  skyHorizon: '#f3d3b0',
  skyBottom: '#e8d3c0',
  fog: '#e8d3c0',
  sun: '#ffe4bd',
  hemiSky: '#d9ecff',
  hemiGround: '#7a6656',
  amber: '#ffb347',
  amberDeep: '#f08a24',
  teal: '#3fd1c7',
  coral: '#ff7a6b',
  positive: '#7bd389',
  negative: '#ff8a7a',
  cream: '#fff4df',
  ink: '#243042',
  wood: '#8a5a3b',
  woodDark: '#5e3b27',
  stone: '#a59b8f',
  stoneDark: '#6f655c',
};

export const BIOME_COLORS: Record<Biome | 'hub', { top: string; edge: string; under: string; underDeep: string; path: string }> = {
  hub: { top: '#9fcf73', edge: '#79a957', under: '#a07a58', underDeep: '#5c4a44', path: '#e8d6a8' },
  meadow: { top: '#a5d27a', edge: '#7cad5b', under: '#9c7a5a', underDeep: '#584846', path: '#ead9ad' },
  forest: { top: '#6fae62', edge: '#4f8a4b', under: '#7d6550', underDeep: '#463c3d', path: '#d8c79a' },
  autumn: { top: '#dc9a52', edge: '#b9763d', under: '#9a6448', underDeep: '#563b3c', path: '#f3dcb4' },
  snow: { top: '#eef3f6', edge: '#c9d6df', under: '#8b8f9c', underDeep: '#4c5060', path: '#d7e2ea' },
  desert: { top: '#e8c88c', edge: '#cfa76a', under: '#b07f56', underDeep: '#6b4a3e', path: '#f6e3bb' },
  crystal: { top: '#8fc6c4', edge: '#69a5a8', under: '#7a7495', underDeep: '#433f5c', path: '#d6ecea' },
};
