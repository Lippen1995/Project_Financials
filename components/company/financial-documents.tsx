import { NormalizedFinancialDocument } from "@/lib/types";

function fileTypeLabel(type: string) {
  switch (type) {
    case "aarsregnskap":
      return "Arsregnskap";
    case "baerekraft":
      return "Baerekraftsopplysninger";
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
      <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-sand/55 p-6 text-sm text-ink/65">
        Bronnoysundregistrene viser ikke apen arsregnskapsmetadata for denne virksomheten akkurat na.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[1.5rem] border border-ink/10 bg-sand/45 p-5">
          <p className="text-sm text-ink/55">Sist innsendt arsregnskap</p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {latestYear ?? "Ikke tilgjengelig"}
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-ink/10 bg-sand/45 p-5">
          <p className="text-sm text-ink/55">Registrerte arsregnskapsar</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{documents.length}</p>
        </div>
      </div>

      <div className="space-y-3">
        {documents.map((document) => (
          <div key={document.sourceId} className="rounded-2xl border border-ink/10 bg-white px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">{document.year}</p>
                <p className="text-sm text-ink/60">
                  {document.files.map((file) => fileTypeLabel(file.type)).join(", ")}
                </p>
              </div>
              <div className="rounded-full bg-tide/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-tide">
                BRREG
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
