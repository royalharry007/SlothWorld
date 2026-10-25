import { create } from 'zustand';
import type { Location, Station, World } from '../shared/blueprint';
import { approachPoint, layoutWorld, type WorldLayout } from '../shared/layout';
import { gradientStep, mse, networkForward, SAMPLE_NETWORK, type ForwardTrace } from '../shared/math';
import { loadProgress, saveProgress, type Progress } from './storage';

// Spaced review: 10 minutes, then 1, 3, 7 and 21 days. A miss starts the ladder again.
export const REVIEW_LADDER = [10 * 60_000, 86_400_000, 3 * 86_400_000, 7 * 86_400_000, 21 * 86_400_000];
const REVIEWABLE = new Set(['quiz', 'claim_check', 'cloze']);

export type Panel =
  | { kind: 'station'; stationId: string }
  | { kind: 'concept'; islandId: string }
  | { kind: 'source'; page: number; passage?: string; from?: Panel }
  | { kind: 'guide' }
  | { kind: 'hoot' }
  | { kind: 'review' }
  | null;

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'info' | 'success' | 'island';
}

interface NeuronState {
  inputs: number[];
  weights: number[];
  bias: number;
  activation: 'sigmoid' | 'relu';
  achieved: { fire: boolean; quiet: boolean; balance: boolean };
}

interface NetworkState {
  inputs: number[];
  firedAt: number | null; // performance.now() when the signal was sent
  trace: ForwardTrace | null;
  tried: Record<string, number[]>; // pattern -> outputs
}

interface LossState {
  w: number;
  lr: number;
  history: number[];
  sawOvershoot: boolean;
}

interface State {
  screen: 'landing' | 'world';
  world: World | null;
  layout: WorldLayout | null;
  pdfUrl: string | null; // object URL of the uploaded PDF (this session only) or a sample PDF path
  progress: Progress;
  panel: Panel;
  journalOpen: boolean;
  overview: boolean;
  nearSpot: string | null;
  currentIsland: string | null;
  teleport: { x: number; z: number; facing: number; nonce: number } | null;
  toasts: Toast[];
  neuron: NeuronState;
  network: NetworkState;
  loss: LossState;

  openWorld: (w: World, pdfUrl?: string | null) => void;
  exitWorld: () => void;
  setPanel: (p: Panel) => void;
  setJournal: (open: boolean) => void;
  setOverview: (v: boolean) => void;
  setNearSpot: (id: string | null) => void;
  enterIsland: (id: string | null) => void;
  complete: (stationId: string) => void;
  travelTo: (spotId: string) => void;
  reviewResult: (stationId: string, correct: boolean) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  setNeuron: (p: Partial<Omit<NeuronState, 'achieved'>>) => void;
  setNetworkInput: (i: number, v: number) => void;
  fireNetwork: () => void;
  setLoss: (p: Partial<LossState>) => void;
  lossStep: () => void;
}

const initialNeuron = (): NeuronState => ({
  inputs: [0.5, 0.8, 0.3],
  weights: [0.4, -0.6, 0.9],
  bias: 0.1,
  activation: 'sigmoid',
  achieved: { fire: false, quiet: false, balance: false },
});
const initialNetwork = (): NetworkState => ({ inputs: [0, 1, 0], firedAt: null, trace: null, tried: {} });
const initialLoss = (): LossState => ({ w: 0.5, lr: 0.05, history: [mse(0.5)], sawOvershoot: false });

let toastId = 1;

export const useStore = create<State>((set, get) => ({
  screen: 'landing',
  world: null,
  layout: null,
  pdfUrl: null,
  progress: { completed: {}, visited: {}, review: {} },
  panel: null,
  journalOpen: false,
  overview: false,
  nearSpot: null,
  currentIsland: null,
  teleport: null,
  toasts: [],
  neuron: initialNeuron(),
  network: initialNetwork(),
  loss: initialLoss(),

  openWorld: (w, pdfUrl = null) => {
    const prev = get().pdfUrl;
    if (prev && prev.startsWith('blob:') && prev !== pdfUrl) URL.revokeObjectURL(prev);
    set({
      screen: 'world',
      world: w,
      layout: layoutWorld(w.blueprint),
      pdfUrl,
      progress: loadProgress(w.blueprint.id),
      panel: { kind: 'guide' },
      journalOpen: false,
      overview: false,
      nearSpot: null,
      currentIsland: 'hub',
      teleport: null,
      toasts: [],
      neuron: initialNeuron(),
      network: initialNetwork(),
      loss: initialLoss(),
    });
  },

  // Progress is saved continuously, so leaving never loses it.
  exitWorld: () => set({ screen: 'landing', panel: null, journalOpen: false, overview: false, nearSpot: null }),

  setPanel: (panel) => set({ panel, journalOpen: panel ? false : get().journalOpen }),
  setJournal: (journalOpen) => set({ journalOpen, panel: journalOpen ? null : get().panel }),
  setOverview: (overview) => set({ overview, panel: null }),
  setNearSpot: (nearSpot) => {
    if (get().nearSpot !== nearSpot) set({ nearSpot });
  },

  enterIsland: (id) => {
    const { currentIsland, world, progress } = get();
    if (id === currentIsland) return;
    set({ currentIsland: id });
    if (!id || id === 'hub' || !world) return;
    const loc = world.blueprint.locations.find((l) => l.id === id);
    if (!loc) return;
    get().toast({ title: loc.title, body: loc.objective, tone: 'island' });
    if (!progress.visited[id]) {
      const next = { ...progress, visited: { ...progress.visited, [id]: true as const } };
      set({ progress: next });
      saveProgress(world.blueprint.id, next);
    }
  },

  complete: (stationId) => {
    const { progress, world } = get();
    if (!world || progress.completed[stationId]) return;
    const found = findStation(world, stationId);
    const reviewable = found && REVIEWABLE.has(found.station.type);
    const next: Progress = {
      ...progress,
      completed: { ...progress.completed, [stationId]: true as const },
      review: reviewable ? { ...progress.review, [stationId]: { due: Date.now() + REVIEW_LADDER[0], step: 0 } } : progress.review,
    };
    set({ progress: next });
    saveProgress(world.blueprint.id, next);
    const total = world.blueprint.locations.reduce((s, l) => s + l.stations.length, 0);
    const done = Object.keys(next.completed).filter((k) => findStation(world, k)).length;
    get().toast({
      title: done === total ? 'World complete!' : 'Challenge complete',
      body: done === total ? `You finished all ${total} challenges. The sloth is impressed (slowly).` : `${done} of ${total} challenges done. Slow and steady.`,
      tone: 'success',
    });
  },

  reviewResult: (stationId, correct) => {
    const { progress, world } = get();
    if (!world) return;
    const cur = progress.review[stationId] ?? { due: 0, step: 0 };
    const step = correct ? Math.min(cur.step + 1, REVIEW_LADDER.length - 1) : 0;
    const next: Progress = { ...progress, review: { ...progress.review, [stationId]: { due: Date.now() + REVIEW_LADDER[step], step } } };
    set({ progress: next });
    saveProgress(world.blueprint.id, next);
  },

  travelTo: (spotId) => {
    const L = get().layout;
    const spot = L?.spots.find((s) => s.id === spotId);
    if (!L || !spot) return;
    const p = approachPoint(spot, L);
    set({ teleport: { ...p, nonce: Date.now() }, overview: false, journalOpen: false });
  },

  toast: (t) => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    setTimeout(() => get().dismissToast(id), t.tone === 'island' ? 4200 : 3600);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  setNeuron: (p) => {
    const n = { ...get().neuron, ...p };
    if (n.activation === 'sigmoid') {
      const z = n.inputs.reduce((s, x, i) => s + x * n.weights[i], 0) + n.bias;
      const y = 1 / (1 + Math.exp(-z));
      n.achieved = {
        fire: n.achieved.fire || y >= 0.9,
        quiet: n.achieved.quiet || y <= 0.1,
        balance: n.achieved.balance || Math.abs(y - 0.5) <= 0.01,
      };
    }
    set({ neuron: n });
    if (n.achieved.fire && n.achieved.quiet && n.achieved.balance) get().complete('neuron-lab');
  },

  setNetworkInput: (i, v) => {
    const inputs = get().network.inputs.slice();
    inputs[i] = v;
    set({ network: { ...get().network, inputs } });
  },

  fireNetwork: () => {
    const net = get().network;
    const trace = networkForward(net.inputs, SAMPLE_NETWORK);
    const key = net.inputs.join('');
    set({ network: { ...net, firedAt: performance.now(), trace, tried: { ...net.tried, [key]: trace.activations[2] } } });
    // Count the challenge once the signal has visibly reached the outputs.
    if (trace.activations[2][0] > 0.75) setTimeout(() => get().complete('network-lab'), 2500);
  },

  setLoss: (p) => {
    set({ loss: { ...get().loss, ...p } });
    if (mse(get().loss.w) < 0.05) get().complete('loss-lab');
  },

  lossStep: () => {
    const l = get().loss;
    const w = gradientStep(l.w, l.lr);
    const before = mse(l.w);
    const after = mse(w);
    set({ loss: { ...l, w, history: [...l.history, after].slice(-40), sawOvershoot: l.sawOvershoot || after > before } });
    if (after < 0.05) get().complete('loss-lab');
    if (after > before) get().toast({ title: 'The loss went up!', body: 'That step overshot the valley floor. Look at the size of the learning rate.', tone: 'info' });
  },
}));

export function findStation(world: World, id: string): { station: Station; location: Location } | null {
  for (const location of world.blueprint.locations) {
    const station = location.stations.find((s) => s.id === id);
    if (station) return { station, location };
  }
  return null;
}

export function worldTotals(world: World, progress: Progress) {
  const all = world.blueprint.locations.flatMap((l) => l.stations.map((s) => s.id));
  return { total: all.length, done: all.filter((id) => progress.completed[id]).length };
}

export function dueReviews(world: World, progress: Progress, now = Date.now()) {
  return Object.entries(progress.review)
    .filter(([id, r]) => r.due <= now && findStation(world, id))
    .sort((a, b) => a[1].step - b[1].step || a[1].due - b[1].due)
    .map(([id]) => id);
}

export function nextReviewAt(world: World, progress: Progress): number | null {
  const times = Object.entries(progress.review)
    .filter(([id]) => findStation(world, id))
    .map(([, r]) => r.due);
  return times.length ? Math.min(...times) : null;
}

// The next unfinished challenge, following the island order of the layout.
export function nextStep(world: World, layout: WorldLayout, progress: Progress): { stationId: string; islandTitle: string } | null {
  const order = layout.islands.filter((i) => i.kind === 'concept').sort((a, b) => a.order - b.order);
  for (const isl of order) {
    const loc = world.blueprint.locations.find((l) => l.id === isl.locationId);
    const st = loc?.stations.find((s) => !progress.completed[s.id]);
    if (loc && st) return { stationId: st.id, islandTitle: loc.title };
  }
  return null;
}
