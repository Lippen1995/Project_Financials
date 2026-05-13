import type {
  UnifiedConfidenceAdminRow,
  UnifiedConfidenceAdminStatus,
} from "@/server/services/annual-report-unified-confidence-admin-service";

function verdictClasses(verdict: UnifiedConfidenceAdminRow["gateVerdict"]) {
  switch (verdict) {
    case "PASS":
      return "bg-green-50 text-green-700 border-green-200";
    case "WARN":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "FAIL":
      return "bg-red-50 text-red-700 border-red-200";
    case "INSUFFICIENT_DATA":
      return "bg-slate-50 text-slate-600 border-slate-200";
    default:
      return "bg-slate-50 text-slate-500 border-slate-200";
  }
}

function statusClasses(status: UnifiedConfidenceAdminStatus) {
  switch (status) {
    case "completed":
      return "bg-green-50 text-green-700 border-green-200";
    case "skipped":
      return "bg-slate-50 text-slate-600 border-slate-200";
    case "error":
      return "bg-red-50 text-red-700 border-red-200";
  }
}

export function VerdictBadge({ verdict }: { verdict: UnifiedConfidenceAdminRow["gateVerdict"] }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${verdictClasses(verdict)}`}>
      {verdict ?? "UNKNOWN"}
    </span>
  );
}

export function StatusBadge({ status }: { status: UnifiedConfidenceAdminStatus }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${statusClasses(status)}`}>
      {status}
    </span>
  );
}

export function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString("nb-NO") : "—";
}

export function formatDuration(value: number | null) {
  return value === null ? "—" : `${value} ms`;
}

export function formatPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(0)}%`;
}

export function formatCount(value: number | null) {
  return value === null ? "—" : String(value);
}

export function summarizeCodes(codes: string[], max = 2) {
  if (codes.length === 0) {
    return "—";
  }

  const head = codes.slice(0, max).join(", ");
  return codes.length > max ? `${head} +${codes.length - max}` : head;
}
