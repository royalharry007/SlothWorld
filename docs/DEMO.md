# Recording the SlothWorld demo on a MacBook

**Goal:** a calm 2½–3 minute video for the Best Use of Gemma entry. Judges decide in the first 30 seconds whether to keep watching, so open with the problem and the world, not the setup.

## A. The day before: set up and rehearse (about 30 minutes)

1. Install everything with [docs/MAC.md](MAC.md): Node.js, Ollama, Chrome, the SlothWorld code, and the model for your Mac.
2. Run it once (`npm start`, then open http://127.0.0.1:8787 in Chrome) and **do the whole script below as a rehearsal**. It warms up the model, and you'll find out how long generation takes on your Mac.
3. Put `public/samples/the-water-cycle.pdf` on the Desktop, ready to drag in.
4. Open **Notes** with the two Pip texts (end of this file) ready to copy.

## B. Right before recording (10 minutes)

1. **Restart the Mac.** Then quit everything you don't need: Slack, other browsers, Photos, Xcode.
2. **Turn on Do Not Disturb:** Control Centre → Focus → Do Not Disturb, so no notifications appear in the video.
3. **Hide the Dock and clean the desktop:** System Settings → Desktop & Dock → *Automatically hide and show the Dock*.
4. **Plug in the charger.** Macs slow down on battery under load.
5. **Warm the model** in Terminal:
   ```bash
   ollama run gemma4:e2b-it-qat "Say OK."      # or gemma3:1b
   ```
6. **Start SlothWorld** in the project folder:
   ```bash
   npm start
   ```
7. **Open Chrome in a private window** (`Cmd+Shift+N`) at http://127.0.0.1:8787, then go full screen with `Cmd+Ctrl+F`. A private window means progress starts at 0 and no old worlds show.

## C. Recording

- **Screen:** press `Cmd+Shift+5` → *Record Entire Screen* → **Options** → set *Microphone* to *None* (record your voice separately). The stop button appears in the menu bar.
  - *Alternative:* OBS Studio (free) gives 1080p at 60 fps and more control.
- **Voice:** record each line separately with the iPhone **Voice Memos** app or a headset, in a quiet room. Separate takes sound calmer, and you can redo a line without redoing the video.
- **Mistakes:** redo just that shot. You'll cut the shots together.

## D. Shot list and voice-over script (about 2 min 50 s)

| # | On screen | Voice-over |
|---|---|---|
| 1 | The landing page. Don't touch anything; the islands drift. *(0:00–0:12)* | "You know that PDF you've reread four times and still can't explain? Studying it properly means a pile of chores: notes, flashcards, practice questions, revision. So most of us just reread." |
| 2 | Move the mouse over the green dot under the buttons. *(0:12–0:20)* | "SlothWorld does the chores for you, using Gemma, Google's open model, running right here on my MacBook." |
| 3 | Click **Explore the sample world**; the camera glides down. Click **Start exploring**. *(0:20–0:28)* | "This sample is hand-made, about how neural networks learn." |
| 4 | Click **Walk me there**; the sloth crosses the bridge by itself. *(0:28–0:36)* | "Feeling lazy? The sloth walks you to your next challenge." |
| 5 | At the Neuron Machine, press `E`. Drag **w2** below zero (the tube turns red), then raise **w1** and **w3** until *output* is above 0.90. Press `Esc`. *(0:36–0:55)* | "It's a real neuron. A negative weight holds the input back. Every number is calculated live." |
| 6 | Walk to **Pip** (the small sloth with a "?" on a stump) and press `E`. Paste **Pip text 1** and click **Teach Pip**. *(0:55–1:05)* | "Here's the heart of it. You learn best by teaching, so meet Pip, who doesn't get it yet." |
| 7 | Wait for Pip's answer. Point the mouse at *"1 of 3 key ideas"*, then at Pip's question. *(1:05–1:15)* | "Pip only knows the key sentences from the PDF. I got one idea across, so Pip asks about what I missed, without giving the answer away." |
| 8 | Paste **Pip text 2**, click **Teach Pip**, and wait for *"I get it now!"* and the green box. *(1:15–1:25)* | "Explain it fully, and Pip gets it. So do I." |
| 9 | Press `Esc`, then `H`. Type *What does the bias do?* and press Return. Point at **Quote verified in the PDF**, then click **Open page 1** (the sentence is highlighted). *(1:25–1:40)* | "Stuck? Professor Hoot answers only from my PDF, shows the exact sentence, and opens the page." |
| 10 | Press `Esc`. At the **Word Bridge**, press `E`, click *amplifies*, then *suppresses*, then **Check words**. *(1:40–1:50)* | "Word Bridges are real sentences from the PDF with the key words missing." |
| 11 | Click **Exit**, then **Create a world from a PDF**, and drag in *the-water-cycle.pdf* from the Desktop. Show the stages ticking. *(1:50–2:05; cut the waiting in editing)* | "Now any PDF. Gemma maps the key ideas, designs every island, and SlothWorld checks each quote against the document." |
| 12 | The new world opens with the **AI-generated · gemma…** badge. Show the objectives, then click **Start exploring**. *(2:05–2:15)* | "A different document makes a different world, in the order you'd learn it. That took about a minute; making these notes and quizzes by hand would take me hours." |
| 13 | Press `J`. Show the concept map, scroll down and open the **Validation report**. *(2:15–2:28)* | "Small models make mistakes, so SlothWorld checks them. Anything Gemma got wrong is fixed or flagged, never hidden." |
| 14 | Press `Esc`. Walk to the **Review Grove** (the lantern tree on the start island) and press `E`. *(2:28–2:40)* | "What you solve comes back after ten minutes, then tomorrow, then next week. Slow and steady." |
| 15 | Press `M` for the world map. Hold for 3 seconds, then end on a title card with the logo and **github.com/royalharry007/SlothWorld**. *(2:40–2:52)* | "Open model, on my own machine, no cloud, no cost. Stop rereading. Let the sloth do the chores." |

> **Timing on 12:** if your Mac took longer than a minute, say the real time ("about two minutes") or show it in a caption. Never claim a time you didn't see.

### Pip text 1 (shot 6)

```
A neuron takes its inputs, multiplies each by a weight and adds them up.
```

### Pip text 2 (shot 8)

```
There is also a bias added to the weighted sum. Positive weights amplify an input and negative weights suppress it, and the sigmoid turns big positive sums into outputs near 1 and big negative sums into outputs near 0.
```

Pip and Hoot write fresh replies each time, so the exact words may differ from the script. Just keep the meaning of your line.

## E. Editing (iMovie is free on every Mac)

1. Import the screen clips and voice memos into a new iMovie project.
2. Put the clips in shot order and drop each voice line under its shot.
3. **Cut the generation wait** in shot 11 down to about 3 seconds, and add a caption with the real time ("≈ 1 minute on a MacBook").
4. Add the title card at the end: **SlothWorld**, *Stop rereading. Start exploring.*, and the GitHub link.
5. Export at 1080p: File → Share → File.
6. Upload to **YouTube** (Unlisted is fine). DEV embeds YouTube with `{% embed https://youtu.be/... %}`.

## F. For the DEV post

- **GIF:** make a 5-second GIF of shots 7–8 (teaching Pip). It's the most memorable moment, and many readers won't play the video. On a Mac, record that part with `Cmd+Shift+5` and convert it with a free tool such as Gifski.
- **Cover image:** `docs/screenshots/01-landing.png`.
- **Images in the post:** `docs/screenshots/23-teach-pip.png` and `docs/screenshots/05-neuron-lab.png`.
