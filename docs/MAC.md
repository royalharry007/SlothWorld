# Running SlothWorld on a Mac

SlothWorld uses only cross-platform tools: Node.js, Ollama, Gemma and a web browser. The project includes the Mac build tools for both Apple Silicon (M1 or newer) and Intel Macs. It has been developed and tested on Windows; the Mac steps below haven't been run on a real Mac yet.

## 1. Install the tools (one time)

1. **Node.js 20 or newer:** download the macOS installer (LTS) from [nodejs.org](https://nodejs.org) and run it.
2. **Git:** open **Terminal** and type `git --version`. If macOS offers to install the developer tools, click **Install**.
3. **Ollama:** download the Mac app from [ollama.com/download](https://ollama.com/download). Drag it to **Applications** and open it once; a llama icon appears in the menu bar. (Or run `brew install ollama` and then `ollama serve`.) Use a recent version, since Gemma 4 needs Ollama 0.30.5 or newer.
4. **Google Chrome:** recommended for the best WebGL performance, and needed for the automated tests.

## 2. Get SlothWorld and the model

In **Terminal**:

```bash
git clone https://github.com/royalharry007/SlothWorld.git
cd SlothWorld
npm install
npm run build
```

Then download Gemma:

| Your Mac | Run this | Notes |
|---|---|---|
| Apple Silicon (M1/M2/M3/M4) with **16 GB** or more | `ollama pull gemma4:e2b-it-qat` | The best experience; Ollama uses the Mac's GPU |
| Apple Silicon with **8 GB** | `ollama pull gemma4:e2b-it-qat` | Should work; close other apps first. If it's slow, use `gemma3:1b` instead |
| Intel Mac | `ollama pull gemma3:1b` | CPU only: about 3–5 minutes per world |

To check your Mac, open the Apple menu → **About This Mac**: it shows the *Chip* (Apple M… or Intel) and *Memory*.

## 3. Start it

**With Gemma 4 (the default):**

```bash
npm start
```

**With Gemma 3 1B:**

```bash
SLOTH_MODEL=gemma3:1b SLOTH_MAX_CONCEPTS=4 npm start
```

On an Intel Mac, also add `SLOTH_NUM_GPU=0` before `npm start`.

Open **http://127.0.0.1:8787** in Chrome. The dot on the start page turns green when the model is ready. Leave Terminal open while you use SlothWorld; press `Ctrl+C` there to stop it.

## 4. Mac shortcuts

- **Full screen in Chrome:** `Cmd+Ctrl+F`
- **Private window:** `Cmd+Shift+N`
- **Screen recording:** `Cmd+Shift+5`, then choose *Record Entire Screen* or *Record Selected Portion*. QuickTime Player → File → New Screen Recording does the same.
- In SlothWorld the keys are the same as on Windows: `W A S D` walk, `E` use, `H` ask Hoot, `J` journal, `M` world map, `Esc` close.

## Troubleshooting

- **The green dot doesn't appear.** Make sure the Ollama app is running (the llama icon is in the menu bar) and that `ollama list` shows the model.
- **`npm install` fails.** Check `node --version`: it must be 20 or newer.
- **Port 8787 is busy.** Start with `PORT=8790 npm start` and open http://127.0.0.1:8790.
- **The 3D view freezes or goes blank** (low memory while the model runs). Click **Wake the world up**; your progress is kept. Closing other apps helps.
- **Safari** should work too, but Chrome is what was tested.
- **Running the automated tests on a Mac:** `npm test` works anywhere. `npm run e2e` finds Chrome in `/Applications` automatically, or set `CHROME_PATH`.
