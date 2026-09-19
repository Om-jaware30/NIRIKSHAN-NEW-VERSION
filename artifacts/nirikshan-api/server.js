import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { login, authenticateToken, requireRole } from "./auth.js";
import { realProjects, realSummary, realStates, realCategories, realStatuses } from "./real-data.js";
import { realProjectIndex } from "./real-project-index.js";
import { maharashtraSsrMaterialRates, boqPrototypeLines, convergencePrototypeRecords } from "./reference-data.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.NIRIKSHAN_DATA_DIR || path.join(__dirname, 'runtime');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const allowedOrigins = String(process.env.CORS_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
if (process.env.NODE_ENV === 'production' && !allowedOrigins.length) throw new Error('CORS_ORIGIN must be set in production.');
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: false }));
app.use(express.json({ limit: '2mb' }));
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { inspections: {}, reports: [], opinions: [], reviews: [], videoEvidence: [] }; } }
function saveState() { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(runtimeState, null, 2)); }
const runtimeState = loadState();
function persist() { try { saveState(); intelligenceSummaryCache = null; } catch (err) { console.warn('State persistence unavailable:', err?.message || err); } }

/* =========================================================
   AUTHENTICATION
   ========================================================= */

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: "Username and password are required",
    });
  }

  const result = login(username, password);

  if (!result) {
    return res.status(401).json({
      error: "Invalid username or password",
    });
  }

  res.json(result);
});

app.post("/api/demo-login", (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({error:'Demo login is disabled in production.'});
  const { role } = req.body;

  const credentials = {
    civilian: {
      username: "civilian",
      password: "Civic@123",
    },
    officer: {
      username: "officer",
      password: "Officer@123",
    },
    incharge: {
      username: "incharge",
      password: "Incharge@123",
    },
    contractor: {
      username: "contractor",
      password: "Contractor@123",
    },
  };

  const account = credentials[role];

  if (!account) {
    return res.status(400).json({
      error: "Invalid role",
    });
  }

  const result = login(account.username, account.password);

  if (!result) {
    return res.status(401).json({
      error: "Demo login failed",
    });
  }

  res.json(result);
});

/* =========================================================
   AUTHENTICATED USER
   ========================================================= */

app.get("/api/me", authenticateToken, (req, res) => {
  res.json({
    user: req.user,
  });
});

/* =========================================================
   REAL MPLADS REGISTER DATA
   =========================================================
   Project record data.
   Production version should use a database.
   ========================================================= */

const projects = realProjects.map((project) => ({
  ...project,
  // Backward-compatible aliases used by existing workflow handlers.
  expenditure: project.currentExpenditure,
}));
const persistedProjectState = runtimeState.projectState || {};
for (const project of projects) {
  const saved = persistedProjectState[project.id];
  if (saved && typeof saved === 'object') Object.assign(project, saved);
}
function persistProject(project) {
  runtimeState.projectState = runtimeState.projectState || {};
  runtimeState.projectState[project.id] = {
    milestones: project.milestones || [], executionIssues: project.executionIssues || [],
    workUpdates: project.workUpdates || [], contractorReports: project.contractorReports || [], siteReports: project.siteReports || [],
    civilianReports: project.civilianReports || [], videoEvidence: project.videoEvidence || [],
    physicalProgress: project.physicalProgress, status: project.status
  };
  persist();
}

const datasetMeta = {
  source: projectSourceLabel(),
  totalMPs: realSummary.totalMPs,
  totalWorksRecommended: realSummary.totalWorksRecommended,
  totalWorksCompleted: realSummary.totalWorksCompleted,
  totalTransactions: realSummary.totalTransactions,
};

function projectSourceLabel() {
  return 'MPLADS register export supplied for NIRIKSHAN';
}

const projectIndexDicts = realProjectIndex.dicts;
const projectIndexRows = realProjectIndex.rows;

function workValue(row, dictName, index) {
  return projectIndexDicts[dictName]?.[row[index]] || '';
}

function workRecordFromRow(row) {
  const recommended = row[7];
  const finalAmount = row[9];
  const completed = Boolean(row[16]);
  const financialProgress = recommended && finalAmount != null
    ? Number((finalAmount / recommended * 100).toFixed(1))
    : null;
  return {
    id: `MPLADS-WORK-${row[0]}`,
    workId: row[0],
    name: workValue(row, 'Work Description', 1),
    description: workValue(row, 'Work Description', 1),
    category: workValue(row, 'Category', 2),
    mpName: workValue(row, 'MP Name', 3),
    constituency: workValue(row, 'Constituency', 4),
    location: workValue(row, 'Constituency', 4),
    locality: row[15] || workValue(row, 'Constituency', 4),
    district: row[14] || '',
    state: workValue(row, 'State', 5),
    house: workValue(row, 'House', 6),
    recommendedAmount: recommended,
    finalAmount,
    sanctionedCost: recommended ?? finalAmount ?? null,
    currentExpenditure: finalAmount,
    recommendationDate: row[8] || '',
    completedDate: row[10] || '',
    status: completed ? 'Completed' : 'Recommended',
    hasImages: Boolean(row[11]),
    averageRating: row[12] == null ? null : row[12],
    ida: workValue(row, 'IDA', 13),
    responsibleAuthority: workValue(row, 'IDA', 13),
    // The supplied register provides completion status, not an in-progress
    // physical measurement. Never turn missing progress into a fake 0% value.
    physicalProgress: completed ? 100 : null,
    financialProgress,
    progressReported: completed,
    public: true,
    dataSource: 'MPLADS work register supplied for NIRIKSHAN',
    recordType: 'work',
    milestones: completed
      ? [{ name: 'Work recommended', status: 'Completed' }, { name: 'Work completed', status: 'Completed' }]
      : [{ name: 'Work recommended', status: 'Recorded' }, { name: 'Work completed', status: 'Pending' }],
    publicUpdates: [
      completed ? `Work #${row[0]} is recorded as completed.` : `Work #${row[0]} is recorded as recommended and not present in the supplied completion register.`,
      recommended != null ? `Recommended amount: ₹${Number(recommended).toLocaleString('en-IN')}.` : '',
      finalAmount != null ? `Final recorded amount: ₹${Number(finalAmount).toLocaleString('en-IN')}.` : ''
    ].filter(Boolean),
    civilianReports: [], executionIssues: [], workUpdates: [], contractorReports: [], fieldInspections: [], videoEvidence: [],
    signals: { cost: { actualCost: finalAmount, benchmarkRange: null, deviation: financialProgress == null ? null : Number((financialProgress - 100).toFixed(1)), severity: 'Low', reason: 'Work-level financial context is derived from the supplied recommendation/completion registers; no external market benchmark is asserted.' }, mismatch: { physical: completed ? 100 : null, financial: financialProgress, gap: completed && financialProgress != null ? Number((financialProgress - 100).toFixed(1)) : null, severity: 'Low', reason: 'Work-level progress is derived only from register completion status and recorded amounts.' }, duplicate: { similarity: 0, matchedProject: 'No automated duplicate verdict', severity: 'Low', reason: 'Duplicate screening requires scope and location verification.' }, timeline: { expected: row[10] || '', daysOverdue: 0, severity: 'Low', reason: 'No completion target is supplied in this work register.' } },
    recommendedWorks: 1, completedWorks: completed ? 1 : 0, transactionCount: 0, successfulPayments: 0, pendingPayments: 0, completionRatePct: completed ? 100 : null, utilizationPct: finalAmount != null && recommended ? Number((finalAmount / recommended * 100).toFixed(1)) : null,
    recommendedWorksSample: [{ workId: row[0], description: workValue(row, 'Work Description', 1), category: workValue(row, 'Category', 2), amount: recommended, date: row[8] || '', hasImages: Boolean(row[11]), ida: workValue(row, 'IDA', 13) }],
    completedWorksSample: completed ? [{ workId: row[0], description: workValue(row, 'Work Description', 1), category: workValue(row, 'Category', 2), amount: finalAmount, date: row[10] || '', hasImages: Boolean(row[11]), rating: row[12] == null ? null : row[12], ida: workValue(row, 'IDA', 13) }] : [],
    transactionSample: [], repeatedWorkSamples: []
  };
}

const projectRegisterMeta = {
  total: projectIndexRows.length,
  recommendedRecords: projectIndexRows.filter(row => row[7] != null).length,
  completedRecords: projectIndexRows.filter(row => row[16]).length,
  overlappingWorkIds: projectIndexRows.filter(row => row[16] && row[7] != null).length,
  source: 'MPLADS recommended-work and completed-work registers supplied for NIRIKSHAN'
};

// Feed the existing duplicate-review signal with the actual supplied work register.
// This does not label anything as fraudulent; it only counts exact repeated descriptions
// within each MP portfolio so the officer can compare Work IDs, scope and location.
const normalizeWorkDescription = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const repeatedByMp = new Map();
for (const row of projectIndexRows) {
  const mp = workValue(row, 'MP Name', 3);
  const description = normalizeWorkDescription(workValue(row, 'Work Description', 1));
  if (!mp || !description) continue;
  const key = `${mp}\u0000${description}`;
  const item = repeatedByMp.get(key) || { mp, description, workIds: [] };
  item.workIds.push(Number(row[0]));
  repeatedByMp.set(key, item);
}
const duplicateSummaryByMp = new Map();
for (const item of repeatedByMp.values()) {
  if (item.workIds.length > 1) {
    const current = duplicateSummaryByMp.get(item.mp) || { count: 0, examples: [] };
    current.count += item.workIds.length - 1;
    if (current.examples.length < 5) current.examples.push(item);
    duplicateSummaryByMp.set(item.mp, current);
  }
}
for (const project of projects) {
  const summary = duplicateSummaryByMp.get(project.name);
  if (summary) {
    project.signals = project.signals || {};
    project.signals.duplicate = {
      similarity: Math.min(1, summary.count / 5),
      matchedProject: `${summary.count} repeated work description signal${summary.count === 1 ? '' : 's'}`,
      severity: summary.count >= 3 ? 'Medium' : 'Low',
      reason: 'Exact repeated work descriptions found in the supplied recommendations; verify Work IDs, scope and location.'
    };
  }
}

function filteredWorkRows(req) {
  const query = String(req.query?.query || '').trim().toLowerCase();
  const state = String(req.query?.state || '').trim().toLowerCase();
  const district = String(req.query?.district || '').trim().toLowerCase();
  const area = String(req.query?.area || '').trim().toLowerCase();
  const category = String(req.query?.category || '').trim().toLowerCase();
  const status = String(req.query?.status || '').trim().toLowerCase();
  const house = String(req.query?.house || '').trim().toLowerCase();
  return projectIndexRows.filter(row => {
    const desc = workValue(row, 'Work Description', 1);
    const mp = workValue(row, 'MP Name', 3);
    const constituency = workValue(row, 'Constituency', 4);
    const st = workValue(row, 'State', 5);
    const h = workValue(row, 'House', 6);
    const cat = workValue(row, 'Category', 2);
    const ds = String(row[14] || '');
    const loc = String(row[15] || '');
    const hay = `${row[0]} ${desc} ${mp} ${constituency} ${st} ${ds} ${loc} ${cat} ${h}`.toLowerCase();
    const rowStatus = row[16] ? 'completed' : 'recommended';
    return (!query || hay.includes(query))
      && (!state || st.toLowerCase() === state)
      && (!district || ds.toLowerCase() === district)
      && (!area || `${loc} ${constituency} ${ds} ${desc}`.toLowerCase().includes(area))
      && (!category || cat.toLowerCase() === category)
      && (!status || rowStatus === status)
      && (!house || h.toLowerCase() === house);
  });
}

function paginateRows(rows, req) {
  const page = Math.max(1, Number(req.query?.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(req.query?.pageSize || 50)));
  const start = (page - 1) * pageSize;
  return { page, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)), rows: rows.slice(start, start + pageSize) };
}

function filteredProjects(req, list = projects) {
  const query = String(req.query?.query || '').trim().toLowerCase();
  const state = String(req.query?.state || '').trim().toLowerCase();
  const category = String(req.query?.category || '').trim().toLowerCase();
  const status = String(req.query?.status || '').trim().toLowerCase();
  const risk = String(req.query?.risk || '').trim().toLowerCase();
  return list.filter((p) => {
    const hay = `${p.id} ${p.name} ${p.location} ${p.state} ${p.house}`.toLowerCase();
    return (!query || hay.includes(query))
      && (!state || p.state.toLowerCase() === state)
      && (!category || p.category.toLowerCase() === category)
      && (!status || p.status.toLowerCase() === status)
      && (!risk || p.riskLevel.toLowerCase() === risk);
  });
}


/* =========================================================
   WORK-LEVEL INTELLIGENCE
   ========================================================= */
function getWorkRow(workId) {
  const id = String(workId || '').replace(/^MPLADS-WORK-/, '');
  return projectIndexRows.find(row => String(row[0]) === id);
}
function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function workSimilarity(a, b) {
  const aa = new Set(normalizeText(a).split(' ').filter(x => x.length > 2));
  const bb = new Set(normalizeText(b).split(' ').filter(x => x.length > 2));
  if (!aa.size || !bb.size) return 0;
  let common = 0; for (const token of aa) if (bb.has(token)) common++;
  return common / Math.max(aa.size, bb.size);
}
const workDuplicateIndex = new Map();
for (const row of projectIndexRows) {
  const key = normalizeText(workValue(row, 'Work Description', 1));
  if (!key) continue;
  const list = workDuplicateIndex.get(key) || [];
  list.push(row);
  workDuplicateIndex.set(key, list);
}
const workTokenIndex = new Map();
for (const row of projectIndexRows) {
  const tokens = new Set(normalizeText(workValue(row, 'Work Description', 1)).split(' ').filter(t => t.length > 3));
  for (const token of tokens) { const list=workTokenIndex.get(token)||[]; if(list.length<200) list.push(row); workTokenIndex.set(token,list); }
}
function workIntelligenceRecord(row, options = {}) {
  const includeFuzzy = options.includeFuzzy !== false;
  const work = workRecordFromRow(row);
  const key = normalizeText(work.description);
  const exactPool = workDuplicateIndex.get(key) || [];
  const exactMatches = exactPool.filter(r => String(r[0]) !== String(row[0])).slice(0, 8);
  const candidateRows = [];
  if (includeFuzzy) {
    const tokens = new Set(key.split(' ').filter(t => t.length > 3));
    for (const token of tokens) {
      for (const candidate of (workTokenIndex.get(token) || [])) {
        if (String(candidate[0]) !== String(row[0])) candidateRows.push(candidate);
        if (candidateRows.length >= 80) break;
      }
      if (candidateRows.length >= 80) break;
    }
  }
  const seen = new Set();
  const fuzzyMatches = candidateRows.map(r => ({ row:r, similarity:workSimilarity(work.description, workValue(r,'Work Description',1)) }))
    .filter(x => { const id=String(x.row[0]); if(seen.has(id)) return false; seen.add(id); return x.similarity >= 0.72; })
    .sort((a,b)=>b.similarity-a.similarity).slice(0,5);
  const recommended = work.recommendedAmount == null ? null : Number(work.recommendedAmount);
  const finalAmount = work.finalAmount == null ? null : Number(work.finalAmount);
  const utilization = recommended && finalAmount != null ? Number((finalAmount / recommended * 100).toFixed(1)) : null;
  const completed = work.status === 'Completed';
  const duplicateSignal = Math.min(30, exactMatches.length * 10 + fuzzyMatches.length * 6);
  let financialSignal=0, progressSignal=0, evidenceSignal=0;
  const reasons=[];
  if (exactMatches.length) reasons.push(`${exactMatches.length} exact repeated-description match${exactMatches.length===1?'':'es'} found in the supplied register.`);
  if (fuzzyMatches.length) reasons.push(`${fuzzyMatches.length} similar-description candidate${fuzzyMatches.length===1?'':'s'} passed the screening threshold.`);
  if (utilization != null && utilization > 100) { financialSignal=25; reasons.push(`Recorded final amount exceeds the recommended amount by ${(utilization-100).toFixed(1)}%.`); }
  else if (utilization != null && completed && utilization < 40) { financialSignal=10; reasons.push(`Completed record has low recorded utilization of ${utilization}%.`); }
  if (finalAmount != null && !completed && recommended && finalAmount > 0) { progressSignal=12; reasons.push('A final amount is present while the supplied completion register does not mark the work completed.'); }
  if (completed && !work.hasImages) { evidenceSignal=8; reasons.push('The supplied completed record does not report an image flag.'); }
  const completenessFields=[work.workId,work.description,work.category,work.mpName,work.constituency,work.state,work.recommendedAmount,work.recommendationDate,work.hasImages];
  const present=completenessFields.filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').length;
  const dataCompleteness=Math.round(present/completenessFields.length*100);
  const dataQualitySignal=dataCompleteness<60?6:dataCompleteness<80?3:0;
  if(dataQualitySignal) reasons.push(`Data completeness is ${dataCompleteness}%, so additional source verification may be needed.`);
  if(!reasons.length) reasons.push('No material screening signal was identified from the supplied fields.');
  const riskScore=Math.max(0,Math.min(100,duplicateSignal+financialSignal+progressSignal+evidenceSignal+dataQualitySignal));
  const riskLevel=riskScore>=55?'High':riskScore>=30?'Medium':'Low';
  return {...work,intelligence:{completionProxy:completed?100:null,progressStatus:completed?'Recorded as completed':'Completion not recorded',spendRatio:utilization,financialGap:utilization==null?null:Number((utilization-(completed?100:0)).toFixed(1)),duplicateCount:exactMatches.length,fuzzyMatchCount:fuzzyMatches.length,riskScore,riskLevel,riskParts:{duplicate:duplicateSignal,financial:financialSignal,progress:progressSignal,evidence:evidenceSignal,dataQuality:dataQualitySignal},dataCompleteness,reasons,riskReason:reasons.join(' '),action:riskLevel==='High'?'Prioritize human verification.':riskLevel==='Medium'?'Review supporting records and consider field verification.':'Routine monitoring; no immediate screening action.'}};
}
function filteredWorkIntelligence(req) {
  const q = String(req.query?.query || '').trim().toLowerCase();
  const state = String(req.query?.state || '').trim().toLowerCase();
  const house = String(req.query?.house || '').trim().toLowerCase();
  const riskLevel = String(req.query?.riskLevel || '').trim();
  const signal = String(req.query?.signal || '').trim().toLowerCase();
  const rows = projectIndexRows.filter(row => {
    const work = workValue(row,'Work Description',1).toLowerCase();
    const mp = workValue(row,'MP Name',3).toLowerCase();
    const constituency = workValue(row,'Constituency',4).toLowerCase();
    const st = workValue(row,'State',5).toLowerCase();
    const h = workValue(row,'House',6).toLowerCase();
    if(q && !`${row[0]} ${work} ${mp} ${constituency}`.includes(q)) return false;
    if(state && st !== state) return false;
    if(house && h !== house) return false;
    if(riskLevel || signal){
      const i=workIntelligenceRecord(row,{includeFuzzy:false}).intelligence;
      if(riskLevel && i.riskLevel !== riskLevel) return false;
      if(signal==='financial' && !(i.riskParts.financial>0)) return false;
      if(signal==='duplicate' && !(i.duplicateCount>0||i.fuzzyMatchCount>0)) return false;
      if(signal==='progress' && !(i.riskParts.progress>0)) return false;
      if(signal==='evidence' && !(i.riskParts.evidence>0)) return false;
      if(signal==='incomplete' && !(i.dataCompleteness<80)) return false;
    }
    return true;
  });
  return rows;
}

let intelligenceSummaryCache = null;
let intelligenceSummaryAt = 0;
app.get('/api/officer/intelligence-summary', authenticateToken, requireRole('officer','incharge'), (req,res)=>{
  if (intelligenceSummaryCache && Date.now()-intelligenceSummaryAt < 60000) return res.json(intelligenceSummaryCache);
  let high=0, medium=0, low=0, duplicate=0, financial=0, progress=0, evidence=0, incomplete=0;
  for (const row of projectIndexRows) {
    const description=workValue(row,'Work Description',1);
    const exact=Math.max(0,(workDuplicateIndex.get(normalizeText(description))||[]).length-1);
    const recommended=row[7]==null?null:Number(row[7]); const finalAmount=row[9]==null?null:Number(row[9]); const completed=Boolean(row[16]);
    const utilization=recommended&&finalAmount!=null?(finalAmount/recommended*100):null;
    const duplicateSignal=Math.min(30,exact*10);
    const financialSignal=utilization!=null&&utilization>100?25:utilization!=null&&completed&&utilization<40?10:0;
    const progressSignal=finalAmount!=null&&!completed&&recommended&&finalAmount>0?12:0;
    const evidenceSignal=completed&&!Boolean(row[11])?8:0;
    const fields=[row[0],description,workValue(row,'Category',2),workValue(row,'MP Name',3),workValue(row,'Constituency',4),workValue(row,'State',5),recommended,row[8],row[11]];
    const completeness=Math.round(fields.filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').length/fields.length*100);
    const dataQuality=completeness<60?6:completeness<80?3:0;
    const score=Math.max(0,Math.min(100,duplicateSignal+financialSignal+progressSignal+evidenceSignal+dataQuality));
    if(score>=55)high++; else if(score>=30)medium++; else low++;
    if(exact>0)duplicate++; if(financialSignal>0)financial++; if(progressSignal>0)progress++; if(evidenceSignal>0)evidence++; if(completeness<80)incomplete++;
  }
  intelligenceSummaryCache={works:projectIndexRows.length,high,medium,low,duplicateSignals:duplicate,financialSignals:financial,progressSignals:progress,evidenceSignals:evidence,incompleteRecords:incomplete,source:projectRegisterMeta.source}; intelligenceSummaryAt=Date.now();
  res.json(intelligenceSummaryCache);
});

app.get('/api/officer/work-intelligence', authenticateToken, requireRole('officer','incharge'), (req,res)=>{
  const rows = filteredWorkIntelligence(req);
  const page = Math.max(1, Number(req.query?.page || 1));
  const pageSize = Math.min(50, Math.max(10, Number(req.query?.pageSize || 20)));
  const start = (page - 1) * pageSize;
  res.json({ total: rows.length, page, pageSize, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)), works: rows.slice(start,start+pageSize).map(workIntelligenceRecord), source: projectRegisterMeta.source });
});

app.get('/api/officer/work/:workId/intelligence', authenticateToken, requireRole('officer','incharge'), (req,res)=>{
  const row = getWorkRow(req.params.workId);
  if (!row) return res.status(404).json({error:'Work record not found'});
  res.json({work: workIntelligenceRecord(row)});
});

app.get('/api/officer/work/:workId/duplicate-analysis', authenticateToken, requireRole('officer','incharge'), (req,res)=>{
  const row = getWorkRow(req.params.workId);
  if (!row) return res.status(404).json({error:'Work record not found'});
  const base = workIntelligenceRecord(row);
  const exact = (workDuplicateIndex.get(normalizeText(base.description)) || []).filter(r => String(r[0]) !== String(row[0]));
  const fuzzyCandidates = [];
  const tokens = new Set(normalizeText(base.description).split(' ').filter(t=>t.length>3));
  for (const token of tokens) for (const candidate of (workTokenIndex.get(token)||[])) if(String(candidate[0])!==String(row[0])) fuzzyCandidates.push(candidate);
  const seen = new Set();
  const candidateRows = [...exact, ...fuzzyCandidates].filter(r=>{const id=String(r[0]);if(seen.has(id))return false;seen.add(id);return true;});
  const matches = candidateRows.map(r => {
    const p = workRecordFromRow(r);
    const sameDistrict = String(p.district||'').toLowerCase() === String(base.district||'').toLowerCase();
    const sameState = String(p.state||'').toLowerCase() === String(base.state||'').toLowerCase();
    const similarity = workSimilarity(base.description,p.description);
    const exactMatch = normalizeText(base.description) === normalizeText(p.description);
    return { id:p.id, workId:p.workId, name:p.name, location:p.locality || p.constituency, district:p.district, state:p.state, category:p.category, similarity:Number(similarity.toFixed(3)), proximityKm:null, status:p.status, recommendedAmount:p.recommendedAmount, finalAmount:p.finalAmount, matchType:exactMatch?'Exact normalized description':'Similarity candidate', factors:[exactMatch?'Exact normalized description':'Similar description', sameDistrict?'Same district':sameState?'Same state':'Different geography'] };
  }).filter(x=>x.matchType.startsWith('Exact')||x.similarity>=0.72).sort((a,b)=>b.similarity-a.similarity).slice(0,10);
  res.json({projectId:base.id, workId:base.workId, selected:base, matches, recommendation:matches.length?'Compare Work IDs, sanction scope, locality and completion evidence before treating the records as the same work.':'No exact repeated work description was found in the supplied register; broader GIS/scope matching would require additional location data.', sampleLabel:'Derived from supplied MPLADS work register'});
});

app.get('/api/officer/work/:workId/progress-analysis', authenticateToken, requireRole('officer','incharge'), (req,res)=>{
  const row=getWorkRow(req.params.workId); if(!row)return res.status(404).json({error:'Work record not found'});
  const w=workIntelligenceRecord(row); const financial=w.intelligence.spendRatio; const physical=w.intelligence.completionProxy;
  const difference = physical != null && financial != null ? Number((financial-physical).toFixed(1)) : null;
  const anomalyScore = difference == null ? null : Math.min(100, Math.round(Math.abs(difference)*1.5));
  res.json({projectId:w.id,workId:w.workId,financialProgress:financial,physicalProgress:physical,expectedRange:w.status==='Completed'?[90,100]:null,difference,anomalyScore,explanation:`Physical progress is only available as a completion-status proxy when the supplied register marks the work completed. A recommended-but-not-completed record is reported as physical progress not reported, not 0%. Financial progress is recorded final amount divided by recommended amount where both are available. This is a screening comparison, not a certified measurement.`,recommendation:difference!=null&&difference>15?'Verify expenditure against site progress, measurement records and completion evidence.':physical==null?'Collect a field measurement or completion update before interpreting physical progress.':'Continue routine monitoring and verify against field evidence when available.',sampleLabel:'Derived from supplied MPLADS work register'});
});

app.get('/api/officer/work/:workId/financial-analysis', authenticateToken, requireRole('officer','incharge'), (req,res)=>{
  const row=getWorkRow(req.params.workId); if(!row)return res.status(404).json({error:'Work record not found'});
  const w=workIntelligenceRecord(row); const recommended=Number(w.recommendedAmount||0); const finalAmount=w.finalAmount==null?null:Number(w.finalAmount); const variance=finalAmount==null||recommended===0?null:Number(((finalAmount-recommended)/recommended*100).toFixed(1));
  res.json({projectId:w.id,workId:w.workId,description:w.description,recommendedAmount:recommended,finalAmount,unspentAmount:finalAmount==null?null:Number((recommended-finalAmount).toFixed(2)),utilizationPct:finalAmount==null||recommended===0?null:Number((finalAmount/recommended*100).toFixed(1)),variancePct:variance,category:w.category,state:w.state,authority:w.responsibleAuthority,hasImages:w.hasImages,factors:[finalAmount==null?'No final amount is present in the supplied completion register.':'Final amount is present in the supplied completion register.',w.hasImages?'Image flag is present in the completion record.':'No image flag is reported in the completion record.'],recommendation:finalAmount!=null&&variance>0?'Review final amount against the sanctioned/recommended amount and supporting measurement/payment records.':'Reconcile the work record with completion and payment evidence before closing the financial review.',sampleLabel:'Derived from supplied MPLADS work register; no market-rate benchmark asserted'});
});

app.get('/api/officer/work/:workId/risk-analysis', authenticateToken, requireRole('officer','incharge'), (req,res)=>{
  const row=getWorkRow(req.params.workId); if(!row)return res.status(404).json({error:'Work record not found'});
  const w=workIntelligenceRecord(row); res.json({projectId:w.id,workId:w.workId,overallScore:w.intelligence.riskScore,level:w.intelligence.riskLevel,contributions:w.intelligence.riskParts,dataCompleteness:w.intelligence.dataCompleteness,summary:'Work-level priority combines duplicate, financial, progress, evidence and data-quality screening signals.',attentionReason:w.intelligence.riskReason,reasons:w.intelligence.reasons,recommendation:w.intelligence.action,guardrail:'This is a screening priority, not a finding of fraud or misconduct.',sampleLabel:'Derived from supplied MPLADS work register'});
});

/* =========================================================
   PHASE 2 — FINANCIAL TRANSACTION BOOK / BENCHMARKING / VIDEO EVIDENCE
   ========================================================= */
function buildTransactions(project) {
  return (project.transactionSample || []).map((tx, index) => ({
    id: `TX-${project.id}-${index + 1}`,
    projectId: project.id,
    date: tx.date,
    work: tx.work,
    amount: Number((Number(tx.amount || 0) / 100000).toFixed(2)),
    payee: tx.payee || 'Not reported',
    category: project.category || 'Public Works',
    status: tx.status || 'Recorded',
    milestone: 'Recorded expenditure',
    source: project.dataSource,
    ida: tx.ida || '',
  }));
}

function buildComparison(project) {
  const peers = projects.filter((p) => p.id !== project.id && p.state === project.state);
  const pool = peers.length ? peers : projects.filter((p) => p.id !== project.id);
  const records = pool.slice().sort((a, b) => Math.abs((b.physicalProgress || 0) - (project.physicalProgress || 0)) - Math.abs((a.physicalProgress || 0) - (project.physicalProgress || 0))).slice(0, 5).map((p) => ({
    id: p.id,
    label: p.name,
    region: `${p.location}, ${p.state}`,
    physicalProgress: p.physicalProgress == null ? null : Number(p.physicalProgress),
    financialProgress: Number(p.financialProgress || 0),
    completionDays: null,
  }));
  const avgPhysical = records.length ? Number((records.reduce((n, r) => n + r.physicalProgress, 0) / records.length).toFixed(1)) : 0;
  const avgFinancial = records.length ? Number((records.reduce((n, r) => n + r.financialProgress, 0) / records.length).toFixed(1)) : 0;
  const physical = Number(project.physicalProgress || 0);
  const financial = Number(project.financialProgress || 0);
  const physicalGap = Number((physical - avgPhysical).toFixed(1));
  const financialGap = Number((financial - avgFinancial).toFixed(1));
  let assessment = 'Current portfolio progress is being compared with other MPLADS portfolio records in the same state.';
  if (physicalGap <= -8 && financialGap >= 8) assessment = 'Physical completion is below the selected state peer range while expenditure-to-allocation is higher.';
  else if (physicalGap <= -8) assessment = 'Physical completion is below the selected state peer range.';
  else if (physicalGap >= 8) assessment = 'Physical completion is above the selected state peer range.';
  return { projectId: project.id, projectType: project.type, current: { physicalProgress: physical, financialProgress: financial }, comparables: records, averageComparable: { physicalProgress: avgPhysical, financialProgress: avgFinancial }, variance: { physicalGap, financialGap }, assessment, recommendation: 'Use the comparison as a review prompt and validate the underlying register records before making a consequential decision.', sampleLabel: 'Derived from supplied MPLADS register' };
}
function buildSatelliteObservation(project) {
  const seed = [...String(project.id || project.name || 'satellite')]
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  const previousActivity = 42 + (seed % 16);
  const activityChange = 14 + (seed % 13);
  const latestActivity = Math.min(92, previousActivity + activityChange);
  const observedProgress = Math.min(96, Math.max(18, latestActivity - 4));
  const physicalProgress = Number(project.completionRatePct ?? project.physicalProgress ?? 0);

  const gap = Math.abs(observedProgress - physicalProgress);
  const consistency = gap > 12 ? 'Review suggested' : 'Consistent';

  return {
    projectId: project.id,
    projectName: project.name,
    projectArea: `${project.location}, ${project.state}`,
    available: true,

    previousObservationDate: '2026-05-18',
    latestObservationDate: '2026-08-22',

    previousActivity,
    latestActivity,
    activityChange,
    observedProgress,
    consistency,

    observation:
      consistency === 'Review suggested'
        ? `Remote observation indicates increased site activity, but the estimated progress differs from the reported ${physicalProgress}% physical progress. A field verification is recommended.`
        : `Remote observation indicates site activity consistent with the reported ${physicalProgress}% physical progress.`,

    sampleLabel: 'Simulated satellite observation · prototype demo',

    demoNotice:
      'Simulated remote-observation data for demonstration. This is not a live satellite feed.'
  };
}

const videoEvidence = [];

/* =========================================================
   MP DIRECTORY + WORK-LEVEL PROJECT REGISTER
   ========================================================= */

app.get('/api/mp-register', (req, res) => {
  const query = String(req.query?.query || '').trim().toLowerCase();
  const state = String(req.query?.state || '').trim().toLowerCase();
  const house = String(req.query?.house || '').trim().toLowerCase();
  const rows = projects.filter(p => {
    const hay = `${p.name} ${p.location} ${p.state} ${p.id}`.toLowerCase();
    return (!query || hay.includes(query)) && (!state || p.state.toLowerCase() === state) && (!house || p.house.toLowerCase() === house);
  });
  const page = Math.max(1, Number(req.query?.page || 1));
  const pageSize = Math.min(50, Math.max(10, Number(req.query?.pageSize || 20)));
  const start = (page - 1) * pageSize;
  res.json({
    total: rows.length, page, pageSize, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
    mps: rows.slice(start, start + pageSize).map(p => ({ id:p.id, name:p.name, constituency:p.location, state:p.state, house:p.house, allocatedAmount:p.sanctionedCost, recommendedAmount:p.recommendedAmount, expenditure:p.currentExpenditure, recommendedWorks:p.recommendedWorks, completedWorks:p.completedWorks, completionRate:p.completionRatePct, transactionCount:p.transactionCount, successfulPayments:p.successfulPayments, pendingPayments:p.pendingPayments, balanceNotYetPaidToVendors:p.balanceNotYetPaidToVendors, averageRating:p.averageRating, responsibleAuthority:p.responsibleAuthority, dataSource:p.dataSource }))
  });
});
let projectRegisterOptionsCache = null;
app.get('/api/project-register/options', (req, res) => {
  const hasFilters = ['query','state','district','area','category','status','house']
    .some(key => String(req.query?.[key] || '').trim());

  if (!hasFilters && projectRegisterOptionsCache) {
  return res.json(projectRegisterOptionsCache);
}

const rows = hasFilters ? filteredWorkRows(req) : projectIndexRows;
  const districts = [...new Set(rows.map(r => r[14]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const areasCount = new Map();
  for (const row of rows) { const area = String(row[15] || '').trim(); if (area) areasCount.set(area, (areasCount.get(area) || 0) + 1); }
  const areas = [...areasCount.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,250).map(([name,count])=>({name,count}));
  const result = { states: realStates, districts, categories: realCategories, houses:['Lok Sabha','Rajya Sabha'], statuses:['Recommended','Completed'], areas, total: rows.length, source: projectRegisterMeta.source };
if (!hasFilters) projectRegisterOptionsCache = result;
res.json(result);
});

app.get('/api/project-register', (req, res) => {
  const result = paginateRows(filteredWorkRows(req), req);
  res.json({ ...result, source: projectRegisterMeta.source, register: projectRegisterMeta, projects: result.rows.map(workRecordFromRow) });
});

app.get('/api/project-register/:workId', authenticateToken, (req, res) => {
  const id = String(req.params.workId).replace(/^MPLADS-WORK-/, '');
  const row = projectIndexRows.find(r => String(r[0]) === id);
  if (!row) return res.status(404).json({ error: 'Work/project record not found' });
  res.json({ project: workRecordFromRow(row) });
});

/* =========================================================
   CIVILIAN / PUBLIC
   ========================================================= */

app.get("/api/projects/public", (req, res) => {
  const publicProjects = filteredProjects(req).filter((project) => project.public)
    .map((project) => ({
      id: project.id,
      name: project.name,
      location: project.location,
      type: project.type,
      status: project.status,
      physicalProgress: project.physicalProgress,
      financialProgress: project.financialProgress,
      progressReported: project.progressReported !== false,
      plannedCompletion: project.plannedCompletion,
      actualCompletion: project.actualCompletion,
      mpName: project.name,
      house: project.house,
      allocatedAmount: project.sanctionedCost,
      recommendedAmount: project.recommendedAmount,
      completedWorks: project.completedWorks,
      recommendedWorks: project.recommendedWorks,
      transactionCount: project.transactionCount,
      dataSource: project.dataSource,
      responsibleAuthority: project.responsibleAuthority,
      budget: project.budget,
      publicUpdates: project.publicUpdates,
      civilianReports: project.civilianReports,
    }));

  res.json({
    projects: publicProjects,
  });
});

/* =========================================================
   GOVERNMENT OFFICER
   ========================================================= */

app.get(
  "/api/officer/projects",
  authenticateToken,
  requireRole("officer"),
  (req, res) => {
    const oversightProjects = filteredProjects(req).map((project) => ({
      ...project,

      aiReviewSignal:
        project.riskLevel === "High"
          ? "Elevated risk signals require officer attention."
          : "Routine monitoring signal.",

      requiresHumanVerification: true,

      internalReview: {
        priority:
          project.riskLevel === "High"
            ? "High"
            : project.riskLevel === "Medium"
              ? "Medium"
              : "Low",

        reviewStatus: "Pending human verification",
      },
    }));

    res.json({
      projects: oversightProjects,
    });
  }
);

/* =========================================================
   PROJECT IN-CHARGE
   ========================================================= */

app.get(
  "/api/incharge/projects",
  authenticateToken,
  requireRole("incharge"),
  (req, res) => {
    const executionProjects = filteredProjects(req).map((project) => ({
      id: project.id,
      name: project.name,
      location: project.location,
      type: project.type,
      status: project.status,
      physicalProgress: project.physicalProgress,
      financialProgress: project.financialProgress,
      progressReported: project.progressReported !== false,
      plannedCompletion: project.plannedCompletion,
      milestones: project.milestones,
      house: project.house,
      recommendedAmount: project.recommendedAmount,
      recommendedWorks: project.recommendedWorks,
      completedWorks: project.completedWorks,
      transactionCount: project.transactionCount,
      dataSource: project.dataSource,

      execution: {
        nextAction:
          project.physicalProgress < 70
            ? "Review current milestone progress"
            : "Prepare next milestone",

        inspectionRequired: project.riskLevel !== "Low",
      },
    }));

    res.json({
      projects: executionProjects,
    });
  }
);

/* =========================================================
   CONTRACTOR
   ========================================================= */

app.get(
  "/api/contractor/projects",
  authenticateToken,
  requireRole("contractor"),
  (req, res) => {
    const assignedProjects = filteredProjects(req)
      .filter((project) => project.primaryPayee || project.transactionCount > 0)
      .slice(0, 50)
      .map((project) => ({
        id: project.id,
        name: project.name,
        location: project.location,
        type: project.type,
        status: project.status,
        physicalProgress: project.physicalProgress,
        financialProgress: project.financialProgress,
        progressReported: project.progressReported !== false,
        plannedCompletion: project.plannedCompletion,
        milestones: project.milestones,
        house: project.house,
        recommendedAmount: project.recommendedAmount,
        recommendedWorks: project.recommendedWorks,
        completedWorks: project.completedWorks,
        transactionCount: project.transactionCount,
        primaryPayee: project.primaryPayee,
        dataSource: project.dataSource,
      }));

    res.json({
      projects: assignedProjects,
    });
  }
);

/* =========================================================
   PROJECT DETAIL
   ========================================================= */

app.get(
  "/api/projects/:projectId",
  authenticateToken,
  (req, res) => {
    const project = projects.find(
      (item) => item.id === req.params.projectId
    );

    if (!project) {
      const workId = String(req.params.projectId).replace(/^MPLADS-WORK-/, '');
      const workRow = projectIndexRows.find(row => String(row[0]) === workId);
      if (workRow) {
        const workProject = workRecordFromRow(workRow);
        if (req.user.role === 'officer') {
          return res.json({ project: { ...workProject, aiReviewSignal: 'Work-level register record available for verification.', requiresHumanVerification: true } });
        }
        if (req.user.role === 'civilian') return res.json({ project: { id:workProject.id,name:workProject.name,location:workProject.location,state:workProject.state,status:workProject.status,recordType:'work',physicalProgress:workProject.physicalProgress,plannedCompletion:workProject.plannedCompletion,recommendedAmount:workProject.recommendedAmount,currentExpenditure:workProject.currentExpenditure,publicUpdates:workProject.publicUpdates,dataSource:workProject.dataSource,public:true } });
        if (req.user.role === 'incharge') return res.json({ project: { id:workProject.id,workId:workProject.workId,name:workProject.name,location:workProject.location,state:workProject.state,status:workProject.status,recordType:'work',physicalProgress:workProject.physicalProgress,financialProgress:workProject.financialProgress,milestones:workProject.milestones,dataSource:workProject.dataSource } });
        if (req.user.role === 'contractor') return res.status(403).json({error:'Individual contractor assignment is not established by the supplied MPLADS register.'});
      }
      return res.status(404).json({ error: "Project not found" });
    }

    /* Civilian */

    if (req.user.role === "civilian") {
      if (!project.public) return res.status(404).json({ error: "Public project not found" });
      const publicProject = {
        id: project.id,
        name: project.name,
        location: project.location,
        type: project.type,
        status: project.status,
        physicalProgress: project.physicalProgress,
        plannedCompletion: project.plannedCompletion,
        actualCompletion: project.actualCompletion,
        responsibleAuthority: project.responsibleAuthority,
        budget: project.budget,
        house: project.house,
        recommendedAmount: project.recommendedAmount,
        currentExpenditure: project.currentExpenditure,
        recommendedWorks: project.recommendedWorks,
        completedWorks: project.completedWorks,
        transactionCount: project.transactionCount,
        completionRatePct: project.completionRatePct,
        dataSource: project.dataSource,
        publicUpdates: project.publicUpdates,
        civilianReports: project.civilianReports,
      };

      return res.json({
        project: publicProject,
      });
    }

    /* Officer */

    if (req.user.role === "officer") {
      return res.json({
        project: {
          ...project,

          aiReviewSignal:
            project.riskLevel === "High"
              ? "Elevated risk signals require officer attention."
              : "Routine monitoring signal.",

          requiresHumanVerification: true,
        },
      });
    }

    /* In-charge */

    if (req.user.role === "incharge") {
      return res.json({
        project: {
          id: project.id,
          name: project.name,
          location: project.location,
          type: project.type,
          status: project.status,
          physicalProgress: project.physicalProgress,
          plannedCompletion: project.plannedCompletion,
          milestones: project.milestones,
        },
      });
    }

    /* Contractor */

    if (req.user.role === "contractor") {
      if (!(project.primaryPayee || project.transactionCount > 0)) return res.status(403).json({ error: "No payment-linked delivery record is available for this portfolio" });
      return res.json({
        project: {
          id: project.id,
          name: project.name,
          location: project.location,
          state: project.state,
          type: project.type,
          status: project.status,
          physicalProgress: project.physicalProgress,
          financialProgress: project.financialProgress,
          plannedCompletion: '',
          milestones: project.milestones,
          primaryPayee: project.primaryPayee,
          transactionCount: project.transactionCount,
          dataSource: project.dataSource,
        },
      });
    }

    return res.status(403).json({
      error: "Insufficient permissions",
    });
  }
);

/* =========================================================
   OFFICER — UNIFIED RISK ANALYSIS
   ========================================================= */

app.get(
  "/api/officer/projects/:projectId/unified-risk",
  authenticateToken,
  requireRole("officer"),
  (req, res) => {
    const project = projects.find(
      (item) => item.id === req.params.projectId
    );

    if (!project) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const duplicate = Math.round(
      (project.signals?.duplicate?.similarity || 0) * 100
    );

    const progress = Math.min(
      100,
      Math.abs(project.signals?.mismatch?.gap || 0) * 2
    );

    const cost = Math.min(
      100,
      Math.abs(project.signals?.cost?.deviation || 0) * 2
    );

    const timeline = Math.min(
      100,
      (project.signals?.timeline?.daysOverdue || 0) / 1.5
    );

    const highSignals = [
      duplicate > 35 ? "similarity" : null,
      progress > 30 ? "progress" : null,
      cost > 30 ? "cost" : null,
      timeline > 35 ? "timeline" : null,
    ].filter(Boolean);

    res.json({
      projectId: project.id,
      overallScore: project.riskScore,
      level: project.riskLevel,

      contributions: {
        duplicate: Math.round(duplicate),
        progress: Math.round(progress),
        cost: Math.round(cost),
        timeline: Math.round(timeline),
      },

      summary:
        `${project.riskLevel} priority is driven by ` +
        `${highSignals.join(", ") || "limited signals"} in the supplied register record.`,

      attentionReason:
        project.riskScore > 60
          ? "Several independent indicators merit a closer record-level review before the next decision."
          : "Signals are currently contained and do not indicate an immediate priority review.",

      recommendation:
        project.riskScore > 60
          ? "Prioritize for Human Review"
          : "Continue routine monitoring",

      sampleLabel: datasetMeta.source,
    });
  }
);

/* =========================================================
   OFFICER — DUPLICATE DETECTION
   ========================================================= */

app.get(
  "/api/officer/projects/:projectId/duplicate-analysis",
  authenticateToken,
  requireRole("officer"),
  (req, res) => {
    const project = projects.find((item) => item.id === req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const grouped = new Map();
    for (const row of projectIndexRows) {
      if (workValue(row, 'MP Name', 3) !== project.name) continue;
      const description = String(workValue(row, 'Work Description', 1) || '').trim();
      const key = normalizeWorkDescription(description);
      if (!key) continue;
      const item = grouped.get(key) || { description, workIds: [], category: workValue(row, 'Category', 2), ida: workValue(row, 'IDA', 13), locality: row[15] || project.location };
      item.workIds.push(Number(row[0]));
      grouped.set(key, item);
    }
    const matches = Array.from(grouped.values()).filter(x => x.workIds.length > 1).slice(0, 20).map((x, index) => ({
      id: `${project.id}-REPEAT-${index + 1}`, name: x.description, location: x.locality || x.ida || project.location, category: x.category || project.category, similarity: 1, proximityKm: 0, status: `Exact description repeated ${x.workIds.length} times`, workIds: x.workIds, factors: ['Exact description repeated in supplied recommendations', `Work IDs: ${x.workIds.slice(0, 8).join(', ')}${x.workIds.length > 8 ? '…' : ''}`, 'Scope/location verification required']
    }));
    res.json({ projectId: project.id, matches, recommendation: matches.length ? 'Review repeated work descriptions against Work IDs, sanction scope and location before treating them as overlapping work.' : 'No exact repeated work description was found for this MP portfolio in the supplied recommendation register.', sampleLabel: datasetMeta.source });
  }
);

/* =========================================================
   OFFICER — PROGRESS ANALYSIS
   ========================================================= */

app.get(
  "/api/officer/projects/:projectId/progress-analysis",
  authenticateToken,
  requireRole("officer"),
  (req, res) => {
    const project = projects.find(
      (item) => item.id === req.params.projectId
    );

    if (!project) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const financialProgress = Number(
      project.financialProgress || 0
    );

    const physicalProgress = Number(
      project.physicalProgress || 0
    );

    const difference = Math.round(
      (financialProgress - physicalProgress) * 10
    ) / 10;

    const expectedRange = [
      Math.max(0, physicalProgress - 10),
      Math.min(100, physicalProgress + 10),
    ];

    const anomalyScore = Math.min(
      100,
      Math.round(Math.abs(difference) * 2.5)
    );

    let explanation;

    if (difference > 15) {
      explanation =
        `Financial progress is ${financialProgress}% while physical progress is ` +
        `${physicalProgress}%, creating a ${difference}-point gap. ` +
        `The supplied register record therefore warrants closer comparison between expenditure and visible work.`;
    } else if (difference < -15) {
      explanation =
        `Physical progress is ${physicalProgress}% while financial progress is ` +
        `${financialProgress}%, creating a ${Math.abs(difference)}-point reverse gap. ` +
        `The supplied register record may warrant checking whether work has progressed ahead of recorded expenditure.`;
    } else {
      explanation =
        `Financial progress is ${financialProgress}% and physical progress is ` +
        `${physicalProgress}%, a ${Math.abs(difference)}-point difference within the normal comparison range.`;
    }

    const recommendation =
      Math.abs(difference) > 15
        ? "Prioritize field verification of expenditure against visible work."
        : "Continue routine monitoring.";

    res.json({
      projectId: project.id,

      financialProgress,
      physicalProgress,

      expectedRange,

      difference,

      anomalyScore,

      explanation,

      recommendation,

      sampleLabel: datasetMeta.source,
    });
  }
);


/* =========================================================
   PHASE 2 — CIVILIAN REPORTS
   ========================================================= */

app.post(
  "/api/projects/:projectId/reports",
  authenticateToken,
  requireRole("civilian"),
  (req, res) => {
    const project = projects.find((item) => item.id === req.params.projectId);

    if (!project || !project.public) {
      return res.status(404).json({ error: "Public project not found" });
    }

    const { type, text } = req.body || {};

    if (!type || !text || !String(text).trim()) {
      return res.status(400).json({
        error: "Report type and observable description are required",
      });
    }

    const report = {
      id: `CIV-${Date.now()}`,
      projectId: project.id,
      type: String(type).trim(),
      text: String(text).trim(),
      status: "Open",
      reporterId: req.user.userId || req.user.username,
      aiSignal: "Pending classification",
      createdAt: new Date().toISOString(),
    };

    project.civilianReports = project.civilianReports || [];
    project.civilianReports.push(report);
    persistProject(project);
    runtimeState.reports.unshift({...report, role:'officer', projectName:project.name, type:'Civilian report'});
    persist();

    res.status(201).json({ report });
  }
);

app.get(
  "/api/civilian/reports",
  authenticateToken,
  requireRole("civilian"),
  (req, res) => {
    const reporterId = req.user.userId || req.user.username;
    const reports = projects.flatMap((project) =>
      (project.civilianReports || [])
        .filter((report) => !report.reporterId || report.reporterId === reporterId)
        .map((report) => ({
          ...report,
          projectName: project.name,
        }))
    );
    res.json({ reports: reports.slice().reverse() });
  }
);

app.get(
  "/api/projects/:projectId/reports",
  authenticateToken,
  (req, res) => {
    const project = projects.find((item) => item.id === req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (req.user.role === "civilian") {
      return res.json({
        projectId: project.id,
        reports: (project.civilianReports || []).map((report) => ({
          id: report.id,
          type: report.type,
          text: report.text,
          status: report.status,
          createdAt: report.createdAt,
        })),
      });
    }

    if (req.user.role === "officer") {
      return res.json({
        projectId: project.id,
        reports: project.civilianReports || [],
      });
    }

    return res.status(403).json({ error: "Insufficient permissions" });
  }
);

app.get('/api/officer/financial-context', authenticateToken, requireRole('officer'), (req,res)=>{
  const category=String(req.query?.category||'').trim().toLowerCase();
  const rows=projects.filter(p=>!category || p.category.toLowerCase()===category);
  const allocated=rows.reduce((n,p)=>n+Number(p.sanctionedCost||0),0);
  const recommended=rows.reduce((n,p)=>n+Number(p.recommendedAmount||0),0);
  const expenditure=rows.reduce((n,p)=>n+Number(p.currentExpenditure||0),0);
  res.json({category:category||'All categories',projectCount:rows.length,allocatedAmount:Number(allocated.toFixed(2)),recommendedAmount:Number(recommended.toFixed(2)),recordedExpenditure:Number(expenditure.toFixed(2)),expenditureToAllocationPct:allocated?Number((expenditure/allocated*100).toFixed(1)):0,source:datasetMeta.source});
});

/* =========================================================
   OFFICER — COST BENCHMARKING
   ========================================================= */

const buildCostBenchmarkAnalysis = (project) => {
  const sanctionedCost = Number(project.sanctionedCost || 0);
  const recommendedAmount = Number(project.recommendedAmount || 0);
  const actualCost = Number(project.currentExpenditure || 0);
  const deviation = recommendedAmount > 0 ? Number((((actualCost - recommendedAmount) / recommendedAmount) * 100).toFixed(1)) : 0;
  const anomalyScore = Math.min(100, Math.round(Math.abs(deviation) * 1.5));
  const estimatedRange = [0, sanctionedCost];
  return {
    projectId: project.id,
    projectType: project.type,
    location: `${project.location}, ${project.state}`,
    size: `${project.recommendedWorks.toLocaleString('en-IN')} recommended works`,
    sanctionedCost,
    actualCost,
    recommendedAmount,
    estimatedRange,
    benchmarkMidpoint: recommendedAmount,
    difference: Number((actualCost - recommendedAmount).toFixed(2)),
    deviation,
    deviationPercent: sanctionedCost > 0 ? Number((((actualCost - sanctionedCost) / sanctionedCost) * 100).toFixed(1)) : 0,
    anomalyScore,
    factors: [
      `Allocated amount: ₹${sanctionedCost}L`,
      `Recommended amount: ₹${recommendedAmount}L`,
      `Recorded expenditure: ₹${actualCost}L`,
      `Recorded works: ${project.completedWorks.toLocaleString('en-IN')} completed / ${project.recommendedWorks.toLocaleString('en-IN')} recommended`,
    ],
    explanation: recommendedAmount > 0
      ? `Recorded expenditure is ₹${actualCost}L against ₹${recommendedAmount}L recommended in the supplied register. This variance is a financial review signal and is not an audit conclusion.`
      : 'No recommended amount is recorded for this portfolio, so a recommendation-to-expenditure variance cannot be calculated.',
    recommendation: Math.abs(deviation) > 10 ? 'Review recommendation and expenditure records before the next decision.' : 'Continue routine financial monitoring.',
    disclaimer: 'This view uses only the supplied MPLADS allocation, recommendation and expenditure records. It is not a PWD market-rate benchmark or an audit finding.',
    sampleLabel: datasetMeta.source,
  };
};

const costBenchmarkHandler = (req, res) => {
  const project = projects.find((item) => item.id === req.params.projectId);

  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  res.json(buildCostBenchmarkAnalysis(project));
};

app.get(
  "/api/officer/projects/:projectId/cost-benchmark",
  authenticateToken,
  requireRole("officer"),
  costBenchmarkHandler
);

app.get(
  "/api/officer/projects/:projectId/cost-benchmarking",
  authenticateToken,
  requireRole("officer"),
  costBenchmarkHandler
);

/* =========================================================
   OFFICER — RISK ANALYSIS ALIAS
   ========================================================= */

app.get(
  "/api/officer/projects/:projectId/risk-analysis",
  authenticateToken,
  requireRole("officer"),
  (req, res) => {
    const project = projects.find((item) => item.id === req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const duplicate = Math.round((project.signals?.duplicate?.similarity || 0) * 100);
    const progress = Math.min(100, Math.abs(project.signals?.mismatch?.gap || 0) * 2);
    const cost = Math.min(100, Math.abs(project.signals?.cost?.deviation || 0) * 2);
    const timeline = Math.min(100, (project.signals?.timeline?.daysOverdue || 0) / 1.5);

    res.json({
      projectId: project.id,
      overallScore: project.riskScore,
      level: project.riskLevel,
      contributions: {
        duplicate: Math.round(duplicate),
        progress: Math.round(progress),
        cost: Math.round(cost),
        timeline: Math.round(timeline),
      },
      summary: `${project.riskLevel} priority is based on multiple signals in the supplied register record.`,
      attentionReason:
        project.riskScore > 60
          ? "Several independent indicators merit closer record-level review before the next decision."
          : "Signals are currently contained and do not indicate an immediate priority review.",
      recommendation:
        project.riskScore > 60
          ? "Prioritize for Human Review"
          : "Continue routine monitoring",
      sampleLabel: datasetMeta.source,
    });
  }
);

app.post('/api/officer/review-priority', authenticateToken, requireRole('officer'), (req,res)=>{
  const project=projects.find(p=>p.id===String(req.body?.projectId||''));
  if(!project)return res.status(404).json({error:'MP portfolio not found'});
  project.reviewPriorities=project.reviewPriorities||[];
  const record={id:`REVIEW-${Date.now()}`,projectId:project.id,createdAt:new Date().toISOString(),status:'Queued for human review'};
  project.reviewPriorities.unshift(record);
  res.json({ok:true,record});
});

/* =========================================================
   OFFICER — RISK ALERTS
   ========================================================= */

app.get(
  "/api/officer/risk-alerts",
  authenticateToken,
  requireRole("officer"),
  (req, res) => {
    const alerts = projects
      .filter((project) => project.riskLevel === "High")
      .map((project) => ({
        id: `RISK-${project.id}`,
        projectId: project.id,
        projectName: project.name,
        riskScore: project.riskScore,
        riskLevel: project.riskLevel,
        reason:
          "Multiple review signals indicate that this project merits human verification.",
        status: "Open",
        createdAt: new Date().toISOString(),
      }));

    res.json({
      alerts,
      count: alerts.length,
      sampleLabel: datasetMeta.source,
    });
  }
);

/* =========================================================
   OFFICER — CONTRACTOR INTELLIGENCE
   ========================================================= */

const contractorRecords = (() => {
  const map = new Map();
  for (const project of projects) {
    for (const tx of project.transactionSample || []) {
      const name = String(tx.payee || '').trim();
      if (!name) continue;
      const row = map.get(name) || { name, active: 0, completed: 0, transactions: 0, successful: 0, pending: 0, spend: 0 };
      row.transactions += 1;
      row.spend += Number(tx.amount || 0);
      if (String(tx.status).toLowerCase().includes('success')) row.successful += 1;
      if (String(tx.status).toLowerCase().includes('progress')) row.pending += 1;
      map.set(name, row);
    }
  }
  return Array.from(map.values()).sort((a,b) => b.spend - a.spend).slice(0, 12).map(row => ({
    ...row, active: row.pending > 0 ? 1 : 0, completed: row.successful, onTime: 'Not reported', overrun: 'Not reported', quality: 'Not reported', grade: 'N/A'
  }));
})();

app.get(
  "/api/officer/contractors",
  authenticateToken,
  requireRole("officer"),
  (req, res) => {
    res.json({
      contractors: contractorRecords,
      sampleLabel: "Contractor performance records",
    });
  }
);

app.get(
  "/api/contractor/performance",
  authenticateToken,
  requireRole("contractor"),
  (req, res) => {
    const contractor = contractorRecords[0] || { name: 'No payment-linked vendor records', active: 0, completed: 0, transactions: 0, successful: 0, pending: 0, spend: 0, onTime: 'Not reported', overrun: 'Not reported', quality: 'Not reported', grade: 'N/A' };
    res.json({
      contractor,
      assignedProjectCount: projects.filter((project) => project.primaryPayee === contractor?.name).length,
      sampleLabel: "Contractor performance record",
    });
  }
);

/* =========================================================
   REPORTS
   ========================================================= */

const buildReportsForRole = (role) => {
  const persisted = Array.isArray(runtimeState.reports) ? runtimeState.reports.filter(r => r.role === role || (role === 'officer' && r.type === 'Civilian report')) : [];
  if (persisted.length) return persisted;
  if (role === "incharge") {
    const rows=projects.flatMap(project=>(project.siteReports||[]).map(r=>({...r,projectName:project.name})));
    if(rows.length) return rows.slice().reverse();
  }
  if (role === "contractor") {
    const rows=projects.flatMap(project=>(project.contractorReports||[]).map(r=>({...r,projectName:project.name})));
    if(rows.length) return rows.slice().reverse();
  }
  if (role === "officer") {
    return projects
      .filter((project) => project.riskLevel !== "Low")
      .map((project) => ({
        id: `OFF-${project.id}`,
        projectId: project.id,
        projectName: project.name,
        type: "Officer review",
        status: "Pending human verification",
        riskLevel: project.riskLevel,
        createdAt: new Date().toISOString(),
      }));
  }

  if (role === "incharge") {
    return projects
      .slice(0, 4)
      .map((project) => ({
        id: `SITE-${project.id}`,
        projectId: project.id,
        projectName: project.name,
        type: "Site report",
        status: "Draft",
        createdAt: new Date().toISOString(),
      }));
  }

  if (role === "contractor") {
    return projects
      .filter((project) => project.primaryPayee || project.transactionCount > 0)
      .map((project) => ({
        id: `WORK-${project.id}`,
        projectId: project.id,
        projectName: project.name,
        type: "Work update",
        status: "Draft",
        createdAt: new Date().toISOString(),
      }));
  }

  return [];
};

app.get(
  "/api/officer/reports",
  authenticateToken,
  requireRole("officer"),
  (req, res) => {
    res.json({ reports: buildReportsForRole("officer") });
  }
);

app.get(
  "/api/officer/reports/:reportId",
  authenticateToken,
  requireRole("officer"),
  (req, res) => {
    const reports = buildReportsForRole("officer");
    const report = reports.find((item) => item.id === req.params.reportId);

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.json({
      report,
      project: projects.find((project) => project.id === report.projectId),
    });
  }
);

app.patch("/api/officer/reports/:reportId", authenticateToken, requireRole("officer"), (req,res)=>{ const report=runtimeState.reports.find(r=>String(r.id)===String(req.params.reportId)); if(!report)return res.status(404).json({error:"Report not found"}); const status=String(req.body?.status||'Reviewed'); if(!['Reviewed','Field verification required','Action required','Closed'].includes(status))return res.status(400).json({error:'Invalid review status'}); report.status=status; report.reviewNote=String(req.body?.reviewNote||'').slice(0,1000); report.reviewedAt=new Date().toISOString(); report.reviewedBy=req.user.username; persist(); res.json({report}); });

app.get(
  "/api/contractor/reports",
  authenticateToken,
  requireRole("contractor"),
  (req, res) => {
    res.json({ reports: buildReportsForRole("contractor") });
  }
);

/* =========================================================
   CIVILIAN OPINIONS — PUBLIC FEEDBACK
   ========================================================= */
app.post(
  "/api/projects/:projectId/opinions",
  authenticateToken,
  requireRole("civilian"),
  (req, res) => {
    const project = projects.find((item) => item.id === req.params.projectId);
    if (!project || !project.public) return res.status(404).json({ error: "Public project not found" });
    const rating = Number(req.body?.rating);
    const text = String(req.body?.text || "").trim();
    if (!Number.isFinite(rating) || rating < 1 || rating > 5 || !text) {
      return res.status(400).json({ error: "Rating from 1 to 5 and opinion text are required" });
    }
    const opinion = {
      id: `OP-${Date.now()}`,
      projectId: project.id,
      rating: Math.round(rating),
      text,
      status: "Recorded",
      createdAt: new Date().toISOString(),
    };
    project.opinions = project.opinions || [];
    project.opinions.push(opinion);
    runtimeState.opinions.unshift(opinion); persist();
    res.status(201).json({ opinion });
  }
);


/* =========================================================
   OFFICER — FINANCIAL TRANSACTION BOOK
   ========================================================= */
app.get("/api/officer/projects/:projectId/transactions", authenticateToken, requireRole("officer"), (req,res)=>{
  const project=projects.find(item=>item.id===req.params.projectId);
  if(!project) return res.status(404).json({error:"Project not found"});
  const transactions=buildTransactions(project);
  const sanctioned=Number(project.sanctionedCost||0), spent=Number(project.expenditure||0);
  const recommended=Number(project.recommendedAmount||0);
  res.json({projectId:project.id,projectName:project.name,sanctionedCost:sanctioned,releasedAmount:recommended,recordedExpenditure:spent,balance:Number((sanctioned-spent).toFixed(2)),transactions,totalTransactionCount:project.transactionCount||0,sampleLabel:"Latest transaction records from supplied MPLADS expenditure register",dataSource:project.dataSource});
});

/* =========================================================
   OFFICER + IN-CHARGE — COMPARABLE PROJECT ANALYSIS
   ========================================================= */


/* =========================================================
   OFFICER + IN-CHARGE — SATELLITE MONITORING
   ========================================================= */
app.get("/api/projects/:projectId/satellite", authenticateToken, requireRole("officer","incharge"), (req,res)=>{
  const project=projects.find(item=>item.id===req.params.projectId);
  if(!project) return res.status(404).json({error:"Project not found"});
  res.json(buildSatelliteObservation(project));
});
app.get("/api/projects/:projectId/comparison", authenticateToken, requireRole("officer","incharge"), (req,res)=>{
  const project=projects.find(item=>item.id===req.params.projectId);
  if(!project) return res.status(404).json({error:"Project not found"});
  res.json(buildComparison(project));
});

/* =========================================================
   CONTRACTOR — VIDEO EVIDENCE SUBMISSION
   ========================================================= */
app.post("/api/contractor/projects/:projectId/video-evidence", authenticateToken, requireRole("contractor"), (req,res)=>{
  const project=projects.find(item=>item.id===req.params.projectId);
  if(!project) return res.status(404).json({error:"Project not found"});
  if(!(project.primaryPayee || project.transactionCount > 0)) return res.status(403).json({error:"No payment-linked delivery record is available for this portfolio"});
  const {fileName,mimeType,size,note,milestone}=req.body||{};
  if(!fileName || !String(mimeType||"").startsWith("video/")) return res.status(400).json({error:"A video file name and video MIME type are required"});
  const evidence={id:`VID-${Date.now()}`,projectId:project.id,projectName:project.name,fileName:String(fileName),mimeType:String(mimeType),size:Number(size||0),note:String(note||""),milestone:milestone?String(milestone):null,submittedBy:req.user.username || "Contractor workspace",status:"Submitted for In-Charge verification",createdAt:new Date().toISOString()};
  videoEvidence.push(evidence); project.videoEvidence=project.videoEvidence||[]; project.videoEvidence.push(evidence); runtimeState.videoEvidence.unshift(evidence); persist(); res.status(201).json({evidence});
});
app.get("/api/contractor/projects/:projectId/video-evidence", authenticateToken, requireRole("contractor"), (req,res)=>{
  const project=projects.find(item=>item.id===req.params.projectId);
  if(!project) return res.status(404).json({error:"Project not found"});
  if(!(project.primaryPayee || project.transactionCount > 0)) return res.status(403).json({error:"No payment-linked delivery record is available for this portfolio"});
  res.json({evidence:project.videoEvidence||[]});
});

/* =========================================================
   IN-CHARGE — VIDEO EVIDENCE VERIFICATION
   ========================================================= */
app.get("/api/incharge/projects/:projectId/video-evidence", authenticateToken, requireRole("incharge"), (req,res)=>{
  const project=projects.find(item=>item.id===req.params.projectId);
  if(!project) return res.status(404).json({error:"Project not found"});
  res.json({evidence:project.videoEvidence||[]});
});
app.patch("/api/incharge/projects/:projectId/video-evidence/:evidenceId", authenticateToken, requireRole("incharge"), (req,res)=>{
  const project=projects.find(item=>item.id===req.params.projectId);
  if(!project) return res.status(404).json({error:"Project not found"});
  const evidence=(project.videoEvidence||[]).find(item=>item.id===req.params.evidenceId);
  if(!evidence) return res.status(404).json({error:"Video evidence not found"});
  const status=String(req.body?.status||"Verified");
  if(!["Verified","Needs re-submission","Rejected for review"].includes(status)) return res.status(400).json({error:"Invalid verification status"});
  evidence.status=status; evidence.verifiedAt=new Date().toISOString(); evidence.verifiedBy=req.user.username || "Project In-Charge"; persist(); res.json({evidence});
});

/* =========================================================
   PROJECT IN-CHARGE — EXECUTION WORKFLOW
   ========================================================= */

const getExecutionProject = (projectId) =>
  projects.find((project) => project.id === projectId);

app.get(
  "/api/incharge/projects/:projectId",
  authenticateToken,
  requireRole("incharge"),
  (req, res) => {
    const project = getExecutionProject(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({
      project: {
        id: project.id,
        name: project.name,
        location: project.location,
        type: project.type,
        status: project.status,
        physicalProgress: project.physicalProgress,
        financialProgress: project.financialProgress,
        plannedCompletion: project.plannedCompletion,
        milestones: project.milestones,
        issues: project.executionIssues || [],
      },
    });
  }
);

app.get(
  "/api/incharge/projects/:projectId/milestones",
  authenticateToken,
  requireRole("incharge"),
  (req, res) => {
    const project = getExecutionProject(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({
      projectId: project.id,
      milestones: project.milestones || [],
    });
  }
);

app.patch(
  "/api/incharge/projects/:projectId/milestones/:milestoneId",
  authenticateToken,
  requireRole("incharge"),
  (req, res) => {
    const project = getExecutionProject(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const milestones = project.milestones || [];
    const numericId = Number(req.params.milestoneId);
    const index = Number.isInteger(numericId) ? numericId : milestones.findIndex(
      (item) => item.id === req.params.milestoneId || item.name === req.params.milestoneId
    );

    if (index < 0 || index >= milestones.length) {
      return res.status(404).json({ error: "Milestone not found" });
    }

    const { status, name } = req.body || {};
    if (status) milestones[index].status = String(status);
    if (name) milestones[index].name = String(name);
    persistProject(project);

    res.json({
      milestone: milestones[index],
      projectId: project.id,
    });
  }
);

app.get(
  "/api/incharge/projects/:projectId/issues",
  authenticateToken,
  requireRole("incharge"),
  (req, res) => {
    const project = getExecutionProject(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({
      projectId: project.id,
      issues: project.executionIssues || [],
    });
  }
);

app.post(
  "/api/incharge/projects/:projectId/issues",
  authenticateToken,
  requireRole("incharge"),
  (req, res) => {
    const project = getExecutionProject(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { title, description, priority } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: "Issue title is required" });
    }

    const issue = {
      id: `ISSUE-${Date.now()}`,
      title: String(title),
      description: String(description || ""),
      priority: String(priority || "Medium"),
      status: "Open",
      createdAt: new Date().toISOString(),
    };

    project.executionIssues = project.executionIssues || [];
    project.executionIssues.push(issue);
    persistProject(project);

    res.status(201).json({ issue });
  }
);

/* =========================================================
   CONTRACTOR — WORK UPDATES
   ========================================================= */

app.get(
  "/api/contractor/projects/:projectId",
  authenticateToken,
  requireRole("contractor"),
  (req, res) => {
    const project = getExecutionProject(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({
      project: {
        id: project.id,
        name: project.name,
        location: project.location,
        type: project.type,
        status: project.status,
        physicalProgress: project.physicalProgress,
        plannedCompletion: project.plannedCompletion,
        milestones: project.milestones,
        house: project.house,
        recommendedAmount: project.recommendedAmount,
        recommendedWorks: project.recommendedWorks,
        completedWorks: project.completedWorks,
        transactionCount: project.transactionCount,
        primaryPayee: project.primaryPayee,
        assignedContractor: project.primaryPayee,
      },
    });
  }
);

app.post(
  "/api/contractor/projects/:projectId/work-updates",
  authenticateToken,
  requireRole("contractor"),
  (req, res) => {
    const project = getExecutionProject(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (!(project.primaryPayee || project.transactionCount > 0)) {
      return res.status(403).json({ error: "No payment-linked delivery record is available for this portfolio" });
    }

    const { update, physicalProgress, milestone, note } = req.body || {};

    if (!update && !note) {
      return res.status(400).json({ error: "Work update text is required" });
    }

    const workUpdate = {
      id: `WORK-${Date.now()}`,
      projectId: project.id,
      update: String(update || note || "").trim(),
      physicalProgress:
        physicalProgress === undefined ? project.physicalProgress : Number(physicalProgress),
      milestone: milestone ? String(milestone) : null,
      status: "Submitted for review",
      createdAt: new Date().toISOString(),
    };

    project.workUpdates = project.workUpdates || [];
    project.workUpdates.push(workUpdate);

    if (Number.isFinite(workUpdate.physicalProgress)) {
      project.physicalProgress = Math.max(0, Math.min(100, workUpdate.physicalProgress));
    }
    persistProject(project);

    res.status(201).json({ workUpdate });
  }
);

/* =========================================================
   CONTRACTOR REPORTS — SUBMISSION
   ========================================================= */

app.post(
  "/api/contractor/reports",
  authenticateToken,
  requireRole("contractor"),
  (req, res) => {
    const { projectId, text } = req.body || {};

    if (!projectId || !text) {
      return res.status(400).json({ error: "projectId and report text are required" });
    }

    const project = getExecutionProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const report = {
      id: `CON-${Date.now()}`,
      projectId,
      projectName: project.name,
      type: "Work report",
      text: String(text).trim(),
      status: "Submitted for review",
      createdAt: new Date().toISOString(),
    };

    project.contractorReports = project.contractorReports || [];
    project.contractorReports.push(report);
    persistProject(project);

    res.status(201).json({ report });
  }
);


/* =========================================================
   PHASE 2 — IN-CHARGE REPORTS
   ========================================================= */
app.get(
  "/api/incharge/reports",
  authenticateToken,
  requireRole("incharge"),
  (req, res) => {
    res.json({ reports: buildReportsForRole("incharge") });
  }
);

app.get(
  "/api/incharge/reports/:reportId",
  authenticateToken,
  requireRole("incharge"),
  (req, res) => {
    const report = buildReportsForRole("incharge").find((item) => item.id === req.params.reportId);
    if (!report) return res.status(404).json({ error: "Report not found" });
    return res.json({ report, project: projects.find((project) => project.id === report.projectId) });
  }
);

app.post(
  "/api/incharge/reports",
  authenticateToken,
  requireRole("incharge"),
  (req, res) => {
    const { projectId, text } = req.body || {};
    const project = getExecutionProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!(project.primaryPayee || project.transactionCount > 0)) return res.status(403).json({ error: "No payment-linked delivery record is available for this portfolio" });
    if (!text || !String(text).trim()) return res.status(400).json({ error: "Report text is required" });
    const report = { id: `SITE-${Date.now()}`, projectId, projectName: project.name, type: "Site report", text: String(text).trim(), status: "Submitted for review", createdAt: new Date().toISOString() };
    project.siteReports = project.siteReports || [];
    project.siteReports.push(report);
    persistProject(project);
    res.status(201).json({ report });
  }
);

/* =========================================================
   EXISTING RBAC TEST
   ========================================================= */

app.get(
  "/api/officer-test",
  authenticateToken,
  requireRole("officer"),
  (req, res) => {
    res.json({
      message: "Officer access verified",
      user: req.user,
    });
  }
);


/* =========================================================
   NIREE · CONTEXT-AWARE PROJECT ASSISTANT
   Grounded in the same NIRIKSHAN work intelligence used by the UI.
   ========================================================= */
function normalizeQuestion(text){ return String(text||'').toLowerCase().replace(/[^a-z0-9\s#%.-]/g,' ').replace(/\s+/g,' ').trim(); }
function visibleProjectsForRole(role){
  if(role==='civilian') return projects.filter(p=>p.public);
  if(role==='contractor') return projects.filter(p=>p.primaryPayee || p.transactionCount > 0);
  return projects;
}
function formatMoneyCr(value){ const lakh=Number(value||0); return lakh>=100 ? `₹${(lakh/100).toFixed(2)} Cr` : `₹${lakh.toFixed(1)}L`; }
function formatMoneyRupees(value){ const n=Number(value||0); return n>=10000000?`₹${(n/10000000).toFixed(2)} Cr`:n>=100000?`₹${(n/100000).toFixed(2)} L`: `₹${n.toLocaleString('en-IN')}`; }

function findNireeProject(list,q){
  const tokens=q.split(/\s+/).filter(t=>t.length>2 && !['show','which','what','about','tell','give','find','project','projects','work','works','risk','status','progress','financial','finance'].includes(t));
  const scored=list.map(p=>{
    const hay=`${p.name||''} ${p.id||''} ${p.location||''} ${p.state||''} ${p.district||''} ${p.constituency||''}`.toLowerCase();
    const score=tokens.reduce((n,t)=>n+(hay.includes(t)?1:0),0);
    return {p,score};
  }).sort((a,b)=>b.score-a.score);
  return scored[0]?.score>0 ? scored[0].p : undefined;
}

function workRowsForNiree(role){
  if(role==='civilian') return projectIndexRows.filter(r=>workRecordFromRow(r).public);
  return projectIndexRows;
}
function workIdFromText(q){
  const m=q.match(/(?:work|project|mplads)?\s*#?\s*(\d{2,})\b/);
  return m ? m[1] : null;
}
function contextWorkId(history){
  for(let i=history.length-1;i>=0;i--){
    const hit=workIdFromText(normalizeQuestion(history[i]?.text||''));
    if(hit) return hit;
    const src=Array.isArray(history[i]?.sources)?history[i].sources.join(' '):'';
    const sm=src.match(/work\s*#?\s*(\d{2,})/i);
    if(sm) return sm[1];
  }
  return null;
}
function listWorkRows(role, q){
  const nq=normalizeQuestion(q);
  let rows=workRowsForNiree(role);
  const districtTokens=['nagpur','thane','pune','nashik','mumbai','kolhapur','satara','aurangabad','chandrapur','amravati','wardha','yavatmal'];
  const district=districtTokens.find(x=>nq.includes(x));
  if(district) rows=rows.filter(r=>String(workRecordFromRow(r).district||'').toLowerCase().includes(district));
  const target=nq.includes('high')?'High':nq.includes('medium')?'Medium':nq.includes('low')?'Low':null;
  if(target) rows=rows.filter(r=>workIntelligenceRecord(r,{includeFuzzy:false}).intelligence.riskLevel===target);
  if(nq.includes('financial')||nq.includes('finance')||nq.includes('cost')||nq.includes('overspend')) rows=rows.filter(r=>workIntelligenceRecord(r,{includeFuzzy:false}).intelligence.riskParts.financial>0);
  if(nq.includes('duplicate')||nq.includes('similar')) rows=rows.filter(r=>{const i=workIntelligenceRecord(r,{includeFuzzy:false}).intelligence;return i.duplicateCount>0;});
  if(nq.includes('incomplete')||nq.includes('missing data')) rows=rows.filter(r=>workIntelligenceRecord(r,{includeFuzzy:false}).intelligence.dataCompleteness<80);
  if(nq.includes('evidence')||nq.includes('image')) rows=rows.filter(r=>workIntelligenceRecord(r,{includeFuzzy:false}).intelligence.riskParts.evidence>0);
  if(nq.includes('delayed')||nq.includes('not completed')||nq.includes('incomplete work')) rows=rows.filter(r=>workRecordFromRow(r).status!=='Completed');
  return rows;
}

function nireeAnswer(role,question,history=[]){
  const q=normalizeQuestion(question);
  const sources=[];
  const previousWorkId=contextWorkId(history);
  const explicitWorkId=workIdFromText(q);
  const selectedWorkId=explicitWorkId || ((q.includes('it ')||q.includes('this ')||q.includes('that ')||q.includes('its ')) ? previousWorkId : null);
  const row=selectedWorkId ? getWorkRow(selectedWorkId) : null;

  if(selectedWorkId && !row) return {answer:`I couldn't find Work #${selectedWorkId} in the supplied NIRIKSHAN register. Check the Work ID and try again.`,sources:[],role};

  if(row){
    const w=workIntelligenceRecord(row);
    const i=w.intelligence;
    sources.push(`Work #${w.workId}`);
    if(role==='civilian'){
      if(q.includes('risk')||q.includes('alert')||q.includes('flag')) return {answer:`I can show public project information, but internal risk and officer-review signals are not exposed in the civilian view.`,sources,role};
      if(q.includes('progress')||q.includes('physical')) return {answer:`Work #${w.workId} is ${w.status}. The supplied register does not provide a measured physical-progress percentage for this work.`,sources,role};
      if(q.includes('cost')||q.includes('budget')||q.includes('spend')||q.includes('expenditure')) return {answer:`The public record for Work #${w.workId} shows a recorded amount of ${w.finalAmount==null?'not reported':formatMoneyRupees(w.finalAmount)}.`,sources,role};
      return {answer:`Work #${w.workId} — ${w.name}. Status: ${w.status}. Location: ${w.location||'not reported'}.`,sources,role};
    }
    if(q.includes('why')||q.includes('reason')){
      return {answer:`Work #${w.workId} has a ${i.riskLevel.toLowerCase()} screening priority of ${i.riskScore}/100. ${i.reasons.slice(0,4).join(' ')} This is an explainable review signal, not a finding of fraud or misconduct.`,sources,role};
    }
    if(q.includes('risk')||q.includes('alert')||q.includes('flag')||q.includes('priority')){
      return {answer:`Work #${w.workId} is currently ${i.riskLevel.toLowerCase()} priority (${i.riskScore}/100). ${i.riskReason} ${i.action}`,sources,role};
    }
    if(q.includes('duplicate')||q.includes('similar')){
      return {answer:`Duplicate screening for Work #${w.workId}: ${i.duplicateCount} exact repeated-description match${i.duplicateCount===1?'':'es'} and ${i.fuzzyMatchCount} similarity candidate${i.fuzzyMatchCount===1?'':'s'}. These are screening signals that still need human verification of scope, location and timing.`,sources,role};
    }
    if(q.includes('progress')||q.includes('physical')||q.includes('complete')){
      return {answer:i.completionProxy===100?`Work #${w.workId} is recorded as completed in the supplied completion register.`:`Work #${w.workId} is not marked completed in the supplied completion register. A measured physical-progress percentage is not available in the source record.`,sources,role};
    }
    if(q.includes('cost')||q.includes('budget')||q.includes('spend')||q.includes('expenditure')||q.includes('financial')){
      return {answer:`Financial context for Work #${w.workId}: recommended amount ${w.recommendedAmount==null?'not reported':formatMoneyRupees(w.recommendedAmount)}; final recorded amount ${w.finalAmount==null?'not reported':formatMoneyRupees(w.finalAmount)}; recorded utilization ${i.spendRatio==null?'not available':i.spendRatio+'%'}.`,sources,role};
    }
    if(q.includes('data')||q.includes('complete')){
      return {answer:`Work #${w.workId} has ${i.dataCompleteness}% data completeness in the current screening fields. ${i.dataCompleteness<80?'Some source fields need verification or completion.':'The core screening fields are substantially populated.'}`,sources,role};
    }
    if(q.includes('evidence')||q.includes('image')) return {answer:`The supplied record ${w.hasImages?'reports an image/evidence flag.':'does not report an image/evidence flag.'} For a completed work, that missing flag contributes to the screening signal.`,sources,role};
    return {answer:`Work #${w.workId} is ${w.status}, with a ${i.riskLevel.toLowerCase()} screening priority (${i.riskScore}/100). You can ask me about its risk, reasons, progress, finance, duplicate screening, evidence or data completeness.`,sources,role};
  }

  const list=visibleProjectsForRole(role);
  const project=findNireeProject(list,q);
  if(project){
    sources.push(project.name);
    if(q.includes('cost')||q.includes('budget')||q.includes('spend')||q.includes('expenditure')) return {answer:`${project.name} has a recorded sanctioned cost of ${formatMoneyCr(project.sanctionedCost)}.${project.currentExpenditure?` Recorded expenditure is ${formatMoneyCr(project.currentExpenditure)}.`:' Public expenditure is not loaded in the current record.'}`,sources,role};
    if(q.includes('contractor')||q.includes('vendor')) return {answer:project.primaryPayee ? `${project.name} has a payment-linked payee record of ${project.primaryPayee}. The supplied register does not establish individual contractor assignment.` : 'No payment-linked payee is listed in the current project record.',sources,role};
    if(q.includes('milestone')||q.includes('stage')) return {answer:`${project.name} is ${project.status}. Milestones: ${(project.milestones||[]).map(m=>`${m.name}: ${m.status}`).join('; ')||'No milestone details are recorded.'}`,sources,role};
    if(q.includes('progress')) return {answer:`${project.name} is ${project.status}. Portfolio-level progress is ${project.physicalProgress}% physical and ${project.financialProgress}% financial where those fields are available.`,sources,role};
    return {answer:`${project.name} is ${project.status}, located at ${project.location||'location not reported'}.`,sources,role};
  }

  const isListIntent=/\b(show|list|which|find|give|how many|count)\b/.test(q) || /\b(high|medium|low)\s+risk\b/.test(q) || /\b(risk|financial|duplicate|incomplete|delayed)\s+(projects?|works?|records?)\b/.test(q);
  if(isListIntent){
    const rows=listWorkRows(role,q).map(r=>workIntelligenceRecord(r,{includeFuzzy:false}));
    if(q.includes('how many')||q.includes('count')) return {answer:`I found ${rows.length.toLocaleString('en-IN')} matching work records in the current screening view.`,sources:[],role};
    const top=rows.sort((a,b)=>(b.intelligence.riskScore||0)-(a.intelligence.riskScore||0)).slice(0,8);
    if(top.length){
      const label=q.includes('high')?'high-priority':q.includes('medium')?'medium-priority':q.includes('low')?'low-priority':'matching';
      return {answer:`I found ${rows.length.toLocaleString('en-IN')} ${label} work records. Here are the first ${top.length}: ${top.map(w=>`#${w.workId} — ${w.name} (${w.intelligence.riskLevel}, ${w.intelligence.riskScore}/100)`).join('; ')}. Ask “why is Work #${top[0].workId} flagged?” for a detailed explanation.`,sources:top.map(w=>`Work #${w.workId}`),role};
    }
    return {answer:`I couldn't find a matching work record in the current NIRIKSHAN screening view. Try a Work ID, district, or a filter such as “high-risk projects”.`,sources:[],role};
  }

  if(q.includes('hello')||q.includes('hi ')||q==='hi'||q==='hey') return {answer:`Hello! I’m NIREE. I can help you explore the NIRIKSHAN register and explain project intelligence. Try “show high-risk projects” or “what is the risk for Work #12345?”.`,sources:[],role};
  return {answer:`I can help with NIRIKSHAN project monitoring. Ask me about a Work ID, risk priority, financial signals, duplicate screening, progress/completion, evidence, data completeness, or filtered project lists. I’ll use the supplied register rather than inventing details.`,sources:[],role};
}

app.post('/api/niree', authenticateToken, (req,res)=>{
  const question=String(req.body?.question||'').trim();
  if(!question)return res.status(400).json({error:'Question is required'});
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-8):[];
  res.json(nireeAnswer(req.user.role,question,history));
});

/* =========================================================
   NIRIKSHAN 9 — PROJECT ASSURANCE / EDGE PLUG
   ========================================================= */

app.get('/api/officer/projects/:projectId/funding-check', authenticateToken, requireRole('officer'), (req,res)=>{
  const row=getWorkRow(req.params.projectId); if(!row)return res.status(404).json({error:'Work record not found'});
  const w=workRecordFromRow(row);
  res.json({projectId:w.id,workId:w.workId,status:'No source-backed overlap found',overlapCount:0,summary:'The supplied MPLADS registers do not contain a second scheme register. NIRIKSHAN therefore reports no source-backed cross-scheme match and keeps prototype scenarios separate.',matches:[],prototypeScenarios:convergencePrototypeRecords.slice(0,3),prototype:true,sourceLabel:'Prototype cross-scheme scenarios + official MPLADS convergence rules; not government transaction records'});
});

app.post('/api/officer/projects/:projectId/boq-analysis', authenticateToken, requireRole('officer'), (req,res)=>{
  const row=getWorkRow(req.params.projectId); if(!row)return res.status(404).json({error:'Work record not found'});
  const project=workRecordFromRow(row);
  if(req.body?.note){project.assuranceNotes=project.assuranceNotes||[];project.assuranceNotes.push({note:String(req.body.note).slice(0,500),createdAt:new Date().toISOString()});}
  const content=String(req.body?.content||'').trim();
  const fileName=String(req.body?.fileName||'').toLowerCase();
  if(fileName.endsWith('.pdf')) return res.status(415).json({error:'PDF extraction is not enabled in this Node-only release. Upload the BOQ as CSV/TXT, or connect a PDF extraction service before production use.'});
  const parsed = content ? parseBoqContent(content) : [];
  const sourceLines = parsed.length ? parsed : boqPrototypeLines;
  const items = sourceLines.map(item => {
    const key=normalizeText(item.item);
    const ref=maharashtraSsrMaterialRates.find(r=>r.match.some(m=>key.includes(m)));
    const referenceRate=ref?.rate ?? null;
    const boqRate=Number(item.rate||0);
    const variancePct=referenceRate&&boqRate?Number(((boqRate-referenceRate)/referenceRate*100).toFixed(1)):null;
    return {...item,referenceRate,referenceUnit:ref?.unit||item.unit,referenceSource:ref?.source||'No matching reference rate',variancePct,status:variancePct==null?'Reference unavailable':variancePct>15?'Review required':variancePct>5?'Review suggested':'Within reference band'};
  });
  const comparable=items.filter(x=>x.variancePct!=null);
  const boqTotal=Number(items.reduce((n,x)=>n+Number(x.quantity||0)*Number(x.rate||0),0).toFixed(2));
  const referenceTotal=Number(items.filter(x=>x.referenceRate!=null).reduce((n,x)=>n+Number(x.quantity||0)*Number(x.referenceRate||0),0).toFixed(2));
  const comparableVariance=referenceTotal>0?Number(((boqTotal-referenceTotal)/referenceTotal*100).toFixed(1)):null;
  res.json({projectId:project.id,workId:project.workId,fileName:String(req.body?.fileName||'Prototype BOQ input'),items,boqTotal,referenceTotal,comparableVariance,summary:content&&parsed.length?'BOQ lines were parsed and matched against the configured Maharashtra PWD SSR material-reference table where a direct material match exists.':'Prototype BOQ lines are shown so the workflow can be demonstrated before an actual project BOQ is uploaded.',sourceLabel:content?'Officer-supplied BOQ input + Maharashtra PWD SSR 2022-23 material reference':'Prototype BOQ demonstration dataset + Maharashtra PWD SSR 2022-23 material reference',referenceDate:'2022-23',comparableCount:comparable.length,guardrail:'Rate variance is a screening signal; location, grade, transport, taxes, specification and item composition must be verified before action.'});
});

function parseBoqContent(content){
  const text=String(content||'').replace(/\r/g,'');
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], next=text[i+1];
    if(c==='"'){ if(quoted && next==='"'){field+='"'; i++;} else quoted=!quoted; continue; }
    if(!quoted && (c===',' || c==='\t' || c==='|')){ row.push(field.trim()); field=''; continue; }
    if(!quoted && c==='\n'){ row.push(field.trim()); field=''; if(row.some(Boolean)) rows.push(row); row=[]; continue; }
    field+=c;
  }
  row.push(field.trim()); if(row.some(Boolean)) rows.push(row);
  const out=[];
  for(const parts of rows){
    if(parts.length<3) continue;
    const normalized=parts.map(x=>String(x||'').trim());
    const numeric=normalized.map(x=>Number(x.replace(/[^0-9.-]/g,'')));
    const rate=numeric.find((n,idx)=>idx>0 && Number.isFinite(n) && n>0);
    const qty=Number.isFinite(numeric[1])&&numeric[1]>0?numeric[1]:1;
    const unit=normalized[2]||'unit';
    if(Number.isFinite(rate)&&rate>0) out.push({item:normalized[0],quantity:qty,unit,rate});
  }
  return out;
}
const fieldInspectionStore = new Map(Object.entries(runtimeState.inspections || {}));

app.get('/api/field-inspection/projects/:projectId', authenticateToken, requireRole('officer','incharge'), (req,res)=>{
  const row=getWorkRow(req.params.projectId); if(!row)return res.status(404).json({error:'Work record not found'});
  const project=workRecordFromRow(row);
  res.json({projectId:project.id,reports:fieldInspectionStore.get(String(project.workId))||[],syncMode:'local-first'});
});
app.post('/api/field-inspection/sync', authenticateToken, requireRole('officer','incharge'), (req,res)=>{
  const {projectId,note,photoName,device,createdAt}=req.body||{};
  const row=getWorkRow(projectId); if(!row)return res.status(404).json({error:'Work record not found'});
  const project=workRecordFromRow(row);
  project.fieldInspections=project.fieldInspections||[];
  if(!note)return res.status(400).json({error:'Inspection note is required'});
  const record={id:`EDGE-${Date.now()}`,projectId,note:String(note).slice(0,1000),photoName:photoName||null,device:device||'Edge Plug',createdAt:createdAt||new Date().toISOString(),status:'Synced'};
  const stored = fieldInspectionStore.get(String(project.workId)) || [];
  stored.unshift(record);
  fieldInspectionStore.set(String(project.workId), stored);
  runtimeState.inspections[String(project.workId)] = stored; persist();
  res.status(201).json({inspection:record});
});

app.post('/api/niree', authenticateToken, (req,res)=>{ const question=String(req.body?.question||'').trim(); if(!question)return res.status(400).json({error:'Question is required'}); res.json(nireeAnswer(req.user.role,question)); });

app.get('/api/dataset/summary', (req,res)=>{
  res.json({ ...realSummary, states: realStates, categories: realCategories, statuses: realStatuses, source: datasetMeta.source });
});

/* =========================================================
   SINGLE-SERVICE FRONTEND DELIVERY
   The Vite build is emitted into artifacts/nirikshan-api/public so the
   same Node service can host the UI and API in one deployable unit.
   ========================================================= */
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
}

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Nirikshan API",
    time: new Date().toISOString(),
  });
});

/*
 * Simple health route for browser/CMD testing.
 */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Nirikshan API",
    frontend: fs.existsSync(path.join(PUBLIC_DIR, 'index.html')) ? 'built' : 'not-built',
    works: projectIndexRows.length,
  });
});

// SPA fallback: API routes are already registered above; only non-API paths
// are rewritten to index.html for browser-side routing (e.g. /dashboard).
if (fs.existsSync(PUBLIC_DIR)) {
  app.get(/^(?!\/api(?:\/|$)|\/health$).*/, (req, res, next) => {
    const indexFile = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    next();
  });
}

/* =========================================================
   SERVER
   ========================================================= */

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) { app.listen(PORT, () => console.log(`Nirikshan API running on http://localhost:${PORT}`)); }
export default app;
