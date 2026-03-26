import { CompanyProfile, NormalizedCompany, NormalizedRole } from "@/lib/types";

type OrganizationNodeType = "company" | "person" | "externalCompany";
type RoleBucket = "owners" | "board" | "management" | "authority" | "advisors" | "other";
type AuthorityKind = "signatur" | "prokura";

export type OrganizationActor = {
  id: string;
  type: "person" | "company";
  name: string;
  birthYear?: number | null;
  orgNumber?: string | null;
  legalForm?: string | null;
  approvalStatus?: string | null;
  sourceId: string;
  sourceSystem: string;
  roles: NormalizedRole[];
  titles: string[];
  buckets: RoleBucket[];
  primaryBucket: RoleBucket;
  hasMultipleRoles: boolean;
  relatedCompanyCount: number;
};

export type OrganizationGraphNode = {
  id: string;
  type: OrganizationNodeType;
  label: string;
  meta: string;
  bucket: RoleBucket | "company";
  badges: string[];
  priority: "high" | "normal" | "low";
  orgNumber?: string | null;
  birthYear?: number | null;
  hiddenWhenCollapsed?: boolean;
};

export type OrganizationGraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  bucket: RoleBucket;
  importance: "primary" | "secondary";
};

export type AuthorityRule = {
  id: string;
  kind: AuthorityKind;
  text: string;
  available: boolean;
};

export type OwnershipRecord = {
  id: string;
  name: string;
  entityType: "person" | "company";
  share?: string | null;
  relation?: string | null;
  orgNumber?: string | null;
  available: boolean;
};

export type ExternalAdvisorRecord = {
  id: string;
  role: string;
  name: string;
  entityType: "person" | "company";
  orgNumber?: string | null;
  approvalStatus?: string | null;
};

export type InsightRecord = {
  id: string;
  tone: "neutral" | "flag" | "positive";
  title: string;
  description: string;
};

export type OrganizationModel = {
  company: NormalizedCompany;
  actors: OrganizationActor[];
  nodes: OrganizationGraphNode[];
  edges: OrganizationGraphEdge[];
  ownerships: OwnershipRecord[];
  signatureRules: AuthorityRule[];
  procurationRules: AuthorityRule[];
  advisors: ExternalAdvisorRecord[];
  groupedActors: Record<RoleBucket, OrganizationActor[]>;
  insights: InsightRecord[];
  statusItems: Array<{ label: string; value: string }>;
  availability: {
    owners: boolean;
    auditor: boolean;
    accountant: boolean;
    signature: boolean;
    procuration: boolean;
  };
};

const RELATED_ROLE_PATTERNS = [
  /styre/i,
  /leder/i,
  /daglig/i,
  /signatur/i,
  /prokura/i,
  /revisor/i,
  /regnskapsf/i,
  /deltaker/i,
  /innehaver/i,
  /komplementar/i,
  /kontaktperson/i,
  /observat/i,
];

function matchesAnyRole(title: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(title));
}

function classifyRole(title: string): RoleBucket {
  if (/eier|aksjeeier|deltaker/i.test(title)) {
    return "owners";
  }

  if (/revisor|regnskapsf/i.test(title)) {
    return "advisors";
  }

  if (/signatur|prokura/i.test(title)) {
    return "authority";
  }

  if (/daglig leder|adm/i.test(title)) {
    return "management";
  }

  if (/styre|leder/i.test(title)) {
    return "board";
  }

  return "other";
}

function getPrimaryBucket(buckets: RoleBucket[]) {
  const priority: RoleBucket[] = ["owners", "management", "board", "authority", "advisors", "other"];
  return priority.find((bucket) => buckets.includes(bucket)) ?? "other";
}

function titleCaseSentence(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getActorId(role: NormalizedRole) {
  if (role.organization?.orgNumber) {
    return `company:${role.organization.orgNumber}`;
  }

  return `person:${role.person.sourceId}`;
}

function getActorMeta(role: NormalizedRole) {
  if (role.organization) {
    return {
      id: getActorId(role),
      type: "company" as const,
      name: role.organization.name,
      birthYear: null,
      orgNumber: role.organization.orgNumber,
      legalForm: role.organization.legalForm,
      approvalStatus: role.organization.approvalStatus,
      sourceId: role.organization.sourceId,
      sourceSystem: role.organization.sourceSystem,
    };
  }

  return {
    id: getActorId(role),
    type: "person" as const,
    name: role.person.fullName,
    birthYear: role.person.birthYear,
    orgNumber: null,
    legalForm: null,
    approvalStatus: null,
    sourceId: role.person.sourceId,
    sourceSystem: role.person.sourceSystem,
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractCandidateTexts(payload: unknown, targetKeys: string[]) {
  const matches = new Set<string>();

  function visit(value: unknown) {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      if (targetKeys.includes(key.toLowerCase())) {
        if (typeof nested === "string" && nested.trim()) {
          matches.add(nested.trim());
        } else if (Array.isArray(nested)) {
          for (const item of nested) {
            if (typeof item === "string" && item.trim()) {
              matches.add(item.trim());
            }
          }
        } else if (nested && typeof nested === "object") {
          for (const item of Object.values(nested)) {
            if (typeof item === "string" && item.trim()) {
              matches.add(item.trim());
            }
          }
        }
      }

      visit(nested);
    }
  }

  visit(payload);

  return Array.from(matches);
}

function extractAuthorityRules(company: NormalizedCompany, kind: AuthorityKind): AuthorityRule[] {
  const keyMap: Record<AuthorityKind, string[]> = {
    signatur: ["signatur", "signaturregel", "signature", "signaturerule"],
    prokura: ["prokura", "prokuraregel", "procuration", "procurationrule"],
  };

  const texts = extractCandidateTexts(company.rawPayload, keyMap[kind]);

  if (texts.length === 0) {
    return [
      {
        id: `${kind}-unavailable`,
        kind,
        text: "Ikke registrert i tilgjengelig kilde.",
        available: false,
      },
    ];
  }

  return texts.map((text, index) => ({
    id: `${kind}-${index}`,
    kind,
    text: titleCaseSentence(text),
    available: true,
  }));
}

function buildOwnerships(company: NormalizedCompany, roles: NormalizedRole[]): OwnershipRecord[] {
  const ownershipRoles = roles.filter((role) => classifyRole(role.title) === "owners");
  if (ownershipRoles.length > 0) {
    return ownershipRoles.map((role, index) => ({
      id: `owner-role-${index}`,
      name: role.organization?.name ?? role.person.fullName,
      entityType: role.organization ? "company" : "person",
      share: null,
      relation: "Direkte rolle registrert hos Brreg",
      orgNumber: role.organization?.orgNumber ?? null,
      available: true,
    }));
  }

  const payloadOwners = extractCandidateTexts(company.rawPayload, ["eiere", "aksjeeiere", "deltakere"]);
  if (payloadOwners.length > 0) {
    return payloadOwners.map((text, index) => ({
      id: `owner-payload-${index}`,
      name: text,
      entityType: "company",
      share: null,
      relation: "Oppgitt i kildepayload",
      orgNumber: null,
      available: true,
    }));
  }

  return [
    {
      id: "owners-unavailable",
      name: "Ingen eiere registrert i tilgjengelig kilde",
      entityType: "company",
      share: null,
      relation: null,
      orgNumber: null,
      available: false,
    },
  ];
}

function groupActors(roles: NormalizedRole[]) {
  const actorMap = new Map<string, OrganizationActor>();

  for (const role of roles) {
    const actorMeta = getActorMeta(role);
    const existing = actorMap.get(actorMeta.id);
    const bucket = classifyRole(role.title);

    if (existing) {
      existing.roles.push(role);
      existing.titles = uniqueStrings([...existing.titles, role.title]);
      existing.buckets = uniqueStrings([...existing.buckets, bucket]) as RoleBucket[];
      existing.primaryBucket = getPrimaryBucket(existing.buckets);
      existing.hasMultipleRoles = existing.titles.length > 1;
      existing.relatedCompanyCount = uniqueStrings(
        existing.roles
          .flatMap((item) => extractCandidateTexts(item.rawPayload, ["enhet", "organisasjonsnummer"]))
          .filter(Boolean),
      ).length;
      continue;
    }

    actorMap.set(actorMeta.id, {
      ...actorMeta,
      roles: [role],
      titles: [role.title],
      buckets: [bucket],
      primaryBucket: bucket,
      hasMultipleRoles: false,
      relatedCompanyCount: 0,
    });
  }

  return Array.from(actorMap.values()).sort((left, right) => {
    if (left.primaryBucket !== right.primaryBucket) {
      return left.primaryBucket.localeCompare(right.primaryBucket);
    }

    return left.name.localeCompare(right.name, "nb-NO");
  });
}

function buildGraph(company: NormalizedCompany, actors: OrganizationActor[], ownerships: OwnershipRecord[]) {
  const companyNode: OrganizationGraphNode = {
    id: `company:${company.orgNumber}`,
    type: "company",
    label: company.name,
    meta: `${company.legalForm ?? "Foretak"} · ${company.orgNumber}`,
    bucket: "company",
    badges: [company.status],
    priority: "high",
    orgNumber: company.orgNumber,
  };

  const nodes: OrganizationGraphNode[] = [companyNode];
  const edges: OrganizationGraphEdge[] = [];

  for (const actor of actors) {
    const nodeType: OrganizationNodeType = actor.type === "company" ? "externalCompany" : "person";
    const badges = actor.titles.slice(0, 4);

    nodes.push({
      id: actor.id,
      type: nodeType,
      label: actor.name,
      meta:
        actor.type === "company"
          ? [actor.orgNumber, actor.legalForm].filter(Boolean).join(" · ") || "Eksternt foretak"
          : actor.birthYear
            ? `F. ${actor.birthYear}`
            : "Person",
      bucket: actor.primaryBucket,
      badges,
      priority:
        actor.primaryBucket === "owners" ||
        actor.titles.some((title) => /daglig leder|styrets leder/i.test(title))
          ? "high"
          : actor.primaryBucket === "advisors"
            ? "low"
            : "normal",
      orgNumber: actor.orgNumber,
      birthYear: actor.birthYear,
      hiddenWhenCollapsed: actor.primaryBucket === "other",
    });

    for (const title of actor.titles) {
      edges.push({
        id: `${actor.id}-${title}`,
        from: actor.id,
        to: companyNode.id,
        label: title,
        bucket: classifyRole(title),
        importance: /daglig leder|styrets leder|eier/i.test(title) ? "primary" : "secondary",
      });
    }
  }

  for (const owner of ownerships.filter((item) => item.available)) {
    const ownerId = owner.orgNumber ? `company:${owner.orgNumber}` : `owner:${owner.name}`;
    if (!nodes.find((node) => node.id === ownerId)) {
      nodes.push({
        id: ownerId,
        type: owner.entityType === "company" ? "externalCompany" : "person",
        label: owner.name,
        meta: owner.orgNumber ?? "Eier",
        bucket: "owners",
        badges: ["Eier"],
        priority: "high",
        orgNumber: owner.orgNumber,
      });
    }

    edges.push({
      id: `${ownerId}-ownership`,
      from: ownerId,
      to: companyNode.id,
      label: "Eier",
      bucket: "owners",
      importance: "primary",
    });
  }

  return { nodes, edges };
}

function buildGroupedActors(actors: OrganizationActor[]) {
  return {
    owners: actors.filter((actor) => actor.primaryBucket === "owners"),
    board: actors.filter((actor) => actor.primaryBucket === "board"),
    management: actors.filter((actor) => actor.primaryBucket === "management"),
    authority: actors.filter((actor) => actor.primaryBucket === "authority"),
    advisors: actors.filter((actor) => actor.primaryBucket === "advisors"),
    other: actors.filter((actor) => actor.primaryBucket === "other"),
  };
}

function buildAdvisors(actors: OrganizationActor[]) {
  return actors
    .filter((actor) => actor.primaryBucket === "advisors")
    .map((actor) => ({
      id: actor.id,
      role: actor.titles.join(", "),
      name: actor.name,
      entityType: actor.type,
      orgNumber: actor.orgNumber,
      approvalStatus: actor.approvalStatus,
    }));
}

function buildInsights(
  company: NormalizedCompany,
  actors: OrganizationActor[],
  ownerships: OwnershipRecord[],
  signatureRules: AuthorityRule[],
  procurationRules: AuthorityRule[],
  advisors: ExternalAdvisorRecord[],
): InsightRecord[] {
  const insights: InsightRecord[] = [];
  const multiRoleActors = actors.filter((actor) => actor.hasMultipleRoles);
  const leaderChair = actors.find(
    (actor) =>
      actor.titles.some((title) => /daglig leder/i.test(title)) &&
      actor.titles.some((title) => /styrets leder/i.test(title)),
  );

  if (leaderChair) {
    insights.push({
      id: "same-person-chair-ceo",
      tone: "flag",
      title: "Ledelse og styre samlet på én person",
      description: `${leaderChair.name} er både daglig leder og styreleder.`,
    });
  }

  const authorityOverlap = actors.find(
    (actor) =>
      actor.titles.some((title) => /signatur/i.test(title)) &&
      actor.titles.some((title) => /prokura/i.test(title)),
  );

  if (authorityOverlap) {
    insights.push({
      id: "signature-procuration-overlap",
      tone: "flag",
      title: "Samme aktør har flere fullmakter",
      description: `${authorityOverlap.name} har både signatur- og prokura-tilknytning i tilgjengelige data.`,
    });
  }

  if (!ownerships.some((owner) => owner.available)) {
    insights.push({
      id: "owners-missing",
      tone: "neutral",
      title: "Eierskap er ikke synlig i kildegrunnlaget",
      description: "Brreg-kildene som er koblet inn i MVP-et gir ikke registrerte eiere for dette foretaket.",
    });
  }

  if (!advisors.some((advisor) => /revisor/i.test(advisor.role))) {
    insights.push({
      id: "auditor-missing",
      tone: company.rawPayload && JSON.stringify(company.rawPayload).includes("fravalgRevisjon")
        ? "positive"
        : "neutral",
      title: "Revisor er ikke registrert",
      description:
        company.rawPayload && JSON.stringify(company.rawPayload).includes("fravalgRevisjon")
          ? "Foretaket har registrert fravalg av revisjon i tilgjengelig Brreg-payload."
          : "Ingen registrert revisor ble funnet i tilgjengelige data.",
    });
  }

  if (!advisors.some((advisor) => /regnskapsf/i.test(advisor.role))) {
    insights.push({
      id: "accountant-missing",
      tone: "neutral",
      title: "Regnskapsfører er ikke registrert",
      description: "Ingen ekstern regnskapsfører ble funnet i tilgjengelige rolldata.",
    });
  }

  if (multiRoleActors.length > 0) {
    const topActor = multiRoleActors.sort((left, right) => right.titles.length - left.titles.length)[0];
    insights.push({
      id: "role-concentration",
      tone: "flag",
      title: "Roller er konsentrert",
      description: `${topActor.name} har ${topActor.titles.length} registrerte roller i samme foretak.`,
    });
  }

  if (ownerships.some((owner) => owner.available && owner.entityType === "company")) {
    insights.push({
      id: "corporate-owner",
      tone: "neutral",
      title: "Kontroll kan ligge hos annet foretak",
      description: "Tilgjengelige eieropplysninger peker mot juridisk person, ikke fysisk person.",
    });
  }

  if (signatureRules.some((rule) => rule.available && /fellesskap|to styremedlemmer/i.test(rule.text))) {
    insights.push({
      id: "joint-signature",
      tone: "positive",
      title: "Signatur krever samhandling",
      description: "Signaturregelen indikerer at flere personer må opptre i fellesskap.",
    });
  }

  if (procurationRules.some((rule) => rule.available) && advisors.some((advisor) => advisor.entityType === "company")) {
    insights.push({
      id: "external-procuration",
      tone: "neutral",
      title: "Ekstern aktør er koblet inn",
      description: "Det finnes eksterne selskapsaktører i rollebildet som bør vurderes opp mot fullmakter og kontroll.",
    });
  }

  if (actors.filter((actor) => actor.primaryBucket === "board" || actor.primaryBucket === "management").length <= 2) {
    insights.push({
      id: "small-governance-team",
      tone: "neutral",
      title: "Kompakt styringsstruktur",
      description: "Foretaket har få registrerte personer i styre og ledelse.",
    });
  }

  return insights.slice(0, 6);
}

export function buildOrganizationModel(profile: CompanyProfile): OrganizationModel {
  const ownerships = buildOwnerships(profile.company, profile.roles);
  const signatureRules = extractAuthorityRules(profile.company, "signatur");
  const procurationRules = extractAuthorityRules(profile.company, "prokura");
  const actors = groupActors(profile.roles);
  const groupedActors = buildGroupedActors(actors);
  const advisors = buildAdvisors(actors);
  const graph = buildGraph(profile.company, actors, ownerships);

  const availability = {
    owners: ownerships.some((item) => item.available),
    auditor: advisors.some((advisor) => /revisor/i.test(advisor.role)),
    accountant: advisors.some((advisor) => /regnskapsf/i.test(advisor.role)),
    signature: signatureRules.some((item) => item.available),
    procuration: procurationRules.some((item) => item.available),
  };

  return {
    company: profile.company,
    actors,
    nodes: graph.nodes,
    edges: graph.edges,
    ownerships,
    signatureRules,
    procurationRules,
    advisors,
    groupedActors,
    insights: buildInsights(
      profile.company,
      actors,
      ownerships,
      signatureRules,
      procurationRules,
      advisors,
    ),
    statusItems: [
      { label: "Selskapsform", value: profile.company.legalForm ?? "Ikke tilgjengelig" },
      { label: "Stiftelsesdato", value: profile.company.foundedAt ? new Intl.DateTimeFormat("nb-NO").format(profile.company.foundedAt) : "Ikke tilgjengelig" },
      { label: "Status", value: profile.company.status },
      {
        label: "Forretningsadresse",
        value:
          [
            profile.company.addresses[0]?.line1,
            profile.company.addresses[0]?.postalCode,
            profile.company.addresses[0]?.city,
          ]
            .filter(Boolean)
            .join(", ") || "Ikke tilgjengelig",
      },
      {
        label: "NACE / bransje",
        value:
          [profile.company.industryCode?.code, profile.company.industryCode?.title]
            .filter(Boolean)
            .join(" ") || "Ikke tilgjengelig",
      },
      { label: "Registrerte roller / aktorer", value: `${profile.roles.length} / ${actors.length}` },
      {
        label: "Registrerte eiere",
        value: availability.owners ? String(ownerships.filter((item) => item.available).length) : "Ikke tilgjengelig",
      },
      { label: "Revisor", value: availability.auditor ? "Registrert" : "Ikke registrert" },
      { label: "Regnskapsforer", value: availability.accountant ? "Registrert" : "Ikke registrert" },
      { label: "Signatur", value: availability.signature ? "Registrert" : "Ikke registrert" },
      { label: "Prokura", value: availability.procuration ? "Registrert" : "Ikke registrert" },
    ],
    availability,
  };
}

export function getRoleSearchText(actor: OrganizationActor) {
  return `${actor.name} ${actor.titles.join(" ")} ${actor.orgNumber ?? ""}`.toLowerCase();
}

export function getActorConnectionSummary(actor: OrganizationActor) {
  if (actor.titles.length === 1) {
    return actor.titles[0];
  }

  return `${actor.titles.length} roller: ${actor.titles.join(", ")}`;
}

export function isKeyRole(actor: OrganizationActor) {
  return actor.primaryBucket !== "other" && matchesAnyRole(actor.titles.join(" "), RELATED_ROLE_PATTERNS);
}
