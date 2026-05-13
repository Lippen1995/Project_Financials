import PdfModelCandidatesClient from "./PdfModelCandidatesClient";

export default function PdfModelCandidatesPage() {
  return (
    <PdfModelCandidatesClient
      initialFilters={{
        status: "",
        modelTarget: "",
        modelId: "",
        limit: "50",
      }}
    />
  );
}
