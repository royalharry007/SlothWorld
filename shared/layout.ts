import type { Biome, Blueprint } from './blueprint';
import { hashString, mulberry32 } from './rand';

// Deterministic world layout. The same blueprint always produces the same world:
// prerequisites come before the concepts that need them, consecutive islands are
// linked by walkable bridges, other relationships become sky links.

export interface IslandLayout {
  id: string; // 'hub' or location id
  kind: 'hub' | 'concept';
  locationId?: string;
  order: number; // 0 = hub
  x: number;
  z: number;
  radius: number;
  biome: Biome;
  entryAngle: number | null; // direction (radians) toward the previous island
  exitAngle: number | null; // direction toward the next island
}

export interface BridgeLayout {
  id: string;
  from: string;
  to: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  label?: string;
}

export interface SkyLinkLayout {
  id: string;
  from: string;
  to: string;
  label: string;
  type: string;
}

export interface SpotLayout {
  id: string; // station id, or `${islandId}:landmark` / `${islandId}:source` / 'hub:guide'
  kind: 'station' | 'landmark' | 'source' | 'guide' | 'hoot' | 'review';
  islandId: string;
  x: number;
  z: number;
  facing: number; // y rotation so the object faces the island centre
  blockRadius: number;
}

export type DecorKind = 'fir' | 'pine' | 'juniper' | 'broadleaf' | 'blossom' | 'bush' | 'bush_flowering' | 'shrub' | 'rocks' | 'boulder' | 'stump' | 'grass';

export interface DecorLayout {
  kind: DecorKind;
  x: number;
  z: number;
  rot: number;
  scale: number;
  blockRadius: number;
}

export interface WorldLayout {
  islands: IslandLayout[];
  bridges: BridgeLayout[];
  links: SkyLinkLayout[];
  spots: SpotLayout[];
  decor: DecorLayout[];
  spawn: { x: number; z: number; facing: number };
  center: { x: number; z: number };
  extent: number;
}

export const HUB_RADIUS = 10;
export const BRIDGE_LENGTH = 9;
export const BRIDGE_HALF_WIDTH = 1.5;

// ---- Ordering: topological by prerequisites, keeping related concepts adjacent ----
export function orderLocations(bp: Blueprint): string[] {
  const locByConcept = new Map(bp.locations.map((l) => [l.conceptId, l.id]));
  const ids = bp.locations.map((l) => l.id);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const edges = new Map<string, string[]>(ids.map((id) => [id, []]));
  const related = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
  for (const r of bp.relationships) {
    const a = locByConcept.get(r.from);
    const b = locByConcept.get(r.to);
    if (!a || !b || a === b) continue;
    related.get(a)!.add(b);
    related.get(b)!.add(a);
    if (r.type === 'prerequisite') {
      edges.get(a)!.push(b);
      indeg.set(b, indeg.get(b)! + 1);
    }
  }
  const placed: string[] = [];
  const remaining = new Set(ids);
  while (remaining.size) {
    let avail = ids.filter((id) => remaining.has(id) && indeg.get(id) === 0);
    if (!avail.length) avail = [ids.find((id) => remaining.has(id))!]; // break cycles by document order
    const last = placed[placed.length - 1];
    const pick = (last && avail.find((id) => related.get(last)!.has(id))) || avail[0];
    placed.push(pick);
    remaining.delete(pick);
    for (const n of edges.get(pick)!) indeg.set(n, indeg.get(n)! - 1);
  }
  return placed;
}

const islandRadius = (stations: number) => 9 + Math.max(0, stations - 2) * 0.9;

export function layoutWorld(bp: Blueprint): WorldLayout {
  const order = orderLocations(bp);
  const locs = new Map(bp.locations.map((l) => [l.id, l]));
  const rnd = mulberry32(hashString(bp.id + bp.title));

  const islands: IslandLayout[] = [
    { id: 'hub', kind: 'hub', order: 0, x: 0, z: 0, radius: HUB_RADIUS, biome: 'meadow', entryAngle: null, exitAngle: null },
  ];
  let heading = -Math.PI / 2 + (rnd() - 0.5) * 0.3; // first island lies "ahead" (-z) of the hub
  order.forEach((locId, i) => {
    const loc = locs.get(locId)!;
    const prev = islands[islands.length - 1];
    const r = islandRadius(loc.stations.length);
    const base = 0.55 + rnd() * 0.25;
    const tries = [base, -base, 0, base * 1.8, -base * 1.8, base * 2.6, -base * 2.6, Math.PI];
    let pos = { x: 0, z: 0 };
    let chosen = heading;
    for (const t of tries) {
      const h = i === 0 ? heading : heading + t;
      const d = prev.radius + r + BRIDGE_LENGTH;
      const cand = { x: prev.x + Math.cos(h) * d, z: prev.z + Math.sin(h) * d };
      const ok = islands.every((o) => o === prev || Math.hypot(o.x - cand.x, o.z - cand.z) > o.radius + r + 7);
      pos = cand;
      chosen = h;
      if (ok) break;
    }
    heading = chosen;
    islands.push({ id: locId, kind: 'concept', locationId: locId, order: i + 1, x: pos.x, z: pos.z, radius: r, biome: loc.biome, entryAngle: null, exitAngle: null });
  });

  // Entry/exit directions and bridges between consecutive islands.
  const bridges: BridgeLayout[] = [];
  const conceptOf = (islandId: string) => locs.get(islandId)?.conceptId;
  const relLabel = (a: string, b: string) => {
    const ca = conceptOf(a);
    const cb = conceptOf(b);
    const r = bp.relationships.find((r) => (r.from === ca && r.to === cb) || (r.from === cb && r.to === ca));
    return r?.label;
  };
  for (let i = 1; i < islands.length; i++) {
    const a = islands[i - 1];
    const b = islands[i];
    const ang = Math.atan2(b.z - a.z, b.x - a.x);
    a.exitAngle = ang;
    b.entryAngle = ang + Math.PI;
    const inset = 1.2; // bridges overlap island edges so the walkable area is continuous
    bridges.push({
      id: `bridge-${a.id}-${b.id}`,
      from: a.id,
      to: b.id,
      ax: a.x + Math.cos(ang) * (a.radius - inset),
      az: a.z + Math.sin(ang) * (a.radius - inset),
      bx: b.x - Math.cos(ang) * (b.radius - inset),
      bz: b.z - Math.sin(ang) * (b.radius - inset),
      label: i > 1 ? relLabel(a.id, b.id) : undefined,
    });
  }

  // Relationships that aren't already walkable bridges become sky links.
  const bridged = new Set(bridges.map((b) => `${b.from}|${b.to}`));
  const locByConcept = new Map(bp.locations.map((l) => [l.conceptId, l.id]));
  const links: SkyLinkLayout[] = [];
  for (const r of bp.relationships) {
    const a = locByConcept.get(r.from);
    const b = locByConcept.get(r.to);
    if (!a || !b || bridged.has(`${a}|${b}`) || bridged.has(`${b}|${a}`)) continue;
    links.push({ id: `link-${a}-${b}`, from: a, to: b, label: r.label, type: r.type });
  }

  // ---- Spots on each island ----
  const spots: SpotLayout[] = [];
  const angleFree = (ang: number, isl: IslandLayout, margin = 0.6) =>
    [isl.entryAngle, isl.exitAngle].every((e) => e === null || Math.abs(Math.atan2(Math.sin(ang - e), Math.cos(ang - e))) > margin);
  const facingCentre = (x: number, z: number, isl: IslandLayout) => Math.atan2(isl.x - x, isl.z - z);

  for (const isl of islands) {
    if (isl.kind === 'hub') {
      // Beside the path to island 1, so a learner leaving the start sees its front.
      const a = (isl.exitAngle ?? -Math.PI / 2) + 0.75;
      const x = isl.x + Math.cos(a) * 4.5;
      const z = isl.z + Math.sin(a) * 4.5;
      spots.push({ id: 'hub:guide', kind: 'guide', islandId: isl.id, x, z, facing: facingCentre(x, z, isl), blockRadius: 1.1 });
      // Professor Hoot on the other side of the path; the Review Grove further round the island.
      for (const [id, kind, da, r, block] of [
        ['hub:hoot', 'hoot', -0.75, 4.5, 0.9],
        ['hub:review', 'review', 2.3, 5.6, 1.3],
      ] as const) {
        const b = (isl.exitAngle ?? -Math.PI / 2) + da;
        const hx = isl.x + Math.cos(b) * r;
        const hz = isl.z + Math.sin(b) * r;
        spots.push({ id, kind, islandId: isl.id, x: hx, z: hz, facing: facingCentre(hx, hz, isl), blockRadius: block });
      }
      continue;
    }
    const loc = locs.get(isl.locationId!)!;
    const lab = loc.stations.find((s) => s.type.endsWith('_lab'));
    const ringStations = loc.stations.filter((s) => s !== lab);
    if (lab) spots.push({ id: lab.id, kind: 'station', islandId: isl.id, x: isl.x, z: isl.z, facing: (isl.entryAngle ?? 0) + Math.PI / 2, blockRadius: 3.2 });
    else spots.push({ id: `${isl.id}:landmark`, kind: 'landmark', islandId: isl.id, x: isl.x, z: isl.z, facing: 0, blockRadius: 1.8 });

    // Candidate angles around the ring, avoiding bridge entrances.
    const ringR = isl.radius * (lab ? 0.68 : 0.56);
    const want = ringStations.length + 1; // +1 for the source lectern
    const cands: number[] = [];
    const startA = (isl.entryAngle ?? 0) + Math.PI / 2;
    for (let k = 0; k < 16; k++) {
      const a = startA + (k / 16) * Math.PI * 2;
      if (angleFree(a, isl, 0.75)) cands.push(a);
    }
    const step = cands.length / want;
    const chosen = Array.from({ length: want }, (_, k) => cands[Math.floor(k * step)]);
    ringStations.forEach((s, k) => {
      const a = chosen[k];
      const x = isl.x + Math.cos(a) * ringR;
      const z = isl.z + Math.sin(a) * ringR;
      spots.push({ id: s.id, kind: 'station', islandId: isl.id, x, z, facing: facingCentre(x, z, isl), blockRadius: 1.0 });
    });
    const sa = chosen[want - 1];
    const sx = isl.x + Math.cos(sa) * ringR;
    const sz = isl.z + Math.sin(sa) * ringR;
    spots.push({ id: `${isl.id}:source`, kind: 'source', islandId: isl.id, x: sx, z: sz, facing: facingCentre(sx, sz, isl), blockRadius: 0.8 });
  }

  // ---- Decor: deterministic scatter on the outer ring, away from paths and spots ----
  const decor: DecorLayout[] = [];
  const palette: Record<Biome, DecorKind[]> = {
    meadow: ['broadleaf', 'bush_flowering', 'bush', 'grass', 'rocks', 'blossom'],
    forest: ['fir', 'pine', 'fir', 'bush', 'stump', 'grass'],
    autumn: ['blossom', 'broadleaf', 'shrub', 'stump', 'rocks', 'grass'],
    snow: ['fir', 'juniper', 'pine', 'boulder', 'rocks'],
    desert: ['boulder', 'rocks', 'juniper', 'shrub', 'stump'],
    crystal: ['juniper', 'rocks', 'boulder', 'bush', 'pine'],
  };
  const big = new Set<DecorKind>(['fir', 'pine', 'broadleaf', 'blossom', 'juniper']);
  for (const isl of islands) {
    const r = mulberry32(hashString(isl.id));
    const kinds = palette[isl.biome];
    const n = isl.kind === 'hub' ? 9 : 12;
    for (let k = 0, attempts = 0; k < n && attempts < 80; attempts++) {
      const a = r() * Math.PI * 2;
      const d = isl.radius * (0.72 + r() * 0.2);
      const x = isl.x + Math.cos(a) * d;
      const z = isl.z + Math.sin(a) * d;
      const kind = kinds[Math.floor(r() * kinds.length)];
      if (!angleFree(a, isl, 0.45)) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < s.blockRadius + (big.has(kind) ? 3.4 : 2.2))) continue;
      if (decor.some((o) => Math.hypot(o.x - x, o.z - z) < 2.4)) continue;
      const scale = big.has(kind) ? 0.75 + r() * 0.35 : 0.8 + r() * 0.4;
      decor.push({ kind, x, z, rot: r() * Math.PI * 2, scale, blockRadius: big.has(kind) || kind === 'boulder' ? 0.8 * scale : kind === 'grass' ? 0 : 0.5 });
      k++;
    }
  }

  const xs = islands.map((i) => i.x);
  const zs = islands.map((i) => i.z);
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
  const extent = Math.max(...islands.map((i) => Math.hypot(i.x - center.x, i.z - center.z) + i.radius));
  const first = islands[1];
  const spawnFacing = first ? Math.atan2(first.x, first.z) : 0;
  return { islands, bridges, links, spots, decor, spawn: { x: 0, z: 0, facing: spawnFacing }, center, extent };
}

// ---- Collision: the walkable area is the union of island discs and bridge strips, minus obstacles ----
function distToSegment(px: number, pz: number, b: BridgeLayout) {
  const dx = b.bx - b.ax;
  const dz = b.bz - b.az;
  const t = Math.max(0, Math.min(1, ((px - b.ax) * dx + (pz - b.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (b.ax + t * dx), pz - (b.az + t * dz));
}

export function isWalkable(x: number, z: number, L: WorldLayout, bodyRadius = 0.45): boolean {
  const onIsland = L.islands.some((i) => Math.hypot(x - i.x, z - i.z) < i.radius - 0.9);
  const onBridge = L.bridges.some((b) => distToSegment(x, z, b) < BRIDGE_HALF_WIDTH - 0.35);
  if (!onIsland && !onBridge) return false;
  if (L.spots.some((s) => Math.hypot(x - s.x, z - s.z) < s.blockRadius + bodyRadius)) return false;
  if (L.decor.some((d) => d.blockRadius > 0 && Math.hypot(x - d.x, z - d.z) < d.blockRadius + bodyRadius)) return false;
  return true;
}

// Move with wall-sliding: try the full step, then each axis on its own.
export function slideMove(x: number, z: number, dx: number, dz: number, L: WorldLayout): { x: number; z: number } {
  if (isWalkable(x + dx, z + dz, L)) return { x: x + dx, z: z + dz };
  if (isWalkable(x + dx, z, L)) return { x: x + dx, z };
  if (isWalkable(x, z + dz, L)) return { x, z: z + dz };
  return { x, z };
}

// A free standing point next to a spot, on the island-centre side, for "travel to" actions.
export function approachPoint(spot: SpotLayout, L: WorldLayout): { x: number; z: number; facing: number } {
  const isl = L.islands.find((i) => i.id === spot.islandId)!;
  const atCentre = Math.hypot(spot.x - isl.x, spot.z - isl.z) < 0.5;
  // Labs: stand a little to the side of the entrance so the machine stays in view.
  // Ring stations: approach along the ring (tangent), away from the busy island centre.
  const base = atCentre ? (isl.entryAngle ?? Math.PI / 2) + 0.75 : Math.atan2(spot.z - isl.z, spot.x - isl.x) + Math.PI / 2;
  for (let extra = 0; extra < 6; extra++) {
    for (const da of [0, Math.PI, 0.35, Math.PI - 0.35, -0.35, Math.PI + 0.35, 0.8, -0.8]) {
      const a = base + da;
      const d = spot.blockRadius + 1.2 + extra * 0.6;
      const x = spot.x + Math.cos(a) * d;
      const z = spot.z + Math.sin(a) * d;
      if (isWalkable(x, z, L)) return { x, z, facing: Math.atan2(spot.x - x, spot.z - z) };
    }
  }
  return { x: isl.x, z: isl.z + 2, facing: 0 };
}

// Walking route between two points, crossing bridges in order (used by click-to-walk).
export function routeTo(fromX: number, fromZ: number, toX: number, toZ: number, L: WorldLayout): { x: number; z: number }[] {
  const islandAt = (x: number, z: number) => L.islands.find((i) => Math.hypot(x - i.x, z - i.z) < i.radius)?.id;
  const a = islandAt(fromX, fromZ);
  const b = islandAt(toX, toZ);
  if (!a || !b || a === b) return [{ x: toX, z: toZ }];
  // Breadth-first search over the island graph (islands = nodes, bridges = edges).
  const prev = new Map<string, { island: string; bridge: BridgeLayout; forward: boolean }>();
  const queue = [a];
  const seen = new Set([a]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === b) break;
    for (const br of L.bridges) {
      const next = br.from === cur ? br.to : br.to === cur ? br.from : null;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { island: cur, bridge: br, forward: br.from === cur });
      queue.push(next);
    }
  }
  if (!prev.has(b)) return [{ x: toX, z: toZ }];
  const hops: { bridge: BridgeLayout; forward: boolean }[] = [];
  for (let cur = b; cur !== a; ) {
    const p = prev.get(cur)!;
    hops.unshift({ bridge: p.bridge, forward: p.forward });
    cur = p.island;
  }
  const pts: { x: number; z: number }[] = [];
  for (const { bridge: br, forward } of hops) {
    const [s, e] = forward ? [{ x: br.ax, z: br.az }, { x: br.bx, z: br.bz }] : [{ x: br.bx, z: br.bz }, { x: br.ax, z: br.az }];
    pts.push(s, e);
  }
  pts.push({ x: toX, z: toZ });
  return detourAroundObstacles({ x: fromX, z: fromZ }, pts, L);
}

// Insert a waypoint beside any big obstacle (lab machine, monument) that a straight leg would hit.
function detourAroundObstacles(start: { x: number; z: number }, pts: { x: number; z: number }[], L: WorldLayout) {
  const out: { x: number; z: number }[] = [];
  let prev = start;
  for (const p of pts) {
    const dx = p.x - prev.x;
    const dz = p.z - prev.z;
    const len2 = dx * dx + dz * dz || 1;
    for (const sp of L.spots) {
      if (sp.blockRadius < 1.5) continue;
      const t = ((sp.x - prev.x) * dx + (sp.z - prev.z) * dz) / len2;
      if (t <= 0 || t >= 1) continue;
      const cx = prev.x + dx * t;
      const cz = prev.z + dz * t;
      const d = Math.hypot(cx - sp.x, cz - sp.z);
      const clear = sp.blockRadius + 1.3;
      if (d >= clear) continue;
      // push sideways from the obstacle centre, on whichever side the leg already leans
      let nx = cx - sp.x;
      let nz = cz - sp.z;
      if (Math.hypot(nx, nz) < 1e-3) {
        nx = -dz;
        nz = dx;
      }
      const nl = Math.hypot(nx, nz);
      for (const k of [1, -1]) {
        const w = { x: sp.x + (nx / nl) * clear * k, z: sp.z + (nz / nl) * clear * k };
        if (isWalkable(w.x, w.z, L, 0.3)) {
          out.push(w);
          break;
        }
      }
    }
    out.push(p);
    prev = p;
  }
  return out;
}
