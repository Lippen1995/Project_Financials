import {
  DataAvailability,
  NormalizedCompany,
  NormalizedFinancialStatement,
  NormalizedRole,
} from "@/lib/types";

import { AiSummary } from "./overview/ai-summary";
import { CompanyInfo } from "./overview/company-info";
import { EarningsTrends } from "./overview/earnings-trends";
import { KeyFiguresOverview } from "./overview/key-figures-overview";

export function OverviewAnalytics({
  company,
  roles,
  statements,
}: {
  company: NormalizedCompany;
  roles: NormalizedRole[];
  statements: NormalizedFinancialStatement[];
  financialsAvailability: DataAvailability;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AiSummary />
      <EarningsTrends statements={statements} />
      <div className="border-t border-[var(--px-border-subtle)] pt-6">
        <KeyFiguresOverview statements={statements} />
      </div>
      <div className="border-t border-[var(--px-border-subtle)] pt-6">
        <CompanyInfo company={company} roles={roles} />
      </div>
    </div>
  );
}
