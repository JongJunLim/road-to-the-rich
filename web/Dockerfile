# Road To The Rich — Cloud Run 이미지 (Next.js standalone)
# 빌드:  docker build -t road-to-the-rich .
# 실행:  docker run -p 8080:8080 road-to-the-rich        (기본 DATA_MODE=demo)

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 app
COPY --from=build --chown=app /app/.next/standalone ./
COPY --from=build --chown=app /app/.next/static ./.next/static
COPY --from=build --chown=app /app/public ./public
COPY --from=build --chown=app /app/data ./data
USER app
EXPOSE 8080
CMD ["node", "server.js"]
