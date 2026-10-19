import type { Severity, Status } from "../types";
import { STATUS_LABEL } from "../types";

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-red-500/15 text-red-300 ring-red-500/40",
  high: "bg-orange-500/15 text-orange-300 ring-orange-500/40",
  medium: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  low: "bg-slate-500/15 text-slate-300 ring-slate-500/40",
};

const STATUS_STYLE: Record<Status, string> = {
  new: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/40",
  triage: "bg-violet-500/15 text-violet-300 ring-violet-500/40",
  investigating: "bg-blue-500/15 text-blue-300 ring-blue-500/40",
  resolved: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  false_positive: "bg-slate-500/15 text-slate-400 ring-slate-500/40",
};

const base = "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`${base} ${SEVERITY_STYLE[severity]} capitalize`}>{severity}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`${base} ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}
