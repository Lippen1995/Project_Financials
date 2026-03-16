import { NormalizedFinancialStatement } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

type FinancialDetailItem = {
  label: string;
  value: number | string | boolean | null | undefined;
  kind?: "currency" | "text" | "boolean";
};

type FinancialSection = {
  title: string;
  items: FinancialDetailItem[];
};

function renderValue(item: FinancialDetailItem) {
  if (item.value === null || item.value === undefined || item.value === "") {
    return "Ikke tilgjengelig";
  }

  if (item.kind === "currency" && typeof item.value === "number") {
    return formatCurrency(item.value);
  }

  if (item.kind === "boolean" && typeof item.value === "boolean") {
    return item.value ? "Ja" : "Nei";
  }

  return String(item.value);
}

function buildSections(statement: NormalizedFinancialStatement): FinancialSection[] {
  const payload = (statement.rawPayload ?? {}) as Record<string, any>;
  const revisjon = payload.revisjon ?? {};
  const prinsipper = payload.regnkapsprinsipper ?? {};
  const resultat = payload.resultatregnskapResultat ?? {};
  const driftsresultat = resultat.driftsresultat ?? {};
  const driftsinntekter = driftsresultat.driftsinntekter ?? {};
  const driftskostnad = driftsresultat.driftskostnad ?? {};
  const finansresultat = resultat.finansresultat ?? {};
  const finansinntekt = finansresultat.finansinntekt ?? {};
  const finanskostnad = finansresultat.finanskostnad ?? {};
  const eiendeler = payload.eiendeler ?? {};
  const omloepsmidler = eiendeler.omloepsmidler ?? {};
  const anleggsmidler = eiendeler.anleggsmidler ?? {};
  const egenkapitalGjeld = payload.egenkapitalGjeld ?? {};
  const egenkapital = egenkapitalGjeld.egenkapital ?? {};
  const opptjentEgenkapital = egenkapital.opptjentEgenkapital ?? {};
  const innskuttEgenkapital = egenkapital.innskuttEgenkapital ?? {};
  const gjeld = egenkapitalGjeld.gjeldOversikt ?? {};
  const kortsiktigGjeld = gjeld.kortsiktigGjeld ?? {};
  const langsiktigGjeld = gjeld.langsiktigGjeld ?? {};

  return [
    {
      title: "Regnskapsmetadata",
      items: [
        { label: "Regnskapsar", value: statement.fiscalYear, kind: "text" },
        { label: "Journalnummer", value: payload.journalnr, kind: "text" },
        { label: "Regnskapstype", value: payload.regnskapstype, kind: "text" },
        { label: "Oppstillingsplan", value: payload.oppstillingsplan, kind: "text" },
        { label: "Valuta", value: statement.currency, kind: "text" },
        { label: "Avviklingsregnskap", value: payload.avviklingsregnskap, kind: "boolean" },
        {
          label: "Regnskapsperiode fra",
          value: payload.regnskapsperiode?.fraDato ? formatDate(payload.regnskapsperiode.fraDato) : null,
          kind: "text",
        },
        {
          label: "Regnskapsperiode til",
          value: payload.regnskapsperiode?.tilDato ? formatDate(payload.regnskapsperiode.tilDato) : null,
          kind: "text",
        },
      ],
    },
    {
      title: "Revisjon og prinsipper",
      items: [
        { label: "Ikke revidert arsregnskap", value: revisjon.ikkeRevidertAarsregnskap, kind: "boolean" },
        { label: "Fravalg revisjon", value: revisjon.fravalgRevisjon, kind: "boolean" },
        { label: "Sma foretak", value: prinsipper.smaaForetak, kind: "boolean" },
        { label: "Regnskapsregler", value: prinsipper.regnskapsregler, kind: "text" },
      ],
    },
    {
      title: "Resultatregnskap",
      items: [
        { label: "Salgsinntekter", value: driftsinntekter.salgsinntekter, kind: "currency" },
        { label: "Sum driftsinntekter", value: driftsinntekter.sumDriftsinntekter, kind: "currency" },
        { label: "Lonnskostnad", value: driftskostnad.loennskostnad, kind: "currency" },
        { label: "Sum driftskostnad", value: driftskostnad.sumDriftskostnad, kind: "currency" },
        { label: "Driftsresultat", value: driftsresultat.driftsresultat, kind: "currency" },
        { label: "Netto finans", value: finansresultat.nettoFinans, kind: "currency" },
        { label: "Sum finansinntekter", value: finansinntekt.sumFinansinntekter, kind: "currency" },
        { label: "Sum finanskostnad", value: finanskostnad.sumFinanskostnad, kind: "currency" },
        {
          label: "Ordinaert resultat for skattekostnad",
          value: resultat.ordinaertResultatFoerSkattekostnad,
          kind: "currency",
        },
        {
          label: "Ordinaert resultat skattekostnad",
          value: resultat.ordinaertResultatSkattekostnad,
          kind: "currency",
        },
        { label: "Ekstraordinaere poster", value: resultat.ekstraordinaerePoster, kind: "currency" },
        {
          label: "Skattekostnad ekstraordinaert resultat",
          value: resultat.skattekostnadEkstraordinaertResultat,
          kind: "currency",
        },
        { label: "Arsresultat", value: resultat.aarsresultat, kind: "currency" },
        { label: "Totalresultat", value: resultat.totalresultat, kind: "currency" },
      ],
    },
    {
      title: "Eiendeler",
      items: [
        { label: "Goodwill", value: eiendeler.goodwill, kind: "currency" },
        { label: "Sum varer", value: eiendeler.sumVarer, kind: "currency" },
        { label: "Sum fordringer", value: eiendeler.sumFordringer, kind: "currency" },
        { label: "Sum investeringer", value: eiendeler.sumInvesteringer, kind: "currency" },
        {
          label: "Sum bankinnskudd og kontanter",
          value: eiendeler.sumBankinnskuddOgKontanter,
          kind: "currency",
        },
        { label: "Sum omlopsmidler", value: omloepsmidler.sumOmloepsmidler, kind: "currency" },
        { label: "Sum anleggsmidler", value: anleggsmidler.sumAnleggsmidler, kind: "currency" },
        { label: "Sum eiendeler", value: eiendeler.sumEiendeler, kind: "currency" },
      ],
    },
    {
      title: "Egenkapital og gjeld",
      items: [
        { label: "Sum egenkapital", value: egenkapital.sumEgenkapital, kind: "currency" },
        {
          label: "Sum opptjent egenkapital",
          value: opptjentEgenkapital.sumOpptjentEgenkapital,
          kind: "currency",
        },
        {
          label: "Sum innskutt egenkapital",
          value: innskuttEgenkapital.sumInnskuttEgenkaptial,
          kind: "currency",
        },
        { label: "Sum gjeld", value: gjeld.sumGjeld, kind: "currency" },
        { label: "Sum kortsiktig gjeld", value: kortsiktigGjeld.sumKortsiktigGjeld, kind: "currency" },
        { label: "Sum langsiktig gjeld", value: langsiktigGjeld.sumLangsiktigGjeld, kind: "currency" },
        {
          label: "Sum egenkapital og gjeld",
          value: egenkapitalGjeld.sumEgenkapitalGjeld,
          kind: "currency",
        },
      ],
    },
  ];
}

export function FinancialStatementDetails({
  statement,
}: {
  statement: NormalizedFinancialStatement | undefined;
}) {
  if (!statement) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-sand/55 p-6 text-sm text-ink/65">
        Ingen apne regnskapstall er tilgjengelige for denne virksomheten akkurat na.
      </div>
    );
  }

  const sections = buildSections(statement);

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <div key={section.title} className="rounded-[1.5rem] border border-ink/10 bg-white p-5">
          <h3 className="text-lg font-semibold">{section.title}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {section.items.map((item) => (
              <div key={`${section.title}-${item.label}`} className="rounded-2xl bg-sand/45 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink/45">{item.label}</p>
                <p className="mt-2 text-sm font-semibold text-ink">{renderValue(item)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
