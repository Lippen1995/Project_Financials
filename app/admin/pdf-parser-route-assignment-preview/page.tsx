import PdfParserRouteAssignmentPreviewClient from "./PdfParserRouteAssignmentPreviewClient";

export default function PdfParserRouteAssignmentPreviewPage() {
  return (
    <PdfParserRouteAssignmentPreviewClient
      initialFilters={{
        seed: "preview",
        from: "",
        to: "",
        fiscalYear: "",
        organizationNumber: "",
        limit: "100",
      }}
    />
  );
}
