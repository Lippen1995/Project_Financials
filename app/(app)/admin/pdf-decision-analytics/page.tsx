import PdfDecisionAnalyticsClient from "./PdfDecisionAnalyticsClient";
import { getActivePdfDecisionRuleConfig } from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";

export default async function PdfDecisionAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  return (
    <PdfDecisionAnalyticsClient
      activeRuleConfigVersion={getActivePdfDecisionRuleConfig().version}
      initialFilters={{
        limit: typeof sp.limit === "string" ? sp.limit : "100",
        fiscalYear: typeof sp.fiscalYear === "string" ? sp.fiscalYear : "",
        orgNumber: typeof sp.orgNumber === "string" ? sp.orgNumber : "",
      }}
    />
  );
}
