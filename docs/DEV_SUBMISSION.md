---
title: "SlothWorld: a sloth turns the PDF you keep rereading into a world you can explore"
tags: devchallenge, hf26challenge, gemma, render
cover_image: <!-- upload docs/screenshots/01-landing.png -->
---

<!-- Before publishing: create the post from the official submission template (it adds #devchallenge and #hf26challenge), paste this in, and replace every comment in angle brackets. -->

*This is a submission for the Hacktoberfest 2026 Open-Source AI Challenge, Week 3: Slow and Steady.*

## What I built

You know the PDF. Forty pages, due tomorrow, and you've read the same paragraph four times.

Studying it properly means doing a pile of chores first: pick out the key ideas, write notes, make flashcards and practice questions, check your answers against the text, and remember to revise next week. Most of us skip the chores and just reread. That's the least effective option there is.

**SlothWorld does the chores for you.** Drop in a PDF and a sloth turns it into a small 3D world in about a minute. Each key idea becomes an island, bridges lead from the basics to the ideas built on them, and every island has something to *do*:

- 🪨 **Riddle Stones** (quizzes) and ⚖️ **Scales of Truth** (is this claim supported by your PDF?)
- 🌉 **Word Bridges:** a real sentence from your PDF with the key words missing
- 🦥 **Pip**, a baby sloth who doesn't get the idea yet and wants *you* to explain it
- 🦉 **Professor Hoot** (press `H`), who answers questions only from your PDF, with the page
- 🏮 **The Review Grove**, which brings what you solved back after 10 minutes, then 1, 3, 7 and 21 days

There are no timers, no streaks and no penalty for a wrong answer. You move at sloth speed; the sloth did the work.

<!-- embed the demo video here -->

## The lazy payoff

| The chore | Done by |
|---|---|
| Finding the key ideas and the order to learn them | Gemma, about a minute for a short PDF |
| Writing quizzes, flashcards and fill-in-the-blank sentences | Gemma and plain code, from your PDF's own sentences |
| Checking answers against the text | Code: every quote and answer key is matched against the PDF |
| Explaining it to someone, the best test of understanding | Pip, on every island |
| Remembering to revise | The Review Grove, on a schedule |

It's built this way on purpose. Rereading and highlighting are rated among the least useful study techniques, while practice testing and spaced practice are rated the most useful ([Dunlosky et al., 2013](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)). And students try harder when they teach someone, the "protégé effect" ([Chase et al., 2009](https://purl.stanford.edu/zm369yx3532)). The lazy way to study well is to let a sloth set up the effective habits for you.

## Demo

<!-- embed video; add a GIF of teaching Pip -->

1. **The sample world** (*How Neural Networks Learn*, hand-written and labelled as such) has three working labs. Drag a neuron's weights and watch the output change; send a signal through a small network; roll a ball down a real loss curve with gradient descent. Every number is computed live.
2. **Teach Pip.** I typed half an explanation. Pip said I'd covered 1 of 3 key ideas and asked, *"What happens after you add those weighted inputs together?"* After my full answer: *"Ooh, I get it now!"*
3. **Ask Hoot** "What does the bias do?": the answer comes with the exact sentence from page 1, verified against the PDF. Ask about something the PDF doesn't cover and Hoot says so.
4. **My own PDF:** a 3-page water-cycle primer became a 5-island world in about 70 seconds, with every concept's quote verified against the PDF.

![Teaching Pip](<!-- upload docs/screenshots/23-teach-pip.png -->)

## Open models at the core

Gemma does the jobs a study partner would do. Plain code keeps it honest.

1. **Map the concepts.** Gemma reads the page-marked text and returns 4–6 key ideas with explanations, prerequisites, relationships, learning objectives and what the PDF leaves unclear. Each comes with a page number and a quote.
2. **Design each island.** For each idea, Gemma sees only the relevant pages and writes a quiz, a true-or-false claim, and a sequence (only if the text describes one).
3. **Be Pip.** Gemma judges which key ideas your explanation conveys and asks one Socratic question, never giving the answer away.
4. **Be Hoot.** Gemma answers from the relevant pages with a quote.

Gemma only ever returns structured data. A fixed set of 3D components draws the world, so the model never writes code or HTML.

**Trust, but verify.** A small model is only useful for studying if you can see where it's wrong. So every quote is searched for in the PDF and labelled *verified*, *page corrected*, *closest matching passage* or *not found*. The passage you read is always the PDF's own words.

The most useful lesson came from the smallest model. Running **Gemma 3 1B** on CPU, it marked the **wrong** answer as correct on 5 of its 6 quizzes for one PDF; one had "rivers and lakes" as the energy source that drives the water cycle. So I added an **answer-key check**: each quiz's answer must match the cited PDF passage, and Gemma's own explanation, better than every other option, or the quiz is dropped and noted in the world's validation report. It caught all 5 bad keys, and kept all 10 correct quizzes from earlier Gemma 4 runs. Pip has a similar guard: an idea only counts if your explanation shares real vocabulary with it, so an off-topic answer can't earn credit.

## Why open innovation matters here, and where it beat closed

- **Your notes stay yours.** Run locally, the PDF is read, mapped and quizzed entirely on your laptop. There's no account and no upload. Lecture notes, drafts and work documents never touch a server you don't control.
- **It works offline, and costs nothing to run.** Once Gemma is downloaded, there's no API key, no per-token bill and no usage cap. Once the model is loaded, Pip and Hoot answer in a second or two on a 6 GB laptop GPU, so you can talk to them as much as you like.
- **I could pick the right model for each place, and swap with one setting.** On my laptop I use **Gemma 4 E2B**: about 45–110 s per world, and better questions. For the public demo on CPU I use **Gemma 3 1B**. Same code; `SLOTH_MODEL` is the only difference.
- **I could see and fix its mistakes.** Because I run the model myself, I could test it on my own documents, watch it get answer keys wrong, and build checks around exactly those failures. With a hosted black box I'd have the same mistakes and less ability to understand them.

**Render as the AI runtime.** The online version runs in a single Render container: the web app, Ollama and Gemma 3 1B together, on plain CPUs with no GPU and no outside AI API. A world takes about 3–6 minutes there instead of 1 on a laptop GPU, and the online app is honest about privacy: it says your PDF is processed on the SlothWorld server, in memory, not stored, and not sent to any AI company. Each visitor gets 3 worlds and 40 questions per hour, so everyone gets a turn.

## How I built it

- **Frontend:** React and React Three Fiber (three.js). The islands, bridges, labs, Pip, Hoot and the sloth are procedural low-poly geometry, and the trees and rocks are reused models. Placement is deterministic: prerequisites first, related ideas next to each other.
- **Backend:** Node and Express read PDFs with pdf.js, in memory. Gemma runs through Ollama with JSON-schema-constrained output, then Zod validation and the repair and grounding checks.
- **Tests:** 35 unit tests, and 21 end-to-end checks that play the game in Chrome the way a learner would: the labs' numbers against the math, walking between islands, teaching Pip and asking Hoot with the real model, bad uploads (text, fake, scanned and empty files), and generating a world from a real PDF.

## What it can't do (yet)

- **No OCR.** Scanned PDFs are detected and you're told how to fix them.
- **Long PDFs are sampled.** Very long documents lose detail.
- **The hands-on labs are hand-built** for the sample world. Generated worlds get quizzes, claims, sequences, Word Bridges, Pip and Hoot.
- **The small online model writes simpler questions** than Gemma 4 on your own machine.

## Try it

- 🌐 **Play online:** <!-- Render URL -->
- 💻 **Run it yourself** (full Gemma 4 experience, works offline): <!-- https://github.com/royalharry007/SlothWorld -->
  ```bash
  git clone https://github.com/royalharry007/SlothWorld.git
  cd SlothWorld && npm install && npm run build && npm start
  ollama pull gemma4:e2b-it-qat   # enables PDF worlds, Pip and Hoot
  ```

Stop rereading. Let the sloth do the chores, then explore. 🦥
