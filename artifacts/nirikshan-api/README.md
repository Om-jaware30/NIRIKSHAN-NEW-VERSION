# NIRIKSHAN API + Web App — Hackathon Release

NIRIKSHAN is shipped as a **single Node/Express service** for the hackathon prototype. The service exposes the API and, when the frontend is built, serves the React/Vite application from the same origin.

## Run locally

From the repository root (`src`):

```text
pnpm install
pnpm --filter @workspace/nirikshan build
pnpm --filter nirikshan-api start
```

Open `http://localhost:4000`. The API health check is `http://localhost:4000/api/health`.

For frontend development with hot reload, run the Vite dev server separately:

```text
pnpm --filter @workspace/nirikshan dev
pnpm --filter nirikshan-api start
```

## Docker

The repository-level `Dockerfile` is the recommended deployment path. It installs the workspace from the lockfile, builds the frontend and starts one Node service.

```text
docker build -t nirikshan .
docker run --rm -p 4000:4000 \
  -e NODE_ENV=production \
  -e JWT_SECRET="replace-with-a-random-32-plus-character-secret" \
  -e NIRIKSHAN_USERS_JSON='[{"id":"officer-1","username":"officer","password":"change-me","role":"officer"}]' \
  -e CORS_ORIGIN="http://localhost:4000" \
  -v nirikshan-data:/app/runtime \
  nirikshan
```

## Prototype accounts

Local/development mode provides four demo accounts:

- civilian / Civic@123
- officer / Officer@123
- incharge / Incharge@123
- contractor / Contractor@123

These are **demo fixtures**, not government identities. Demo login is disabled when `NODE_ENV=production`.

## Data boundary

The supplied MPLADS recommended/completed work registers and expenditure data are the source for the prototype intelligence. Work ID is the primary construction unit; MP records are portfolio context. Maharashtra PWD SSR 2022–23 values are historical reference data where used. No supplied second-scheme register, satellite dataset or binary evidence store is treated as available.

## Evidence boundary

Field/video workflows currently persist inspection metadata and notes rather than image/video binaries. A government production rollout would need an authorized object store, evidence retention policy and signed access URLs.
