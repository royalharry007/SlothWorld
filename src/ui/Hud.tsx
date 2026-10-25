import { useEffect } from 'react';
import { approachPoint } from '../../shared/layout';
import { interact, spotLabel, STATION_NAMES } from '../interact';
import { walkTo } from '../three/Player';
import { dueReviews, findStation, nextStep, useStore, worldTotals } from '../store';
import { Logo } from './Logo';

export function Hud() {
  const world = useStore((s) => s.world);
  const progress = useStore((s) => s.progress);
  const nearSpot = useStore((s) => s.nearSpot);
  const panel = useStore((s) => s.panel);
  const journalOpen = useStore((s) => s.journalOpen);
  const overview = useStore((s) => s.overview);
  const toasts = useStore((s) => s.toasts);
  const { setJournal, setOverview, exitWorld, setPanel } = useStore.getState();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const s = useStore.getState();
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (s.panel?.kind === 'source' && s.panel.from) s.setPanel(s.panel.from);
        else if (s.panel) s.setPanel(null);
        else if (s.journalOpen) s.setJournal(false);
        else if (s.overview) s.setOverview(false);
      } else if (k === 'j') s.setJournal(!s.journalOpen);
      else if (k === 'h') s.setPanel(s.panel?.kind === 'hoot' ? null : { kind: 'hoot' });
      else if (k === 'm') s.setOverview(!s.overview);
      else if ((k === 'e' || (k === 'enter' && t?.tagName !== 'BUTTON')) && s.nearSpot && !s.journalOpen && !s.overview) {
        if (s.panel && s.panel.kind !== 'guide') return;
        e.preventDefault();
        interact(s.nearSpot);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  if (!world) return null;
  const { done, total } = worldTotals(world, progress);
  const showPrompt = nearSpot && !journalOpen && !overview && (!panel || panel.kind === 'guide');

  return (
    <>
      <div className="hud-top">
        <div className="hud-title">
          <Logo size={40} />
          <div className="meta">
            <div className="name" title={world.blueprint.title}>
              {world.blueprint.title}
            </div>
            <div className="progress-line" aria-label={`${done} of ${total} challenges complete`} data-testid="progress">
              <div className="mini-bar">
                <div style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>
              {done}/{total} challenges · {world.blueprint.meta.origin === 'curated' ? 'curated sample' : 'AI-generated'}
            </div>
          </div>
        </div>
        <div className="hud-actions">
          <button className="chip-btn" onClick={() => setPanel(panel?.kind === 'hoot' ? null : { kind: 'hoot' })} aria-pressed={panel?.kind === 'hoot'} data-testid="hoot-btn">
            <span aria-hidden>🦉</span>
            <span className="lbl">Ask Hoot</span> <kbd>H</kbd>
          </button>
          <button className="chip-btn" onClick={() => setPanel(panel?.kind === 'guide' ? null : { kind: 'guide' })} title="World guide">
            <span aria-hidden>ℹ</span>
            <span className="lbl">Guide</span>
          </button>
          <button className="chip-btn" onClick={() => setJournal(!journalOpen)} aria-pressed={journalOpen} data-testid="journal-btn">
            <span aria-hidden>📖</span>
            <span className="lbl">Journal</span> <kbd>J</kbd>
          </button>
          <button className="chip-btn" onClick={() => setOverview(!overview)} aria-pressed={overview} data-testid="map-btn">
            <span aria-hidden>🗺</span>
            <span className="lbl">{overview ? 'Back to sloth' : 'World map'}</span> <kbd>M</kbd>
          </button>
          <button className="chip-btn" onClick={exitWorld} title="Your progress is saved">
            <span aria-hidden>⏏</span>
            <span className="lbl">Exit</span>
          </button>
        </div>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <b>{t.title}</b>
            {t.body && <span>{t.body}</span>}
          </div>
        ))}
      </div>

      {!showPrompt && <NextStep />}

      {showPrompt && (
        <button className="prompt" onClick={() => interact(nearSpot!)} data-testid="interact-prompt">
          <kbd>E</kbd> {spotLabel(nearSpot!)}
        </button>
      )}

      {overview && (
        <div className="prompt" style={{ cursor: 'default' }}>
          Click an island to travel there · <kbd>M</kbd> to return
        </div>
      )}

      {!panel && !journalOpen && !overview && (
        <div className="controls-hint" aria-hidden>
          <span>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> move
          </span>
          <span>drag look</span>
          <span>click walk</span>
          <span>
            <kbd>E</kbd> use
          </span>
          <span>
            <kbd>H</kbd> Hoot
          </span>
        </div>
      )}
    </>
  );
}

// "What should I do next?" Points at the next unfinished challenge and can walk the sloth there.
function NextStep() {
  const world = useStore((s) => s.world);
  const layout = useStore((s) => s.layout);
  const progress = useStore((s) => s.progress);
  const panel = useStore((s) => s.panel);
  const overview = useStore((s) => s.overview);
  if (!world || !layout || overview || (panel && panel.kind !== 'guide')) return null;
  const due = dueReviews(world, progress).length;
  const next = nextStep(world, layout, progress);
  const go = (spotId: string) => {
    const spot = layout.spots.find((sp) => sp.id === spotId);
    if (!spot) return;
    useStore.getState().setPanel(null);
    const p = approachPoint(spot, layout);
    walkTo(p.x, p.z, layout);
  };
  if (due >= 3 || (!next && due > 0))
    return (
      <div className="hud-next">
        <span className="next-chip">
          🏮 <b>{due} ready in the Review Grove</b>
        </span>
        <button className="btn btn-small btn-primary" onClick={() => go('hub:review')} data-testid="next-go">
          Walk me there
        </button>
      </div>
    );
  if (!next)
    return (
      <div className="hud-next">
        <span className="next-chip">🌸 Every challenge solved. Come back later for review.</span>
      </div>
    );
  const st = findStation(world, next.stationId)!;
  return (
    <div className="hud-next" data-testid="next-step">
      <span className="next-chip">
        Next: <b>{STATION_NAMES[st.station.type]}</b> <span className="muted-light">· {next.islandTitle}</span>
      </span>
      <button className="btn btn-small btn-primary" onClick={() => go(next.stationId)} data-testid="next-go">
        Walk me there
      </button>
    </div>
  );
}
