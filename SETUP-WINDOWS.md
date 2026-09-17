## NIRIKSHAN 16.1 release note
This package is a single-service Node/Express deployment. Build the frontend first, then start the API service; the Express server serves the built frontend and `/api/*` routes. The root `start` script is intended for Node hosts; Docker remains the recommended single-service deployment path.

# NIRIKSHAN Phase 2 — Windows setup

This ZIP contains the complete NIRIKSHAN Phase 2 source/configuration. `node_modules`, caches, Git metadata, and old build output are intentionally excluded so the archive stays clean and portable.

## First run

1. Install Node.js 22 LTS (or the Node version already used by your NIRIKSHAN setup).
2. Install pnpm if it is not already installed:
   `corepack enable`
   `corepack prepare pnpm@latest --activate`
3. Open this folder in VS Code.
4. In the project root run:
   `pnpm install`
5. Start the NIRIKSHAN frontend:
   `pnpm --filter @workspace/nirikshan dev`

For a production build:

`pnpm --filter @workspace/nirikshan build`

The build is generated at:
`artifacts/nirikshan-api/public`

## Phase 2 perspectives

- Civilian
- Government Officer
- Project In-Charge
- Contractor

A single project-data guideline is shown on the four-perspectives entry screen. The interface itself stays clean; operational records may be modeled where public project data is incomplete.

## NIREE

NIREE is the role-aware Nirikshan project assistant. It is available as a floating assistant after login and answers from project information available to the current role. It does not bypass role-based access.

## Public project records

The register now includes selected public infrastructure projects alongside the existing operational records. Publicly reported fields are kept separate from progress fields that are not available in the current record; NIREE and the UI do not invent missing physical/financial progress.
