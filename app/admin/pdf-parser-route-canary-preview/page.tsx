import PdfParserRouteCanaryPreviewClient from "./PdfParserRouteCanaryPreviewClient";

export default function PdfParserRouteCanaryPreviewPage() {
  return (
    <PdfParserRouteCanaryPreviewClient
      initialFilters={{
        from: "",
        to: "",
        fiscalYear: "",
        organizationNumber: "",
        limit: "100",
      }}
    />
  );
}
