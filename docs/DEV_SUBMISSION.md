---
title: "SlothWorld: Gemma turns the PDF you keep rereading into islands you can explore"
tags: devchallenge, gemma, opensource, ai
cover_image: <!-- upload docs/screenshots/01-landing.png -->
---

<!-- Before publishing, replace every comment in angle brackets: repo link, live demo link, video. -->

*This is a submission for the Hacktoberfest 2026 challenge.*

## The 2 a.m. PDF

You know the one. Forty pages, due tomorrow, and you've read the same paragraph four times. Your eyes move; nothing sticks.

Rereading feels like studying, but it's mostly passive. What actually helps is slower and more active: asking what an idea *does*, poking at it, being wrong and finding out why. That kind of studying takes effort to set up. Someone has to turn the PDF into questions, diagrams and something to try. Usually that someone is you, at 2 a.m.

So I built a sloth to do that part.

## What SlothWorld is

**SlothWorld turns a dense PDF into a small 3D world you explore at your own pace.** Each key idea becomes an island. Bridges lead from foundations to the ideas that build on them. On every island something asks you to think, not reread:

- 🪨 a **Riddle Stone**: a multiple-choice question about the idea
- ⚖️ a **Scale of Truth**: a claim to judge; is it supported by the text or not?
- 🔢 **Sequence Steps**: put a process in order, but only when the document actually describes one
- 📖 a **Source Lectern**: opens the exact page the island came from, with the passage highlighted

<!-- embed demo video or GIF here -->

It's for students, self-learners and anyone who has a document they *need* to understand, not just get through.

## Meet the cast: helpers that teach *with* you

Research on studying is blunt: rereading and highlighting rank among the least useful techniques, and practice testing and spaced practice among the most useful (Dunlosky et al., 2013). Students also try harder when they *teach* someone (the "protégé effect", Chase et al., 2009). So SlothWorld gives you a small cast, each with one job:

- 🦥 **Pip**, a baby sloth on every island who doesn't get the concept yet. You explain it in your own words. Gemma checks your explanation against key sentences copied from your PDF, then Pip asks *one* curious question about what you missed, without giving the answer away. In testing, a half-explanation earned 1 of 3 ideas and the nudge "What happens after you add those weighted inputs together?"
- 🦉 **Professor Hoot**, who answers your questions using *only* your PDF, with a quote SlothWorld verifies. Ask about something the PDF doesn't cover and Hoot says so instead of guessing.
- 🏮 **The Review Grove**, where what you solved comes back after 10 minutes, then 1, 3, 7 and 21 days. A few minutes now and then beats one long cram.

Behind the scenes, two more Gemma "agents" build each world (a cartographer that maps the concepts, and a builder that designs each island), and a fact-checker written in plain code holds all of them to your PDF.

## Slow and steady, on purpose

The mascot isn't a joke about being lazy. Sloths are deliberate: they move only when they need to, and they get where they're going.

SlothWorld is built around that:

- **No timers, no streaks, no scores to protect.** Nothing in the app is timed.
- **Being wrong is part of it.** A wrong answer says "look again"; after a couple of tries you get a hint. Then you see the real passage from your PDF and why the answer is right.
- **You set the pace.** Walk the islands in order, or open the journal and jump anywhere. Leave mid-island; your progress is saved.
- **The calm is deliberate.** Floating islands, warm light, a slow-blinking sloth in a leaf hat. Studying is stressful enough.

The effort SlothWorld saves is the tedious part: turning pages into practice. A 4-page PDF becomes a 5-island world with about a dozen challenges in **about a minute** on my laptop. The slow part, actually understanding the material, stays with you, and it's the part worth keeping.

## Learning by doing: the sample world

To show what the islands *can* be, I hand-built a sample world about **How Neural Networks Learn**. It's clearly labelled as hand-written, not AI-generated, and it works offline with no model at all:

- **The Neuron.** Drag weights, inputs and the bias, and watch z = Σwx + b and sigmoid(z) change live. Tube thickness and colour show each weight. Challenge: make it fire, go quiet, then balance at exactly 0.5.
- **The Network.** Flip three inputs and send a signal through a 3→4→2 network. The pulses glow by weight × activation. Find the input pattern that makes Output A fire.
- **The Learning Arena.** Roll a ball down the *real* loss curve with gradient steps. Then try learning rate 0.14 and watch the loss climb, because 0.14 is above this data's divergence limit of 2/15.

Every number is computed, not animated, and unit tests check it.

![The neuron lab](<!-- upload docs/screenshots/05-neuron-lab.png -->)

## Where Gemma comes in

The worlds you create from your own PDFs are designed by **Gemma**, and it's doing real work, not decoration:

1. **Mapping the concepts.** Gemma reads the page-marked text and returns 4–6 key concepts, with explanations, prerequisites, how they relate, learning objectives, and what the document leaves *unclear*. Each concept comes with a page number and a quote copied from that page.
2. **Designing the islands.** For each concept, Gemma sees only the pages about it and designs a quiz, a claim to judge (alternating true and false), and a sequence only if the text describes one.

Both steps use structured, schema-constrained JSON. The model only fills in data. A fixed set of 3D components does the rendering, so the model never writes code or HTML.

I use two Gemma models, each where it fits:

| | Model | Runs on | A 3–4 page PDF takes |
|---|---|---|---|
| On your own computer | **Gemma 4 E2B** (`gemma4:e2b-it-qat`, 4.6B) | a 6 GB laptop GPU via Ollama | ~45–95 s, 5 islands |
| Public demo on Render | **Gemma 3 1B** (`gemma3:1b`) | 2 CPU cores, no GPU | ~4–5 min, 4 islands |

## Trust, but verify: what a 1-billion-parameter model taught me

Small models are wonderful because anyone can run them. They're also confidently wrong sometimes. So SlothWorld treats every model answer as a suggestion to check against the PDF:

- **Every quote is searched for in the PDF's actual text.** Each one is labelled *verified*, *page number corrected*, *closest matching passage* or *not found*. The passage you read is always the PDF's own words, never the model's.
- **The model's explanations are labelled as the model's.** Anything it adds beyond the text appears in a separate "Beyond the source" box.
- **Every repair is visible.** The journal has a validation report listing what was fixed or flagged.

The most interesting moment came while preparing the CPU-only Render version. On a water-cycle PDF, **Gemma 3 1B marked the wrong answer as correct on 5 of its 6 quizzes**. One had "rivers and lakes" as the energy source that drives the water cycle. The quotes it cited were real; its answer keys weren't.

A study tool that confidently teaches wrong answers is worse than no tool. So I added an **answer-key check**: each quiz's answer must match the PDF passage it cites *and* the model's own explanation better than every other option does, or the quiz is dropped and noted. On the water-cycle run it **caught all 5 bad keys**. Re-checking earlier Gemma 4 runs, it **kept all 10 of their correct quizzes**.

The model does the creative work, and plain, checkable code keeps it honest. That pairing is what makes a small open model good enough to learn from.

## Why open models matter here

- **Your notes stay yours.** Running locally, the PDF never leaves your computer: no account, no upload, no API key. That matters for lecture notes, drafts and anything you'd rather not hand to a company.
- **Anyone can run it.** A student with a mid-range laptop gets the full experience for free, offline, forever. No usage limits.
- **It can be checked and changed.** The model is a pinned file you can inspect or swap with one setting. The whole app is open source, so if you want a new kind of island, it's one more component.
- **Even the hosted demo stays open.** The public version runs an open-weight Gemma on a plain CPU server. Your PDF goes to that server, but not to any AI company, and it isn't stored.

## How it's built

React + React Three Fiber for the world; Zustand, Zod and pdf.js; an Express server; Ollama running Gemma. All the islands, bridges, labs and the sloth itself are procedural geometry; only the trees and rocks are reused low-poly models.

Under the hood, the order of the islands isn't random. A deterministic layout puts prerequisites before the ideas that need them, keeps related ideas next to each other, and shows other relationships as labelled arcs in the sky. The same document always gives the same world.

**Does it work?** I tested it the way a user would:

- **35 unit tests** cover the math, quote checking, repairs, layout, and the guards on Pip and Hoot (e.g. Pip can't be flattered into crediting an off-topic answer).
- **21 end-to-end checks** drive the real app in Chrome: teaching Pip with real model feedback, Hoot's verified answers and refusals, spaced review, walking the sloth between islands, walking, every lab's numbers against the math, quiz feedback, source links, journal travel, saved progress, bad uploads (a text file, a fake PDF, a scanned PDF, an empty file), a missing model, an offline model, and a **real PDF → Gemma → world generation**. All 16 pass on the production build.
- **5 hosted-mode checks** cover the Render setup: a full generation on CPU-only Gemma 3 1B, the privacy wording and the rate limit.

## What it can't do (yet)

- **No OCR:** scanned PDFs are detected and you're told how to fix them.
- **Long documents are sampled,** so very long PDFs lose detail.
- **The hands-on labs are hand-built.** Generated worlds get quizzes, claims, sequences and matching, not invented simulations.
- **The small hosted model writes simpler questions** than Gemma 4 on your own machine. That's the honest trade for running anywhere.

Next, I'd like to add spaced review: islands that gently resurface a few days later, at sloth speed.

## Try it

- 🌍 **Play online:** <!-- Render URL -->. The sample world is instant; making a world from your PDF takes a few minutes on the free-to-use demo server.
- 💻 **Run it yourself** (full speed with Gemma 4): <!-- GitHub repo URL -->
  ```bash
  npm install && npm run dev
  ollama pull gemma4:e2b-it-qat   # optional: enables PDF → world
  ```

Stop rereading. Start exploring, slowly. 🦥
