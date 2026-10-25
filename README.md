# SlothWorld 🦥

**Stop rereading. Start exploring.**

Hi, I'm **Harichand**, and this is my entry for the **Hacktoberfest 2026 Open-Source AI Challenge, Week 3: *Slow and Steady***, in the **Best Use of Gemma** category.

SlothWorld is a 3D web game that turns a dense PDF into small islands you walk around, experiment on, and teach your way through. Google's open **Gemma** model does the hard work, right on your own laptop.

<!-- Harichand: add one or two sentences here about a PDF you struggled with and why you built this. -->

![Teaching Pip: Pip gets 1 of 3 key ideas from a half-explanation, asks a nudging question, then understands after the full explanation](docs/screenshots/23-teach-pip.png)

<!-- Add the demo video link here: 🎬 **Watch the demo:** <link> -->

## Why this is a "Slow and Steady" project

This week's prompt asked for *something that rewards laziness, that does the work so you don't have to*. Sloths conserve their energy and move at their own pace. I wanted a sloth that does exactly that for studying.

Studying a dense PDF *properly* means doing a pile of chores before you learn anything: pick out the key ideas, write notes, make flashcards and practice questions, check your answers against the text, and remember to revise next week. Most people skip the chores and just reread the PDF again. That happens to be one of the least effective ways to study.

**So I made the sloth do the chores.** Drop in a PDF, and about a minute later it's a world:

| The chore you'd normally do | What SlothWorld does for you |
|---|---|
| Pick out the key ideas and the order to learn them | Gemma maps 4–6 concepts, prerequisites first, each with its page and a quote |
| Write practice questions and flashcards | Quizzes, true-or-false claims, fill-in sentences and sequencing puzzles for every idea |
| Check your answers against the text | Every quote and answer key is checked against your PDF |
| Explain it to someone (the best test of understanding) | Pip, a baby sloth on every island, waits for you to teach them |
| Remember to revise | The Review Grove brings challenges back after 10 minutes, then 1, 3, 7 and 21 days |

Then you get to be slow and steady: nothing is timed, there are no streaks to protect, and a wrong answer just means "look again". The sloth did the work; you just explore.

I didn't want it to be lazy in the bad sense either. Rereading and highlighting are rated among the *least* useful study techniques, while practice testing and spaced practice are rated the *most* useful ([Dunlosky et al., 2013](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)). People also try harder when they teach someone, the "protégé effect" ([Chase et al., 2009](https://purl.stanford.edu/zm369yx3532)). SlothWorld sets up those effective habits for you, so the lazy way to study is also the good way.

## What you can do in SlothWorld

- **Explore.** Each key idea is an island, and bridges lead from the basics to the ideas that build on them. Click **Walk me there** and the sloth wanders to your next challenge.
- **Teach Pip.** Explain the idea in your own words. Pip knows only the key sentences from your PDF, tells you which ones came across, and asks *one* question about what you missed, without giving the answer away.
- **Ask Professor Hoot.** Press `H` anywhere. Hoot answers only from your PDF, shows the exact sentence and links to the page. If your PDF doesn't cover it, Hoot says so instead of guessing.
- **Practise.** Riddle Stones (quizzes), Scales of Truth (is this claim supported?), Sequence Steps and Word Bridges (put the key words back into a real sentence from your PDF).
- **Remember.** Solved challenges grow into the Review Grove and come back at spaced intervals.
- **Watch it bloom.** Islands fill with flowers as you learn. Your progress is saved, so you can stop whenever you like.

There's also a hand-written sample world, *How Neural Networks Learn*, with three working labs: tune a real neuron, send a signal through a small network, and roll a ball down a real loss curve with gradient descent. Every number is calculated live.

![The neuron lab](docs/screenshots/05-neuron-lab.png)

## How I used Gemma

Gemma is the core of the project: without it there are no worlds, no Pip and no Hoot. I gave it four narrow jobs, and wrote plain code that checks everything it says against your PDF before you see it.

| Gemma's job | What it does | How I keep it honest |
|---|---|---|
| **Cartographer** | Reads the PDF and maps the key ideas: explanations, prerequisites, how they connect, learning objectives, and what the PDF leaves unclear. Each comes with a page and a quote. | Every quote is searched for in the PDF's real text. Wrong page numbers are corrected; quotes that aren't found are flagged in red. |
| **Island designer** | Writes a quiz, a true-or-false claim, and a sequence (only if the text describes one). | **Answer keys are checked**: a quiz is dropped if another option matches the cited passage, or Gemma's own explanation, better than the keyed answer. |
| **Pip** | Judges which key ideas your explanation conveys, and asks one Socratic question. | An idea only counts if your explanation shares real vocabulary with that PDF sentence, so Pip can't be flattered by an off-topic answer. |
| **Professor Hoot** | Answers your question from the relevant pages, with a quote. | The quote is verified against the PDF; a made-up one is labelled "could not be found". |

Gemma only ever returns structured data. A fixed set of 3D components draws the world, so the model never writes code or HTML. The Word Bridges and Review Grove are built by code from verified sentences.

**Gemma on any laptop.** I tested two sizes:

| | Model | On | A 3–4 page PDF becomes a world in |
|---|---|---|---|
| **Default** | Gemma 4 E2B (`gemma4:e2b-it-qat`, ~4.3 GB) | a laptop GPU (my 6 GB GTX 1660 Ti) | about 45–110 seconds, 5 islands |
| **No GPU?** | Gemma 3 1B (`gemma3:1b`, ~815 MB) | just the CPU (tested with 2 threads) | about 3–5 minutes, 4 islands |

**What testing taught me:** the tiny Gemma 3 1B marked the *wrong* answer as correct on 5 of its 6 quizzes for one PDF; one said "rivers and lakes" drive the water cycle. That's why I built the answer-key check. It caught all 5, and kept all 10 correct quizzes from Gemma 4. A study tool must never confidently teach something wrong.

## Why open models matter for this, and where open beat closed

- **Your notes stay yours.** The PDF is read, mapped and quizzed entirely on your computer. No account, no upload, no server you don't control. That matters for lecture notes, drafts and work documents.
- **It works offline and costs nothing to run.** Once Gemma is downloaded there's no API key, no per-token bill and no usage cap. Once the model is loaded, Pip and Hoot answer in a second or two on my laptop, so you can ask as much as you like.
- **I could choose the right model for each machine.** Gemma 4 for laptops with a GPU, and Gemma 3 1B for CPU-only machines. Same code; one setting (`SLOTH_MODEL`) switches them.
- **I could see its mistakes and fix them.** Running the model myself meant I could test it on my own documents, watch exactly where it went wrong (like those answer keys), and build checks for those failures. With a closed, hosted model I'd face the same kinds of mistakes but have far less room to study and fix them.

## Try it

You need **Node.js 20+** ([nodejs.org](https://nodejs.org)), **Git**, and, for creating worlds from your own PDFs, [Ollama](https://ollama.com/download).

```bash
git clone https://github.com/royalharry007/SlothWorld.git
cd SlothWorld
npm install
npm run build
npm start
```

Open **http://127.0.0.1:8787** and click **Explore the sample world**. That works straight away, without a model.

To create worlds from your own PDFs and talk to Pip and Hoot, download Gemma once:

```bash
ollama pull gemma4:e2b-it-qat
```

No GPU? Use the small model on CPU instead:

```bash
ollama pull gemma3:1b
# then start SlothWorld with:
SLOTH_MODEL=gemma3:1b SLOTH_NUM_GPU=0 SLOTH_MAX_CONCEPTS=4 npm start
```

(On Windows PowerShell, set them first: `$env:SLOTH_MODEL="gemma3:1b"; $env:SLOTH_NUM_GPU="0"; $env:SLOTH_MAX_CONCEPTS="4"; npm start`.)

No PDF handy? Try `public/samples/the-water-cycle.pdf`.

**Keys:** `W A S D` walk · drag to look · `E` use · `H` ask Hoot · `J` journal and concept map · `M` world map · `Esc` close.

**On a Mac?** The same steps work in Terminal. See [docs/MAC.md](docs/MAC.md) for which Gemma to pick for your Mac and a few Mac tips.

I tested it on Windows 11 with Chrome. Other recent desktop browsers with WebGL, and macOS, should work, but I haven't tested them.

## Safety and honesty

- **Nothing from the PDF or the model is executed.** The PDF is read as text in memory, and the model's output is data checked against a strict schema.
- **The passage you read is always the PDF's own words.** Everything the model writes is labelled as the model's, and every quote shows whether it was *verified*, had its *page corrected*, is only the *closest matching passage*, or was *not found*.
- **Wrong answers are dropped, not hidden.** The journal's validation report lists everything that was fixed or flagged.
- **Clear failures.** Scanned PDFs, password-protected files, a missing model and an offline model each get a clear message, and the sample world always works.

## Known limitations

- **No OCR.** Scanned PDFs are detected and refused, with instructions.
- **Long PDFs are sampled.** Some detail in long documents is missed.
- **Smaller models write simpler questions.** Gemma 3 1B can also mislabel a claim; the source passage is always shown after you answer.
- **The hands-on labs are hand-built** for the sample world. Generated worlds use quizzes, claims, sequences, Word Bridges, Pip and Hoot.
- **On low-memory computers** the 3D view can drop while the model is busy. A **Wake the world up** button brings it back without losing progress.

## For developers

```bash
npm run dev     # live reload: app on http://localhost:5173, API on 127.0.0.1:8787
npm test        # 35 unit tests: math, quote checks, repairs, layout, Pip and Hoot guards
npm run e2e     # 21 end-to-end checks that play the game in Chrome (needs npm run dev)
npx tsx scripts/try-generate.ts public/samples/the-water-cycle.pdf world.json   # PDF → world on the command line
```

The end-to-end run plays the game the way a learner would. It checks the labs' numbers against the math, walks between islands, teaches Pip and asks Hoot with the real model, uploads real, fake, scanned and empty files, and builds a world from a real PDF. Results are in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

**Settings** are environment variables: `SLOTH_MODEL`, `OLLAMA_URL`, `SLOTH_MAX_CONCEPTS` (2–6 islands), `SLOTH_NUM_GPU`, `SLOTH_NUM_THREAD`, `SLOTH_NUM_CTX`, `SLOTH_CALL_TIMEOUT_MS`, and `PORT`/`HOST`. The server only listens on your own computer by default.

**Self-hosting** for other people is optional: a `Dockerfile` bundles SlothWorld, Ollama and Gemma 3 1B for CPU servers, with per-visitor rate limits and honest "processed on the server" privacy wording. See [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md).

```
shared/      world blueprint schema, quote checking, repairs, layout, math, sample world
server/      PDF reading, Ollama client, world generation, Pip and Hoot
src/three/   the 3D world: islands, bridges, the sloth and friends, labs, camera
src/ui/      landing page, upload, panels, challenge cards, journal
tests/ e2e/  unit and end-to-end tests
```

## License and credits

SlothWorld is made by Harichand and released under the [MIT License](LICENSE).

- **Gemma** by Google (Gemma 4 E2B, reported by Ollama as Apache 2.0; Gemma 3 1B under the Gemma Terms of Use), run locally with [Ollama](https://ollama.com). The models download to your computer and aren't included here.
- [React](https://react.dev), [three.js](https://threejs.org), [React Three Fiber](https://github.com/pmndrs/react-three-fiber) and drei, [pdf.js](https://mozilla.github.io/pdf.js/), [Zod](https://zod.dev), [Zustand](https://github.com/pmndrs/zustand), Express and Vite.
- Fonts: Fredoka and Inter (SIL Open Font License).
- The low-poly trees, bushes, rocks and clouds come from my earlier asset library. The islands, labs, characters and the sloth are generated in code.

Stop rereading. Let the sloth do the chores. 🦥
