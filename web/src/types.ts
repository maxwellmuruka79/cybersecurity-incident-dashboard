export type Severity = "low" | "medium" | "high" | "critical";
export type Status = "new" | "triage" | "investigating" | "resolved" | "false_positive";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
export const STATUSES: Status[] = ["new", "triage", "investigating", "resolved", "false_positive"];

export const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  triage: "Triage",
  investigating: "Investigating",
  resolved: "Resolved",
  false_positive: "False positive",
};

export interface Incident {
  id: number;
  title: string;
  category: string;
  description: string | null;
  severity: Severity;
  status: Status;
  assignee: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertRow {
  id: number;
  rule_id: number;
  severity: Severity;
  src_ip: string | null;
  username: string | null;
  description: string;
  created_at: string;
  incident_id: number | null;
  detection_rules: { name: string } | null;
}

export interface Note {
  id: number;
  incident_id: number;
  author: string | null;
  note: string;
  created_at: string;
}

export type EventType = "login_success" | "login_failure";

export interface SecurityEvent {
  id: number;
  occurred_at: string;
  username: string;
  src_ip: string;
  country: string;
  event_type: EventType;
}