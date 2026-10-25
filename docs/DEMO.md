# Recording the SlothWorld demo

**Target:** a 2½–3 minute video. Judges decide in the first 30 seconds whether to keep watching, so open with the problem and the world, not the setup.

## Before you record (10 minutes)

1. **Free memory.** Close Chrome tabs, games and other heavy apps; the model and the 3D world share 8 GB.
2. **Warm the model** so nothing waits on a cold start:
   ```bash
   ollama run gemma4:e2b-it-qat "Say OK."
   ```
3. **Start the production build:** `npm run build && npm start`, then open http://127.0.0.1:8787.
4. **Use a fresh browser profile** (or a private window), so progress starts at 0 and no old worlds show.
5. **Use a real browser with the GPU,** not a remote desktop. Full screen with F11, 1920×1080.
6. **Pre-generate the PDF world once,** so the second generation during recording is the warm one (about 45–70 s).
7. **Have these ready:**
   - `public/samples/the-water-cycle.pdf` in a folder you can drag from;
   - the explanation text for Pip, written below so you can type it smoothly.

**Tools:** OBS Studio (free) or Xbox Game Bar (`Win+G`). Record at 1080p60. Record your voice separately with a phone or headset, then lay it over the video; it sounds calmer and lets you redo lines.

## Shot list

| # | Time | What to show | What to say (short) |
|---|---|---|---|
| 1 | 0:00–0:12 | The landing page, with the islands slowly orbiting | "Rereading a dense PDF feels like studying, but nothing sticks. SlothWorld turns it into a world you explore slowly, at your own pace." |
| 2 | 0:12–0:20 | Click **Explore the sample world**; the camera glides down to the sloth | "This is a hand-made sample about how neural networks learn." |
| 3 | 0:20–0:30 | Click **Walk me there**; the sloth crosses the bridge by itself | "No hurry. The sloth knows the way to your next challenge." |
| 4 | 0:30–0:50 | **Neuron Machine:** drag w2 negative (the tube turns red), then push the output above 0.90 | "It's a real neuron. Every number is computed live." |
| 5 | 0:50–1:15 | **Pip** (the small sloth with a "?"). Type the **partial** answer below, show Pip's question, then type the **full** answer; Pip says "I get it now!" | "Here's the core idea: you learn by teaching. Pip only knows the key sentences from the PDF, and asks about whatever you missed." |
| 6 | 1:15–1:30 | Press **H** and ask Hoot "What does the bias do?". Show the green *Quote verified in the PDF* and click **Open page 1** | "Stuck? Professor Hoot answers only from your document, with the page." |
| 7 | 1:30–1:40 | Fill in a **Word Bridge** and get "The bridge holds!" | "Real sentences from your PDF, key words missing." |
| 8 | 1:40–2:15 | **Exit → Create a world from a PDF**, drop the water-cycle PDF and show the 5 stages. **Cut the wait in editing.** Then the new world opens with its *AI-generated · gemma4* badge | "Now my own PDF. Gemma, running on my laptop, maps the concepts and designs each island. Every quote is checked against the PDF." |
| 9 | 2:15–2:30 | In the new world, open the journal (**J**): the concept map and the **validation report** | "Different document, different world. Anything the model got wrong is fixed or flagged, never hidden." |
| 10 | 2:30–2:45 | The **Review Grove** with glowing lanterns | "What you solve comes back tomorrow, in three days, in a week. Slow and steady." |
| 11 | 2:45–2:55 | The world map (**M**), with blooming islands | "Stop rereading. Start exploring." Then the logo and the repo URL. |

### Text to type for Pip (shot 5)

- **Partial:** `A neuron takes its inputs, multiplies each by a weight and adds them up.`
- **Full:** `There is also a bias added to the weighted sum. Positive weights amplify an input and negative weights suppress it, and the sigmoid turns big positive sums into outputs near 1 and big negative sums into outputs near 0.`

## Tips

- **Move the camera slowly.** Drag gently and let the camera settle before talking about something.
- **Keep the mouse still** while a panel is being read.
- **Be honest about the wait.** If you cut the generation wait, say "this takes about a minute on my laptop" out loud or in a caption.
- **Show one flagged item if a world has one** (an "approximate" or "not found" badge). It proves the honesty checks are real.
- **Add a 3–5 second GIF to the DEV post** of shot 5 (teaching Pip). It's the most distinctive moment, and many readers won't play the video.

## Optional: the public Render demo

If you deploy to Render (`docs/DEPLOY_RENDER.md`), add a 10-second clip of the live URL loading the sample world. Mention that the online version uses the smaller Gemma 3 1B model on a CPU, so worlds take a few minutes there.
