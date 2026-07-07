// Statnett publishes grid-connection queue and reservation data ONLY through embedded
// Power BI "publish to web" reports on
// https://www.statnett.no/for-aktorer-i-kraftbransjen/nettkapasitet-til-produksjon-og-forbruk/foresporsler-og-reservasjon-i-nettet/
// There is no file/JSON/CSV feed. This client issues the same semantic query the embedded
// report runs against Power BI's public `querydata` endpoint and decodes the Power BI DSR
// (Data Shape Result) response.
//
// The identifiers below (resourceKey/reportId per report + shared datasetId/modelId) are
// captured from the reports' public embed tokens. If Statnett republishes the reports these
// change and must be re-captured: open the report, intercept the XHR to
// `/public/reports/querydata`, and read the request's ApplicationContext + `r=` token.

const QUERYDATA_URL =
  "https://wabi-north-europe-api.analysis.windows.net/public/reports/querydata?synchronous=true";
const DATASET_ID = "bb718231-fe68-48df-afd1-708303dbd8f0";
const MODEL_ID = 22622814;

// The three data tables the reports join. Names are stable model entities.
const FROM = [
  { Name: "s", Entity: "Saker", Type: 0 },
  { Name: "s1", Entity: "Stasjoner", Type: 0 },
  { Name: "t", Entity: "Tilknytningsansvarlig", Type: 0 },
] as const;

type SelectEntry = Record<string, unknown>;

function column(source: string, property: string): SelectEntry {
  return {
    Column: { Expression: { SourceRef: { Source: source } }, Property: property },
    Name: `${source}.${property}`,
  };
}

function aggregation(source: string, property: string): SelectEntry {
  return {
    Aggregation: { Expression: { Column: { Expression: { SourceRef: { Source: source } }, Property: property } }, Function: 0 },
    Name: `Sum(${property})`,
  };
}

function measure(source: string, property: string): SelectEntry {
  return {
    Measure: { Expression: { SourceRef: { Source: source } }, Property: property },
    Name: `${source}.${property}`,
  };
}

// Both reports share the same 12-column shape; only the capacity column (aggregated column vs
// pre-defined measure) and the meaning of the two date columns differ.
export type StatnettReportConfig = {
  resourceKey: string;
  reportId: string;
  capacity: SelectEntry;
  capacityOrderDirection: 1 | 2;
  capacityForOrderBy: Record<string, unknown>;
  primaryDateProperty: string;
};

const STATNETT_SOURCE_URL =
  "https://www.statnett.no/for-aktorer-i-kraftbransjen/nettkapasitet-til-produksjon-og-forbruk/foresporsler-og-reservasjon-i-nettet/";

export const QUEUE_REPORT: StatnettReportConfig = {
  resourceKey: "a387c3dc-0c0b-4230-8c5f-a0a2cda5d6af",
  reportId: "92028511-7f2b-43ca-9353-6f6fba236cc8",
  capacity: aggregation("s", "Kapasitet i kø"),
  capacityOrderDirection: 1,
  capacityForOrderBy: { Column: { Expression: { SourceRef: { Source: "s" } }, Property: "Dato - moden bestilling fra sluttkunde" } },
  primaryDateProperty: "Dato - moden bestilling fra sluttkunde",
};

export const RESERVED_REPORT: StatnettReportConfig = {
  resourceKey: "e5d2cb44-3eaf-48d4-a4a0-2328c138ebff",
  reportId: "ad9c790c-e67e-44a1-b088-ea31a38920d4",
  capacity: measure("s", "Reservert kapasitet (MW)"),
  capacityOrderDirection: 2,
  capacityForOrderBy: { Measure: { Expression: { SourceRef: { Source: "s" } }, Property: "Reservert kapasitet (MW)" } },
  primaryDateProperty: "Dato - reservert kapasitet",
};

// Column order is fixed and must match the index-based decode in `rowsToCases`.
function buildSelect(config: StatnettReportConfig): SelectEntry[] {
  return [
    column("s", "Saksnr."),
    column("s", "Tilko saksnr."),
    column("s", "Statnetts stasjon navn"),
    column("s1", "Områdeplan"),
    column("s1", "Prisområde2"),
    column("s", "Statnetts kunde"),
    column("s", "Sluttkunde"),
    column("s", "Næringstype"),
    config.capacity,
    column("s", config.primaryDateProperty),
    column("s", "Dato - Planlagt tilknytning ved bestillingstidspunkt"),
    column("t", "Tilknytningsansvarlig"),
  ];
}

function buildRequestBody(config: StatnettReportConfig) {
  const select = buildSelect(config);
  return {
    version: "1.0.0",
    queries: [
      {
        Query: {
          Commands: [
            {
              SemanticQueryDataShapeCommand: {
                Query: {
                  Version: 2,
                  From: FROM,
                  Select: select,
                  OrderBy: [{ Direction: config.capacityOrderDirection, Expression: config.capacityForOrderBy }],
                },
                Binding: {
                  Primary: { Groupings: [{ Projections: select.map((_, i) => i), Subtotal: 1 }] },
                  // Window well above the national case count (a few hundred) so nothing is truncated.
                  DataReduction: { DataVolume: 3, Primary: { Window: { Count: 2000 } } },
                  Version: 1,
                },
                ExecutionMetricsKind: 1,
              },
            },
          ],
        },
        QueryId: "",
        ApplicationContext: { DatasetId: DATASET_ID, Sources: [{ ReportId: config.reportId }] },
      },
    ],
    cancelQueries: [],
    modelId: MODEL_ID,
  };
}

type Cell = string | number | null;

// Power BI DSR compresses the row set: dictionary-encoded columns store an integer index into
// a named ValueDict, an `R` bitmask marks columns repeated from the previous row (absent from
// `C`), and an `Ø` bitmask marks nulls. Decode back to a plain matrix of primitive cells.
function decodeDsr(payload: unknown): Cell[][] {
  const root = payload as any;
  const data = root?.results?.[0]?.result?.data;
  const ds = data?.dsr?.DS?.[0];
  if (!ds) {
    const err = data?.dsr?.DataShapes?.[0]?.["odata.error"]?.message?.value;
    if (err) throw new Error(`Statnett Power BI query rejected: ${err}`);
    return [];
  }

  const dicts: Record<string, Cell[]> = ds.ValueDicts ?? {};

  // The detail rows live in the largest DM array across the primary hierarchies (PH); smaller
  // ones are subtotal/grand-total groupings.
  let dm: any[] | null = null;
  for (const ph of ds.PH ?? []) {
    for (const value of Object.values(ph)) {
      if (Array.isArray(value) && (!dm || value.length > dm.length)) dm = value as any[];
    }
  }
  if (!dm) return [];

  const schema = dm.find((row) => Array.isArray(row?.S))?.S as Array<{ DN?: string }> | undefined;
  if (!schema) return [];
  const columnCount = schema.length;

  const matrix: Cell[][] = [];
  const previous: Cell[] = new Array(columnCount).fill(null);

  for (const row of dm) {
    if (!Array.isArray(row?.C)) continue; // skip pure schema/grand-total markers
    const compressed: Cell[] = row.C;
    const repeatMask: number = row.R ?? 0;
    const nullMask: number = row["Ø"] ?? 0;

    const decoded: Cell[] = new Array(columnCount);
    let cursor = 0;
    for (let i = 0; i < columnCount; i += 1) {
      let value: Cell;
      if ((nullMask >> i) & 1) value = null;
      else if ((repeatMask >> i) & 1) value = previous[i];
      else value = compressed[cursor++];

      const dictName = schema[i]?.DN;
      if (dictName && typeof value === "number") value = dicts[dictName]?.[value] ?? null;

      decoded[i] = value;
      previous[i] = value;
    }
    matrix.push(decoded);
  }

  return matrix;
}

export type GridConnectionCase = {
  saksnr: string | null;
  tilkoSaksnr: string | null;
  station: string | null;
  areaPlan: string | null;
  priceArea: string | null;
  gridOwner: string | null; // "Statnetts kunde" — the responsible grid company (DSO/TSO customer)
  endCustomer: string | null; // "Sluttkunde" — the company that wants the power (the applicant)
  industry: string | null;
  capacityMw: number | null;
  primaryDate: number | null; // queue: mature-order date · reserved: reservation date (epoch ms)
  plannedConnectionDate: number | null; // epoch ms
  connectionResponsible: string | null;
};

function asString(value: Cell): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: Cell): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Power BI DSR emits the dimension columns first (in Select order, minus the capacity measure)
// and appends the aggregated measure LAST — so the response order is not the Select order: the
// two dates and the connection-responsible shift down and capacity lands at the final index.
function rowsToCases(matrix: Cell[][]): GridConnectionCase[] {
  return matrix.map((row) => ({
    saksnr: asString(row[0]),
    tilkoSaksnr: asString(row[1]),
    station: asString(row[2]),
    areaPlan: asString(row[3]),
    priceArea: asString(row[4]),
    gridOwner: asString(row[5]),
    endCustomer: asString(row[6]),
    industry: asString(row[7]),
    primaryDate: asNumber(row[8]),
    plannedConnectionDate: asNumber(row[9]),
    connectionResponsible: asString(row[10]),
    capacityMw: asNumber(row[11]),
  }));
}

export async function fetchGridConnectionCases(config: StatnettReportConfig): Promise<GridConnectionCase[]> {
  const response = await fetch(QUERYDATA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "X-PowerBI-ResourceKey": config.resourceKey,
      // The public querydata endpoint only answers requests presented as coming from the embed host.
      Origin: "https://app.powerbi.com",
      Referer: "https://app.powerbi.com/",
    },
    body: JSON.stringify(buildRequestBody(config)),
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Statnett Power BI querydata failed with status ${response.status}`);
  }

  return rowsToCases(decodeDsr(await response.json()));
}

export const STATNETT_GRID_CONNECTION_SOURCE_URL = STATNETT_SOURCE_URL;

export const __testables = { decodeDsr, rowsToCases, buildRequestBody };
