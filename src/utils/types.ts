export interface NavigationTiming {
  dns: number;
  tcp: number;
  ttfb: number;
  domLoad: number;
  fullLoad: number;
  redirect: number;
  domInteractive: number;
  domContentLoaded: number;
}

export interface WebVitals {
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  inp: number | null;
  fcp: number | null;
  ttfb: number | null;
}

export interface ResourceInfo {
  name: string;
  type: string;
  size: number;
  duration: number;
  protocol: string;
  cached: boolean;
  compressed: boolean;
  initiatorType: string;
}

export interface ResourceMetrics {
  total: number;
  totalSize: number;
  byType: Record<string, { count: number; size: number }>;
  largest: ResourceInfo[];
  blocking: ResourceInfo[];
  resources: ResourceInfo[];
}

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface PerformanceMetrics {
  navigation: NavigationTiming;
  vitals: WebVitals;
  resources: ResourceMetrics;
  memory: MemoryInfo | null;
  framework: FrameworkInfo;
  runtime: RuntimeInfo;
  score: number;
  timestamp: number;
  url: string;
}

export interface FrameworkInfo {
  name: string;
  confidence: FrameworkConfidence;
  primary: FrameworkCandidate;
  detected: FrameworkCandidate[];
}

export type FrameworkConfidence = 'high' | 'medium' | 'low';

export interface FrameworkCandidate {
  name: string;
  confidence: FrameworkConfidence;
  signal: 'dom-or-global' | 'script-source' | 'fallback';
}

export interface RuntimeInfo {
  mode: 'local' | 'development' | 'production' | 'staging' | 'unknown';
  isLocal: boolean;
  isDev: boolean;
  host: string;
  port: string | null;
  buildStatus: 'prod' | 'dev' | 'unknown';
  buildSignals: string[];
}

export interface AuditIssue {
  severity: 'high' | 'medium' | 'low';
  description: string;
  resource?: string;
  suggestion: string;
}

export interface AuditResult {
  id: string;
  title: string;
  category: string;
  passed: boolean;
  score: number;
  issues: AuditIssue[];
  suggestions: string[];
}

export interface Suggestion {
  id: string;
  impact: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  resources: string[];
}

export interface AuditReport {
  url: string;
  timestamp: number;
  score: number;
  metrics: PerformanceMetrics;
  audits: AuditResult[];
  suggestions: Suggestion[];
}

export interface Settings {
  autoAudit: boolean;
  showBadge: boolean;
  collectResources: boolean;
  aiFixAgent: AIAgent;
  customAIAgent: string;
  auditFrequency: 'pageload' | 'manual' | 'interval';
  auditInterval: number;
  thresholds: {
    good: number;
    moderate: number;
    poor: number;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  autoAudit: true,
  showBadge: false,
  collectResources: true,
  aiFixAgent: 'cursor',
  customAIAgent: '',
  auditFrequency: 'pageload',
  auditInterval: 300000,
  thresholds: {
    good: 90,
    moderate: 50,
    poor: 25,
  },
};

export type MessageType =
  | 'COLLECT_METRICS'
  | 'METRICS_COLLECTED'
  | 'GET_AUDIT'
  | 'AUDIT_RESULT'
  | 'RE_AUDIT'
  | 'SETTINGS_UPDATED'
  | 'GET_CURRENT_AUDIT';

export interface Message {
  type: MessageType;
  payload?: unknown;
}

export type AIAgent = 'cursor' | 'claude' | 'codex' | 'custom';
