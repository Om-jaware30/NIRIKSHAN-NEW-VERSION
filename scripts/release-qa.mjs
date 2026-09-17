import fs from 'node:fs';
import path from 'node:path';
import { realSummary } from '../artifacts/nirikshan-api/real-data.js';
import { realProjectIndex } from '../artifacts/nirikshan-api/real-project-index.js';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  'Dockerfile',
  'DEPLOY-HACKATHON.md',
  'artifacts/nirikshan-api/server.js',
  'artifacts/nirikshan-api/auth.js',
  'artifacts/nirikshan/package.json',
  'artifacts/nirikshan-api/package.json',
  'pnpm-lock.yaml',
  'package.json',
  '.env.example',
];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing release file: ${rel}`);
if (realProjectIndex.rows.length !== 131157) throw new Error(`Unexpected work index size: ${realProjectIndex.rows.length}`);
if (realSummary.totalMPs !== 774) throw new Error(`Unexpected MP count: ${realSummary.totalMPs}`);
if (realSummary.totalWorksCompleted !== 44028) throw new Error(`Unexpected completed-work count: ${realSummary.totalWorksCompleted}`);
if (realSummary.totalTransactions !== 108695) throw new Error(`Unexpected transaction count: ${realSummary.totalTransactions}`);
const server = fs.readFileSync(path.join(root, 'artifacts/nirikshan-api/server.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'artifacts/nirikshan-api/auth.js'), 'utf8');
for (const needle of ['express.static(PUBLIC_DIR', 'NIRIKSHAN_DATA_DIR', 'physicalProgress: completed ? 100 : null']) {
  if (!server.includes(needle)) throw new Error(`Release contract missing: ${needle}`);
}
for (const needle of ['JWT_SECRET', 'NIRIKSHAN_USERS_JSON']) {
  if (!auth.includes(needle)) throw new Error(`Auth contract missing: ${needle}`);
}

const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (rootPackage.scripts?.start !== 'node artifacts/nirikshan-api/server.js') throw new Error('Root start script is missing or incorrect');
const frontendService = fs.readFileSync(path.join(root, 'artifacts/nirikshan/src/lib/mock-service.ts'), 'utf8');
if (frontendService.includes('export const dashboardData =')) throw new Error('Stale hardcoded dashboardData export remains');
if (!frontendService.includes('getWorkIntelligenceSummary')) throw new Error('Canonical work intelligence client missing');
if (!server.includes('app.get(/^(?!')) throw new Error('SPA fallback route missing');

console.log('NIRIKSHAN release QA passed');
console.log(JSON.stringify({ MPs: realSummary.totalMPs, works: realProjectIndex.rows.length, completedWorks: realSummary.totalWorksCompleted, transactions: realSummary.totalTransactions }, null, 2));
