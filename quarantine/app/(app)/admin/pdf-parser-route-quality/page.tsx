import PdfParserRouteQualityClient from "./PdfParserRouteQualityClient";

export default function PdfParserRouteQualityPage() {
  return (
    <PdfParserRouteQualityClient
      initialFilters={{
        from: "",
        to: "",
        fiscalYear: "",
        organizationNumber: "",
        routes: "",
        limit: "100",
      }}
    />
  );
}
