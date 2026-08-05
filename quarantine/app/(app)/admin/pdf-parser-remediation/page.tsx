import PdfParserRemediationClient from "./PdfParserRemediationClient";

export default async function PdfParserRemediationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <PdfParserRemediationClient
      initialFilters={{
        limit: typeof sp.limit === "string" ? sp.limit : "100",
        fiscalYear: typeof sp.fiscalYear === "string" ? sp.fiscalYear : "",
        orgNumber: typeof sp.orgNumber === "string" ? sp.orgNumber : "",
        maxExamples: typeof sp.maxExamples === "string" ? sp.maxExamples : "5",
      }}
    />
  );
}
