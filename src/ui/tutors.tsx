import { useEffect, useMemo, useRef, useState } from 'react';
import type { Station } from '../../shared/blueprint';
import { findPassages, relevantPages } from '../../shared/grounding';
import { askHoot, isTutorError, teachPip, type HootReply } from '../api';
import { dueReviews, findStation, nextReviewAt, REVIEW_LADDER, useStore } from '../store';
import { Evidence, ClaimCard, ClozeCard, QuizCard } from './stations';

type TeachStation = Extract<Station, { type: 'teach_back' }>;

// Pip needs every key idea (or all but one when there are four).
const needed = (n: number) => (n <= 3 ? n : n - 1);

function Avatar({ who }: { who: 'pip' | 'hoot' | 'you' }) {
  if (who === 'you') return <span className="avatar you">You</span>;
  return <span className={`avatar ${who}`} aria-hidden>{who === 'pip' ? '🦥' : '🦉'}</span>;
}

// ---------------- Teach Pip (learning by teaching) ----------------

export function TeachCard({ s }: { s: TeachStation }) {
  const complete = useStore((st) => st.complete);
  const solved = useStore((st) => !!st.progress.completed[s.id]);
  const setPanel = useStore((st) => st.setPanel);
  const panel = useStore((st) => st.panel);
  const [text, setText] = useState('');
  const [thread, setThread] = useState<{ who: 'you' | 'pip'; text: string; note?: string }[]>([
    { who: 'pip', text: `Hi! I keep hearing about “${s.conceptName}” but I don’t get it. Can you explain it to me in your own words?` },
  ]);
  const [covered, setCovered] = useState<Set<number>>(() => (solved ? new Set(s.keyPoints.map((_, i) => i)) : new Set()));
  const [attempts, setAttempts] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [selfCheck, setSelfCheck] = useState<string | null>(null); // reason, when no model is available
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [revealed, setRevealed] = useState(solved);
  const end = useRef<HTMLDivElement>(null);
  const goal = needed(s.keyPoints.length);
  const done = solved || covered.size >= goal;

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [thread, thinking]);

  const send = async () => {
    const explanation = text.trim();
    if (!explanation || thinking) return;
    setThread((t) => [...t, { who: 'you', text: explanation }]);
    setText('');
    if (selfCheck) return;
    setThinking(true);
    const r = await teachPip({ conceptName: s.conceptName, keyPoints: s.keyPoints.map((k) => k.text), explanation, attempt: attempts + 1 });
    setThinking(false);
    setAttempts((a) => a + 1);
    if (isTutorError(r)) {
      setSelfCheck(r.error === 'RATE_LIMITED' ? r.message : 'Pip is napping right now (the language model isn’t available), so you can check your explanation yourself.');
      return;
    }
    const merged = new Set([...covered, ...r.covered]);
    setCovered(merged);
    setThread((t) => [...t, { who: 'pip', text: r.reply, note: r.misconception ? `Pip is puzzled: ${r.misconception}` : undefined }]);
    if (merged.size >= goal) complete(s.id);
  };

  return (
    <div>
      <p className="muted small">
        Explaining something in your own words is one of the best ways to learn it. Pip only knows the key ideas from your PDF, and will tell you which ones came across.
      </p>
      <div className="thread" aria-live="polite">
        {thread.map((m, i) => (
          <div key={i} className={`msg ${m.who}`}>
            <Avatar who={m.who} />
            <div className="bubble">
              {m.text}
              {m.note && <div className="note">{m.note}</div>}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="msg pip pending">
            <Avatar who="pip" />
            <div className="bubble thinking">
              <span className="spinner" /> Pip is thinking slowly and carefully…
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {!done && (
        <div className="composer">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
            }}
            placeholder={attempts ? 'Answer Pip’s question, or add what you missed…' : `Explain ${s.conceptName} like you would to a friend…`}
            rows={3}
            aria-label="Your explanation for Pip"
            data-testid="teach-input"
          />
          <button className="btn btn-primary btn-small" disabled={thinking || text.trim().length < 2} onClick={send} data-testid="teach-send">
            Teach Pip
          </button>
        </div>
      )}

      <div className="ideas">
        <div className="ideas-head">
          <b>
            Pip understood {selfCheck ? ticked.size : covered.size} of {s.keyPoints.length} key ideas
          </b>
          <span className="dots">
            {s.keyPoints.map((_, i) => (
              <span key={i} className={`dot-idea${(selfCheck ? ticked : covered).has(i) ? ' on' : ''}`} />
            ))}
          </span>
        </div>
        {selfCheck && (
          <div className="hint-box" style={{ margin: '8px 0' }}>
            {selfCheck} Tick each idea your explanation really included.
          </div>
        )}
        <ul className="goals">
          {s.keyPoints.map((k, i) => {
            const isCovered = covered.has(i);
            const show = isCovered || revealed || !!selfCheck;
            return (
              <li key={i} className={(selfCheck ? ticked : covered).has(i) ? 'met' : ''}>
                {selfCheck ? (
                  <input
                    type="checkbox"
                    aria-label={`I explained idea ${i + 1}`}
                    checked={ticked.has(i)}
                    disabled={thread.filter((m) => m.who === 'you').length === 0}
                    onChange={(e) => {
                      const n = new Set(ticked);
                      if (e.target.checked) n.add(i);
                      else n.delete(i);
                      setTicked(n);
                      if (n.size >= goal) complete(s.id);
                    }}
                  />
                ) : (
                  <span className="tick">{isCovered ? '✓' : ''}</span>
                )}
                <span style={{ flex: 1 }}>
                  {show ? (
                    <>
                      “{k.text}”{' '}
                      <button className="linklike" onClick={() => setPanel({ kind: 'source', page: k.page, passage: k.text, from: panel ?? undefined })}>
                        p. {k.page}
                      </button>
                    </>
                  ) : (
                    <span className="muted">Hidden idea {i + 1}: explain more to uncover it</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {!selfCheck && !revealed && !done && attempts >= 2 && (
          <button className="btn btn-ghost btn-small" onClick={() => setRevealed(true)}>
            Show me what I missed
          </button>
        )}
      </div>
      {done && (
        <div className="feedback good">
          <b>Pip gets it now. So do you!</b>
          Teaching something is the strongest proof you understand it.
        </div>
      )}
    </div>
  );
}

// ---------------- Professor Hoot (questions answered only from the PDF) ----------------

interface HootEntry {
  q: string;
  passages: { page: number; text: string }[];
  state: 'thinking' | 'done' | 'offline';
  reply?: HootReply;
  note?: string;
}

export function HootPanelBody() {
  const world = useStore((s) => s.world)!;
  const currentIsland = useStore((s) => s.currentIsland);
  const setPanel = useStore((s) => s.setPanel);
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<HootEntry[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const loc = world.blueprint.locations.find((l) => l.id === currentIsland);
  const concept = world.blueprint.concepts.find((c) => c.id === loc?.conceptId);
  const topic = concept?.name ?? world.blueprint.title;
  const suggestions = useMemo(
    () => [`What is ${topic} in simple words?`, `Why does ${topic} matter?`, `What example does the document give for ${topic}?`],
    [topic],
  );

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [entries]);

  const ask = async (question: string) => {
    const query = question.trim();
    if (query.length < 3) return;
    setQ('');
    const pages = world.source.pages;
    const passages = findPassages(`${query} ${concept?.name ?? ''}`, pages, 3);
    const idx = entries.length;
    setEntries((e) => [...e, { q: query, passages, state: 'thinking' }]);
    const pageNums = new Set([...relevantPages(`${query} ${topic}`, pages, 3), ...(concept?.sourceRefs.map((r) => r.page) ?? [])]);
    const send = pages.filter((p) => pageNums.has(p.page)).slice(0, 4);
    const r = await askHoot({ question: query, topic, pages: (send.length ? send : pages.slice(0, 2)).map((p) => ({ page: p.page, text: p.text.slice(0, 6000) })) });
    setEntries((e) =>
      e.map((x, i) =>
        i !== idx ? x : isTutorError(r) ? { ...x, state: 'offline', note: r.error === 'RATE_LIMITED' ? r.message : 'Hoot is asleep (no language model available), but here’s what your PDF says:' } : { ...x, state: 'done', reply: r },
      ),
    );
  };

  return (
    <div>
      <p className="muted small">
        Hoot answers <b>only from your PDF</b> and shows the exact passage. If the PDF doesn’t say it, Hoot will tell you.
      </p>
      <div className="thread" aria-live="polite">
        {entries.length === 0 && (
          <div className="msg hoot">
            <Avatar who="hoot" />
            <div className="bubble">Whooo has a question? Ask me anything about {topic}. I’ll answer from your document, with the page.</div>
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i}>
            <div className="msg you">
              <Avatar who="you" />
              <div className="bubble">{e.q}</div>
            </div>
            <div className="msg hoot">
              <Avatar who="hoot" />
              <div className="bubble">
                {e.state === 'thinking' && (
                  <span className="thinking">
                    <span className="spinner" /> Hoot is looking through your PDF…
                  </span>
                )}
                {e.state === 'done' && e.reply && (
                  <>
                    {e.reply.answer}
                    {!e.reply.inSource && <div className="note">Not covered by your PDF, so Hoot won’t guess.</div>}
                    {e.reply.quote && <Evidence refs={[{ page: e.reply.quote.page, quote: e.reply.quote.text, status: e.reply.quote.status, passage: e.reply.quote.passage }]} label="Hoot's source" />}
                  </>
                )}
                {e.state === 'offline' && <div className="note">{e.note}</div>}
                {(e.state === 'offline' || (e.state === 'done' && !e.reply?.quote)) && e.passages.length > 0 && (
                  <ul className="passages">
                    {e.passages.map((p, k) => (
                      <li key={k}>
                        “{p.text}”{' '}
                        <button className="linklike" onClick={() => setPanel({ kind: 'source', page: p.page, passage: p.text, from: { kind: 'hoot' } })}>
                          p. {p.page}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {e.state === 'offline' && e.passages.length === 0 && <div className="note">Nothing in your PDF matches that question.</div>}
              </div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="bank" style={{ marginTop: 8 }}>
        {suggestions.map((sug) => (
          <button key={sug} className="chip" onClick={() => ask(sug)}>
            {sug}
          </button>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(ev) => {
          ev.preventDefault();
          ask(q);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Hoot a question…" aria-label="Your question for Professor Hoot" data-testid="hoot-input" />
        <button className="btn btn-primary btn-small" type="submit" disabled={q.trim().length < 3}>
          Ask
        </button>
      </form>
    </div>
  );
}

// ---------------- Review Grove (spaced retrieval) ----------------

const human = (ms: number) => {
  if (ms <= 60_000) return 'in a moment';
  if (ms < 3_600_000) return `in ${Math.round(ms / 60_000)} minutes`;
  if (ms < 86_400_000) return `in ${Math.round(ms / 3_600_000)} hours`;
  const d = Math.round(ms / 86_400_000);
  return d === 1 ? 'tomorrow' : `in ${d} days`;
};

export function ReviewPanelBody() {
  const world = useStore((s) => s.world)!;
  const progress = useStore((s) => s.progress);
  const reviewResult = useStore((s) => s.reviewResult);
  const [session, setSession] = useState<string[] | null>(null);
  const [pos, setPos] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const due = dueReviews(world, progress, now);
  const next = nextReviewAt(world, progress);
  const scheduled = Object.keys(progress.review).filter((id) => findStation(world, id)).length;

  if (session && pos < session.length) {
    const found = findStation(world, session[pos])!;
    const st = found.station;
    const hooks = {
      onResult: (ok: boolean) => {
        setAnswered(ok);
        reviewResult(st.id, ok);
        setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
      },
    };
    return (
      <div>
        <div className="review-head">
          <span className="badge badge-curated">
            Recall {pos + 1} of {session.length}
          </span>
          <span className="small muted">from {found.location.title}</span>
        </div>
        {st.type === 'quiz' && <QuizCard key={st.id} s={st} review={hooks} />}
        {st.type === 'claim_check' && <ClaimCard key={st.id} s={st} review={hooks} />}
        {st.type === 'cloze' && <ClozeCard key={st.id} s={st} review={hooks} />}
        {answered !== null && (
          <div className="review-next">
            <span className="small muted">
              {answered ? 'Remembered first try, so it comes back later than last time.' : 'Missed on the first try, so it comes back in 10 minutes. That’s normal: forgetting a little is how memory gets stronger.'}
            </span>
            <button
              className="btn btn-primary btn-small"
              onClick={() => {
                setPos((p) => p + 1);
                setAnswered(null);
              }}
              data-testid="review-next"
            >
              {pos + 1 < session.length ? 'Next' : 'Finish'}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (session) {
    return (
      <div>
        <div className="feedback good">
          <b>
            Review done: {score.right} of {score.total} remembered on the first try.
          </b>
          {next ? `Your next review is ${human(next - Date.now())}.` : ''} Slow and steady wins: a few minutes now and then beats one long cram.
        </div>
        <button className="btn btn-secondary btn-small" onClick={() => setSession(null)}>
          Back to the grove
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="lead">The Review Grove brings back challenges you’ve solved, spaced out over time.</p>
      <p className="small muted">
        Retrieving something just as you start to forget it is one of the most effective ways to learn. Each challenge comes back after 10 minutes, then 1, 3, 7 and {REVIEW_LADDER[4] / 86_400_000}{' '}
        days. A miss sends it back to the start.
      </p>
      {due.length > 0 ? (
        <>
          <div className="feedback good">
            <b>{due.length} ready to recall</b>
            About {Math.max(1, Math.round(due.length * 0.5))} minute{due.length > 2 ? 's' : ''}.
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setSession(due.slice(0, 8));
              setPos(0);
              setScore({ right: 0, total: 0 });
            }}
            data-testid="review-start"
          >
            Start review
          </button>
        </>
      ) : (
        <div className="hint-box">
          {scheduled === 0
            ? 'Nothing here yet. Solve Riddle Stones, Scales of Truth or Word Bridges on the islands and they’ll grow here for later review.'
            : `Nothing is due right now. ${scheduled} challenge${scheduled > 1 ? 's are' : ' is'} resting; the next one returns ${next ? human(next - now) : 'later'}.`}
        </div>
      )}
    </div>
  );
}
