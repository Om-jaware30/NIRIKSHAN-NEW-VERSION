export type RiskLevel = 'Low' | 'Medium' | 'High';
export type ProjectStatus = 'In progress' | 'Completed' | 'Delayed' | 'Not started' | 'In Progress';
export type Project = {
  id: string; name: string; location: string; state: string; category: string; type?: string; public?: boolean;
  sanctionedCost: number; currentExpenditure: number; progressReported?: boolean; dataSource?: string; publicSource?: string; budget?: number; physicalProgress: number; financialProgress: number;
  startDate: string; expectedCompletionDate: string; plannedCompletion?: string; actualCompletion?: string | null;
  responsibleAuthority?: string; assignedContractor?: string; status: ProjectStatus; riskScore: number; riskLevel: RiskLevel;
  milestones?: { id?: string; name: string; status: string }[]; publicUpdates?: string[]; civilianReports?: any[]; executionIssues?: any[]; workUpdates?: any[]; contractorReports?: any[]; videoEvidence?: any[]; signals: { cost?: CostSignal; mismatch?: MismatchSignal; duplicate?: DuplicateSignal; timeline?: TimelineSignal };
  house?: string; recommendedAmount?: number; recommendedWorks?: number; completedWorks?: number; transactionCount?: number; successfulPayments?: number; pendingPayments?: number; balanceNotYetPaidToVendors?: number; averageRating?: number | null; utilizationPct?: number; completionRatePct?: number; primaryPayee?: string | null; recommendedWorksSample?: any[]; completedWorksSample?: any[]; transactionSample?: any[]; repeatedWorkSamples?: any[];
};
export type CostSignal = { actualCost: number; benchmarkRange: [number, number]; deviation: number; severity: RiskLevel; reason: string };
export type MismatchSignal = { physical: number; financial: number; gap: number; severity: RiskLevel; reason: string };
export type DuplicateSignal = { similarity: number; matchedProject: string; severity: RiskLevel; reason: string };
export type TimelineSignal = { expected: string; daysOverdue: number; severity: RiskLevel; reason: string };
export type DuplicateMatch = {
  id: string; name: string; location: string; category: string; similarity: number;
  proximityKm: number; status: ProjectStatus; factors: string[]; workIds?: number[];
};
export type DuplicateAnalysis = {
  projectId: string; matches: DuplicateMatch[]; recommendation: string; sampleLabel: string;
};
export type ProgressAnalysis = {
  projectId: string; financialProgress: number; physicalProgress: number;
  expectedRange: [number, number]; difference: number; anomalyScore: number;
  explanation: string; recommendation: string; sampleLabel: string;
};
export type CostBenchmarkAnalysis = {
  projectId: string; projectType: string; location: string; size: string;
  sanctionedCost: number; estimatedRange: [number, number]; actualCost: number;
  deviation: number; anomalyScore: number; factors: string[];
  disclaimer: string; recommendation: string; sampleLabel: string;
};
export type UnifiedRiskAnalysis = {
  projectId: string; overallScore: number; level: RiskLevel;
  contributions: { duplicate: number; progress: number; cost: number; timeline: number };
  summary: string; attentionReason: string; recommendation: string; sampleLabel: string;
};


const wait = <T,>(data: T, ms = 180) =>
  new Promise<T>(resolve => setTimeout(() => resolve(data), ms));

const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = (import.meta.env.VITE_API_URL || (isLocalHost ? 'http://localhost:4000' : window.location.origin)).replace(/\/$/, '');

type AuthRole = 'civilian' | 'officer' | 'incharge' | 'contractor';

type StoredAuthUser = {
  username: string;
  role: AuthRole;
};

function getStoredUser(): StoredAuthUser | null {
  try {
    const raw = localStorage.getItem('nirikshan-auth-user');
    if (!raw) return null;

    const user = JSON.parse(raw) as StoredAuthUser;

    if (
      user &&
      typeof user.username === 'string' &&
      ['civilian', 'officer', 'incharge', 'contractor'].includes(user.role)
    ) {
      return user;
    }
  } catch {
    // Ignore invalid local auth state.
  }

  return null;
}

function getToken(): string | null {
  return localStorage.getItem('nirikshan-token');
}

function getCurrentRole(): AuthRole | null {
  return getStoredUser()?.role ?? null;
}

function getProjectEndpoint(role: AuthRole | null): string {
  switch (role) {
    case 'officer':
      return '/api/officer/projects';

    case 'incharge':
      return '/api/incharge/projects';

    case 'contractor':
      return '/api/contractor/projects';

    case 'civilian':
      return '/api/projects/public';

    default:
      return '/api/projects/public';
  }
}

async function apiGet<T>(
  path: string,
  protectedRoute = true,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (protectedRoute) {
    const token = getToken();

    if (!token) {
      throw new Error('Authentication required.');
    }

    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let message = `API request failed (${response.status})`;

    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch {
      // Keep default error.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function normalizeProject(raw: unknown): Project | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, any>;
  const p = (obj.project && typeof obj.project === 'object' ? obj.project : obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<string, any>;
  const location = String(p.location || '');
  const state = String(p.state || location.split(',').pop()?.trim() || '');
  const category = String(p.category || p.type || 'Public Works');
  const statusRaw = String(p.status || 'Not started');
  const status: ProjectStatus = statusRaw.toLowerCase() === 'in progress' ? 'In progress' : statusRaw as ProjectStatus;
  return {
    ...p, id:String(p.id || ''), name:String(p.name || 'Untitled project'), location, state, category, type:p.type || category,
    sanctionedCost:Number(p.sanctionedCost || 0), currentExpenditure:Number(p.currentExpenditure ?? p.expenditure ?? 0), budget:Number(p.budget ?? p.sanctionedCost ?? 0),
    physicalProgress:Number(p.physicalProgress || 0), financialProgress:Number(p.financialProgress || 0),
    startDate:String(p.startDate || ''), expectedCompletionDate:String(p.expectedCompletionDate || p.plannedCompletion || ''), plannedCompletion:p.plannedCompletion || p.expectedCompletionDate || '',
    actualCompletion:p.actualCompletion ?? null, status, riskScore:Number(p.riskScore || 0), riskLevel:(p.riskLevel || 'Low') as RiskLevel,
    signals:p.signals || {}, milestones:p.milestones || [], publicUpdates:p.publicUpdates || [], civilianReports:p.civilianReports || [], executionIssues:p.executionIssues || [], workUpdates:p.workUpdates || [], contractorReports:p.contractorReports || []
  };
}

function normalizeProjectList(data: unknown): Project[] {
  if (Array.isArray(data)) return data.map(normalizeProject).filter(Boolean) as Project[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const rows = Array.isArray(obj.projects) ? obj.projects : Array.isArray(obj.data) ? obj.data : [];
    return rows.map(normalizeProject).filter(Boolean) as Project[];
  }
  return [];
}

export const getProjects = async (filters?: {
  query?: string;
  risk?: string;
  state?: string;
  category?: string;
  status?: string;
}): Promise<Project[]> => {
  const role = getCurrentRole();

  const params = new URLSearchParams();

  if (filters?.query) params.set('query', filters.query);
  if (filters?.risk) params.set('risk', filters.risk);
  if (filters?.state) params.set('state', filters.state);
  if (filters?.category) params.set('category', filters.category);
  if (filters?.status) params.set('status', filters.status);

  const endpoint = getProjectEndpoint(role);

  const path = params.toString()
    ? `${endpoint}?${params.toString()}`
    : endpoint;

  const data = await apiGet<unknown>(
    path,
    role !== 'civilian',
  );

  return normalizeProjectList(data);
};

export const getProjectById = async (id: string): Promise<Project | undefined> => {
  if (!id) return undefined;
  const role = getCurrentRole();
  const data = await apiGet<unknown>(`/api/projects/${encodeURIComponent(id)}`, true);
  return normalizeProject(data);
};

export async function apiPost<T>(path: string, body: unknown, protectedRoute = true): Promise<T> {
  const headers: Record<string,string> = {'Accept':'application/json','Content-Type':'application/json'};
  if (protectedRoute) { const token=getToken(); if(!token) throw new Error('Authentication required.'); headers.Authorization=`Bearer ${token}`; }
  const response=await fetch(`${API_BASE}${path}`,{method:'POST',headers,body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error((data as any).error || (data as any).message || `API request failed (${response.status})`);
  return data as T;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const token=getToken(); if(!token) throw new Error('Authentication required.');
  const response=await fetch(`${API_BASE}${path}`,{method:'PATCH',headers:{'Accept':'application/json','Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error((data as any).error || (data as any).message || `API request failed (${response.status})`);
  return data as T;
}

export type ReportRecord = { id:string; projectId:string; projectName:string; type:string; text?:string; status:string; riskLevel?:string; createdAt:string; [key:string]:any };
export const getReports = async (role: 'officer'|'incharge'|'contractor'): Promise<ReportRecord[]> => {
  const data=await apiGet<{reports:ReportRecord[]}>(`/api/${role}/reports`,true); return data.reports || [];
};
export const getReportDetail = async (role: 'officer'|'incharge'|'contractor', id:string) => apiGet<{report:ReportRecord;project?:Project}>(`/api/${role}/reports/${encodeURIComponent(id)}`,true);
export const submitCivilianReport = async (projectId:string,type:string,text:string) => apiPost(`/api/projects/${encodeURIComponent(projectId)}/reports`,{type,text},true);
export const getCivilianReports = async () => apiGet<{reports:ReportRecord[]}>(`/api/civilian/reports`,true);
export const submitCivilianOpinion = async (projectId:string,rating:number,text:string) => apiPost(`/api/projects/${encodeURIComponent(projectId)}/opinions`,{rating,text},true);
export const reviewCivilianReport = async (reportId:string,status:string,reviewNote:string) => apiPatch(`/api/officer/reports/${encodeURIComponent(reportId)}`,{status,reviewNote});
export const getInchargeProject = async (projectId:string) => apiGet<{project:Project}>(`/api/incharge/projects/${encodeURIComponent(projectId)}`,true);
export const updateMilestone = async (projectId:string,milestoneId:string,status:string) => apiPatch(`/api/incharge/projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}`,{status});
export const createInchargeIssue = async (projectId:string,title:string,description:string,priority:string) => apiPost(`/api/incharge/projects/${encodeURIComponent(projectId)}/issues`,{title,description,priority},true);
export const updateInchargeIssue = async (projectId:string,issueId:string,status:string,response:string) => apiPatch(`/api/incharge/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`,{status,response});
export const submitInchargeReport = async (projectId:string,text:string) => apiPost('/api/incharge/reports',{projectId,text},true);
export const submitContractorWorkUpdate = async (projectId:string,update:string,physicalProgress?:number,milestone?:string) => apiPost(`/api/contractor/projects/${encodeURIComponent(projectId)}/work-updates`,{update,physicalProgress,milestone},true);
export const submitContractorReport = async (projectId:string,text:string) => apiPost('/api/contractor/reports',{projectId,text},true);
export const getContractorPerformance = async () => apiGet('/api/contractor/performance',true);
export type NireeResponse = { answer:string; sources:string[]; role:string };
export const askNiree = async (question:string): Promise<NireeResponse> => apiPost<NireeResponse>('/api/niree',{question},true);



export type FundingCheck = { projectId:string; overlapCount:number; status:'Review suggested'|'No overlap signal'; summary:string; matches:{scheme:string;reference:string;reason:string}[] };
export type BoqAnalysis = { projectId:string; fileName:string; items:{item:string;quantity:number;unit:string;boqRate:number;referenceRate:number;variancePct:number;status:string}[]; summary:string; sourceLabel:string };
export type FieldInspection = { projectId:string; reports:any[]; syncMode:string };
export const getFundingCheck = async (projectId:string):Promise<FundingCheck> => apiGet<FundingCheck>(`/api/officer/projects/${encodeURIComponent(projectId)}/funding-check`,true);
export const analyzeBoq = async (projectId:string,fileName:string,note?:string,content?:string):Promise<BoqAnalysis> => apiPost<BoqAnalysis>(`/api/officer/projects/${encodeURIComponent(projectId)}/boq-analysis`,{fileName,note,content},true);
export const getFieldInspection = async (projectId:string):Promise<FieldInspection> => apiGet<FieldInspection>(`/api/field-inspection/projects/${encodeURIComponent(projectId)}`,true);
export const syncFieldInspection = async (payload:any) => apiPost(`/api/field-inspection/sync`,payload,true);


export type WorkIntelligence = Project & { workId:number; mpName:string; constituency:string; locality:string; district:string; recommendedAmount:number|null; finalAmount:number|null; intelligence:any };
export type WorkSearchResponse = { total:number; page:number; pageSize:number; totalPages:number; source:string; works:WorkIntelligence[] };
export type WorkIntelligenceSummary = {works:number;high:number;medium:number;low:number;duplicateSignals:number;financialSignals:number;progressSignals:number;evidenceSignals:number;incompleteRecords:number;source:string};
export const getWorkIntelligenceSummary = async ():Promise<WorkIntelligenceSummary> => apiGet<WorkIntelligenceSummary>('/api/officer/intelligence-summary',true);
export type WorkDuplicateAnalysis = { projectId:string; workId:number; selected:WorkIntelligence; matches:any[]; recommendation:string; sampleLabel:string };
export type WorkProgressAnalysis = { projectId:string; workId:number; financialProgress:number|null; physicalProgress:number|null; expectedRange:[number,number]|null; difference:number|null; anomalyScore:number|null; explanation:string; recommendation:string; sampleLabel:string };
export type WorkFinancialAnalysis = { projectId:string; workId:number; description:string; recommendedAmount:number; finalAmount:number|null; unspentAmount:number|null; utilizationPct:number|null; variancePct:number|null; category:string; state:string; authority:string; hasImages:boolean; factors:string[]; recommendation:string; sampleLabel:string };
export type WorkRiskAnalysis = { projectId:string; workId:number; overallScore:number; level:RiskLevel; contributions:{duplicate:number;financial:number;progress:number;evidence:number;dataQuality:number}; dataCompleteness:number; summary:string; attentionReason:string; reasons:string[]; recommendation:string; guardrail:string; sampleLabel:string };
export const getWorkIntelligence = async (filters?:{query?:string;state?:string;house?:string;riskLevel?:string;signal?:string;page?:number;pageSize?:number}):Promise<WorkSearchResponse> => { const params=new URLSearchParams(); Object.entries(filters||{}).forEach(([k,v])=>{if(v!==undefined&&v!=='')params.set(k,String(v))}); return apiGet<WorkSearchResponse>(`/api/officer/work-intelligence${params.toString()?`?${params.toString()}`:''}`,true); };
export const getWorkIntelligenceItem = async (id:string):Promise<WorkIntelligence> => apiGet<{work:WorkIntelligence}>(`/api/officer/work/${encodeURIComponent(id)}/intelligence`,true).then(x=>x.work);
export const getWorkDuplicateAnalysis = async (id:string):Promise<WorkDuplicateAnalysis> => apiGet<WorkDuplicateAnalysis>(`/api/officer/work/${encodeURIComponent(id)}/duplicate-analysis`,true);
export const getWorkProgressAnalysis = async (id:string):Promise<WorkProgressAnalysis> => apiGet<WorkProgressAnalysis>(`/api/officer/work/${encodeURIComponent(id)}/progress-analysis`,true);
export const getWorkFinancialAnalysis = async (id:string):Promise<WorkFinancialAnalysis> => apiGet<WorkFinancialAnalysis>(`/api/officer/work/${encodeURIComponent(id)}/financial-analysis`,true);
export const getWorkRiskAnalysis = async (id:string):Promise<WorkRiskAnalysis> => apiGet<WorkRiskAnalysis>(`/api/officer/work/${encodeURIComponent(id)}/risk-analysis`,true);

export const getRiskAnalysis = (id:string) => apiGet<any>(`/api/officer/projects/${encodeURIComponent(id)}/risk-analysis`,true);
export const getCostBenchmark = (category:string) => apiGet<any>(`/api/officer/financial-context?category=${encodeURIComponent(category)}`,true);
export const getDuplicateMatches = (id:string) => apiGet<any>(`/api/officer/projects/${encodeURIComponent(id)}/duplicate-analysis`,true).then((x:any)=>x.matches||[]);
export const getDuplicateAnalysis = (id:string): Promise<DuplicateAnalysis> => apiGet<DuplicateAnalysis>(`/api/officer/projects/${encodeURIComponent(id)}/duplicate-analysis`,true);
export const getProgressAnalysis = (id:string): Promise<ProgressAnalysis> => apiGet<ProgressAnalysis>(`/api/officer/projects/${encodeURIComponent(id)}/progress-analysis`,true);
export const getCostBenchmarkAnalysis = (id:string): Promise<CostBenchmarkAnalysis> => apiGet<CostBenchmarkAnalysis>(`/api/officer/projects/${encodeURIComponent(id)}/cost-benchmark`,true);

  export const getUnifiedRiskAnalysis = async (
  id: string
): Promise<UnifiedRiskAnalysis> => {
  const role = getCurrentRole();

  if (role !== 'officer') {
    throw new Error('Officer access required for unified risk analysis.');
  }

  return apiGet<UnifiedRiskAnalysis>(
    `/api/officer/projects/${encodeURIComponent(id)}/unified-risk`,
    true
  );
};

export const recordReviewPriority = async (projectId:string) => apiPost('/api/officer/review-priority',{projectId},true);

export type ProjectRegisterItem = Project & { workId:number; description:string; mpName:string; constituency:string; locality:string; district:string; recommendationDate:string; completedDate:string; recommendedAmount:number|null; finalAmount:number|null; hasImages:boolean; averageRating:number|null; ida:string; recordType:'work' };
export type ProjectRegisterResponse = { total:number; page:number; pageSize:number; totalPages:number; source:string; register:{total:number;recommendedRecords:number;completedRecords:number;overlappingWorkIds:number;source:string}; projects:ProjectRegisterItem[] };
export type ProjectRegisterOptions = { states:string[]; districts:string[]; categories:string[]; houses:string[]; statuses:string[]; areas:{name:string;count:number}[]; total:number; source:string };
export type MPRegisterItem = { id:string; name:string; constituency:string; state:string; house:string; allocatedAmount:number; recommendedAmount:number; expenditure:number; recommendedWorks:number; completedWorks:number; completionRate:number; transactionCount:number; successfulPayments:number; pendingPayments:number; balanceNotYetPaidToVendors:number; averageRating:number|null; responsibleAuthority:string; dataSource:string };
export type MPRegisterResponse = { total:number; page:number; pageSize:number; totalPages:number; mps:MPRegisterItem[] };
export const getProjectRegister = async (filters?:{query?:string;state?:string;district?:string;area?:string;category?:string;status?:string;house?:string;page?:number;pageSize?:number}):Promise<ProjectRegisterResponse> => {
  const params=new URLSearchParams(); Object.entries(filters||{}).forEach(([k,v])=>{if(v!==undefined&&v!=='' )params.set(k,String(v))});
  return apiGet<ProjectRegisterResponse>(`/api/project-register${params.toString()?`?${params.toString()}`:''}`,false);
};
export const getProjectRegisterOptions = async (filters?:{state?:string;district?:string}):Promise<ProjectRegisterOptions> => {
  const params=new URLSearchParams(); Object.entries(filters||{}).forEach(([k,v])=>{if(v)params.set(k,String(v))});
  return apiGet<ProjectRegisterOptions>(`/api/project-register/options${params.toString()?`?${params.toString()}`:''}`,false);
};
export const getProjectRegisterItem = async (id:string):Promise<ProjectRegisterItem> => apiGet<{project:ProjectRegisterItem}>(`/api/project-register/${encodeURIComponent(id)}`,true).then(x=>x.project);
export const getMPRegister = async (filters?:{query?:string;state?:string;house?:string;page?:number;pageSize?:number}):Promise<MPRegisterResponse> => {
  const params=new URLSearchParams(); Object.entries(filters||{}).forEach(([k,v])=>{if(v!==undefined&&v!=='')params.set(k,String(v))});
  return apiGet<MPRegisterResponse>(`/api/mp-register${params.toString()?`?${params.toString()}`:''}`,false);
};
export const allStates = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu And Kashmir','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman And Nicobar Islands','Chandigarh','Dadra And Nagar Haveli And Daman And Diu','Delhi','Ladakh','Lakshadweep','Puducherry'];
export const allCategories = ['Public Works','Repair & Renovation','Community / Society','Community / Association'];
export const allStatuses = ['Completed','In Progress','Not started'];

export type TransactionRecord = { id:string; projectId:string; date:string; work:string; amount:number; payee:string; category:string; status:string; milestone:string; source?:string };
export type TransactionBook = { projectId:string; projectName:string; sanctionedCost:number; releasedAmount:number; recordedExpenditure:number; balance:number; transactions:TransactionRecord[]; sampleLabel:string };
export type ProjectComparison = { projectId:string; projectType:string; current:{physicalProgress:number;financialProgress:number}; comparables:any[]; averageComparable:{physicalProgress:number;financialProgress:number}; variance:{physicalGap:number;financialGap:number}; assessment:string; recommendation:string; sampleLabel:string };
export const getTransactionBook = async (projectId:string) => apiGet<TransactionBook>(`/api/officer/projects/${encodeURIComponent(projectId)}/transactions`,true);
export const getProjectComparison = async (projectId:string) => apiGet<ProjectComparison>(`/api/projects/${encodeURIComponent(projectId)}/comparison`,true);
export type SatelliteMonitoring = { projectId:string; projectName:string; projectArea:string; available?:boolean; previousObservationDate:string; latestObservationDate:string; previousActivity:number; latestActivity:number; activityChange:number; observedProgress:number; consistency:'Consistent'|'Review suggested'|'Not available'; observation:string; sampleLabel:string };
export const getSatelliteMonitoring = async (projectId:string) => apiGet<SatelliteMonitoring>(`/api/projects/${encodeURIComponent(projectId)}/satellite`,true);
export const submitVideoEvidence = async (projectId:string,payload:{fileName:string;mimeType:string;size:number;note?:string;milestone?:string}) => apiPost(`/api/contractor/projects/${encodeURIComponent(projectId)}/video-evidence`,payload,true);
export const getInchargeVideoEvidence = async (projectId:string) => apiGet<{evidence:any[]}>(`/api/incharge/projects/${encodeURIComponent(projectId)}/video-evidence`,true);
export const verifyVideoEvidence = async (projectId:string,evidenceId:string,status:string) => apiPatch(`/api/incharge/projects/${encodeURIComponent(projectId)}/video-evidence/${encodeURIComponent(evidenceId)}`,{status});
