import PdfModelCandidateDetailClient from "./PdfModelCandidateDetailClient";

export default async function PdfModelCandidateDetailPage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;
  return <PdfModelCandidateDetailClient candidateId={candidateId} />;
}
