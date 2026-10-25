# SlothWorld + Ollama + gemma3:1b in one container, for CPU-only hosts such as Render.
# The model is baked into the image, so nothing is downloaded when the service starts.

# ---- 1. build the web app ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 2. runtime: Ollama image + Node + app ----
FROM ollama/ollama:latest
ARG SLOTH_MODEL=gemma3:1b

# Node runtime copied from the official image (Ollama's image is Ubuntu-based, glibc-compatible).
COPY --from=build /usr/local/bin/node /usr/local/bin/node

# Pull the model at build time.
RUN (ollama serve >/tmp/ollama-build.log 2>&1 &) \
 && until ollama list >/dev/null 2>&1; do sleep 1; done \
 && ollama pull ${SLOTH_MODEL} \
 && ollama list

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY docker/start.sh ./docker/start.sh
RUN sed -i 's/\r$//' docker/start.sh && chmod +x docker/start.sh

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    OLLAMA_HOST=127.0.0.1:11434 \
    OLLAMA_KEEP_ALIVE=24h \
    OLLAMA_NUM_PARALLEL=1 \
    SLOTH_HOSTED=1 \
    SLOTH_MODEL=${SLOTH_MODEL} \
    SLOTH_NUM_GPU=0 \
    SLOTH_NUM_THREAD=2 \
    SLOTH_NUM_CTX=4096 \
    SLOTH_MAX_CONCEPTS=4 \
    SLOTH_CALL_TIMEOUT_MS=600000 \
    SLOTH_RATE_LIMIT_PER_HOUR=3 \
    SLOTH_TUTOR_LIMIT_PER_HOUR=40

EXPOSE 10000
ENTRYPOINT []
CMD ["/app/docker/start.sh"]
