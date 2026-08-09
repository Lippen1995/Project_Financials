import { UNSUPPORTED_SIMULATION_PROFILE, type FiSimProfileKey } from "./profiles";

/**
 * Deterministic profile selection, from spec section 6.
 *
 * Priority is fixed: regulatory overlay, then SSB industry code, then organisation form, then an
 * explicit versioned rule, then SERVICE as the documented default. Company name, hardcoded
 * organisation numbers and random variation must never influence the outcome — the same company
 * metadata must always yield the same profile, because a demo that reshuffles itself between
 * runs is not a demo of anything.
 *
 * Every outcome carries the id of the rule that produced it, so a statement can say why it looks
 * the way it does.
 */

export const FI_SIM_PROFILE_RULESET_VERSION = "fi-sim-profile-rules-2026.1";

export type CompanyProfileSignals = {
  /** SN2007 industry code, e.g. "47.111". Null when Brreg has none. */
  industryCode: string | null;
  /** The classification version the code belongs to, recorded with the decision. */
  industryCodeVersion?: string | null;
  /** Brreg organisation form, e.g. "AS", "ASA". */
  organisationForm: string | null;
  /**
   * Set when a regulatory overlay demands blocking or a special profile. The overlay is not
   * implemented yet; the parameter exists so the highest-priority step is real rather than
   * retrofitted later.
   */
  regulatoryBlock?: { reason: string } | null;
};

export type ProfileSelection =
  | { supported: true; profile: FiSimProfileKey; ruleId: string; rulesetVersion: string }
  | {
      supported: false;
      errorCode: typeof UNSUPPORTED_SIMULATION_PROFILE;
      ruleId: string;
      rulesetVersion: string;
      reason: string;
    };

type IndustryRule = {
  ruleId: string;
  /** Matched against the start of the industry code, so "64.2" catches "64.201". */
  prefixes: readonly string[];
  outcome: FiSimProfileKey | typeof UNSUPPORTED_SIMULATION_PROFILE;
  reason: string;
};

/**
 * Industry rules, evaluated in order. The first matching prefix wins, so the blocked financial
 * activities are listed before the holding and investment ones they share a division with.
 *
 * Only the two blocking rules come straight from the spec, which names banks and insurers. The
 * rest is a reading of SN2007 divisions against the six profiles and is the part most worth
 * reviewing: it is explicit and versioned precisely so it can be argued with and changed.
 */
const INDUSTRY_RULES: readonly IndustryRule[] = [
  {
    ruleId: "industry.banking.blocked",
    prefixes: ["64.1", "64.9"],
    outcome: UNSUPPORTED_SIMULATION_PROFILE,
    reason: "Bank og annen kredittgivning har egen regnskapsoppstilling og er ikke modellert i v1.",
  },
  {
    ruleId: "industry.insurance.blocked",
    prefixes: ["65"],
    outcome: UNSUPPORTED_SIMULATION_PROFILE,
    reason: "Forsikring og pensjonskasser har egen regnskapsoppstilling og er ikke modellert i v1.",
  },
  {
    ruleId: "industry.holding",
    // 64.2 holding, 64.3 investment vehicles. Inside the same division as banking, which is why
    // the blocking rules above must be evaluated first.
    prefixes: ["64.2", "64.3"],
    outcome: "HOLDING_INVESTMENT",
    reason: "Holdingselskaper og investeringsselskaper.",
  },
  {
    ruleId: "industry.property",
    prefixes: ["68"],
    outcome: "PROPERTY",
    reason: "Omsetning og drift av fast eiendom.",
  },
  {
    ruleId: "industry.construction",
    prefixes: ["41", "42", "43"],
    outcome: "MANUFACTURING_CONSTRUCTION",
    reason: "Bygge- og anleggsvirksomhet.",
  },
  {
    ruleId: "industry.manufacturing",
    // SN2007 divisions 10-33 are industry; 05-09 extraction is project-shaped in the same way.
    prefixes: ["05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33"],
    outcome: "MANUFACTURING_CONSTRUCTION",
    reason: "Industri og utvinning.",
  },
  {
    ruleId: "industry.trade",
    prefixes: ["45", "46", "47"],
    outcome: "TRADE",
    reason: "Handel med og reparasjon av varer.",
  },
];

/**
 * Organisation-form rules. Deliberately empty.
 *
 * The spec places organisation form third in priority, and the step is wired so a rule can be
 * added without restructuring. No Norwegian organisation form on its own justifies one of the
 * six profiles today: an AS can be any of them. Inventing a rule to fill the step would make the
 * selection look better justified than it is.
 */
const ORGANISATION_FORM_RULES: ReadonlyArray<{
  ruleId: string;
  forms: readonly string[];
  outcome: FiSimProfileKey;
  reason: string;
}> = [];

function normalizeIndustryCode(code: string | null) {
  return code?.trim() ?? "";
}

export function selectSimulationProfile(signals: CompanyProfileSignals): ProfileSelection {
  const rulesetVersion = FI_SIM_PROFILE_RULESET_VERSION;

  // 1. Regulatory overlay.
  if (signals.regulatoryBlock) {
    return {
      supported: false,
      errorCode: UNSUPPORTED_SIMULATION_PROFILE,
      ruleId: "overlay.regulatory.blocked",
      rulesetVersion,
      reason: signals.regulatoryBlock.reason,
    };
  }

  // 2. SSB industry code.
  const industryCode = normalizeIndustryCode(signals.industryCode);
  if (industryCode) {
    for (const rule of INDUSTRY_RULES) {
      if (!rule.prefixes.some((prefix) => industryCode.startsWith(prefix))) continue;
      if (rule.outcome === UNSUPPORTED_SIMULATION_PROFILE) {
        return {
          supported: false,
          errorCode: UNSUPPORTED_SIMULATION_PROFILE,
          ruleId: rule.ruleId,
          rulesetVersion,
          reason: rule.reason,
        };
      }
      return { supported: true, profile: rule.outcome, ruleId: rule.ruleId, rulesetVersion };
    }
  }

  // 3. Organisation form.
  const organisationForm = signals.organisationForm?.trim().toUpperCase() ?? "";
  for (const rule of ORGANISATION_FORM_RULES) {
    if (rule.forms.includes(organisationForm)) {
      return { supported: true, profile: rule.outcome, ruleId: rule.ruleId, rulesetVersion };
    }
  }

  // 4 and 5. No explicit rule matched, so the documented default.
  return {
    supported: true,
    profile: "SERVICE",
    ruleId: "default.service",
    rulesetVersion,
  };
}
