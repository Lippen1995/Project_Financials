import { Prisma, type HealthScoreModel } from "@prisma/client";

import {
  defaultHealthScoreConfig,
  healthMetricCatalog,
  healthPillarDescriptions,
  healthPillarLabels,
  HEALTH_PILLAR_KEYS,
  type HealthScoreConfig,
} from "@/lib/health-score";
import { prisma } from "@/lib/prisma";
import {
  parseStoredHealthScoreConfig,
  reconcileConfigWithCatalog,
  type HealthScoreModelInput,
} from "@/server/health-score/domain";

/**
 * Admin-side reads and writes for financial-health scoring models, plus the
 * resolver the company page uses to pick which model applies to a company.
 *
 * Every write is audited: the score on a company page is a claim about that
 * company, so a change to the model behind it has to be attributable to a person
 * and reversible from the trail.
 */

export type AdminHealthScoreModel = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isFallback: boolean;
  active: boolean;
  version: number;
  config: HealthScoreConfig;
  /** False when the stored JSON failed validation and the default was used. */
  configValid: boolean;
  industryRules: { nacePrefix: string; note: string | null }[];
  updatedAt: string;
};

export type AdminHealthScoreCatalogEntry = {
  key: string;
  label: string;
  pillar: string;
  unit: string;
  requires: string;
  help: string;
};

export type AdminHealthScoreDashboard = {
  models: AdminHealthScoreModel[];
  /** Every metric the engine knows how to compute, for the editor's picker. */
  catalog: AdminHealthScoreCatalogEntry[];
  pillars: { key: string; label: string; description: string }[];
  recentChanges: {
    id: string;
    modelKey: string;
    action: string;
    actorEmail: string | null;
    createdAt: string;
  }[];
};

type ModelWithRules = HealthScoreModel & {
  industryRules: { nacePrefix: string; note: string | null }[];
};

function serializeModel(model: ModelWithRules): AdminHealthScoreModel {
  const { config, valid } = parseStoredHealthScoreConfig(model.config);
  return {
    id: model.id,
    key: model.key,
    name: model.name,
    description: model.description,
    isFallback: model.isFallback,
    active: model.active,
    version: model.version,
    config: reconcileConfigWithCatalog(config),
    configValid: valid,
    industryRules: [...model.industryRules].sort((left, right) =>
      left.nacePrefix.localeCompare(right.nacePrefix, "nb-NO"),
    ),
    updatedAt: model.updatedAt.toISOString(),
  };
}

async function listModels(): Promise<AdminHealthScoreModel[]> {
  const models = await prisma.healthScoreModel.findMany({
    include: { industryRules: { select: { nacePrefix: true, note: true } } },
    orderBy: [{ isFallback: "desc" }, { name: "asc" }],
  });
  return models.map(serializeModel);
}

export async function buildAdminHealthScoreDashboard(): Promise<AdminHealthScoreDashboard> {
  const [models, audits] = await Promise.all([
    listModels(),
    prisma.healthScoreModelAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { actor: { select: { email: true } } },
    }),
  ]);

  return {
    models,
    catalog: healthMetricCatalog.map((metric) => ({
      key: metric.key,
      label: metric.label,
      pillar: metric.pillar,
      unit: metric.unit,
      requires: metric.requires,
      help: metric.help,
    })),
    pillars: HEALTH_PILLAR_KEYS.map((key) => ({
      key,
      label: healthPillarLabels[key],
      description: healthPillarDescriptions[key],
    })),
    recentChanges: audits.map((audit) => ({
      id: audit.id,
      modelKey: audit.modelKey,
      action: audit.action,
      actorEmail: audit.actor?.email ?? null,
      createdAt: audit.createdAt.toISOString(),
    })),
  };
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    modelKey: string;
    action: string;
    beforeState: unknown;
    afterState: unknown;
  },
) {
  await tx.healthScoreModelAudit.create({
    data: {
      actorUserId: input.actorUserId,
      modelKey: input.modelKey,
      action: input.action,
      beforeState: (input.beforeState ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      afterState: (input.afterState ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
}

/**
 * A NACE prefix may only belong to one model, so a rule moving between models has
 * to be released by its previous owner first.
 */
async function claimIndustryRules(
  tx: Prisma.TransactionClient,
  modelId: string,
  rules: HealthScoreModelInput["industryRules"],
) {
  await tx.healthScoreModelIndustryRule.deleteMany({ where: { modelId } });
  if (rules.length === 0) return;

  const prefixes = rules.map((rule) => rule.nacePrefix);
  await tx.healthScoreModelIndustryRule.deleteMany({
    where: { nacePrefix: { in: prefixes } },
  });
  await tx.healthScoreModelIndustryRule.createMany({
    data: rules.map((rule) => ({ modelId, nacePrefix: rule.nacePrefix, note: rule.note })),
  });
}

/** Keeps the "exactly one fallback" invariant when a model claims the role. */
async function demoteOtherFallbacks(tx: Prisma.TransactionClient, keepModelId: string | null) {
  await tx.healthScoreModel.updateMany({
    where: keepModelId ? { isFallback: true, NOT: { id: keepModelId } } : { isFallback: true },
    data: { isFallback: false },
  });
}

export async function createHealthScoreModel(
  actorUserId: string,
  input: HealthScoreModelInput,
): Promise<AdminHealthScoreModel> {
  const model = await prisma.$transaction(async (tx) => {
    const existingCount = await tx.healthScoreModel.count();
    // The very first model has to be the fallback, or nothing would ever resolve.
    const isFallback = input.isFallback || existingCount === 0;

    const created = await tx.healthScoreModel.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description,
        active: isFallback ? true : input.active,
        isFallback,
        config: input.config as unknown as Prisma.InputJsonValue,
        updatedByUserId: actorUserId,
      },
    });

    if (isFallback) await demoteOtherFallbacks(tx, created.id);
    await claimIndustryRules(tx, created.id, isFallback ? [] : input.industryRules);
    await writeAudit(tx, {
      actorUserId,
      modelKey: created.key,
      action: "CREATE",
      beforeState: null,
      afterState: input,
    });

    return tx.healthScoreModel.findUniqueOrThrow({
      where: { id: created.id },
      include: { industryRules: { select: { nacePrefix: true, note: true } } },
    });
  });

  return serializeModel(model);
}

export async function updateHealthScoreModel(
  actorUserId: string,
  modelId: string,
  input: HealthScoreModelInput,
): Promise<AdminHealthScoreModel> {
  const model = await prisma.$transaction(async (tx) => {
    const before = await tx.healthScoreModel.findUniqueOrThrow({
      where: { id: modelId },
      include: { industryRules: { select: { nacePrefix: true, note: true } } },
    });

    // The current fallback can only stop being the fallback by handing the role
    // to another model, never by simply switching it off.
    const isFallback = before.isFallback ? true : input.isFallback;

    const updated = await tx.healthScoreModel.update({
      where: { id: modelId },
      data: {
        key: input.key,
        name: input.name,
        description: input.description,
        active: isFallback ? true : input.active,
        isFallback,
        config: input.config as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedByUserId: actorUserId,
      },
    });

    if (isFallback) await demoteOtherFallbacks(tx, updated.id);
    await claimIndustryRules(tx, updated.id, isFallback ? [] : input.industryRules);
    await writeAudit(tx, {
      actorUserId,
      modelKey: updated.key,
      action: "UPDATE",
      beforeState: { ...before, config: before.config, industryRules: before.industryRules },
      afterState: input,
    });

    return tx.healthScoreModel.findUniqueOrThrow({
      where: { id: modelId },
      include: { industryRules: { select: { nacePrefix: true, note: true } } },
    });
  });

  return serializeModel(model);
}

/** Promotes a model to fallback, demoting the current one and dropping its NACE rules. */
export async function promoteHealthScoreModelToFallback(
  actorUserId: string,
  modelId: string,
): Promise<AdminHealthScoreModel> {
  const model = await prisma.$transaction(async (tx) => {
    const target = await tx.healthScoreModel.findUniqueOrThrow({ where: { id: modelId } });
    await demoteOtherFallbacks(tx, modelId);
    await tx.healthScoreModelIndustryRule.deleteMany({ where: { modelId } });
    await tx.healthScoreModel.update({
      where: { id: modelId },
      data: { isFallback: true, active: true, updatedByUserId: actorUserId },
    });
    await writeAudit(tx, {
      actorUserId,
      modelKey: target.key,
      action: "PROMOTE_FALLBACK",
      beforeState: null,
      afterState: { modelKey: target.key },
    });

    return tx.healthScoreModel.findUniqueOrThrow({
      where: { id: modelId },
      include: { industryRules: { select: { nacePrefix: true, note: true } } },
    });
  });

  return serializeModel(model);
}

export async function deleteHealthScoreModel(
  actorUserId: string,
  modelId: string,
): Promise<{ deleted: true }> {
  await prisma.$transaction(async (tx) => {
    const model = await tx.healthScoreModel.findUniqueOrThrow({ where: { id: modelId } });
    if (model.isFallback) {
      throw new Error(
        "Standardmodellen kan ikke slettes. Gjør en annen modell til standard først.",
      );
    }
    await tx.healthScoreModel.delete({ where: { id: modelId } });
    await writeAudit(tx, {
      actorUserId,
      modelKey: model.key,
      action: "DELETE",
      beforeState: { key: model.key, name: model.name, config: model.config },
      afterState: null,
    });
  });

  return { deleted: true };
}

/* ── Resolution ───────────────────────────────────────────────────────────── */

export type ResolvedHealthScoreModel = {
  modelKey: string;
  modelName: string;
  /** The NACE prefix that matched, or null when the fallback was used. */
  matchedNacePrefix: string | null;
  config: HealthScoreConfig;
};

const BUILT_IN_MODEL: ResolvedHealthScoreModel = {
  modelKey: "innebygd-standard",
  modelName: "Innebygd standardmodell",
  matchedNacePrefix: null,
  config: defaultHealthScoreConfig(),
};

/**
 * Every prefix of a NACE code that a rule could match, longest first:
 * "68.209" → ["68.209", "68.20", "68.2", "68", "6"]. Longest match wins, so a
 * rule for "68.20" beats a rule for "68".
 */
function nacePrefixCandidates(naceCode: string): string[] {
  const cleaned = naceCode.trim();
  if (!cleaned) return [];
  const candidates: string[] = [];
  for (let length = cleaned.length; length > 0; length -= 1) {
    const candidate = cleaned.slice(0, length);
    // Never propose a prefix that ends mid-separator: "68." is not a NACE code.
    if (candidate.endsWith(".")) continue;
    candidates.push(candidate);
  }
  return candidates;
}

/**
 * Picks the model that applies to a company. Resolution order is: longest
 * matching NACE rule on an active model, then the fallback model, then the
 * built-in default when the database holds no models at all.
 */
export async function resolveHealthScoreModel(
  naceCode: string | null | undefined,
): Promise<ResolvedHealthScoreModel> {
  const candidates = naceCode ? nacePrefixCandidates(naceCode) : [];

  if (candidates.length > 0) {
    const rules = await prisma.healthScoreModelIndustryRule.findMany({
      where: { nacePrefix: { in: candidates }, model: { active: true } },
      include: { model: true },
    });

    if (rules.length > 0) {
      const best = rules.reduce((longest, rule) =>
        rule.nacePrefix.length > longest.nacePrefix.length ? rule : longest,
      );
      return {
        modelKey: best.model.key,
        modelName: best.model.name,
        matchedNacePrefix: best.nacePrefix,
        config: reconcileConfigWithCatalog(parseStoredHealthScoreConfig(best.model.config).config),
      };
    }
  }

  const fallback = await prisma.healthScoreModel.findFirst({
    where: { isFallback: true, active: true },
  });
  if (!fallback) return BUILT_IN_MODEL;

  return {
    modelKey: fallback.key,
    modelName: fallback.name,
    matchedNacePrefix: null,
    config: reconcileConfigWithCatalog(parseStoredHealthScoreConfig(fallback.config).config),
  };
}

/** The starting point offered when an admin creates their first model. */
export function starterHealthScoreModelInput(): HealthScoreModelInput {
  return {
    key: "standard",
    name: "Standardmodell",
    description: "Bredt sammensatt modell som brukes for alle bransjer uten egen regel.",
    active: true,
    isFallback: true,
    config: defaultHealthScoreConfig(),
    industryRules: [],
  };
}
