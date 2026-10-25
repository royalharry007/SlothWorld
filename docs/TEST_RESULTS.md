# Test results

Recorded on 2026-10-25 on Windows 11, with Node 24.13, Chrome (SwiftShader WebGL, headless), Ollama 0.40.11, `gemma4:e2b-it-qat` and a GTX 1660 Ti (6 GB) with 8 GB RAM.

## Unit tests: `npm test`

```
 Test Files  2 passed (2)
      Tests  35 passed (35)
```

They cover:

- neuron, network and MSE/gradient math, including a finite-difference gradient check and the 2/15 divergence threshold;
- grounding outcomes: verified, relocated, approximate and unverified;
- every curated sample reference verifying against the sample text;
- quiz answer-key checks (catches wrong keys, keeps every curated quiz);
- blueprint repair: malformed quizzes, duplicate options, markup stripping, "false" claims that are verbatim in the source, and step-label cleanup;
- deterministic, non-overlapping, fully walkable layouts.

## End-to-end: `npm run e2e -- http://127.0.0.1:8787` (production build)

Full log: [e2e-latest.log](e2e-latest.log). Screenshots: [screenshots/](screenshots).

| # | Check | Result |
|---|---|---|
| 1 | Landing renders identity, tagline, both entry points, live AI status | ✓ |
| 2 | Sample world loads with `/api` blocked | ✓ |
| 3 | Keyboard movement, edge collision, interaction prompt | ✓ walked 4.0 units, stayed on walkable ground |
| 4 | Neuron lab values equal `neuronForward` (2 settings + real slider input); challenge completes | ✓ |
| 4b | Quiz and claim feedback | ✓ |
| 5 | Network propagation: results hidden until the signal arrives, values match the forward pass | ✓ A = 0.819, B = 0.147 for input `100` |
| 5b | Ordering puzzle solved with arrow buttons | ✓ |
| 6 | 5 gradient steps at lr 0.05 give MSE 0.0243 (matches the math); lr 0.14 makes the loss grow | ✓ |
| 9 | Concept panel evidence; source viewer highlights the cited passage on p. 1 | ✓ |
| – | Journal travel, world map toggle | ✓ |
| – | Progress survives exit and page reload | ✓ |
| 12 | Panels fit at 1280×720 and 1024×640, no horizontal scroll | ✓ |
| 7 | `.txt`, fake PDF, scanned PDF and empty file are rejected with specific messages | ✓ |
| 10 | Missing model gives `MODEL_MISSING` with the `ollama pull` hint; runtime offline gives `UNREACHABLE` | ✓ |
| 7/8/9 | `the-water-cycle.pdf` becomes a validated AI world in the browser | ✓ 74 s, 5 concepts, 13 stations, 5/5 concept quotes verified (re-run after the Render changes; an earlier run took 85 s with 12 stations) |
| 11 | No critical console errors | ✓ |

**16/16 passed.**

### Note on an earlier run

The first production run scored 14/16. Ollama auto-updated (0.40.10 → 0.40.11) and restarted mid-run (see `%LOCALAPPDATA%\Ollama\server.log`), so the model was briefly unreachable. The app reported this correctly as "runtime not reachable". The e2e script was then changed to fail fast when the UI shows an error, and the re-run passed 16/16.

## CLI generation runs (`scripts/try-generate.ts`)

| PDF | Time | Concepts | Stations | Concept quotes verified |
|---|---|---|---|---|
| how-neural-networks-learn.pdf (4 pp.) | 57 s (cold model) | 5 | 13 | 5/5 |
| the-water-cycle.pdf (3 pp.) | 44 s | 5 | 13 | 5/5 |
| how-neural-networks-learn.pdf (after prompt fixes) | 46 s | 5 | 15 | 5/5 (claims alternate true/false) |

## Hosted mode (Render configuration): `npx tsx e2e/hosted.ts http://127.0.0.1:8788`

The server ran locally with the container's settings: `SLOTH_HOSTED=1`, `gemma3:1b`, CPU only, 2 threads, 4 islands, 4k context and a rate limit of 1 per hour. Log: [e2e-hosted.log](e2e-hosted.log).

| Check | Result |
|---|---|
| Health reports hosted mode, model, rate limit | ✓ |
| Hosted privacy wording; no "never leaves this computer" claim | ✓ |
| gemma3:1b on CPU generates a validated world through the UI | ✓ 272 s, 4 islands, 11 stations |
| Second world in the same hour is rate-limited | ✓ |
| No page errors | ✓ |

The Docker image itself wasn't built locally because Docker isn't installed.

### gemma3:1b answer-key quality

On the water-cycle PDF, gemma3:1b keyed the wrong answer on 5 of 6 quizzes (e.g. "primary energy source → Rivers and lakes"). The answer-key check dropped all 5 and kept the correct one. Applied to earlier Gemma 4 E2B runs, it kept all 10 of their correct quizzes.

After the Render changes, the local suite still passes 15/15 (`--skip-ai`) and the unit tests 19/19.

## Interactive cast update (Pip, Hoot, Word Bridge, Review Grove)

Latest full end-to-end run on the production build: **20/21 checks passed.** Log: [e2e-latest.log](e2e-latest.log).

| Check | Result |
|---|---|
| 13. *Walk me there* routes the sloth across bridges | ✓ start island → Island 1 |
| 14. Word Bridge | ✓ wrong word flagged, correct words accepted, evidence shown after answering |
| 15. Teach Pip (real Gemma 4) | ✓ partial explanation: "1 of 3 key ideas" plus a Socratic nudge; full explanation solved it |
| 16. Professor Hoot (real Gemma 4) | ✓ verified quote for an in-document question; refused an off-document one |
| 17. Review Grove | ✓ solved challenges scheduled; a first-try recall moved to the 1-day step |
| 7/8/9. Real PDF → AI world | ✓ 67 s, 5 concepts, 26 stations (now including Word Bridges and Pip lessons), 5/5 quotes verified |
| 11. No critical console errors | ✗ **WebGL context lost** during checks 3 and 15 |

**About the failure:** the browser reported `webglcontextlost` (logged by the test). The earlier "shader validation" errors had empty logs, which is consistent with a lost context. It happened with only ~1.2 GB RAM free, while Ollama held the model in memory and headless Chrome rendered WebGL in software (SwiftShader) on this 8 GB machine. Earlier runs with the same scene code reported no context loss. three.js normally restores a lost context, but **recovery hasn't been verified yet**. This is a known open issue: low-memory machines may see the 3D view reset.
