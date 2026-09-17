## NIRIKSHAN 16.1 release note
This package is a single-service Node/Express deployment. Build the frontend first, then start the API service; the Express server serves the built frontend and `/api/*` routes. The root `start` script is intended for Node hosts; Docker remains the recommended single-service deployment path.

# NIRIKSHAN — Hackathon Deployment Checklist

## What this release is designed to demonstrate

**Real register data → automatic work-level intelligence → role-aware dashboard → NIREE explanation → human action.**

The construction **Work ID** is the primary intelligence unit. MP portfolios remain context.

## Fastest deployment path

Use the repository `Dockerfile`. Build and run the image on any Docker-capable host with a persistent writable volume.

### Environment

```text
NODE_ENV=production
PORT=<host supplied port or 4000>
JWT_SECRET=<random 32+ character secret>
NIRIKSHAN_USERS_JSON=<JSON array of demo users>
CORS_ORIGIN=<public app origin>
NIRIKSHAN_DATA_DIR=/app/runtime
```

Example user JSON shape:

```json
[{"id":"officer-demo","username":"officer","password":"change-this","role":"officer"}]
```

Use separate demo passwords for the public deployment. Do not publish a real credential in the repository.

## Grand-finale demo flow

1. **Officer login**
2. Dashboard shows the real work-register scale and automatic intelligence summary.
3. Open the **Work Register** and search a real Work ID.
4. Open **Work 360** to show the canonical work record.
5. Show the automatically derived duplicate, financial, progress, evidence and risk signals.
6. Open **NIREE** and ask why the selected work received its priority.
7. Move to **Field Inspection** and attach a field note/photo reference.
8. Show role-specific visibility and the human-review guardrail.

## What not to claim

- Do not call screening signals fraud findings.
- Do not call historical PWD SSR 2022–23 values current market prices.
- Do not claim satellite detection when no satellite source is connected.
- Do not claim a second-scheme double-funding match when the second register is unavailable.
- Do not claim image/video binaries are stored when only metadata is persisted.
- Do not call the demo accounts government identities.
