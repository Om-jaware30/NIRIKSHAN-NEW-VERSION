# NIRIKSHAN — single-service production/hackathon deployment
# Builds the React/Vite UI and serves it from the same Node/Express service.
FROM node:22-alpine AS build
WORKDIR /workspace
ENV CI=true
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate \
  && pnpm install --frozen-lockfile --filter @workspace/nirikshan... --filter nirikshan-api... \
  && pnpm --filter @workspace/nirikshan build \
  && pnpm deploy --filter nirikshan-api --prod /out/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NIRIKSHAN_DATA_DIR=/app/runtime
ENV PORT=4000
# pnpm deploy creates a standalone API dependency tree for the runtime image.
COPY --from=build /out/api ./
COPY --from=build /workspace/artifacts/nirikshan-api/public ./public
RUN mkdir -p /app/runtime && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
