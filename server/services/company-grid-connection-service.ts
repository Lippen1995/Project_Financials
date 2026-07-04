import { StatnettGridConnectionProvider } from "@/integrations/statnett/statnett-grid-connection-provider";
import { logRecoverableError } from "@/lib/recoverable-error";
import {
  CompanyGridConnectionOverview,
  CompanyGridConnectionProfile,
  GridConnectionRecord,
} from "@/lib/types";

const provider = new StatnettGridConnectionProvider();

function normalizeCompanyName(value: string | null | undefined) {
  return value?.toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "").trim() ?? "";
}

export function buildCompanyGridConnectionOverview(records: GridConnectionRecord[]): CompanyGridConnectionOverview {
  return records.reduce(
    (overview, record) => {
      overview.totalCapacityMw += record.capacityMw;

      if (record.status === "QUEUE") {
        overview.queueCapacityMw += record.capacityMw;
        overview.queueCount += 1;
      }

      if (record.status === "RESERVED") {
        overview.reservedCapacityMw += record.capacityMw;
        overview.reservedCount += 1;
      }

      if (record.status === "CONNECTED") {
        overview.connectedCapacityMw += record.capacityMw;
        overview.connectedCount += 1;
      }

      return overview;
    },
    {
      totalCapacityMw: 0,
      queueCapacityMw: 0,
      reservedCapacityMw: 0,
      connectedCapacityMw: 0,
      queueCount: 0,
      reservedCount: 0,
      connectedCount: 0,
    },
  );
}

export function filterGridConnectionsForCompany(input: {
  records: GridConnectionRecord[];
  orgNumber: string;
  companyName: string;
}) {
  const normalizedName = normalizeCompanyName(input.companyName);

  return input.records.filter((record) => {
    if (record.companyOrgNumber && record.companyOrgNumber === input.orgNumber) return true;
    return Boolean(record.companyName && normalizeCompanyName(record.companyName) === normalizedName);
  });
}

export async function getCompanyGridConnectionProfile(input: {
  orgNumber: string;
  companyName: string;
}): Promise<CompanyGridConnectionProfile> {
  try {
    const allRecords = await provider.listGridConnections();
    const records = filterGridConnectionsForCompany({
      records: allRecords,
      orgNumber: input.orgNumber,
      companyName: input.companyName,
    });

    return {
      records,
      overview: buildCompanyGridConnectionOverview(records),
      availability: {
        available: records.length > 0,
        reliable: true,
        sourceSystem: "STATNETT",
        sourceUrl: records[0]?.sourceUrl ?? null,
        message:
          records.length > 0
            ? "Offentlige Statnett-saker er matchet mot selskapet med organisasjonsnummer eller eksakt selskapsnavn."
            : allRecords.length > 0
              ? "Ingen offentlige Statnett-saker kunne matches sikkert mot selskapet."
              : "Statnett-datakilde for nettilknytning er ikke konfigurert.",
      },
    };
  } catch (error) {
    logRecoverableError("company-grid-connection-service.getCompanyGridConnectionProfile", error, input);
    return {
      records: [],
      overview: buildCompanyGridConnectionOverview([]),
      availability: {
        available: false,
        reliable: false,
        sourceSystem: "STATNETT",
        sourceUrl: null,
        message: "Statnett-data for nettilknytning kunne ikke hentes akkurat nå.",
      },
    };
  }
}
