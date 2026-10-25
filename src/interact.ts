import type { StationType } from '../shared/blueprint';
import { findStation, useStore } from './store';

// One place that decides what "interacting" with a spot in the world does.

export const STATION_NAMES: Record<StationType, string> = {
  quiz: 'Riddle Stone',
  claim_check: 'Scale of Truth',
  ordering: 'Sequence Steps',
  matching: 'Pairing Totems',
  cloze: 'Word Bridge',
  teach_back: 'Pip the Learner',
  neuron_lab: 'Neuron Machine',
  network_lab: 'Signal Network',
  loss_lab: 'Loss Valley',
};

export const STATION_VERBS: Record<StationType, string> = {
  quiz: 'Answer the riddle',
  claim_check: 'Weigh the claim',
  ordering: 'Order the steps',
  matching: 'Match the pairs',
  cloze: 'Fill in the missing words',
  teach_back: 'Teach Pip',
  neuron_lab: 'Tinker with the neuron',
  network_lab: 'Send a signal',
  loss_lab: 'Train the model',
};

export function spotLabel(spotId: string): string {
  const { world, layout } = useStore.getState();
  if (!world || !layout) return '';
  if (spotId === 'hub:guide') return 'Read the world guide';
  if (spotId === 'hub:hoot') return 'Ask Professor Hoot';
  if (spotId === 'hub:review') return 'Visit the Review Grove';
  const spot = layout.spots.find((s) => s.id === spotId);
  if (!spot) return '';
  const loc = world.blueprint.locations.find((l) => l.id === spot.islandId);
  const concept = world.blueprint.concepts.find((c) => c.id === loc?.conceptId);
  if (spot.kind === 'landmark') return `Study “${concept?.name ?? loc?.title}”`;
  if (spot.kind === 'source') {
    const p = concept?.sourceRefs[0]?.page;
    return p ? `Read the source (p. ${p})` : 'Read the source';
  }
  const st = findStation(world, spotId);
  return st ? STATION_VERBS[st.station.type] : '';
}

export function interact(spotId: string) {
  const s = useStore.getState();
  const { world, layout } = s;
  if (!world || !layout) return;
  if (spotId === 'hub:guide') return s.setPanel({ kind: 'guide' });
  if (spotId === 'hub:hoot') return s.setPanel({ kind: 'hoot' });
  if (spotId === 'hub:review') return s.setPanel({ kind: 'review' });
  const spot = layout.spots.find((sp) => sp.id === spotId);
  if (!spot) return;
  if (spot.kind === 'landmark') return s.setPanel({ kind: 'concept', islandId: spot.islandId });
  if (spot.kind === 'source') {
    const loc = world.blueprint.locations.find((l) => l.id === spot.islandId);
    const concept = world.blueprint.concepts.find((c) => c.id === loc?.conceptId);
    const ref = concept?.sourceRefs.find((r) => r.status !== 'unverified') ?? concept?.sourceRefs[0];
    return s.setPanel({ kind: 'source', page: ref?.page ?? 1, passage: ref?.status !== 'unverified' ? ref?.passage : undefined, from: { kind: 'concept', islandId: spot.islandId } });
  }
  s.setPanel({ kind: 'station', stationId: spotId });
}
