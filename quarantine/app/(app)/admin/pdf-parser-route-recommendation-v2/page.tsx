import PdfParserRouteRecommendationV2Client from "./PdfParserRouteRecommendationV2Client";

export default function PdfParserRouteRecommendationV2Page() {
  return (
    <PdfParserRouteRecommendationV2Client
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
