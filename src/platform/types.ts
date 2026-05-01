export type AuditCategory =
  | "performance"
  | "seo"
  | "accessibility"
  | "security"
  | "carbon";

export type IssueStatus = "open" | "in_progress" | "fixed" | "ignored";

export interface TeamIssueComment {
  id: string;
  issueId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface TeamIssue {
  id: string;
  category: AuditCategory;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  status: IssueStatus;
  ownerId?: string;
  comments: TeamIssueComment[];
  updatedAt: string;
}

export interface AuditScoreSet {
  performance: number;
  seo: number;
  accessibility: number;
  security: number;
  carbon: number;
  overall: number;
}

export interface AuditSnapshot {
  id: string;
  url: string;
  branch?: string;
  commitSha?: string;
  capturedAt: string;
  scores: AuditScoreSet;
}

export interface BenchmarkRow {
  url: string;
  latest: AuditScoreSet | null;
  trend7d: number | null;
}

export interface RumMetricSample {
  url: string;
  lcp?: number;
  cls?: number;
  inp?: number;
  fcp?: number;
  ttfb?: number;
  deviceType: "mobile" | "desktop" | "tablet";
  browser: string;
  country: string;
  network: string;
  capturedAt: string;
}

export interface AlertPolicy {
  category: AuditCategory | "overall";
  minDelta: number;
  minSampleSize: number;
  coolDownMinutes: number;
}

export interface AlertDigest {
  period: "daily" | "weekly";
  generatedAt: string;
  regressions: Array<{ url: string; category: string; delta: number }>;
}
