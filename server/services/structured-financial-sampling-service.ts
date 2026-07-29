export const STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE =
  "sprint-2-closeout-stratified@1";

export type StructuredFinancialSampleCandidate = {
  orgNumber: string;
  legalForm: string | null;
  companyStatus: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
};

type SampleStratum<T extends StructuredFinancialSampleCandidate> = {
  id: string;
  label: string;
  target: number;
  matches: (candidate: T) => boolean;
};

const CORE_LEGAL_FORMS = new Set(["AS", "ASA", "ENK", "ANS", "DA"]);

function isNonActive(candidate: StructuredFinancialSampleCandidate) {
  return candidate.companyStatus !== "ACTIVE";
}

function sampleStrata<T extends StructuredFinancialSampleCandidate>(): SampleStratum<T>[] {
  return [
    {
      id: "as-active",
      label: "AS – aktiv",
      target: 40,
      matches: (candidate) =>
        candidate.legalForm === "AS" && candidate.companyStatus === "ACTIVE",
    },
    {
      id: "as-dissolved",
      label: "AS – oppløst",
      target: 25,
      matches: (candidate) =>
        candidate.legalForm === "AS" && candidate.companyStatus === "DISSOLVED",
    },
    {
      id: "as-bankrupt",
      label: "AS – konkurs",
      target: 25,
      matches: (candidate) =>
        candidate.legalForm === "AS" && candidate.companyStatus === "BANKRUPT",
    },
    {
      id: "asa-active",
      label: "ASA – aktiv",
      target: 5,
      matches: (candidate) =>
        candidate.legalForm === "ASA" && candidate.companyStatus === "ACTIVE",
    },
    {
      id: "asa-non-active",
      label: "ASA – ikke aktiv",
      target: 5,
      matches: (candidate) => candidate.legalForm === "ASA" && isNonActive(candidate),
    },
    {
      id: "enk-active",
      label: "ENK – aktiv",
      target: 10,
      matches: (candidate) =>
        candidate.legalForm === "ENK" && candidate.companyStatus === "ACTIVE",
    },
    {
      id: "enk-non-active",
      label: "ENK – ikke aktiv",
      target: 10,
      matches: (candidate) => candidate.legalForm === "ENK" && isNonActive(candidate),
    },
    {
      id: "partnership-active",
      label: "ANS/DA – aktiv",
      target: 10,
      matches: (candidate) =>
        (candidate.legalForm === "ANS" || candidate.legalForm === "DA") &&
        candidate.companyStatus === "ACTIVE",
    },
    {
      id: "partnership-non-active",
      label: "ANS/DA – ikke aktiv",
      target: 10,
      matches: (candidate) =>
        (candidate.legalForm === "ANS" || candidate.legalForm === "DA") &&
        isNonActive(candidate),
    },
    {
      id: "other-active",
      label: "Øvrige former – aktiv",
      target: 5,
      matches: (candidate) =>
        !CORE_LEGAL_FORMS.has(candidate.legalForm ?? "") &&
        candidate.companyStatus === "ACTIVE",
    },
    {
      id: "other-non-active",
      label: "Øvrige former – ikke aktiv",
      target: 5,
      matches: (candidate) =>
        !CORE_LEGAL_FORMS.has(candidate.legalForm ?? "") && isNonActive(candidate),
    },
  ];
}

function fingerprint(values: string[]) {
  return createHash("sha256").update(values.join("\n")).digest("hex");
}

export function selectStructuredFinancialCloseoutSample<
  T extends StructuredFinancialSampleCandidate,
>(candidates: T[]) {
  const sorted = [...candidates].sort((left, right) =>
    left.orgNumber.localeCompare(right.orgNumber, "nb-NO"),
  );
  const selected: T[] = [];
  const selectedOrgNumbers = new Set<string>();

  const strata = sampleStrata<T>().map((stratum) => {
    const available = sorted.filter(stratum.matches);
    const chosen = available
      .filter((candidate) => !selectedOrgNumbers.has(candidate.orgNumber))
      .slice(0, stratum.target);
    for (const candidate of chosen) {
      selectedOrgNumbers.add(candidate.orgNumber);
      selected.push(candidate);
    }
    return {
      id: stratum.id,
      label: stratum.label,
      target: stratum.target,
      available: available.length,
      selected: chosen.length,
    };
  });

  const targetSize = strata.reduce((total, stratum) => total + stratum.target, 0);
  return {
    profile: STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE,
    poolSize: sorted.length,
    poolFingerprint: fingerprint(
      sorted.map(
        (candidate) =>
          `${candidate.orgNumber}|${candidate.legalForm ?? ""}|${candidate.companyStatus}`,
      ),
    ),
    selectionFingerprint: fingerprint(
      [...selected]
        .sort((left, right) => left.orgNumber.localeCompare(right.orgNumber, "nb-NO"))
        .map(
          (candidate) =>
            `${candidate.orgNumber}|${candidate.legalForm ?? ""}|${candidate.companyStatus}`,
        ),
    ),
    targetSize,
    selected,
    shortfall: targetSize - selected.length,
    strata,
  };
}
import { createHash } from "node:crypto";
