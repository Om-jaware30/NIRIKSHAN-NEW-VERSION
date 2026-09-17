## NIRIKSHAN 16.1 release note
This package is a single-service Node/Express deployment. Build the frontend first, then start the API service; the Express server serves the built frontend and `/api/*` routes. The root `start` script is intended for Node hosts; Docker remains the recommended single-service deployment path.

# NIRIKSHAN — Work-Centric MPLADS Intelligence

**Hackathon deployment release:** NIRIKSHAN 16

NIRIKSHAN is an end-to-end monitoring prototype built around a simple architecture:

```text
Supplied MPLADS registers
        ↓
Work ID as primary intelligence unit
        ↓
Automatic screening engines
        ↓
Explainable work intelligence
        ↓
Role-aware dashboard + NIREE
        ↓
Human verification / action
```

## Key prototype capabilities

- 131,157 work-index records from the supplied registers
- 774 MP portfolio records kept as context
- Work Register + Work 360
- automatic duplicate-description screening
- financial/utilization screening
- completion/progress screening without inventing physical 0% progress
- evidence availability screening
- explainable work-level risk priority
- role-based access for civilian, officer, in-charge and contractor perspectives
- NIREE conversational access to the same work-intelligence results
- field inspection with local-first metadata capture
- BOQ/rate workflow with explicit source boundaries
- cross-scheme funding guardrail when the second register is unavailable
- single-service Docker deployment with SPA routing and persistent runtime volume

## Deploy

Read `DEPLOY-HACKATHON.md` first. The recommended path is the repository `Dockerfile`.

```text
docker build -t nirikshan .
docker run --rm -p 4000:4000 \
  -e NODE_ENV=production \
  -e JWT_SECRET="replace-with-a-random-32-plus-character-secret" \
  -e CORS_ORIGIN="http://localhost:4000" \
  -e NIRIKSHAN_USERS_JSON='[{"id":"officer-1","username":"officer","password":"change-this","role":"officer"}]' \
  -v nirikshan-data:/app/runtime \
  nirikshan
```

For local development, see `artifacts/nirikshan-api/README.md`.

## Prototype honesty

Signals are review prompts, not findings of fraud or misconduct. Historical PWD SSR values are labeled as historical reference rates. Missing satellite, second-scheme and binary evidence inputs are not fabricated.
