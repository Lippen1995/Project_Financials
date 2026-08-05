import PdfShadowVsRuleGateClient from "./PdfShadowVsRuleGateClient";

export default async function PdfShadowVsRuleGatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <PdfShadowVsRuleGateClient
      initialFilters={{
        limit: typeof sp.limit === "string" ? sp.limit : "100",
        fiscalYear: typeof sp.fiscalYear === "string" ? sp.fiscalYear : "",
        orgNumber: typeof sp.orgNumber === "string" ? sp.orgNumber : "",
        split: typeof sp.split === "string" ? sp.split : "all",
        minRecordCount: typeof sp.minRecordCount === "string" ? sp.minRecordCount : "10",
      }}
    />
  );
}
