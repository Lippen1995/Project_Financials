import PdfShadowModelClient from "./PdfShadowModelClient";

export default async function PdfShadowModelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <PdfShadowModelClient
      initialFilters={{
        limit: typeof sp.limit === "string" ? sp.limit : "100",
        fiscalYear: typeof sp.fiscalYear === "string" ? sp.fiscalYear : "",
        orgNumber: typeof sp.orgNumber === "string" ? sp.orgNumber : "",
        split: typeof sp.split === "string" ? sp.split : "all",
      }}
    />
  );
}
