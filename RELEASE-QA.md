# NIRIKSHAN 16 release QA

## Checks completed in the available build environment

- API JavaScript syntax check passed with `node --check` for `server.js` and `auth.js`.
- JSON package manifests parse successfully.
- `pnpm-lock.yaml` parses successfully as YAML and the API importer no longer declares the unused `bcryptjs` dependency.
- Real-data modules load successfully in Node.
- Supplied data summary loads 774 MP portfolios, 131,157 work-index rows, 44,028 completed works and 108,695 transaction records.
- Work-level screening was checked independently and produces varied risk scores; the old repeated 14-point missing-data bucket is not used by the new work-intelligence formula.
- Work records now use `null` for physical progress when completion is not recorded; the API no longer converts missing in-progress measurement into fake 0% physical completion.
- Production authentication requires a 32+ character `JWT_SECRET` and `NIRIKSHAN_USERS_JSON`; demo-login is disabled in production.
- Express now serves the built SPA and API from one origin, with deep-link fallback for browser routes.

## Checks that must be run on the deployment/build machine

The available build environment did not have the workspace dependencies installed and could not complete a network-backed `pnpm install`. Therefore the release does **not** claim that the final dependency-backed TypeScript build was executed here.

Run before public deployment:

```text
pnpm install --frozen-lockfile
pnpm --filter @workspace/nirikshan typecheck
pnpm --filter @workspace/nirikshan build
pnpm --filter nirikshan-api check
```

Then run the Docker image and smoke-test login, Work Register, Work 360, intelligence endpoints, NIREE, field inspection, reports and role access.

## Honest deployment boundary

This is a hackathon-level working prototype. It is designed for a strong Grand Finale demonstration, not government production certification. Persistent runtime state is JSON-file based, evidence uploads are metadata-only, and some advanced inputs such as live satellite imagery and second-scheme funding registers are intentionally not fabricated when absent.
