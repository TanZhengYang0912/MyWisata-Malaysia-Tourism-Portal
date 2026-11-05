# Build:  docker build --secret id=env,src=.env.local -t mywisata .
# Run:    docker run --rm -p 3000:3000 --env-file .env.local mywisata
# See docs/plans/2026-11-03-1123-run-app-in-docker.md. Vercel crons do not run inside this container.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# The type check needs more than Node's default heap in the ~8 GB Docker VM.
ENV NODE_OPTIONS=--max-old-space-size=4096
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined into browser code at build time; the env file is mounted only for this step.
RUN --mount=type=secret,id=env,target=/app/.env.local npm run build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
