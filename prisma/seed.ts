import { PrismaClient, CompanyStatus, SubscriptionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const industries = [
  { code: "62.010", title: "Programmeringstjenester" },
  { code: "70.220", title: "Bedriftsradgivning" },
  { code: "46.510", title: "Engroshandel med datamaskiner" },
  { code: "41.200", title: "Oppforing av bygninger" },
  { code: "68.320", title: "Eiendomsforvaltning" },
  { code: "86.901", title: "Helsetjenester" }
];

const cities = [
  ["Oslo", "Oslo"],
  ["Bergen", "Vestland"],
  ["Trondheim", "Trondelag"],
  ["Stavanger", "Rogaland"],
  ["Tromso", "Troms"],
  ["Kristiansand", "Agder"]
] as const;

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  await prisma.role.deleteMany();
  await prisma.financialStatement.deleteMany();
  await prisma.address.deleteMany();
  await prisma.company.deleteMany();
  await prisma.person.deleteMany();
  await prisma.industryCode.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  const now = new Date();
  const industryRecords = await Promise.all(
    industries.map((industry) =>
      prisma.industryCode.create({
        data: {
          ...industry,
          description: `${industry.title} fra SSB Klass.`,
          level: "5-digit",
          sourceSystem: "SSB_KLASS",
          sourceEntityType: "industryCode",
          sourceId: industry.code,
          fetchedAt: now,
          normalizedAt: now,
          rawPayload: industry,
        },
      }),
    ),
  );

  const people = await Promise.all(
    Array.from({ length: 60 }).map((_, index) =>
      prisma.person.create({
        data: {
          fullName: `Person ${index + 1} Hansen`,
          birthYear: 1965 + (index % 30),
          sourceSystem: "SEED",
          sourceEntityType: "person",
          sourceId: `person-${index + 1}`,
          fetchedAt: now,
          normalizedAt: now,
          rawPayload: { type: "seed" },
        },
      }),
    ),
  );

  for (let index = 0; index < 30; index += 1) {
    const city = cities[index % cities.length];
    const industry = industryRecords[index % industryRecords.length];
    const orgNumber = `9${(10000000 + index).toString()}`;
    const revenue = 1500000 + index * 420000;
    const operatingProfit = Math.round(revenue * (0.08 + (index % 4) * 0.03));
    const netIncome = Math.round(operatingProfit * 0.78);
    const equity = Math.round(revenue * 0.35);
    const name = `ProjectX Demo Company ${index + 1} AS`;

    const company = await prisma.company.create({
      data: {
        slug: slugify(name),
        orgNumber,
        name,
        legalForm: "AS",
        status: index % 11 === 0 ? CompanyStatus.DISSOLVED : CompanyStatus.ACTIVE,
        registeredAt: new Date(2012 + (index % 8), index % 12, 10),
        foundedAt: new Date(2011 + (index % 8), (index + 2) % 12, 4),
        website: `https://company${index + 1}.projectx.local`,
        employeeCount: 8 + index * 2,
        revenue,
        operatingProfit,
        netIncome,
        equity,
        description: "Normalisert seed-data som folger samme struktur som eksterne providers.",
        sourceSystem: "SEED",
        sourceEntityType: "company",
        sourceId: orgNumber,
        fetchedAt: now,
        normalizedAt: now,
        rawPayload: { seed: true, orgNumber },
        industryCodeId: industry.id,
        addresses: {
          create: [
            {
              line1: `Gate ${index + 1}`,
              postalCode: `${1000 + index}`,
              city: city[0],
              region: city[1],
              sourceSystem: "SEED",
              sourceEntityType: "address",
              sourceId: `${orgNumber}-business`,
              fetchedAt: now,
              normalizedAt: now,
              rawPayload: { type: "business" },
            },
          ],
        },
      },
    });

    const relatedPeople = [
      people[(index * 2) % people.length],
      people[(index * 2 + 1) % people.length],
      people[(index * 2 + 2) % people.length],
    ];

    const roleTitles = ["Daglig leder", "Styreleder", "Styremedlem"];
    for (let roleIndex = 0; roleIndex < roleTitles.length; roleIndex += 1) {
      await prisma.role.create({
        data: {
          companyId: company.id,
          personId: relatedPeople[roleIndex].id,
          title: roleTitles[roleIndex],
          isBoardRole: roleIndex > 0,
          fromDate: new Date(2021 - roleIndex, 0, 1),
          sourceSystem: "SEED",
          sourceEntityType: "role",
          sourceId: `${orgNumber}-${roleIndex}`,
          fetchedAt: now,
          normalizedAt: now,
          rawPayload: { role: roleTitles[roleIndex] },
        },
      });
    }

    for (let year = 2022; year <= 2024; year += 1) {
      const multiplier = year === 2024 ? 1 : year === 2023 ? 0.92 : 0.85;
      await prisma.financialStatement.create({
        data: {
          companyId: company.id,
          fiscalYear: year,
          revenue: Math.round(revenue * multiplier),
          operatingProfit: Math.round(operatingProfit * multiplier),
          netIncome: Math.round(netIncome * multiplier),
          equity: Math.round(equity * multiplier),
          assets: Math.round(revenue * multiplier * 1.25),
          sourceSystem: "SEED",
          sourceEntityType: "financialStatement",
          sourceId: `${orgNumber}-${year}`,
          fetchedAt: now,
          normalizedAt: now,
          rawPayload: { year },
        },
      });
    }
  }

  const passwordHash = await bcrypt.hash("projectx-demo", 10);

  const freeUser = await prisma.user.create({
    data: {
      name: "Free Analyst",
      email: "free@projectx.local",
      passwordHash,
    },
  });

  await prisma.subscription.create({
    data: {
      userId: freeUser.id,
      plan: "free",
      status: SubscriptionStatus.FREE,
    },
  });

  const premiumUser = await prisma.user.create({
    data: {
      name: "Premium Analyst",
      email: "premium@projectx.local",
      passwordHash,
    },
  });

  await prisma.subscription.create({
    data: {
      userId: premiumUser.id,
      plan: "premium",
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });