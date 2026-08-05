import PdfRouteExperimentClient from "./PdfRouteExperimentClient";

export default async function PdfRouteExperimentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <PdfRouteExperimentClient
      initialFilters={{
        limit: typeof sp.limit === "string" ? sp.limit : "100",
        fiscalYear: typeof sp.fiscalYear === "string" ? sp.fiscalYear : "",
        orgNumber: typeof sp.orgNumber === "string" ? sp.orgNumber : "",
        includeLowPriority: sp.includeLowPriority === "true",
      }}
    />
  );
}
