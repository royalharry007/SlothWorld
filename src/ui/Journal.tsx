import { useStore, worldTotals } from '../store';
import { STATION_NAMES } from '../interact';
import { SupportBadge } from './stations';

// A non-3D way to see and navigate the whole world: concept map + island list.
export function Journal() {
  const world = useStore((s) => s.world);
  const layout = useStore((s) => s.layout);
  const progress = useStore((s) => s.progress);
  const setJournal = useStore((s) => s.setJournal);
  const travelTo = useStore((s) => s.travelTo);
  const setPanel = useStore((s) => s.setPanel);
  if (!world || !layout) return null;
  const bp = world.blueprint;
  const { done, total } = worldTotals(world, progress);

  // Fit the island layout into the SVG.
  const xs = layout.islands.map((i) => i.x);
  const zs = layout.islands.map((i) => i.z);
  const pad = 14;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minZ = Math.min(...zs) - pad;
  const maxZ = Math.max(...zs) + pad;
  const W = 520;
  const H = 230;
  const k = Math.min(W / (maxX - minX), H / (maxZ - minZ));
  const ox = (W - (maxX - minX) * k) / 2;
  const oz = (H - (maxZ - minZ) * k) / 2;
  const P = (x: number, z: number) => [ox + (x - minX) * k, oz + (z - minZ) * k] as const;
  const isl = new Map(layout.islands.map((i) => [i.id, i]));

  const go = (islandId: string) => {
    const spot = islandId === 'hub' ? layout.spots.find((s) => s.id === 'hub:guide') : layout.spots.find((s) => s.islandId === islandId && (s.kind === 'landmark' || s.blockRadius > 2));
    if (spot) travelTo(spot.id);
  };

  return (
    <aside className="journal" aria-label="Journal and world map" data-testid="journal">
      <div className="panel-head">
        <div style={{ minWidth: 0 }}>
          <div className="kicker">
            Journal · {done}/{total} challenges
          </div>
          <h2>{bp.title}</h2>
        </div>
        <button className="close" onClick={() => setJournal(false)} aria-label="Close journal (Esc)">
          ✕
        </button>
      </div>
      <div className="panel-body">
        <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Concept map. Islands are concepts; solid lines are walkable bridges, dashed lines are other relationships.">
          {layout.links.map((l) => {
            const a = isl.get(l.from)!;
            const b = isl.get(l.to)!;
            const [x1, y1] = P(a.x, a.z);
            const [x2, y2] = P(b.x, b.z);
            return <line key={l.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1fa99f" strokeWidth={2} strokeDasharray="5 5" />;
          })}
          {layout.bridges.map((b) => {
            const [x1, y1] = P(isl.get(b.from)!.x, isl.get(b.from)!.z);
            const [x2, y2] = P(isl.get(b.to)!.x, isl.get(b.to)!.z);
            return <line key={b.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8a5a3b" strokeWidth={4} strokeLinecap="round" />;
          })}
          {layout.islands.map((i) => {
            const [cx, cy] = P(i.x, i.z);
            const loc = bp.locations.find((l) => l.id === i.locationId);
            const finished = loc ? loc.stations.every((s) => progress.completed[s.id]) : false;
            const visited = loc ? !!progress.visited[loc.id] : true;
            const r = Math.max(10, i.radius * k * 0.75);
            const name = i.kind === 'hub' ? 'Start' : bp.concepts.find((c) => c.id === loc?.conceptId)?.name ?? '';
            return (
              <g key={i.id} className="node" onClick={() => go(i.id)} role="button" tabIndex={0} aria-label={`Travel to ${name}`} onKeyDown={(e) => e.key === 'Enter' && go(i.id)}>
                <circle className="body" cx={cx} cy={cy} r={r} fill={finished ? '#9fe0b0' : visited ? '#ffe3b8' : '#fff'} stroke="#1f2a3a" strokeOpacity={0.25} strokeWidth={1.5} />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1f2a3a">
                  {i.kind === 'hub' ? '★' : i.order}
                </text>
                <text x={cx} y={i.order % 2 ? cy + r + 13 : cy - r - 6} textAnchor="middle" fontSize={11} fill="#1f2a3a">
                  {name.length > 22 ? name.slice(0, 21) + '…' : name}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Click an island to travel there. Solid = walkable bridge, dashed = related idea. Green = all challenges solved.
        </p>
        <ul className="isle-list">
          {layout.islands
            .filter((i) => i.kind === 'concept')
            .map((i) => {
              const loc = bp.locations.find((l) => l.id === i.locationId)!;
              const c = bp.concepts.find((x) => x.id === loc.conceptId)!;
              const solved = loc.stations.filter((s) => progress.completed[s.id]).length;
              return (
                <li key={i.id} className="isle-card">
                  <div className="row">
                    <span className="t">
                      {i.order}. {c.name}
                    </span>
                    <SupportBadge support={c.support} curated={bp.meta.origin === 'curated'} />
                    {solved === loc.stations.length && <span className="badge badge-done">Complete</span>}
                  </div>
                  <div className="s">{c.summary}</div>
                  <div className="small muted" style={{ marginBottom: 8 }}>
                    {loc.stations.map((s) => `${progress.completed[s.id] ? '✓ ' : ''}${STATION_NAMES[s.type]}`).join(' · ')}
                    {c.sourceRefs[0] && ` · p. ${[...new Set(c.sourceRefs.map((r) => r.page))].join(', ')}`}
                  </div>
                  <div className="acts">
                    <button className="btn btn-small btn-primary" onClick={() => go(i.id)}>
                      Travel here
                    </button>
                    <button className="btn btn-small btn-secondary" onClick={() => setPanel({ kind: 'concept', islandId: loc.id })}>
                      Read concept
                    </button>
                  </div>
                </li>
              );
            })}
        </ul>
        {bp.meta.warnings.length > 0 && (
          <details className="report">
            <summary>Validation report ({bp.meta.warnings.length} notes)</summary>
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              What SlothWorld repaired or flagged while checking the model’s blueprint against the PDF:
            </p>
            <ul className="warn-list">
              {bp.meta.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </aside>
  );
}
