import { useMemo, useRef, useState } from 'react';
import type { SourceRef, Station, Support } from '../../shared/blueprint';
import { sameWord } from '../../shared/activities';
import { seededShuffle } from '../../shared/rand';
import { useStore } from '../store';

type StationOf<T extends Station['type']> = Extract<Station, { type: T }>;

export function SupportBadge({ support, curated }: { support: Support; curated?: boolean }) {
  if (support === 'source') return <span className="badge badge-source">{curated ? 'Grounded in the guide' : 'Supported by the PDF'}</span>;
  if (support === 'interpretation') return <span className="badge badge-interp">AI interpretation · closest passage linked</span>;
  return <span className="badge badge-unsupported">Not found in the PDF</span>;
}

const STATUS_TEXT: Record<SourceRef['status'], string> = {
  verified: 'Quote verified in the PDF',
  curated: 'Curated reference',
  relocated: 'Verified · page number corrected',
  approximate: 'Closest matching passage (model’s quote wasn’t verbatim)',
  unverified: 'Could not be found in the PDF',
};

export function Evidence({ refs, label = 'Evidence' }: { refs: SourceRef[]; label?: string }) {
  const setPanel = useStore((s) => s.setPanel);
  const panel = useStore((s) => s.panel);
  if (!refs.length) return null;
  return (
    <>
      {refs.map((r, i) => {
        const cls = r.status === 'approximate' ? 'approx' : r.status === 'unverified' ? 'unverified' : '';
        const text = r.status === 'unverified' ? r.quote : r.passage ?? r.quote;
        return (
          <div key={i} className={`evidence ${cls}`}>
            <div className="q">“{text}”</div>
            <div className="src">
              <span>
                {label} · {STATUS_TEXT[r.status]}
              </span>
              {r.status !== 'unverified' && (
                <button className="linklike" onClick={() => setPanel({ kind: 'source', page: r.page, passage: r.passage ?? r.quote, from: panel ?? undefined })}>
                  Open page {r.page}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function GroundingNote({ grounded }: { grounded: boolean }) {
  if (grounded) return null;
  return (
    <p className="badge badge-unsupported" style={{ whiteSpace: 'normal' }}>
      The answer to this challenge could not be confirmed from the PDF — treat it with care.
    </p>
  );
}

const LETTERS = 'ABCD';

// In the Review Grove a card starts fresh and reports whether the FIRST attempt was right.
export interface ReviewHooks {
  onResult: (firstTryCorrect: boolean) => void;
}

function useOutcome(id: string, review?: ReviewHooks) {
  const complete = useStore((st) => st.complete);
  const solvedInStore = useStore((st) => !!st.progress.completed[id]);
  const reported = useRef(false);
  const report = (ok: boolean) => {
    if (!review || reported.current) return;
    reported.current = true;
    review.onResult(ok);
  };
  return {
    solved: review ? false : solvedInStore,
    correct: () => (review ? report(true) : complete(id)),
    wrong: () => report(false),
  };
}

const EvidenceAfter = ({ shown, refs }: { shown: boolean; refs: SourceRef[] }) =>
  shown ? <Evidence refs={refs} /> : refs.length ? <p className="small muted">Answer first: the evidence from your PDF appears afterwards.</p> : null;

export function QuizCard({ s, review }: { s: StationOf<'quiz'>; review?: ReviewHooks }) {
  const out = useOutcome(s.id, review);
  const solved = out.solved;
  const [picked, setPicked] = useState<number | null>(solved ? s.correctIndex : null);
  const [wrong, setWrong] = useState<number[]>([]);
  const right = picked === s.correctIndex;
  return (
    <div>
      <p className="lead">{s.prompt}</p>
      <div className="options" role="group" aria-label="Answer options">
        {s.options.map((o, i) => (
          <button
            key={i}
            className={`option${right && i === s.correctIndex ? ' correct' : ''}${wrong.includes(i) ? ' wrong' : ''}`}
            disabled={right || wrong.includes(i)}
            onClick={() => {
              setPicked(i);
              if (i === s.correctIndex) out.correct();
              else {
                out.wrong();
                setWrong((w) => [...w, i]);
              }
            }}
          >
            <span className="letter">{LETTERS[i]}</span>
            <span>{o}</span>
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className={`feedback ${right ? 'good' : 'bad'}`} aria-live="polite">
          <b>{right ? 'Correct!' : 'Not quite — try another answer.'}</b>
          {right ? s.explanation : wrong.length >= 2 ? `Hint: ${s.explanation.split('. ')[0]}.` : 'Check the evidence below, then try again.'}
        </div>
      )}
      <GroundingNote grounded={s.grounded} />
      <EvidenceAfter shown={picked !== null} refs={s.sourceRefs} />
    </div>
  );
}

export function ClaimCard({ s, review }: { s: StationOf<'claim_check'>; review?: ReviewHooks }) {
  const out = useOutcome(s.id, review);
  const [answer, setAnswer] = useState<boolean | null>(out.solved ? s.supported : null);
  const right = answer === s.supported;
  return (
    <div>
      <p className="muted">Does the source support this claim?</p>
      <div className="claim">“{s.claim}”</div>
      <div className="two">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            className={`option${answer === v ? (right ? ' correct' : ' wrong') : ''}`}
            disabled={right}
            onClick={() => {
              setAnswer(v);
              if (v === s.supported) out.correct();
              else out.wrong();
            }}
          >
            <span className="letter">{v ? '✓' : '✕'}</span>
            <span>{v ? 'Supported' : 'Not supported'}</span>
          </button>
        ))}
      </div>
      {answer !== null && (
        <div className={`feedback ${right ? 'good' : 'bad'}`} aria-live="polite">
          <b>{right ? 'Well weighed!' : 'Look again — the evidence says otherwise.'}</b>
          {right ? s.explanation : 'Read the passage below and try the other side of the scale.'}
        </div>
      )}
      <GroundingNote grounded={s.grounded} />
      <EvidenceAfter shown={answer !== null} refs={s.sourceRefs} />
    </div>
  );
}

export function OrderingCard({ s }: { s: StationOf<'ordering'> }) {
  const complete = useStore((st) => st.complete);
  const solved = useStore((st) => !!st.progress.completed[s.id]);
  const initial = useMemo(() => {
    if (solved) return s.items.map((_, i) => i);
    let order = seededShuffle(s.items.map((_, i) => i), s.id);
    if (order.every((v, i) => v === i)) order = [...order.slice(1), order[0]];
    return order;
  }, [s, solved]);
  const [order, setOrder] = useState(initial);
  const [checked, setChecked] = useState(solved);
  const allRight = order.every((v, i) => v === i);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const n = order.slice();
    [n[i], n[j]] = [n[j], n[i]];
    setOrder(n);
    setChecked(false);
  };
  return (
    <div>
      <p className="lead">{s.prompt}</p>
      <p className="muted small">Use the arrows to put the steps in order, then check.</p>
      <ol className="order-list">
        {order.map((itemIdx, pos) => (
          <li key={itemIdx} className={checked ? (itemIdx === pos ? 'ok' : 'no') : ''}>
            <span className="num">{pos + 1}</span>
            <span className="txt">{s.items[itemIdx]}</span>
            <button className="icon-btn" aria-label={`Move “${s.items[itemIdx]}” up`} disabled={pos === 0 || (checked && allRight)} onClick={() => move(pos, -1)}>
              ▲
            </button>
            <button className="icon-btn" aria-label={`Move “${s.items[itemIdx]}” down`} disabled={pos === order.length - 1 || (checked && allRight)} onClick={() => move(pos, 1)}>
              ▼
            </button>
          </li>
        ))}
      </ol>
      {!(checked && allRight) && (
        <button
          className="btn btn-primary btn-small"
          onClick={() => {
            setChecked(true);
            if (allRight) complete(s.id);
          }}
        >
          Check order
        </button>
      )}
      {checked && (
        <div className={`feedback ${allRight ? 'good' : 'bad'}`} aria-live="polite">
          <b>{allRight ? 'Perfect sequence!' : `${order.filter((v, i) => v === i).length} of ${order.length} in the right place.`}</b>
          {allRight ? s.explanation : 'Green steps are placed correctly. Move the red ones and check again.'}
        </div>
      )}
      <GroundingNote grounded={s.grounded} />
      <Evidence refs={s.sourceRefs} />
    </div>
  );
}

export function MatchingCard({ s }: { s: StationOf<'matching'> }) {
  const complete = useStore((st) => st.complete);
  const solved = useStore((st) => !!st.progress.completed[s.id]);
  const defs = useMemo(() => seededShuffle(s.pairs.map((_, i) => i), s.id + ':defs'), [s]);
  const [pairs, setPairs] = useState<Record<number, number>>(() => (solved ? Object.fromEntries(s.pairs.map((_, i) => [i, i])) : {}));
  const [sel, setSel] = useState<number | null>(null);
  const [checked, setChecked] = useState(solved);
  const complete_ = Object.keys(pairs).length === s.pairs.length;
  const allRight = complete_ && s.pairs.every((_, i) => pairs[i] === i);
  const termFor = (d: number) => Object.entries(pairs).find(([, v]) => v === d)?.[0];
  return (
    <div>
      <p className="lead">{s.prompt}</p>
      <p className="muted small">Pick a concept, then pick its description.</p>
      <div className="match-grid">
        <div className="match-col">
          {s.pairs.map((p, i) => (
            <button
              key={i}
              className={`match-item${sel === i ? ' sel' : ''}${pairs[i] !== undefined ? (checked ? (pairs[i] === i ? ' ok' : ' no') : ' paired') : ''}`}
              disabled={checked && allRight}
              onClick={() => {
                setSel(i);
                setChecked(false);
              }}
            >
              <b>{p.term}</b>
            </button>
          ))}
        </div>
        <div className="match-col">
          {defs.map((d) => {
            const t = termFor(d);
            return (
              <button
                key={d}
                className={`match-item${t !== undefined ? (checked ? (Number(t) === d ? ' ok' : ' no') : ' paired') : ''}`}
                disabled={sel === null || (checked && allRight)}
                onClick={() => {
                  if (sel === null) return;
                  const n = { ...pairs };
                  for (const k of Object.keys(n)) if (n[Number(k)] === d) delete n[Number(k)];
                  n[sel] = d;
                  setPairs(n);
                  setSel(null);
                  setChecked(false);
                }}
              >
                {t !== undefined && <span className="tag">{s.pairs[Number(t)].term}</span>}
                {s.pairs[d].definition}
              </button>
            );
          })}
        </div>
      </div>
      {!(checked && allRight) && (
        <button
          className="btn btn-primary btn-small"
          disabled={!complete_}
          onClick={() => {
            setChecked(true);
            if (allRight) complete(s.id);
          }}
        >
          Check pairs
        </button>
      )}
      {checked && (
        <div className={`feedback ${allRight ? 'good' : 'bad'}`} aria-live="polite">
          <b>{allRight ? 'All matched!' : 'Some pairs are crossed.'}</b>
          {allRight ? s.explanation : 'Red pairs are wrong — re-pair them and check again.'}
        </div>
      )}
      <GroundingNote grounded={s.grounded} />
    </div>
  );
}

// Word Bridge: fill the key terms back into a real sentence from the PDF.
export function ClozeCard({ s, review }: { s: StationOf<'cloze'>; review?: ReviewHooks }) {
  const out = useOutcome(s.id, review);
  const [filled, setFilled] = useState<(string | null)[]>(() => (out.solved ? s.blanks.map((b) => b.answer) : s.blanks.map(() => null)));
  const [active, setActive] = useState(0);
  const [checked, setChecked] = useState(out.solved);
  const okAt = (i: number) => !!filled[i] && sameWord(filled[i]!, s.blanks[i].answer);
  const allRight = s.blanks.every((_, i) => okAt(i));
  const done = checked && allRight;

  const place = (word: string) => {
    if (done) return;
    const n = filled.slice();
    const target = n[active] === null ? active : n.findIndex((x) => x === null);
    const at = target < 0 ? active : target;
    n[at] = word;
    setFilled(n);
    setChecked(false);
    const nextEmpty = n.findIndex((x) => x === null);
    if (nextEmpty >= 0) setActive(nextEmpty);
  };

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  s.blanks.forEach((b, i) => {
    parts.push(<span key={`t${i}`}>{s.sentence.slice(cursor, b.start)}</span>);
    const state = checked ? (okAt(i) ? ' ok' : ' no') : active === i && !done ? ' sel' : '';
    parts.push(
      <button
        key={`b${i}`}
        className={`blank${state}`}
        aria-label={filled[i] ? `Blank ${i + 1}: ${filled[i]} (click to clear)` : `Blank ${i + 1}, empty`}
        disabled={done}
        onClick={() => {
          if (filled[i]) {
            const n = filled.slice();
            n[i] = null;
            setFilled(n);
            setChecked(false);
          }
          setActive(i);
        }}
      >
        {filled[i] ?? ' '.repeat(Math.max(6, b.answer.length))}
      </button>,
    );
    cursor = b.end;
  });
  parts.push(<span key="end">{s.sentence.slice(cursor)}</span>);

  return (
    <div>
      <p className="muted">This sentence is straight from your PDF. Put the missing words back.</p>
      <div className="cloze-sentence">{parts}</div>
      <div className="bank" role="group" aria-label="Word bank">
        {s.bank.map((w) => (
          <button key={w} className="chip" disabled={done || filled.includes(w)} onClick={() => place(w)}>
            {w}
          </button>
        ))}
      </div>
      {!done && (
        <button
          className="btn btn-primary btn-small"
          disabled={filled.some((x) => x === null)}
          onClick={() => {
            setChecked(true);
            if (allRight) out.correct();
            else out.wrong();
          }}
        >
          Check words
        </button>
      )}
      {checked && (
        <div className={`feedback ${allRight ? 'good' : 'bad'}`} aria-live="polite">
          <b>{allRight ? 'The bridge holds!' : 'A plank is loose.'}</b>
          {allRight ? 'Those are the exact words your PDF uses.' : 'Red words don’t fit. Click one to clear it and try another.'}
        </div>
      )}
      <EvidenceAfter shown={checked} refs={s.sourceRefs} />
    </div>
  );
}
