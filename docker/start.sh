#!/bin/sh
# Start Ollama in the background, wait for it, warm the model, then run SlothWorld in the foreground.
set -e

ollama serve &

echo "[start] waiting for Ollama..."
until ollama list >/dev/null 2>&1; do sleep 1; done

# Load the model into memory now so the first visitor doesn't pay the load time.
# Failure here is not fatal: the app reports model problems clearly in the UI.
echo "[start] warming ${SLOTH_MODEL}..."
ollama run "${SLOTH_MODEL}" "Say OK." >/dev/null 2>&1 || echo "[start] warm-up failed; continuing"

echo "[start] starting SlothWorld on ${HOST}:${PORT}"
exec node --import tsx server/index.ts
