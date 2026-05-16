const SECTION_LABELS: Record<string, string> = {
  BOARD_REPORT: "Styrets årsberetning",
  AUDITOR_REPORT: "Revisjonsberetning",
  AUDITOR_OPINION: "Revisors konklusjon",
  AUDITOR_QUALIFICATION: "Forbehold",
  EMPHASIS_OF_MATTER: "Presiseringer",
  GOING_CONCERN: "Fortsatt drift",
  SIGNATURES: "Underskrifter",
  OTHER_INFORMATION: "Annen informasjon",
};

type NarrativeItem = {
  id: string;
  fiscalYear: number;
  sectionKind: string;
  title: string | null;
  textPreview: string;
  fullText: string;
  pageStart: number | null;
  pageEnd: number | null;
  confidence: number;
};

export function CompanyNarrativesTab({ narratives }: { narratives: NarrativeItem[] }) {
  if (narratives.length === 0) {
    return (
      <div className="px-5 py-10 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Dokumenter ikke tilgjengelig</p>
        <p className="mt-1">
          Ingen styreberetning eller revisjonsberetning er funnet for dette selskapet ennå.
        </p>
      </div>
    );
  }

  // Group by fiscalYear
  const byYear = new Map<number, NarrativeItem[]>();
  for (const item of narratives) {
    if (!byYear.has(item.fiscalYear)) byYear.set(item.fiscalYear, []);
    byYear.get(item.fiscalYear)!.push(item);
  }

  const sortedYears = [...byYear.keys()].sort((a, b) => b - a);
  const mostRecentYear = sortedYears[0]!;
  const sectionsForYear = byYear.get(mostRecentYear) ?? [];

  // Only show BOARD_REPORT and AUDITOR_REPORT (main sections)
  const mainKinds = ["BOARD_REPORT", "AUDITOR_REPORT", "AUDITOR_OPINION", "GOING_CONCERN"];
  const mainSections = sectionsForYear.filter((s) => mainKinds.includes(s.sectionKind));
  const otherSections = sectionsForYear.filter((s) => !mainKinds.includes(s.sectionKind));

  return (
    <div className="divide-y divide-[rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="data-label text-xs font-semibold uppercase text-slate-500">
          Regnskapsår
        </span>
        <span className="text-sm font-semibold text-slate-900">{mostRecentYear}</span>
        {sortedYears.length > 1 && (
          <span className="text-xs text-slate-400">
            (Siste tilgjengelig. {sortedYears.length} år totalt.)
          </span>
        )}
      </div>
      {mainSections.map((section) => (
        <NarrativeSection key={section.id} section={section} />
      ))}
      {otherSections.map((section) => (
        <NarrativeSection key={section.id} section={section} />
      ))}
    </div>
  );
}

function NarrativeSection({ section }: { section: NarrativeItem }) {
  const label = SECTION_LABELS[section.sectionKind] ?? section.sectionKind;
  const pageRange =
    section.pageStart !== null
      ? section.pageEnd !== null && section.pageEnd !== section.pageStart
        ? `Side ${section.pageStart}–${section.pageEnd}`
        : `Side ${section.pageStart}`
      : null;

  return (
    <div className="px-5 py-6">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <h3 className="text-base font-semibold text-slate-900">{section.title ?? label}</h3>
        <span className="rounded-full bg-[var(--px-surface)] px-2 py-0.5 text-xs font-medium text-slate-500">
          {label}
        </span>
        {pageRange && <span className="data-label text-xs text-slate-400">{pageRange}</span>}
      </div>
      <div className="max-h-96 overflow-y-auto rounded-xl bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
        {section.fullText || section.textPreview}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Konfidensgrad: {Math.round(section.confidence * 100)}%
      </p>
    </div>
  );
}
