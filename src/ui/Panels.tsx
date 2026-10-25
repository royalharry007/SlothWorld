import { useEffect, useMemo, useRef } from 'react';
import type { Concept, Location, World } from '../../shared/blueprint';
import { normalize } from '../../shared/grounding';
import { STATION_NAMES } from '../interact';
import { findStation, useStore, worldTotals } from '../store';
import { LossLabPanel, NetworkLabPanel, NeuronLabPanel } from './labs';
import { ClaimCard, ClozeCard, Evidence, MatchingCard, OrderingCard, QuizCard, SupportBadge } from './stations';
import { HootPanelBody, ReviewPanelBody, TeachCard } from './tutors';

function Shell({ kicker, title, children, foot, onClose }: { kicker: React.ReactNode; title: string; children: React.ReactNode; foot?: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.panel-body')?.scrollTo(0, 0);
  }, [title]);
  return (
    <aside className="panel" ref={ref} aria-label={title} data-testid="panel">
      <div className="panel-head">
        <div style={{ minWidth: 0 }}>
          <div className="kicker">{kicker}</div>
          <h2>{title}</h2>
        </div>
        <button className="close" onClick={onClose} aria-label="Close panel (Esc)">
          ✕
        </button>
      </div>
      <div className="panel-body">{children}</div>
      {foot && <div className="panel-foot">{foot}</div>}
    </aside>
  );
}

const originBadge = (w: World) =>
  w.blueprint.meta.origin === 'curated' ? <span className="badge badge-curated">Curated sample · hand-written</span> : <span className="badge badge-ai">AI-generated · {w.blueprint.meta.model}</span>;

function GuidePanel({ world }: { world: World }) {
  const setPanel = useStore((s) => s.setPanel);
  const setJournal = useStore((s) => s.setJournal);
  const travelTo = useStore((s) => s.travelTo);
  const layout = useStore((s) => s.layout);
  const bp = world.blueprint;
  const firstIsland = layout?.islands[1];
  const firstSpot = firstIsland && layout?.spots.find((s) => s.islandId === firstIsland.id && (s.kind === 'landmark' || s.blockRadius > 2));
  return (
    <Shell kicker={originBadge(world)} title={bp.title} onClose={() => setPanel(null)}
      foot={
        <>
          <button className="btn btn-primary btn-small" onClick={() => setPanel(null)} data-testid="start-exploring">
            Start exploring
          </button>
          {firstSpot && (
            <button className="btn btn-secondary btn-small" onClick={() => { setPanel(null); travelTo(firstSpot.id); }}>
              Jump to island 1
            </button>
          )}
          <button className="btn btn-ghost btn-small" onClick={() => setJournal(true)}>
            Open journal
          </button>
        </>
      }
    >
      <p className="lead">{bp.summary}</p>
      {bp.meta.origin === 'curated' ? (
        <p className="small muted">
          This sample world was written by hand for the demo — it is <b>not</b> AI-generated. Its quotes come from the 4-page guide “{world.source.name}”, and every number in the labs is computed live.
        </p>
      ) : (
        <p className="small muted">
          Generated from <b>{bp.meta.sourceName}</b> ({bp.meta.pageCount} pages) by {bp.meta.model} running via {bp.meta.runtime}. Explanations are the model’s; quotes were checked against the PDF and flagged where they didn’t match.
        </p>
      )}
      <h3>You will learn to…</h3>
      <ul>
        {bp.objectives.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ul>
      <h3>How to play</h3>
      <p className="small">
        Walk with <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> or the arrow keys (or click the ground). Drag to look around, scroll to zoom. Walk up to a glowing object and press <kbd>E</kbd>. Open the journal with <kbd>J</kbd> to
        jump straight to any island without walking.
      </p>
      <p className="small">
        <b>Meet the cast.</b> On every island, <b>Pip</b> the baby sloth wants you to explain the idea in your own words. Teaching is the best test of understanding. Stuck? Press{' '}
        <kbd>H</kbd> to ask <b>Professor Hoot</b>, who answers only from your PDF. Solved challenges grow into the <b>Review Grove</b> on this island and come back for spaced
        recall.
      </p>
      <p className="small">
        <b>Slow and steady.</b> Nothing here is timed. A wrong answer just means “look again”, with a hint after a couple of tries. Leave whenever you like: your progress is saved.
      </p>
      {bp.uncertainties.length > 0 && (
        <>
          <h3>What the source leaves unclear</h3>
          <ul className="warn-list">
            {bp.uncertainties.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </>
      )}
    </Shell>
  );
}

function relatedOf(concept: Concept, world: World) {
  return world.blueprint.relationships
    .filter((r) => r.from === concept.id || r.to === concept.id)
    .map((r) => {
      const otherId = r.from === concept.id ? r.to : r.from;
      const other = world.blueprint.concepts.find((c) => c.id === otherId);
      return other ? { other, label: r.label, dir: r.from === concept.id ? '→' : '←' } : null;
    })
    .filter(Boolean) as { other: Concept; label: string; dir: string }[];
}

function ConceptPanel({ world, loc }: { world: World; loc: Location }) {
  const setPanel = useStore((s) => s.setPanel);
  const travelTo = useStore((s) => s.travelTo);
  const completed = useStore((s) => s.progress.completed);
  const concept = world.blueprint.concepts.find((c) => c.id === loc.conceptId)!;
  const curated = world.blueprint.meta.origin === 'curated';
  return (
    <Shell kicker={<>{loc.title} <SupportBadge support={concept.support} curated={curated} /></>} title={concept.name} onClose={() => setPanel(null)}>
      <div className="objective">
        <b>Objective:</b> {loc.objective}
        <div className="small muted">{loc.purpose}</div>
      </div>
      <p className="lead">{concept.summary}</p>
      <h3>{curated ? 'Explanation' : 'Explanation (written by the model)'}</h3>
      <p>{concept.explanation}</p>
      {concept.beyondSource && (
        <div className="beyond">
          <span className="k">Beyond the source</span>
          {concept.beyondSource}
        </div>
      )}
      <h3>From the source</h3>
      {concept.sourceRefs.length ? <Evidence refs={concept.sourceRefs} label="Source" /> : <p className="small muted">No supporting passage was provided.</p>}
      {concept.support === 'unsupported' && <p className="badge badge-unsupported" style={{ whiteSpace: 'normal' }}>SlothWorld couldn’t find this concept’s quote in the PDF. Treat this island as the model’s interpretation.</p>}
      <h3>Challenges on this island</h3>
      <ul className="goals">
        {loc.stations.map((s) => (
          <li key={s.id} className={completed[s.id] ? 'met' : ''}>
            <span className="tick">{completed[s.id] ? '✓' : ''}</span>
            <span style={{ flex: 1 }}>{STATION_NAMES[s.type]}</span>
            <button className="btn btn-small btn-secondary" onClick={() => { travelTo(s.id); setPanel({ kind: 'station', stationId: s.id }); }}>
              Go
            </button>
          </li>
        ))}
      </ul>
      {relatedOf(concept, world).length > 0 && (
        <>
          <h3>Connected ideas</h3>
          <ul className="small">
            {relatedOf(concept, world).map((r, i) => (
              <li key={i}>
                {r.dir === '→' ? `${concept.name} → ${r.label} → ${r.other.name}` : `${r.other.name} → ${r.label} → ${concept.name}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </Shell>
  );
}

function StationPanel({ world, stationId }: { world: World; stationId: string }) {
  const setPanel = useStore((s) => s.setPanel);
  const done = useStore((s) => !!s.progress.completed[stationId]);
  const found = findStation(world, stationId);
  if (!found) return null;
  const { station, location } = found;
  let body: React.ReactNode;
  switch (station.type) {
    case 'quiz':
      body = <QuizCard s={station} />;
      break;
    case 'claim_check':
      body = <ClaimCard s={station} />;
      break;
    case 'ordering':
      body = <OrderingCard s={station} />;
      break;
    case 'matching':
      body = <MatchingCard s={station} />;
      break;
    case 'cloze':
      body = <ClozeCard s={station} />;
      break;
    case 'teach_back':
      body = <TeachCard s={station} />;
      break;
    case 'neuron_lab':
      body = <NeuronLabPanel />;
      break;
    case 'network_lab':
      body = <NetworkLabPanel />;
      break;
    case 'loss_lab':
      body = <LossLabPanel />;
      break;
  }
  const isLab = station.type.endsWith('_lab');
  return (
    <Shell
      kicker={<>{location.title} {done && <span className="badge badge-done">Solved</span>}</>}
      title={STATION_NAMES[station.type]}
      onClose={() => setPanel(null)}
      foot={
        <>
          <button className="btn btn-ghost btn-small" onClick={() => setPanel({ kind: 'concept', islandId: location.id })}>
            About this island’s concept
          </button>
          {isLab && station.sourceRefs[0] && (
            <button className="btn btn-ghost btn-small" onClick={() => setPanel({ kind: 'source', page: station.sourceRefs[0].page, passage: station.sourceRefs[0].passage, from: { kind: 'station', stationId } })}>
              Source p. {station.sourceRefs[0].page}
            </button>
          )}
        </>
      }
    >
      {body}
    </Shell>
  );
}

// Highlights a passage inside the extracted page text using plain text nodes (no HTML injection).
function highlight(text: string, passage?: string): React.ReactNode {
  if (!passage) return text;
  const p = passage.replace(/…$/, '').trim();
  let idx = text.indexOf(p);
  let len = p.length;
  if (idx < 0) {
    // whitespace-insensitive search
    const flat = text.replace(/\s+/g, ' ');
    const pf = p.replace(/\s+/g, ' ');
    const fi = flat.indexOf(pf);
    if (fi >= 0) {
      // map flat index back to original text
      let o = 0;
      let f = 0;
      while (f < fi && o < text.length) {
        if (/\s/.test(text[o])) {
          while (o < text.length && /\s/.test(text[o])) o++;
          f++;
        } else {
          o++;
          f++;
        }
      }
      idx = o;
      let e = o;
      let k = 0;
      while (k < pf.length && e < text.length) {
        if (/\s/.test(text[e])) {
          while (e < text.length && /\s/.test(text[e])) e++;
          k++;
        } else {
          e++;
          k++;
        }
      }
      len = e - o;
    }
  }
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + len)}</mark>
      {text.slice(idx + len)}
    </>
  );
}

function SourcePanel({ world, page, passage, from }: { world: World; page: number; passage?: string; from?: NonNullable<ReturnType<typeof useStore.getState>['panel']> }) {
  const setPanel = useStore((s) => s.setPanel);
  const pdfUrl = useStore((s) => s.pdfUrl);
  const pages = world.source.pages;
  const p = pages.find((x) => x.page === page) ?? pages[0];
  const idx = pages.indexOf(p);
  const found = useMemo(() => !!passage && normalize(p.text).includes(normalize(passage.replace(/…$/, '')).slice(0, 60)), [p, passage]);
  const go = (n: number) => setPanel({ kind: 'source', page: pages[n].page, passage, from });
  return (
    <Shell
      kicker={<>Source · {world.source.name}</>}
      title={`Page ${p.page} of ${pages[pages.length - 1]?.page ?? pages.length}`}
      onClose={() => setPanel(from ?? null)}
      foot={
        <>
          <div className="page-nav">
            <button className="btn btn-secondary btn-small" disabled={idx <= 0} onClick={() => go(idx - 1)}>
              ← Prev
            </button>
            <button className="btn btn-secondary btn-small" disabled={idx >= pages.length - 1} onClick={() => go(idx + 1)}>
              Next →
            </button>
          </div>
          {pdfUrl && (
            <a className="btn btn-teal btn-small" href={`${pdfUrl}#page=${p.page}`} target="_blank" rel="noreferrer">
              Open the original PDF at p. {p.page}
            </a>
          )}
          {from && (
            <button className="btn btn-ghost btn-small" onClick={() => setPanel(from)}>
              Back
            </button>
          )}
        </>
      }
    >
      <p className="small muted">
        Text extracted from the PDF{passage && found ? '; the cited passage is highlighted.' : '.'} {!pdfUrl && 'The original file isn’t kept between sessions, so only the extracted text is shown.'}
      </p>
      <div className="page-text" data-testid="page-text">
        {highlight(p.text, found ? passage : undefined)}
      </div>
    </Shell>
  );
}

export function Panels() {
  const world = useStore((s) => s.world);
  const panel = useStore((s) => s.panel);
  if (!world || !panel) return null;
  if (panel.kind === 'guide') return <GuidePanel world={world} />;
  if (panel.kind === 'hoot')
    return (
      <Shell kicker={<>Professor Hoot · answers only from your PDF</>} title="Ask Professor Hoot" onClose={() => useStore.getState().setPanel(null)}>
        <HootPanelBody />
      </Shell>
    );
  if (panel.kind === 'review')
    return (
      <Shell kicker={<>Start island · spaced review</>} title="The Review Grove" onClose={() => useStore.getState().setPanel(null)}>
        <ReviewPanelBody />
      </Shell>
    );
  if (panel.kind === 'station') return <StationPanel key={panel.stationId} world={world} stationId={panel.stationId} />;
  if (panel.kind === 'source') return <SourcePanel world={world} page={panel.page} passage={panel.passage} from={panel.from ?? undefined} />;
  if (panel.kind === 'concept') {
    const loc = world.blueprint.locations.find((l) => l.id === panel.islandId);
    return loc ? <ConceptPanel world={world} loc={loc} /> : null;
  }
  return null;
}

export { worldTotals };
