import { useEffect, useRef, useState } from 'react';
import { fetchHealth, generateWorld, type GenEvent } from '../api';
import { saveWorld } from '../storage';
import { useStore } from '../store';

const MAX_BYTES = 15 * 1024 * 1024;

const STAGES: { key: string; label: string }[] = [
  { key: 'extract', label: 'Reading the PDF and its page numbers' },
  { key: 'outline', label: 'Mapping concepts and how they connect' },
  { key: 'details', label: 'Designing islands and challenges' },
  { key: 'validate', label: 'Checking quotes against the PDF' },
  { key: 'layout', label: 'Raising islands' },
];

type Phase = { kind: 'pick' } | { kind: 'running'; stage: string; message: string; progress: number; started: number } | { kind: 'error'; message: string; hint?: string };

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const openWorld = useStore((s) => s.openWorld);
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [over, setOver] = useState(false);
  const [now, setNow] = useState(Date.now());
  const ctrl = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [hosted, setHosted] = useState(false);

  useEffect(() => {
    fetchHealth().then((h) => setHosted(!!h?.hosted));
  }, []);

  useEffect(() => {
    if (phase.kind !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase.kind]);

  useEffect(() => () => ctrl.current?.abort(), []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase.kind !== 'running') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [phase.kind, onClose]);

  const start = async (file: File) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setPhase({ kind: 'error', message: `“${file.name}” is not a PDF.`, hint: 'Choose a .pdf file. Word documents, slides and images need to be exported to PDF first.' });
      return;
    }
    if (file.size === 0) {
      setPhase({ kind: 'error', message: 'That file is empty.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhase({ kind: 'error', message: `The file is ${(file.size / 1048576).toFixed(1)} MB; the limit is 15 MB.`, hint: 'Split the PDF or export only the chapter you are studying.' });
      return;
    }
    const pdfUrl = URL.createObjectURL(file);
    ctrl.current = new AbortController();
    setPhase({ kind: 'running', stage: 'extract', message: 'Uploading to the local server…', progress: 0.01, started: Date.now() });
    let opened = false;
    await generateWorld(
      file,
      (e: GenEvent) => {
        if (e.type === 'stage') setPhase((p) => ({ kind: 'running', stage: e.stage, message: e.message, progress: e.progress, started: p.kind === 'running' ? p.started : Date.now() }));
        else if (e.type === 'error') setPhase({ kind: 'error', message: e.message, hint: e.hint });
        else if (e.type === 'done') {
          opened = true;
          const stored = saveWorld(e.world);
          openWorld(e.world, pdfUrl);
          if (!stored) useStore.getState().toast({ title: 'World not saved', body: 'Browser storage is full or disabled, so this world will be lost when you leave.', tone: 'info' });
          onClose();
        }
      },
      ctrl.current.signal,
    );
    if (!opened) URL.revokeObjectURL(pdfUrl);
  };

  const cancel = () => {
    ctrl.current?.abort();
    setPhase({ kind: 'pick' });
  };

  const stageIdx = phase.kind === 'running' ? STAGES.findIndex((s) => s.key === phase.stage) : -1;

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="upload-title">
      <div className="dialog">
        <h2 id="upload-title">Create a world from a PDF</h2>
        <p className="sub">
          {hosted
            ? 'An open-weight Gemma model running on this SlothWorld server reads your document and designs a world of concept islands. The PDF is processed in memory, not stored, and not sent to any AI company.'
            : 'A local open-weight model (Gemma via Ollama) reads your document and designs a world of concept islands. Nothing is uploaded to the internet.'}
        </p>

        {phase.kind === 'running' ? (
          <div aria-live="polite">
            <div className="bar" aria-label="Generation progress">
              <div style={{ width: `${Math.round(phase.progress * 100)}%` }} />
            </div>
            <p className="gen-msg">{phase.message}</p>
            <ol className="stages">
              {STAGES.map((s, i) => (
                <li key={s.key} className={i < stageIdx ? 'done' : i === stageIdx ? 'active' : ''}>
                  <span className="ic">{i < stageIdx ? '✓' : i === stageIdx ? <span className="spinner" /> : i + 1}</span>
                  {s.label}
                </li>
              ))}
            </ol>
            <div className="hint-box">
              Elapsed {Math.round((now - phase.started) / 1000)} s. {hosted
                ? 'This demo server runs the model on CPU, so a short PDF takes about 3–6 minutes. You can keep this tab open in the background.'
                : 'A typical short PDF takes about a minute on a laptop GPU (the first run also loads the model).'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-secondary btn-small" onClick={cancel}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {phase.kind === 'error' && (
              <div className="error-box" role="alert" data-testid="upload-error">
                <b>Couldn’t build that world</b>
                {phase.message}
                {phase.hint && <div style={{ marginTop: 6 }}>{phase.hint}</div>}
              </div>
            )}
            <div
              className={`drop${over ? ' over' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => input.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const f = e.dataTransfer.files[0];
                if (f) start(f);
              }}
            >
              <div style={{ fontSize: 34 }} aria-hidden>
                📄
              </div>
              <b>Drop a PDF here, or click to choose</b>
              <small>Text-based PDFs up to 15 MB · the first 60 pages are used</small>
              <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                data-testid="pdf-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) start(f);
                }}
              />
            </div>
            <div className="samples-row">
              No PDF handy? Download a sample:
              <a href="/samples/the-water-cycle.pdf" download>
                The Water Cycle
              </a>
              ·
              <a href="/samples/how-neural-networks-learn.pdf" download>
                How Neural Networks Learn
              </a>
            </div>
            <p className="fineprint">
              Works best with lecture notes, papers and textbook chapters that have selectable text. Scanned pages need OCR first (SlothWorld doesn’t include OCR). Generated
              content is checked against your PDF, and anything that can’t be verified is clearly flagged.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
