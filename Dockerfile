# Token Arcade: one image, two processes/origins (arcade web+API, and cartridges).
# Run as two services from this image (see render.yaml):
#   ROLE=api        -> web build + API on $PORT
#   ROLE=cartridges -> cartridge origin on $PORT
FROM node:22.12-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY cartridges/coindle/package.json cartridges/coindle/package-lock.json* cartridges/coindle/
RUN npm ci && npm ci --prefix cartridges/coindle
COPY . .
# VITE_PRIVY_APP_ID is baked into the web bundle at build time (public value, not a secret).
ARG VITE_PRIVY_APP_ID=""
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID
RUN npm run build
ENV NODE_ENV=production LOCAL_DEMO_MODE=false HOST=0.0.0.0 CARTRIDGE_HOST=0.0.0.0
CMD ["sh", "-c", "if [ \"$ROLE\" = cartridges ]; then CARTRIDGE_PORT=${PORT:-8788} exec node scripts/cartridges.mjs; else exec node --experimental-sqlite --experimental-strip-types apps/api/src/server.ts; fi"]
