import crypto from "node:crypto";

import env from "@/lib/env";
import {
  NormalizedOwnership,
  NormalizedShareholder,
  ShareholdingGraphSnapshot,
} from "@/lib/types";
import { buildOwnershipGraph, computeOwnershipPercentString } from "@/server/shareholdings/shareholding-graph";

type ApiShare = {
  isinnummer?: string;
  antallAksjer?: number;
  aksjeklasse?: string;
};

type ApiShareholder = {
  personidentifikator?: string;
  organisasjonsnummer?: string;
  navn?: string;
  foedselsaar?: string;
  postnummer?: string;
  landkode?: string;
  aksjer?: ApiShare[];
};

type ApiResponse = {
  identifikator: string;
  kalenderaar: string;
  totaltAntallAksjer?: number;
  aksjonaerer?: ApiShareholder[];
};

function isConfigured() {
  return Boolean(env.skatteetatenShareholdingBaseUrl && env.skatteetatenShareholdingPackage && env.skatteetatenShareholdingToken);
}

function createId(prefix: string, seed: string) {
  return `${prefix}:${crypto.createHash("sha1").update(seed).digest("hex")}`;
}

export class SkatteetatenShareholdingProvider {
  canFetch() {
    return isConfigured();
  }

  async getShareholdingSnapshot(orgNumber: string, taxYear?: number): Promise<ShareholdingGraphSnapshot | null> {
    if (!isConfigured()) {
      return null;
    }

    const url = new URL(
      `${env.skatteetatenShareholdingBaseUrl.replace(/\/$/, "")}/${env.skatteetatenShareholdingPackage}/aksjonaerer/${orgNumber}`,
    );
    if (taxYear) {
      url.searchParams.set("kalenderaar", String(taxYear));
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${env.skatteetatenShareholdingToken}`,
      },
      cache: "no-store",
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Skatteetaten shareholding request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as ApiResponse;
    const totalShares =
      typeof payload.totaltAntallAksjer === "number"
        ? BigInt(payload.totaltAntallAksjer)
        : null;

    const shareholders: NormalizedShareholder[] = [];
    const ownerships: NormalizedOwnership[] = [];

    for (const shareholder of payload.aksjonaerer ?? []) {
      const holderType = shareholder.organisasjonsnummer
        ? "COMPANY"
        : shareholder.personidentifikator
          ? "PERSON"
          : "UNKNOWN";
      const shareholderId = createId(
        "shareholder",
        shareholder.organisasjonsnummer ??
          shareholder.personidentifikator ??
          `${shareholder.navn ?? "ukjent"}|${shareholder.foedselsaar ?? ""}|${shareholder.postnummer ?? ""}`,
      );

      shareholders.push({
        id: shareholderId,
        type: holderType as "PERSON" | "COMPANY" | "UNKNOWN",
        name: shareholder.navn ?? "Ukjent aksjonær",
        normalizedName: shareholder.navn?.toUpperCase() ?? "UKJENT AKSJONÆR",
        birthYear: shareholder.foedselsaar ? Number.parseInt(shareholder.foedselsaar, 10) : null,
        postalCode: shareholder.postnummer ?? null,
        postalPlace: null,
        externalIdentifier: shareholder.organisasjonsnummer ?? shareholder.personidentifikator ?? null,
        linkedCompanyId: null,
        linkedCompanyOrgNumber: shareholder.organisasjonsnummer ?? null,
        linkedCompanyName: shareholder.organisasjonsnummer ? shareholder.navn ?? null : null,
        matchConfidence: shareholder.organisasjonsnummer ? 1 : null,
      });

      for (const share of shareholder.aksjer ?? []) {
        const numberOfShares =
          typeof share.antallAksjer === "number" ? BigInt(share.antallAksjer) : BigInt(0);
        const ownershipPercent =
          totalShares && totalShares > BigInt(0)
            ? computeOwnershipPercentString(numberOfShares, totalShares)
            : null;

        ownerships.push({
          id: createId(
            "ownership",
            `${shareholderId}|${share.aksjeklasse ?? ""}|${share.antallAksjer ?? 0}|${share.isinnummer ?? ""}`,
          ),
          snapshotId: `api:${orgNumber}:${payload.kalenderaar}`,
          companyId: orgNumber,
          shareholderId,
          shareClass: share.aksjeklasse ?? null,
          numberOfShares: numberOfShares.toString(),
          ownershipPercent: ownershipPercent ? Number(ownershipPercent) : null,
          ownershipPercentRaw: ownershipPercent,
          ownershipBasis: totalShares ? "numberOfShares / totalShares" : null,
          dataQualityNote: totalShares ? null : "Totalt antall aksjer mangler i API-responsen.",
          isDirect: true,
        });
      }
    }

    const graph = buildOwnershipGraph({
      companyId: orgNumber,
      companyOrgNumber: payload.identifikator,
      companyName: payload.identifikator,
      ownerships: ownerships
        .map((ownership) => {
          const shareholder = shareholders.find((item) => item.id === ownership.shareholderId);
          return {
            shareholderId: ownership.shareholderId,
            shareholderName: shareholder?.name ?? "Ukjent aksjonær",
            shareholderType: shareholder?.type ?? "UNKNOWN",
            linkedCompanyId: shareholder?.linkedCompanyId ?? null,
            linkedCompanyOrgNumber: shareholder?.linkedCompanyOrgNumber ?? null,
            linkedCompanyName: shareholder?.linkedCompanyName ?? null,
            matchConfidence: shareholder?.matchConfidence ?? null,
            numberOfShares: BigInt(ownership.numberOfShares),
            ownershipPercent: ownership.ownershipPercentRaw ?? null,
            shareClass: ownership.shareClass ?? null,
          };
        })
        .sort((left, right) => {
          const leftPercent = left.ownershipPercent ? Number(left.ownershipPercent) : -1;
          const rightPercent = right.ownershipPercent ? Number(right.ownershipPercent) : -1;
          return rightPercent - leftPercent;
        }),
    });

    return {
      snapshotId: `api:${orgNumber}:${payload.kalenderaar}`,
      companyId: orgNumber,
      companyOrgNumber: payload.identifikator,
      companyName: payload.identifikator,
      taxYear: Number.parseInt(payload.kalenderaar, 10),
      totalShares: totalShares?.toString() ?? null,
      shareholderCount: shareholders.length,
      source: "SKATTEETATEN_API",
      sourceImportedAt: new Date(),
      latestAvailableYear: Number.parseInt(payload.kalenderaar, 10),
      dataQualityNote: totalShares ? null : "API-responsen mangler totalt antall aksjer.",
      availabilityMessage: null,
      nodes: graph.nodes,
      edges: graph.edges,
      ownerships,
      shareholders,
    };
  }
}
