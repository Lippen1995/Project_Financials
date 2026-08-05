import type {
  CanonicalFactCandidate,
  PageClassification,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function compactRowContext(row: ReconstructedRow) {
  const parts = [row.label, row.rowText].filter((part): part is string => Boolean(part?.trim()));
  return normalizeWhitespace(Array.from(new Set(parts)).join(" | ")).slice(0, 240);
}

export function buildFinancialFactPredictionText(input: {
  row?: ReconstructedRow | null;
  classification?: PageClassification | null;
  fact?: CanonicalFactCandidate | null;
  neighborRows?: ReconstructedRow[];
}) {
  const row = input.row;
  const classification = input.classification;
  const fact = input.fact;
  const unitScale = row?.unitScale ?? fact?.unitScale ?? null;
  const neighborRows = (input.neighborRows ?? [])
    .filter((candidate) => candidate !== row)
    .slice(0, 6)
    .map((candidate, index) => {
      const text = compactRowContext(candidate);
      return text ? `nearbyRow${index + 1}=${text}` : null;
    })
    .filter((part): part is string => Boolean(part));

  const parts = [
    `page=${row?.pageNumber ?? fact?.sourcePage ?? classification?.pageNumber ?? "unknown"}`,
    fact?.fiscalYear ? `fiscalYear=${fact.fiscalYear}` : null,
    `statementType=${fact?.statementType ?? row?.sectionType ?? classification?.type ?? "unknown"}`,
    `scope=${fact?.statementScope ?? classification?.statementScope ?? "UNKNOWN"}`,
    `section=${row?.sectionType ?? fact?.sourceSection ?? classification?.type ?? "unknown"}`,
    classification?.heading ? `pageHeading=${classification.heading}` : null,
    classification?.declaredYears?.length ? `declaredYears=${classification.declaredYears.join(",")}` : null,
    classification?.yearHeaderYears?.length ? `yearHeaders=${classification.yearHeaderYears.join(",")}` : null,
    classification?.unitScale !== null && classification?.unitScale !== undefined
      ? `pageUnitScale=${classification.unitScale}`
      : null,
    classification?.tableLike !== undefined ? `tableLike=${classification.tableLike}` : null,
    classification?.numericRowCount !== undefined ? `numericRows=${classification.numericRowCount}` : null,
    row?.noteReference || fact?.noteReference ? `note=${row?.noteReference ?? fact?.noteReference}` : null,
    unitScale !== null ? `unitScale=${unitScale}` : null,
    fact?.value !== undefined && fact?.value !== null ? `value=${fact.value}` : null,
    row?.label || fact?.rawLabel ? `label=${row?.label ?? fact?.rawLabel}` : null,
    row?.rowText || fact?.sourceRowText ? `row=${row?.rowText ?? fact?.sourceRowText}` : null,
    ...neighborRows,
  ].filter((part): part is string => Boolean(part));

  return normalizeWhitespace(parts.join(" | ")).slice(0, 2400);
}
