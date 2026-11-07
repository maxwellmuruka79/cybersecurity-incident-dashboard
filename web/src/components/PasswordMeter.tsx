import { useMemo } from "react";
import { analyzePassword } from "../lib/password";

// Strength bar that slides smoothly from red (weak) to green (strong) as you type.
export default function PasswordMeter({ password, compact = false }: { password: string; compact?: boolean }) {
  const report = useMemo(() => analyzePassword(password), [password]);
  if (!password) return null;

  const hue = Math.round(report.percent * 1.2); // 0 = red, 120 = green
  const colour = `hsl(${hue} 80% 52%)`;
  const firstProblem = report.findings.find((f) => !f.good);

  return (
    <div>
      <div className="h-2 overflow-hidden rounded bg-slate-800" role="meter" aria-valuenow={report.score} aria-valuemin={0} aria-valuemax={4}>
        <div className="h-full rounded transition-all duration-500" style={{ width: `${Math.max(4, report.percent)}%`, background: colour }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span style={{ color: colour }}>{report.label}</span>
        {compact && firstProblem && <span className="ml-3 truncate text-slate-500">{firstProblem.text.split(".")[0]}</span>}
      </div>
    </div>
  );
}