import {
  AiRevenueAllocationMode,
  AppRole,
  Prisma,
  SubscriptionStatus,
  type AiEconomicsSettings,
  type AiSubscriptionPlanEconomics,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import env from "@/lib/env";
import {
  AI_ECONOMICS_RUNTIME_LOCK_KEY,
  calculatePlanAiEconomics,
  parseAiEconomicsSettingsInput,
  parseAiPlanEconomicsInput,
  type AiEconomicsSettingsInput,
  type AiPlanEconomicsInput,
} from "@/server/ai-economics/domain";

type UsageAggregateRow = {
  calls: bigint;
  failedCalls: bigint;
  inputTokens: bigint;
  cachedInputTokens: bigint;
  outputTokens: bigint;
  usageTokens: bigint;
  estimatedCostNok: Prisma.Decimal;
  budgetedCostNok: Prisma.Decimal;
  reservedCostNok: Prisma.Decimal;
};

type UsageSplitRow = UsageAggregateRow & {
  key: string;
};

type UserUsageRow = UsageAggregateRow & {
  userId: string;
  name: string | null;
  email: string;
  category: string;
  appRole: string;
  planKey: string;
};

type ActiveSubscriptionRow = {
  planKey: string;
  subscribers: bigint;
};

function number(value: number | bigint | Prisma.Decimal | null | undefined) {
  return Number(value ?? 0);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function serializeSettings(settings: AiEconomicsSettings | null) {
  if (!settings) return null;
  return {
    id: settings.id,
    runtimeEnabled: settings.runtimeEnabled,
    billingCurrency: settings.billingCurrency,
    exchangeRateNok: number(settings.exchangeRateNok),
    fxRiskBufferBps: settings.fxRiskBufferBps,
    inputPricePerMillion: number(settings.inputPricePerMillion),
    cachedInputPricePerMillion: number(settings.cachedInputPricePerMillion),
    outputPricePerMillion: number(settings.outputPricePerMillion),
    globalMonthlyBudgetNok: number(settings.globalMonthlyBudgetNok),
    requestCostLimitNok: number(settings.requestCostLimitNok),
    dailyRequestLimit: settings.dailyRequestLimit,
    internalMonthlyTokenAllowance: settings.internalMonthlyTokenAllowance,
    version: settings.version,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function serializePlan(plan: AiSubscriptionPlanEconomics) {
  return {
    id: plan.id,
    planKey: plan.planKey,
    displayName: plan.displayName,
    active: plan.active,
    monthlyPriceNok: number(plan.monthlyPriceNok),
    includedAiUsageTokens: plan.includedAiUsageTokens,
    includedAiCostNok: number(plan.includedAiCostNok),
    allocationMode: plan.allocationMode,
    costPlusMarkupBps: plan.costPlusMarkupBps,
    fixedAiAllocationNokPerSubscriber: number(
      plan.fixedAiAllocationNokPerSubscriber,
    ),
    revenueShareBps: plan.revenueShareBps,
    version: plan.version,
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function serializeUsage(row: UsageAggregateRow | undefined) {
  return {
    calls: number(row?.calls),
    failedCalls: number(row?.failedCalls),
    inputTokens: number(row?.inputTokens),
    cachedInputTokens: number(row?.cachedInputTokens),
    outputTokens: number(row?.outputTokens),
    usageTokens: number(row?.usageTokens),
    estimatedCostNok: money(number(row?.estimatedCostNok)),
    budgetedCostNok: money(number(row?.budgetedCostNok)),
    reservedCostNok: money(number(row?.reservedCostNok)),
  };
}

function jsonState(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function getAiRuntimeEconomicsConfig() {
  const settings = await prisma.aiEconomicsSettings.findUnique({
    where: { id: "global" },
  });
  return serializeSettings(settings);
}

export async function getAiPlanEconomicsConfig(planKey: string) {
  const plan = await prisma.aiSubscriptionPlanEconomics.findUnique({
    where: { planKey },
  });
  return plan ? serializePlan(plan) : null;
}

export async function updateAiEconomicsSettings(
  actorUserId: string,
  input: AiEconomicsSettingsInput,
) {
  const parsed = parseAiEconomicsSettingsInput(input);

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${AI_ECONOMICS_RUNTIME_LOCK_KEY}, 0)
      )
    `);
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended('ai-economics-settings:global', 0))
    `);
    const before = await transaction.aiEconomicsSettings.findUnique({
      where: { id: "global" },
    });
    const settings = await transaction.aiEconomicsSettings.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        ...parsed,
        updatedByUserId: actorUserId,
      },
      update: {
        ...parsed,
        version: { increment: 1 },
        updatedByUserId: actorUserId,
      },
    });
    const serialized = serializeSettings(settings);
    await transaction.aiEconomicsChangeAudit.create({
      data: {
        actorUserId,
        entityType: "SETTINGS",
        entityKey: "global",
        beforeState: before
          ? jsonState(serializeSettings(before))
          : Prisma.JsonNull,
        afterState: jsonState(serialized),
      },
    });
    return serialized;
  });
}

export async function upsertAiPlanEconomics(
  actorUserId: string,
  input: AiPlanEconomicsInput,
) {
  const parsed = parseAiPlanEconomicsInput(input);

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${AI_ECONOMICS_RUNTIME_LOCK_KEY}, 0)
      )
    `);
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${"ai-economics-plan:" + parsed.planKey}, 0)
      )
    `);
    const before = await transaction.aiSubscriptionPlanEconomics.findUnique({
      where: { planKey: parsed.planKey },
    });
    const plan = await transaction.aiSubscriptionPlanEconomics.upsert({
      where: { planKey: parsed.planKey },
      create: {
        ...parsed,
        allocationMode: parsed.allocationMode as AiRevenueAllocationMode,
        updatedByUserId: actorUserId,
      },
      update: {
        ...parsed,
        allocationMode: parsed.allocationMode as AiRevenueAllocationMode,
        version: { increment: 1 },
        updatedByUserId: actorUserId,
      },
    });
    const serialized = serializePlan(plan);
    await transaction.aiEconomicsChangeAudit.create({
      data: {
        actorUserId,
        entityType: "SUBSCRIPTION_PLAN",
        entityKey: parsed.planKey,
        beforeState: before ? jsonState(serializePlan(before)) : Prisma.JsonNull,
        afterState: jsonState(serialized),
      },
    });
    return serialized;
  });
}

export async function buildAdminAiEconomicsDashboard(now = new Date()) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const elapsedFraction = Math.max(
    1 / 31,
    Math.min(
      1,
      (now.getTime() - periodStart.getTime()) /
        (periodEnd.getTime() - periodStart.getTime()),
    ),
  );

  const [
    settingsRecord,
    planRecords,
    totalRows,
    categoryRows,
    roleRows,
    planUsageRows,
    customerPlanUsageRows,
    modelRows,
    userRows,
    activeSubscriptionRows,
    observedPlanRows,
    recentChanges,
  ] = await Promise.all([
    prisma.aiEconomicsSettings.findUnique({ where: { id: "global" } }),
    prisma.aiSubscriptionPlanEconomics.findMany({ orderBy: { planKey: "asc" } }),
    prisma.$queryRaw<UsageAggregateRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'RECORDED')::bigint AS "calls",
        COUNT(*) FILTER (WHERE "status" = 'FAILED')::bigint AS "failedCalls",
        COALESCE(SUM("inputTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "inputTokens",
        COALESCE(SUM("cachedInputTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "cachedInputTokens",
        COALESCE(SUM("outputTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "outputTokens",
        COALESCE(SUM("usageTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "usageTokens",
        COALESCE(SUM("estimatedCostNok") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::numeric AS "estimatedCostNok",
        COALESCE(SUM(COALESCE("budgetedCostNok", "estimatedCostNok")) FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::numeric AS "budgetedCostNok",
        COALESCE(SUM("reservedCostNok") FILTER (WHERE "status" = 'RESERVED' AND "expiresAt" > ${now}), 0)::numeric AS "reservedCostNok"
      FROM "AiSearchUsageEvent"
      WHERE COALESCE("occurredAt", "createdAt") >= ${periodStart}
        AND COALESCE("occurredAt", "createdAt") < ${periodEnd}
    `),
    getUsageSplit("usageCategory", periodStart, periodEnd, now),
    getUsageSplit("appRoleAtUsage", periodStart, periodEnd, now),
    getUsageSplit("subscriptionPlanAtUsage", periodStart, periodEnd, now),
    getUsageSplit("subscriptionPlanAtUsage", periodStart, periodEnd, now, true),
    getUsageSplit("model", periodStart, periodEnd, now),
    prisma.$queryRaw<UserUsageRow[]>(Prisma.sql`
      SELECT
        event."userId",
        users."name",
        users."email",
        COALESCE(event."usageCategory"::text, 'UNCLASSIFIED') AS "category",
        COALESCE(event."appRoleAtUsage"::text, 'UNCLASSIFIED') AS "appRole",
        COALESCE(event."subscriptionPlanAtUsage", 'unclassified') AS "planKey",
        COUNT(*) FILTER (WHERE event."status" = 'RECORDED')::bigint AS "calls",
        COUNT(*) FILTER (WHERE event."status" = 'FAILED')::bigint AS "failedCalls",
        COALESCE(SUM(event."inputTokens") FILTER (WHERE event."status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "inputTokens",
        COALESCE(SUM(event."cachedInputTokens") FILTER (WHERE event."status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "cachedInputTokens",
        COALESCE(SUM(event."outputTokens") FILTER (WHERE event."status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "outputTokens",
        COALESCE(SUM(event."usageTokens") FILTER (WHERE event."status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "usageTokens",
        COALESCE(SUM(event."estimatedCostNok") FILTER (WHERE event."status" IN ('RECORDED', 'FAILED')), 0)::numeric AS "estimatedCostNok",
        COALESCE(SUM(COALESCE(event."budgetedCostNok", event."estimatedCostNok")) FILTER (WHERE event."status" IN ('RECORDED', 'FAILED')), 0)::numeric AS "budgetedCostNok",
        COALESCE(SUM(event."reservedCostNok") FILTER (WHERE event."status" = 'RESERVED' AND event."expiresAt" > ${now}), 0)::numeric AS "reservedCostNok"
      FROM "AiSearchUsageEvent" event
      INNER JOIN "User" users ON users."id" = event."userId"
      WHERE COALESCE(event."occurredAt", event."createdAt") >= ${periodStart}
        AND COALESCE(event."occurredAt", event."createdAt") < ${periodEnd}
      GROUP BY event."userId", users."name", users."email",
        event."usageCategory", event."appRoleAtUsage", event."subscriptionPlanAtUsage"
      ORDER BY "budgetedCostNok" DESC, users."email" ASC
    `),
    prisma.$queryRaw<ActiveSubscriptionRow[]>(Prisma.sql`
      SELECT subscription."plan" AS "planKey", COUNT(*)::bigint AS "subscribers"
      FROM "Subscription" subscription
      INNER JOIN "User" users ON users."id" = subscription."userId"
      WHERE subscription."status" = ${SubscriptionStatus.ACTIVE}::"SubscriptionStatus"
        AND users."appRole" = ${AppRole.USER}::"AppRole"
      GROUP BY subscription."plan"
    `),
    prisma.subscription.findMany({
      distinct: ["plan"],
      select: { plan: true },
      orderBy: { plan: "asc" },
    }),
    prisma.aiEconomicsChangeAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { actor: { select: { name: true, email: true } } },
    }),
  ]);

  const settings = serializeSettings(settingsRecord);
  const total = serializeUsage(totalRows[0]);
  const configuredPlanMap = new Map(
    planRecords.map((plan) => [plan.planKey, plan]),
  );
  const activeSubscribers = new Map(
    activeSubscriptionRows.map((row) => [row.planKey, number(row.subscribers)]),
  );
  const planCosts = new Map(
    customerPlanUsageRows.map((row) => [row.key, number(row.estimatedCostNok)]),
  );
  const planBudgetedCosts = new Map(
    customerPlanUsageRows.map((row) => [row.key, number(row.budgetedCostNok)]),
  );
  const allPlanKeys = Array.from(new Set([
    ...planRecords.map((plan) => plan.planKey),
    ...observedPlanRows.map((row) => row.plan),
    ...planUsageRows.map((row) => row.key).filter((key) => key !== "UNCLASSIFIED"),
  ])).sort();

  const plans = allPlanKeys.map((planKey) => {
    const configured = configuredPlanMap.get(planKey);
    const subscribers = activeSubscribers.get(planKey) ?? 0;
    const actualAiCostNok = money(planCosts.get(planKey) ?? 0);
    const budgetedAiCostNok = money(planBudgetedCosts.get(planKey) ?? 0);
    const economics = configured
      ? calculatePlanAiEconomics({
          activeSubscribers: subscribers,
          monthlyPriceNok: number(configured.monthlyPriceNok),
          actualAiCostNok: budgetedAiCostNok,
          allocationMode: configured.allocationMode,
          costPlusMarkupBps: configured.costPlusMarkupBps,
          fixedAiAllocationNokPerSubscriber: number(
            configured.fixedAiAllocationNokPerSubscriber,
          ),
          revenueShareBps: configured.revenueShareBps,
        })
      : null;

    return {
      planKey,
      activeSubscribers: subscribers,
      actualAiCostNok,
      budgetedAiCostNok,
      configured: configured ? serializePlan(configured) : null,
      economics,
    };
  });

  const committedCostNok = total.budgetedCostNok + total.reservedCostNok;
  const monthlyBudgetNok = settings?.globalMonthlyBudgetNok ?? 0;

  return {
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      generatedAt: now.toISOString(),
    },
    settings,
    runtimeControl: {
      environmentMasterEnabled: env.aiSearchBillingEnabled,
      adminEnabled: settings?.runtimeEnabled ?? false,
      effectiveEnabled:
        env.aiSearchBillingEnabled && Boolean(settings?.runtimeEnabled),
    },
    totals: {
      ...total,
      committedCostNok: money(committedCostNok),
      remainingBudgetNok: money(Math.max(0, monthlyBudgetNok - committedCostNok)),
      projectedBudgetedCostNok: money(total.budgetedCostNok / elapsedFraction),
    },
    splits: {
      categories: categoryRows.map(serializeSplit),
      roles: roleRows.map(serializeSplit),
      plans: planUsageRows.map(serializeSplit),
      models: modelRows.map(serializeSplit),
    },
    plans,
    users: userRows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      category: row.category,
      appRole: row.appRole,
      planKey: row.planKey,
      ...serializeUsage(row),
    })),
    recentChanges: recentChanges.map((change) => ({
      id: change.id,
      entityType: change.entityType,
      entityKey: change.entityKey,
      actor: change.actor.name ?? change.actor.email,
      createdAt: change.createdAt.toISOString(),
    })),
  };
}

export type AdminAiEconomicsDashboard = Awaited<
  ReturnType<typeof buildAdminAiEconomicsDashboard>
>;

function serializeSplit(row: UsageSplitRow) {
  return { key: row.key, ...serializeUsage(row) };
}

async function getUsageSplit(
  field: "usageCategory" | "appRoleAtUsage" | "subscriptionPlanAtUsage" | "model",
  periodStart: Date,
  periodEnd: Date,
  now: Date,
  customerOnly = false,
) {
  const column = Prisma.raw(`"${field}"`);
  const categoryFilter = customerOnly
    ? Prisma.sql`AND "usageCategory" = 'CUSTOMER'::"AiUsageCategory"`
    : Prisma.empty;
  return prisma.$queryRaw<UsageSplitRow[]>(Prisma.sql`
    SELECT
      COALESCE(${column}::text, 'UNCLASSIFIED') AS "key",
      COUNT(*) FILTER (WHERE "status" = 'RECORDED')::bigint AS "calls",
      COUNT(*) FILTER (WHERE "status" = 'FAILED')::bigint AS "failedCalls",
      COALESCE(SUM("inputTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "inputTokens",
      COALESCE(SUM("cachedInputTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "cachedInputTokens",
      COALESCE(SUM("outputTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "outputTokens",
      COALESCE(SUM("usageTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "usageTokens",
      COALESCE(SUM("estimatedCostNok") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::numeric AS "estimatedCostNok",
      COALESCE(SUM(COALESCE("budgetedCostNok", "estimatedCostNok")) FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::numeric AS "budgetedCostNok",
      COALESCE(SUM("reservedCostNok") FILTER (WHERE "status" = 'RESERVED' AND "expiresAt" > ${now}), 0)::numeric AS "reservedCostNok"
    FROM "AiSearchUsageEvent"
    WHERE COALESCE("occurredAt", "createdAt") >= ${periodStart}
      AND COALESCE("occurredAt", "createdAt") < ${periodEnd}
      ${categoryFilter}
    GROUP BY ${column}
    ORDER BY "budgetedCostNok" DESC, "key" ASC
  `);
}

export function getUsageCategoryForRole(role: AppRole) {
  if (role === AppRole.ADMIN) return "INTERNAL_ADMIN" as const;
  if (role === AppRole.FINANCIAL_REVIEWER) return "INTERNAL_REVIEWER" as const;
  return "CUSTOMER" as const;
}
