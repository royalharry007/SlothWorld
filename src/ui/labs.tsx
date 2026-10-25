import { useEffect, useState } from 'react';
import { divergenceThreshold, mse, mseGradient, neuronForward, optimalWeight, predict, SAMPLE_DATA } from '../../shared/math';
import { NETWORK_ANIM_SECONDS } from '../three/Labs';
import { useStore } from '../store';

const f2 = (v: number) => v.toFixed(2);
const signed = (v: number) => (v >= 0 ? `+${f2(v)}` : `−${f2(Math.abs(v))}`);

function Slider({ label, value, min, max, step, onChange, id }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; id: string }) {
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <output htmlFor={id}>{f2(value)}</output>
    </div>
  );
}

function Goal({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={met ? 'met' : ''}>
      <span className="tick">{met ? '✓' : ''}</span>
      <span>{children}</span>
    </li>
  );
}

// ---------------- Island 1 ----------------
export function NeuronLabPanel() {
  const n = useStore((s) => s.neuron);
  const set = useStore((s) => s.setNeuron);
  const r = neuronForward(n.inputs, n.weights, n.bias, n.activation);
  const biggest = r.products.reduce((bi, p, i) => (Math.abs(p) > Math.abs(r.products[bi]) ? i : bi), 0);
  const upd = (key: 'inputs' | 'weights', i: number, v: number) => {
    const arr = n[key].slice();
    arr[i] = v;
    set({ [key]: arr });
  };
  return (
    <div className="lab-grid">
      <p className="muted" style={{ margin: 0 }}>
        Three inputs flow into one neuron. Watch the machine: tube thickness is the weight’s size, green means positive, red negative.
      </p>
      <h3 style={{ margin: '4px 0 0' }}>Inputs</h3>
      {n.inputs.map((x, i) => (
        <Slider key={`x${i}`} id={`x${i}`} label={`x${i + 1}`} value={x} min={0} max={1} step={0.05} onChange={(v) => upd('inputs', i, v)} />
      ))}
      <h3 style={{ margin: '4px 0 0' }}>Weights & bias</h3>
      {n.weights.map((w, i) => (
        <Slider key={`w${i}`} id={`w${i}`} label={`w${i + 1}`} value={w} min={-2} max={2} step={0.1} onChange={(v) => upd('weights', i, v)} />
      ))}
      <Slider id="bias" label="bias b" value={n.bias} min={-3} max={3} step={0.1} onChange={(v) => set({ bias: v })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="small muted">Activation</span>
        <div className="seg" role="group" aria-label="Activation function">
          {(['sigmoid', 'relu'] as const).map((a) => (
            <button key={a} className={n.activation === a ? 'on' : ''} onClick={() => set({ activation: a })} aria-pressed={n.activation === a}>
              {a === 'sigmoid' ? 'Sigmoid' : 'ReLU'}
            </button>
          ))}
        </div>
      </div>
      <div className="math" aria-label="Live calculation">
        z = {r.products.map((p, i) => (
          <span key={i} className={p >= 0 ? 'pos' : 'neg'}>
            ({f2(n.weights[i])}×{f2(n.inputs[i])}){i < 2 ? ' + ' : ''}
          </span>
        ))}{' '}
        {signed(n.bias)}
        <br />
        &nbsp;&nbsp;= <span className="hl">{f2(r.z)}</span>
        <br />
        {n.activation === 'sigmoid' ? (
          <>
            output = 1 / (1 + e<sup>−{f2(r.z)}</sup>) = <span className="hl">{r.output.toFixed(3)}</span>
          </>
        ) : (
          <>
            output = max(0, {f2(r.z)}) = <span className="hl">{r.output.toFixed(3)}</span>
          </>
        )}
      </div>
      {n.activation === 'sigmoid' && (
        <div className="meter" aria-label={`Output ${r.output.toFixed(2)}`}>
          <div style={{ width: `${r.output * 100}%` }} />
          <span className="mark" style={{ left: '50%' }} />
        </div>
      )}
      <p className="small" style={{ margin: 0 }}>
        <b>What’s happening:</b> input {biggest + 1} is pushing hardest ({signed(r.products[biggest])}).{' '}
        {n.bias !== 0 && `The bias shifts z by ${signed(n.bias)} regardless of the inputs.`}
      </p>
      <h3 style={{ margin: '6px 0 0' }}>Challenge (sigmoid)</h3>
      <ul className="goals">
        <Goal met={n.achieved.fire}>Make it fire: output ≥ 0.90</Goal>
        <Goal met={n.achieved.quiet}>Make it quiet: output ≤ 0.10</Goal>
        <Goal met={n.achieved.balance}>Balance it on the fence: output = 0.50 (±0.01)</Goal>
      </ul>
      {n.activation === 'relu' && <p className="small muted">Switch back to sigmoid to work on the challenge — ReLU has no upper limit, so “0.90” means something different.</p>}
    </div>
  );
}

// ---------------- Island 2 ----------------
export function NetworkLabPanel() {
  const net = useStore((s) => s.network);
  const setInput = useStore((s) => s.setNetworkInput);
  const fire = useStore((s) => s.fireNetwork);
  const solved = useStore((s) => !!s.progress.completed['network-lab']);
  const [revealed, setRevealed] = useState(net.trace !== null);
  const animating = net.firedAt !== null && !revealed;

  useEffect(() => {
    if (net.firedAt === null) return;
    setRevealed(false);
    const left = NETWORK_ANIM_SECONDS * 1000 - (performance.now() - net.firedAt);
    const t = setTimeout(() => setRevealed(true), Math.max(0, left));
    return () => clearTimeout(t);
  }, [net.firedAt]);

  const tr = revealed ? net.trace : null;
  const strongest = tr
    ? tr.contributions
        .flatMap((layer, l) => layer.flatMap((row, j) => row.map((c, i) => ({ l, j, i, c }))))
        .reduce((a, b) => (Math.abs(b.c) > Math.abs(a.c) ? b : a))
    : null;
  const nodeName = (l: number, j: number) => (l === 0 ? `input ${j + 1}` : l === 1 ? `hidden ${j + 1}` : `output ${j === 0 ? 'A' : 'B'}`);
  const winA = tr ? tr.activations[2][0] > 0.75 : false;

  return (
    <div className="lab-grid">
      <p className="muted" style={{ margin: 0 }}>
        Switch the three inputs on or off, then send the signal. It travels left to right: every hidden neuron gets every input, and every output gets every hidden neuron.
      </p>
      <div className="toggles" role="group" aria-label="Inputs">
        {net.inputs.map((v, i) => (
          <button key={i} className={`toggle${v ? ' on' : ''}`} aria-pressed={!!v} disabled={animating} onClick={() => setInput(i, v ? 0 : 1)}>
            <span className="big">{v}</span>input {i + 1}
          </button>
        ))}
      </div>
      <button className="btn btn-primary" onClick={fire} disabled={animating} data-testid="send-signal">
        {animating ? 'Signal travelling…' : 'Send signal ⚡'}
      </button>
      {tr && (
        <>
          <table className="data" aria-label="Activations">
            <thead>
              <tr>
                <th>Layer</th>
                <th>Values</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>hidden</td>
                <td>{tr.activations[1].map((v) => v.toFixed(2)).join('  ·  ')}</td>
              </tr>
              <tr>
                <td>output A / B</td>
                <td>
                  <b>{tr.activations[2][0].toFixed(3)}</b> / {tr.activations[2][1].toFixed(3)}
                </td>
              </tr>
            </tbody>
          </table>
          {strongest && (
            <p className="small" style={{ margin: 0 }}>
              <b>Brightest connection:</b> {nodeName(strongest.l, strongest.i)} → {nodeName(strongest.l + 1, strongest.j)} carries weight × activation ={' '}
              {signed(strongest.c)}. Its neuron then adds a bias and squashes the sum with a sigmoid.
            </p>
          )}
        </>
      )}
      <h3 style={{ margin: '6px 0 0' }}>Challenge</h3>
      <ul className="goals">
        <Goal met={winA || solved}>Find an input pattern that makes output A fire above 0.75</Goal>
      </ul>
      {Object.keys(net.tried).length > 0 && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Experiment log (A / B):
          </p>
          <div className="tried">
            {Object.entries(net.tried).map(([k, v]) => (
              <div key={k} className={v[0] > 0.75 ? 'win' : ''}>
                <b>{k}</b>
                {v[0].toFixed(2)} / {v[1].toFixed(2)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Island 3 ----------------
export function LossLabPanel() {
  const l = useStore((s) => s.loss);
  const setLoss = useStore((s) => s.setLoss);
  const step = useStore((s) => s.lossStep);
  const solved = useStore((s) => !!s.progress.completed['loss-lab']);
  const loss = mse(l.w);
  const g = mseGradient(l.w);
  const thr = divergenceThreshold();
  const max = Math.max(...l.history, 0.1);
  const pts = l.history.map((v, i) => `${(i / Math.max(1, l.history.length - 1)) * 300},${60 - Math.min(v / max, 1) * 56}`).join(' ');
  const reached = loss < 0.05;
  return (
    <div className="lab-grid">
      <p className="muted" style={{ margin: 0 }}>
        The model predicts <b>ŷ = w × x</b>. The cream pillars are targets, the amber pillars are predictions. The ball sits on the loss valley at the current weight.
      </p>
      <table className="data" aria-label="Predictions">
        <thead>
          <tr>
            <th>x</th>
            <th>target y</th>
            <th>ŷ = w·x</th>
            <th>error²</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_DATA.map((p) => {
            const yh = predict(l.w, p.x);
            return (
              <tr key={p.x}>
                <td>{p.x}</td>
                <td>{p.y.toFixed(1)}</td>
                <td>{yh.toFixed(2)}</td>
                <td>{((yh - p.y) ** 2).toFixed(3)}</td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={3}>
              <b>MSE (average of error²)</b>
            </td>
            <td>
              <b style={{ color: reached ? 'var(--green)' : undefined }}>{loss > 9999 ? '9999+' : loss.toFixed(3)}</b>
            </td>
          </tr>
        </tbody>
      </table>
      <Slider id="w" label="weight w" value={Math.max(-1, Math.min(5, l.w))} min={-1} max={5} step={0.01} onChange={(v) => setLoss({ w: v })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="small muted">Learning rate</span>
        <div className="seg" role="group" aria-label="Learning rate">
          {[0.01, 0.05, 0.14].map((lr) => (
            <button key={lr} className={l.lr === lr ? 'on' : ''} aria-pressed={l.lr === lr} onClick={() => setLoss({ lr })}>
              {lr}
            </button>
          ))}
        </div>
      </div>
      <div className="math">
        gradient = (2/n)·Σ(ŷ−y)·x = <span className="hl">{g.toFixed(2)}</span>
        <br />
        w ← {l.w.toFixed(3)} − {l.lr} × {g.toFixed(2)} = <span className="hl">{(l.w - l.lr * g).toFixed(3)}</span>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {Math.abs(g) < 0.05 ? 'The gradient is almost zero: you’re at the bottom of the valley.' : `The gradient is ${g > 0 ? 'positive' : 'negative'}, so the step moves w ${g > 0 ? 'left (smaller)' : 'right (larger)'} — downhill.`}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-small" onClick={step} data-testid="gd-step">
          Take a gradient step
        </button>
        <button className="btn btn-secondary btn-small" onClick={() => setLoss({ w: 0.5, history: [mse(0.5)] })}>
          Reset w to 0.5
        </button>
      </div>
      {l.history.length > 1 && (
        <svg viewBox="0 0 300 64" width="100%" height="64" role="img" aria-label="Loss after each step">
          <polyline points={pts} fill="none" stroke="#f08a24" strokeWidth="2.5" strokeLinejoin="round" />
          <text x="0" y="62" fontSize="10" fill="#7d8697">
            loss per step ({l.history.length - 1} steps)
          </text>
        </svg>
      )}
      <h3 style={{ margin: '6px 0 0' }}>Challenge</h3>
      <ul className="goals">
        <Goal met={reached || solved}>Bring the loss below 0.05 (best possible: {mse(optimalWeight()).toFixed(3)})</Goal>
        <Goal met={l.sawOvershoot}>Experiment: find a learning rate that makes the loss go up</Goal>
      </ul>
      {l.sawOvershoot && (
        <p className="small" style={{ margin: 0 }}>
          For this data any learning rate above 2/15 ≈ {thr.toFixed(3)} overshoots: each step lands further up the opposite slope. Answer the Riddle Stone to explain why.
        </p>
      )}
    </div>
  );
}
