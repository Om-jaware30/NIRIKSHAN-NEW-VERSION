# NIRIKSHAN deployment guide

## Recommended hackathon deployment

Deploy the **repository-level Dockerfile** as one Node service. It builds the React frontend and serves it from the same Express process as the API. This avoids the previous two-host frontend/API ambiguity.

### Required production variables

- `NODE_ENV=production`
- `PORT` — supplied by the host; defaults to `4000`
- `JWT_SECRET` — random secret, at least 32 characters
- `NIRIKSHAN_USERS_JSON` — JSON array of the users/roles needed for the demo
- `CORS_ORIGIN` — exact frontend origin(s), comma separated. For the single-service deployment this is normally the public app origin.
- `NIRIKSHAN_DATA_DIR` — persistent writable directory; default Docker path is `/app/runtime`

### Important

The runtime state is a JSON file. **Attach persistent storage** if the deployment platform recreates containers; otherwise inspections, reports and reviews recorded during a demo can disappear after restart.

### Build contract

The Docker build performs:

1. `pnpm install --frozen-lockfile`
2. frontend production build
3. API + frontend packaged into one image
4. Node/Express serves `/api/*` and the SPA from one origin
5. `/api/health` is the container health endpoint

### SPA routing

The API serves `index.html` as the fallback for non-API browser routes such as `/dashboard` and `/projects/...`, so refreshing a deep link does not require a separate static-host rewrite rule.

## Local verification

```text
pnpm install
pnpm --filter @workspace/nirikshan typecheck
pnpm --filter @workspace/nirikshan build
pnpm --filter nirikshan-api check
pnpm --filter nirikshan-api start
```

Then verify:

- `/api/health`
- login for the required role
- Work Register search
- Work 360
- automatic intelligence dashboard
- duplicate / progress / financial / risk analysis
- NIREE
- field inspection
- reports/review
- BOQ and funding guardrails
- role-based access

## Prototype honesty

This is a hackathon-level working prototype, not a claim of government production certification. It demonstrates a real-data, work-centric monitoring architecture with role-based access, explainable screening and connected workflows.
