import { runDefaultPdfDecisionRuleTuningSimulation } from "@/server/services/pdf-decision-rule-tuning-simulation-service";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default async function PdfDecisionRuleTuningPage() {
  const report = runDefaultPdfDecisionRuleTuningSimulation();
  const selectedCandidateId = report.recommendation.bestCandidateId ?? report.candidates[0]?.candidateId;
  const selectedCandidate = report.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
          PDF Decision Rule Tuning
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Fixture-based simulation for conservative PDF Decision rule config changes.
          Simulation only. Production rules are not changed.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Baseline rules
          </div>
          <div className="mt-2 font-mono text-sm text-[#162233]">
            {report.baselineRuleConfigVersion}
          </div>
        </div>
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Fixtures
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#162233]">{report.fixtureCount}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-700">
            Recommendation
          </div>
          <div className="mt-2 text-sm text-amber-800">{report.recommendation.reason}</div>
        </div>
      </div>

      <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
        <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#162233]">Candidates</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
              <th className="px-4 py-2">Candidate</th>
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Default failed</th>
              <th className="px-4 py-2 text-right">Candidate failed</th>
              <th className="px-4 py-2 text-right">Delta</th>
              <th className="px-4 py-2 text-right">Changed</th>
              <th className="px-4 py-2">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {report.candidates.map((candidate) => (
              <tr key={candidate.candidateId} className="border-t border-[rgba(15,23,42,0.06)]">
                <td className="px-4 py-2 font-mono text-xs text-slate-600">
                  {candidate.candidateId}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">
                  {candidate.candidateFamily ?? "-"}
                </td>
                <td className="min-w-64 px-4 py-2 text-slate-600">
                  {candidate.candidateDescription ?? "-"}
                </td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {candidate.defaultFailedCount}
                </td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {candidate.candidateFailedCount}
                </td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {candidate.deltaFailedCount}
                </td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {candidate.changedDecisions.length}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {candidate.candidateId === report.recommendation.bestCandidateId ? "Best" : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
        <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#162233]">Changed decisions</h2>
          <p className="mt-1 text-xs text-slate-500">
            Showing changes for {selectedCandidate?.candidateId ?? "the first candidate"}.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
              <th className="px-4 py-2">Fixture</th>
              <th className="px-4 py-2">Default</th>
              <th className="px-4 py-2">Candidate</th>
              <th className="px-4 py-2">Change</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {!selectedCandidate || selectedCandidate.changedDecisions.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={5}>
                  No changed decisions for this candidate.
                </td>
              </tr>
            ) : (
              selectedCandidate.changedDecisions.map((change) => (
                <tr key={change.fixtureName} className="border-t border-[rgba(15,23,42,0.06)]">
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">
                    {change.fixtureName}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">
                    {change.defaultRoute} / {change.defaultRiskLevel} /{" "}
                    {formatPercent(change.defaultConfidenceScore)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">
                    {change.candidateRoute} / {change.candidateRiskLevel} /{" "}
                    {formatPercent(change.candidateConfidenceScore)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">
                    {change.changeType}
                  </td>
                  <td className="min-w-72 px-4 py-2 text-slate-600">
                    {change.notes.join(" ") || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
