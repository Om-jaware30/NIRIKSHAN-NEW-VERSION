# NIRIKSHAN 16 — Hackathon Deploy Release

## Release goal

A single-service, work-centric NIRIKSHAN prototype suitable for a Grand Finale demonstration: real supplied MPLADS work data feeds internal intelligence engines, the dashboard exposes the results, and NIREE explains the same canonical results.

## Release fixes

- Frontend/API deployment unified through the repository Dockerfile.
- Express serves the built SPA and API from one origin.
- SPA deep-link fallback added.
- `pnpm-lock.yaml` cleaned so the API importer no longer declares an unused `bcryptjs` dependency.
- Work records no longer represent an uncompleted/missing physical progress value as a fake `0%`.
- Progress analysis reports unavailable physical progress as `Not reported` and avoids fabricating a gap.
- Officer dashboard displays the canonical nested work risk score correctly.
- Risk contribution labels distinguish progress and data-quality signals.
- Basic security headers added.
- Health endpoint reports whether the frontend build is present and how many work rows are loaded.
- Deployment documentation now treats Node/Docker as the primary target rather than Cloudflare Worker.

## Honest prototype boundaries

The release is designed to be **hackathon-deployable**, not government-production certified. Runtime state uses JSON persistence, evidence uploads are metadata-only, and NIREE is a role-aware rule-based conversational layer.
