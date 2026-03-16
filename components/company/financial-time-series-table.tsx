import { NormalizedFinancialDocument, NormalizedFinancialStatement } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

type RowDefinition = {
  label: string;
  accessor: (payload: Record<string, any>) => string | number | boolean | null | undefined;
};

type SectionDefinition = {
  title: string;
  note?: string;
  rows: RowDefinition[];
};

const sections: SectionDefinition[] = [
  {
    title: "Resultatregnskap",
    note: "Belop i NOK",
    rows: [
      { label: "Valuta", accessor: (payload) => payload.valuta },
      {
        label: "Salgsinntekter",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.driftsresultat?.driftsinntekter?.salgsinntekter,
      },
      {
        label: "Sum driftsinntekter",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.driftsresultat?.driftsinntekter?.sumDriftsinntekter,
      },
      {
        label: "Varekostnad",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.driftsresultat?.driftskostnad?.varekostnad,
      },
      {
        label: "Lonnskostnader",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.driftsresultat?.driftskostnad?.loennskostnad,
      },
      {
        label: "Andre driftskostnader",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.driftsresultat?.driftskostnad?.annenDriftskostnad,
      },
      {
        label: "Sum driftskostnad",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.driftsresultat?.driftskostnad?.sumDriftskostnad,
      },
      {
        label: "Driftsresultat (EBIT)",
        accessor: (payload) => payload.resultatregnskapResultat?.driftsresultat?.driftsresultat,
      },
      {
        label: "Netto finans",
        accessor: (payload) => payload.resultatregnskapResultat?.finansresultat?.nettoFinans,
      },
      {
        label: "Renteinntekt fra tilknyttet selskap",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.finansresultat?.finansinntekt?.renteinntektTilknyttetSelskap,
      },
      {
        label: "Annen renteinntekt",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.finansresultat?.finansinntekt?.annenRenteinntekt,
      },
      {
        label: "Annen finansinntekt",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.finansresultat?.finansinntekt?.annenFinansinntekt,
      },
      {
        label: "Sum finansinntekter",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.finansresultat?.finansinntekt?.sumFinansinntekter,
      },
      {
        label: "Rentekostnad til tilknyttet selskap",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.finansresultat?.finanskostnad?.rentekostnadTilknyttetSelskap,
      },
      {
        label: "Annen rentekostnad",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.finansresultat?.finanskostnad?.annenRentekostnad,
      },
      {
        label: "Annen finanskostnad",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.finansresultat?.finanskostnad?.annenFinanskostnad,
      },
      {
        label: "Sum finanskostnad",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.finansresultat?.finanskostnad?.sumFinanskostnad,
      },
      {
        label: "Ordinaert resultat for skattekostnad",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.ordinaertResultatFoerSkattekostnad,
      },
      {
        label: "Skattekostnad pa resultat",
        accessor: (payload) => payload.resultatregnskapResultat?.skattekostnadResultat,
      },
      {
        label: "Ordinaert resultat etter skattekostnad",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.ordinaertResultatEtterSkattekostnad,
      },
      {
        label: "Arsresultat",
        accessor: (payload) => payload.resultatregnskapResultat?.aarsresultat,
      },
      {
        label: "Totalresultat",
        accessor: (payload) => payload.resultatregnskapResultat?.totalresultat,
      },
      {
        label: "Avsatt til utbytte",
        accessor: (payload) => payload.resultatregnskapResultat?.overforinger?.utbytte,
      },
      {
        label: "Avsatt til annen egenkapital",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.overforinger?.avsattTilAnnenEgenkapital,
      },
      {
        label: "Overfort fra annen egenkapital",
        accessor: (payload) =>
          payload.resultatregnskapResultat?.overforinger?.overfortFraAnnenEgenkapital,
      },
      {
        label: "Sum overforinger",
        accessor: (payload) => payload.resultatregnskapResultat?.overforinger?.sumOverforinger,
      },
    ],
  },
  {
    title: "Eiendeler",
    rows: [
      { label: "Sum varer", accessor: (payload) => payload.eiendeler?.sumVarer },
      { label: "Kundefordringer", accessor: (payload) => payload.eiendeler?.kundefordringer },
      {
        label: "Kundefordringer konsern",
        accessor: (payload) => payload.eiendeler?.kundefordringerKonsern,
      },
      {
        label: "Andre kortsiktige fordringer",
        accessor: (payload) => payload.eiendeler?.andreKortsiktigeFordringer,
      },
      { label: "Konsernfordringer", accessor: (payload) => payload.eiendeler?.konsernfordringer },
      { label: "Sum fordringer", accessor: (payload) => payload.eiendeler?.sumFordringer },
      {
        label: "Bankinnskudd, kontanter o.l.",
        accessor: (payload) => payload.eiendeler?.sumBankinnskuddOgKontanter,
      },
      {
        label: "Sum omlopsmidler",
        accessor: (payload) => payload.eiendeler?.omloepsmidler?.sumOmloepsmidler,
      },
      {
        label: "Sum anleggsmidler",
        accessor: (payload) => payload.eiendeler?.anleggsmidler?.sumAnleggsmidler,
      },
      { label: "Sum eiendeler", accessor: (payload) => payload.eiendeler?.sumEiendeler },
    ],
  },
  {
    title: "Egenkapital og gjeld",
    rows: [
      {
        label: "Aksjekapital",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.egenkapital?.innskuttEgenkapital?.aksjekapital,
      },
      {
        label: "Overkurs",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.egenkapital?.innskuttEgenkapital?.overkurs,
      },
      {
        label: "Annen innskutt egenkapital",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.egenkapital?.innskuttEgenkapital?.annenInnskuttEgenkapital,
      },
      {
        label: "Sum egenkapital",
        accessor: (payload) => payload.egenkapitalGjeld?.egenkapital?.sumEgenkapital,
      },
      {
        label: "Annen egenkapital",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.egenkapital?.opptjentEgenkapital?.annenEgenkapital,
      },
      {
        label: "Sum opptjent egenkapital",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.egenkapital?.opptjentEgenkapital?.sumOpptjentEgenkapital,
      },
      {
        label: "Sum innskutt egenkapital",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.egenkapital?.innskuttEgenkapital?.sumInnskuttEgenkaptial,
      },
      { label: "Sum gjeld", accessor: (payload) => payload.egenkapitalGjeld?.gjeldOversikt?.sumGjeld },
      {
        label: "Sum kortsiktig gjeld",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.gjeldOversikt?.kortsiktigGjeld?.sumKortsiktigGjeld,
      },
      {
        label: "Leverandorgjeld",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.gjeldOversikt?.kortsiktigGjeld?.leverandorgjeld,
      },
      {
        label: "Betalbar skatt",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.gjeldOversikt?.kortsiktigGjeld?.betalbarSkatt,
      },
      {
        label: "Skyldig offentlige avgifter",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.gjeldOversikt?.kortsiktigGjeld?.skyldigOffentligeAvgifter,
      },
      {
        label: "Utbytte",
        accessor: (payload) => payload.egenkapitalGjeld?.gjeldOversikt?.kortsiktigGjeld?.utbytte,
      },
      {
        label: "Annen kortsiktig gjeld",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.gjeldOversikt?.kortsiktigGjeld?.annenKortsiktigGjeld,
      },
      {
        label: "Gjeld til kredittinstitusjoner",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.gjeldOversikt?.langsiktigGjeld?.gjeldTilKredittinstitusjoner,
      },
      {
        label: "Sum langsiktig gjeld",
        accessor: (payload) =>
          payload.egenkapitalGjeld?.gjeldOversikt?.langsiktigGjeld?.sumLangsiktigGjeld,
      },
      {
        label: "Sum egenkapital og gjeld",
        accessor: (payload) => payload.egenkapitalGjeld?.sumEgenkapitalGjeld,
      },
    ],
  },
  {
    title: "Regnskapsmetadata",
    rows: [
      { label: "Journalnummer", accessor: (payload) => payload.journalnr },
      { label: "Regnskapstype", accessor: (payload) => payload.regnskapstype },
      { label: "Oppstillingsplan", accessor: (payload) => payload.oppstillingsplan },
      { label: "Fravalg revisjon", accessor: (payload) => payload.revisjon?.fravalgRevisjon },
      {
        label: "Ikke revidert arsregnskap",
        accessor: (payload) => payload.revisjon?.ikkeRevidertAarsregnskap,
      },
      { label: "Sma foretak", accessor: (payload) => payload.regnkapsprinsipper?.smaaForetak },
      {
        label: "Regnskapsregler",
        accessor: (payload) => payload.regnkapsprinsipper?.regnskapsregler,
      },
    ],
  },
];

function formatYearLabel(year: number) {
  return `${year}-12`;
}

function formatCellValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    return formatNumber(value);
  }

  if (typeof value === "boolean") {
    return value ? "Ja" : "Nei";
  }

  return value;
}

function extractYear(statement: NormalizedFinancialStatement) {
  const payload = (statement.rawPayload ?? {}) as Record<string, any>;
  const toDate = payload.regnskapsperiode?.tilDato;

  if (typeof toDate === "string") {
    const date = new Date(toDate);
    if (!Number.isNaN(date.getTime())) {
      return date.getFullYear();
    }
  }

  return statement.fiscalYear;
}

export function FinancialTimeSeriesTable({
  statements,
  documents,
}: {
  statements: NormalizedFinancialStatement[];
  documents: NormalizedFinancialDocument[];
}) {
  const years = Array.from(
    new Set([
      ...documents.map((document) => document.year),
      ...statements.map((statement) => extractYear(statement)),
    ]),
  ).sort((left, right) => left - right);

  if (years.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-sand/55 p-6 text-sm text-ink/65">
        Ingen apne regnskapstall eller dokumentar er tilgjengelige for denne virksomheten akkurat na.
      </div>
    );
  }

  const statementsByYear = new Map<number, NormalizedFinancialStatement>();
  for (const statement of statements) {
    statementsByYear.set(extractYear(statement), statement);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[1.5rem] border border-ink/10 bg-sand/45 p-4 text-sm text-ink/70">
        Tidsserien viser ekte verdier bare for ar der ProjectX har et verifisert apent regnskap fra Brreg. Ovrige dokumentar vises som tomme kolonner.
      </div>

      {sections.map((section) => (
        <div key={section.title} className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/90 shadow-panel">
          <div className="flex items-center justify-between border-b border-ink/10 bg-sand/55 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold uppercase tracking-[0.08em] text-ink">{section.title}</h3>
              {section.note ? <p className="mt-1 text-xs text-ink/55">{section.note}</p> : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-white">
                  <th className="sticky left-0 z-10 min-w-[280px] bg-white px-5 py-4 text-left font-medium text-ink/55">
                    Linje
                  </th>
                  {years.map((year) => (
                    <th key={`${section.title}-${year}`} className="min-w-[160px] px-5 py-4 text-right font-semibold text-ink">
                      {formatYearLabel(year)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, index) => (
                  <tr key={`${section.title}-${row.label}`} className={index % 2 === 0 ? "bg-white" : "bg-sand/25"}>
                    <td className="sticky left-0 z-10 border-t border-ink/8 bg-inherit px-5 py-3 font-medium text-ink">
                      {row.label}
                    </td>
                    {years.map((year) => {
                      const statement = statementsByYear.get(year);
                      const payload = (statement?.rawPayload ?? {}) as Record<string, any>;
                      const value = statement ? row.accessor(payload) : null;

                      return (
                        <td key={`${section.title}-${row.label}-${year}`} className="border-t border-ink/8 px-5 py-3 text-right text-ink/80">
                          {formatCellValue(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
