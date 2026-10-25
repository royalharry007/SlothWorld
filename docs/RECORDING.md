# SlothWorld demo: what to record

You record **one screen clip and one voice line per shot**. I put them together: I sync each voice line to its clip, trim the dead time, speed up the waiting, add captions and a title card, and export a 1080p video plus GIFs.

**Total length: about 2 min 45 s. 15 shots.**

## Before you start

1. Set up and rehearse once with [docs/MAC.md](MAC.md) and [docs/DEMO.md](DEMO.md) (sections A and B).
2. Chrome in a **private window**, **full screen** (`Cmd+Ctrl+F`), at http://127.0.0.1:8787.
3. Do Not Disturb on, Dock hidden, charger plugged in.

## How to record each clip

- Press `Cmd+Shift+5` → **Record Entire Screen** → Options → Microphone: **None**. Click to start; press the stop button in the menu bar to stop.
- **Start each clip 1 second before** the action and **stop 1–2 seconds after**. I trim the edges, so extra seconds are fine; missing seconds aren't.
- Rename each clip to its shot number: `shot01.mov`, `shot02.mov` … `shot15.mov`.
- **Can't get one right?** Record it again and keep the best take. Only the files named `shotNN` are used.

## How to record the voice

- Use the iPhone **Voice Memos** app (or QuickTime → New Audio Recording on the Mac) in a quiet room, phone 20–30 cm from your mouth.
- **One file per shot**, named `vo01.m4a` … `vo15.m4a`. MP3 or WAV are fine too.
- Speak slowly and calmly, with a short pause before you start. The video adjusts to your voice: if your line is longer than the clip, I hold the last frame.

## The 15 shots

| Shot | Length (about) | Record this on screen | Say this (voice file) |
|---|---|---|---|
| **01** | 12 s | The **landing page**. Don't touch anything; let the islands drift. | "You know that PDF you've reread four times and still can't explain? Studying it properly means a pile of chores: notes, flashcards, practice questions, revision. So most of us just reread." |
| **02** | 8 s | Slowly move the mouse to the **green dot** under the two buttons and rest there. | "SlothWorld does the chores for you, using Gemma, Google's open model, running right here on my MacBook." |
| **03** | 8 s | Click **Explore the sample world**; the camera glides down. Wait, then click **Start exploring**. | "This sample world is hand-made, about how neural networks learn." |
| **04** | 8 s | Click **Walk me there** (bottom centre) and let the sloth walk over the bridge until the prompt appears. | "Feeling lazy? The sloth walks you to your next challenge." |
| **05** | 18 s | At the Neuron Machine press `E`. Drag **w2** below zero (the tube turns red). Raise **w1** and **w3** until *output* is above **0.90**. Press `Esc`. | "This is a real neuron. A negative weight holds its input back. Every number here is calculated live." |
| **06** | 10 s | Walk to **Pip** (the little sloth on a stump with a "?") and press `E`. Paste **Pip text 1**, click **Teach Pip**. | "Here's the heart of SlothWorld. You learn best by teaching, so meet Pip, who doesn't get it yet." |
| **07** | 10 s | Wait for Pip's reply. Move the mouse to *"Pip understood 1 of 3 key ideas"*, then to Pip's question. | "Pip only knows the key sentences from the PDF. I got one idea across, so Pip asks about what I missed, without giving the answer away." |
| **08** | 10 s | Paste **Pip text 2**, click **Teach Pip**, and wait for *"I get it now!"* and the green box. | "Explain it fully, and Pip gets it. And so do I." |
| **09** | 15 s | Press `Esc`, then `H`. Type *What does the bias do?* and press Return. Point at **Quote verified in the PDF**, then click **Open page 1**. | "Stuck? Professor Hoot answers only from my PDF, shows the exact sentence, and opens the page." |
| **10** | 10 s | Press `Esc`. At the **Word Bridge** press `E`. Click *amplifies*, then *suppresses*, then **Check words**. | "Word Bridges are real sentences from the PDF, with the key words missing." |
| **11** | the whole wait | Click **Exit** → **Create a world from a PDF** → drag in *the-water-cycle.pdf*. **Keep recording the whole wait** until the new world appears. | "Now any PDF. Gemma maps the key ideas, designs every island, and SlothWorld checks each quote against the document." |
| **12** | 10 s | The new world, with the **AI-generated** badge. Move the mouse over the objectives, then click **Start exploring**. | "A different document makes a different world, in the order you'd learn it. Making these notes and quizzes by hand would take hours." |
| **13** | 12 s | Press `J`. Show the concept map, scroll down and click **Validation report** to open it. | "Small models make mistakes, so SlothWorld checks them. Anything Gemma got wrong is fixed or flagged, never hidden." |
| **14** | 12 s | Press `Esc`. Walk to the **Review Grove** (the lantern tree on the start island) and press `E`. | "What you solve comes back after ten minutes, then tomorrow, then next week. Slow and steady." |
| **15** | 8 s | Press `M` for the world map. Hold still for 5 seconds. | "Open model, on my own machine, no cloud, no cost. Stop rereading. Let the sloth do the chores." |

**Shot 11:** record the full wait. I speed it up and show the **real time** in a caption, so judges see an honest number.

**Shot 05:** if it takes you longer than 18 seconds, that's fine; I'll keep the important part.

### Pip text 1 (shot 06)

```
A neuron takes its inputs, multiplies each by a weight and adds them up.
```

### Pip text 2 (shot 08)

```
There is also a bias added to the weighted sum. Positive weights amplify an input and negative weights suppress it, and the sigmoid turns big positive sums into outputs near 1 and big negative sums into outputs near 0.
```

Pip and Hoot write fresh replies each time, so their exact words may differ from the script. Keep the meaning of your line.

## Sending me the files

Copy all clips and voice files into this folder on the Windows PC:

```
C:\Users\ViciousMartianee\Videos\SlothWorld\recording\
```

The easiest route from a Mac is a USB stick, Google Drive or OneDrive. Put everything in one folder, no subfolders needed:

```
recording/
  shot01.mov  shot02.mov  …  shot15.mov
  vo01.m4a    vo02.m4a    …  vo15.m4a
```

Then tell me "files are ready" and I'll edit it. The `recording/` folder isn't uploaded to GitHub.

## What you get back

In `recording/output/`:

- `slothworld-demo.mp4`: the finished 1080p video, ready for YouTube.
- `pip.gif`, `hoot.gif`, `neuron.gif`: short GIFs for the DEV post.
- `cover.png`: a title-card image you can use as the DEV cover.
