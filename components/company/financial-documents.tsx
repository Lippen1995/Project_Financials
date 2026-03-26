import { NormalizedFinancialDocument } from "@/lib/types";

function fileTypeLabel(type: string) {
  switch (type) {
    case "aarsregnskap":
      return "Årsregnskap";
    case "baerekraft":
      return "Bærekraftsopplysninger";
    case "mellombalanse":
      return "Mellombalanse";
    default:
      return type;
  }
}

export function FinancialDocuments({
  documents,
  latestYear,
}: {
  documents: NormalizedFinancialDocument[];
  latestYear?: number | null;
}) {
  if (documents.length === 0 && !latestYear) {
    return (
      <div className="border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-7 text-slate-600">
        Dokumentoversikten er ikke tilgjengelig for denne virksomheten akkurat nå.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)] p-5">
          <p className="data-label text-[11px] font-semibold uppercase text-slate-500">Sist innsendte årsregnskap</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{latestYear ?? "Ikke tilgjengelig"}</p>
        </div>
        <div className="border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)] p-5">
          <p className="data-label text-[11px] font-semibold uppercase text-slate-500">Registrerte regnskapsår</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{documents.length}</p>
        </div>
      </div>

      <div className="space-y-3">
        {documents.map((document) => (
          <div key={document.sourceId} className="border border-[rgba(15,23,42,0.08)] bg-white px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{document.year}</p>
                <p className="text-sm text-slate-600">{document.files.map((file) => fileTypeLabel(file.type)).join(", ")}</p>
              </div>
              <div className="data-label rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(49,73,95,0.05)] px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
                Registrert
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
