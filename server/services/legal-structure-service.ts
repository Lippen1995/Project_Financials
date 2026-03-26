import { BrregAuthorityProvider } from "@/integrations/brreg/brreg-authority-provider";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { BrregRolesProvider } from "@/integrations/brreg/brreg-roles-provider";
import { BrregSubunitsProvider } from "@/integrations/brreg/brreg-subunits-provider";
import {
  BrregLegalEntity,
  BrregLegalStructureSnapshot,
  BrregRoleAssignment,
  BrregRoleHolder,
  BrregStructureEdge,
  BrregStructureNode,
} from "@/lib/types";

const companyProvider = new BrregCompanyProvider();
const subunitsProvider = new BrregSubunitsProvider();
const rolesProvider = new BrregRolesProvider();
const authorityProvider = new BrregAuthorityProvider();

function dedupeRoleHolders(holders: BrregRoleHolder[]) {
  const map = new Map<string, BrregRoleHolder>();
  for (const holder of holders) {
    map.set(holder.id, holder);
  }
  return Array.from(map.values());
}

function getRolePriority(roleGroup: string): "high" | "medium" | "low" {
  if (roleGroup === "MANAGEMENT" || roleGroup === "BOARD") {
    return "high";
  }

  if (roleGroup === "ADVISOR") {
    return "low";
  }

  return "medium";
}

export async function getLegalStructure(orgNumber: string): Promise<BrregLegalStructureSnapshot | null> {
  const company = await companyProvider.getCompany(orgNumber);
  if (!company) {
    return null;
  }

  const [subunits, roles, signature, procuration] = await Promise.all([
    subunitsProvider.fetchSubunits(orgNumber).catch(() => []),
    rolesProvider.getRoles(orgNumber).catch(() => []),
    authorityProvider.fetchSignatoryRules(orgNumber).catch(() => ({ rules: [], holders: [], raw: null })),
    authorityProvider.fetchProcurationRules(orgNumber).catch(() => ({ rules: [], holders: [], raw: null })),
  ]);

  const entity: BrregLegalEntity = {
    id: `entity:${company.orgNumber}`,
    orgNumber: company.orgNumber,
    name: company.name,
    entityType: "MAIN_ENTITY",
    companyForm: company.legalForm,
    status: company.status,
    registrationDate: company.registeredAt,
    foundationDate: company.foundedAt,
    parentOrgNumber:
      typeof company.rawPayload === "object" &&
      company.rawPayload &&
      "overordnetEnhet" in company.rawPayload
        ? String(company.rawPayload.overordnetEnhet)
        : null,
    parentName: null,
    address:
      [company.addresses[0]?.line1, company.addresses[0]?.postalCode, company.addresses[0]?.city]
        .filter(Boolean)
        .join(", ") || null,
    postalAddress: (() => {
      const rawPayload =
        typeof company.rawPayload === "object" && company.rawPayload ? (company.rawPayload as Record<string, unknown>) : null;
      const postal =
        rawPayload && typeof rawPayload.postadresse === "object" && rawPayload.postadresse
          ? (rawPayload.postadresse as Record<string, unknown>)
          : null;

      if (!postal) {
        return null;
      }

      return [
        Array.isArray(postal.adresse) ? postal.adresse.join(", ") : null,
        typeof postal.postnummer === "string" ? postal.postnummer : null,
        typeof postal.poststed === "string" ? postal.poststed : null,
      ]
        .filter(Boolean)
        .join(", ");
    })(),
    industryCode: company.industryCode?.code ?? null,
    industryDescription: company.industryCode?.title ?? company.industryCode?.description ?? null,
    source: "BRREG",
    rawPayload: company.rawPayload,
  };

  const roleHoldersFromRoles: BrregRoleHolder[] = roles.map((role) => ({
    id: role.organization?.orgNumber
      ? `role-company:${role.organization.orgNumber}`
      : `role-person:${role.person.sourceId}`,
    type: role.organization ? "COMPANY" : "PERSON",
    name: role.organization?.name ?? role.person.fullName,
    birthYear: role.person.birthYear ?? null,
    orgNumber: role.organization?.orgNumber ?? null,
    source: "BRREG",
  }));

  const roleHolders = dedupeRoleHolders([
    ...roleHoldersFromRoles,
    ...signature.holders,
    ...procuration.holders,
  ]);

  const roleAssignments: BrregRoleAssignment[] = roles.map((role) => ({
    id: role.sourceId,
    entityOrgNumber: orgNumber,
    roleHolderId: role.organization?.orgNumber
      ? `role-company:${role.organization.orgNumber}`
      : `role-person:${role.person.sourceId}`,
    roleType: role.title,
    roleGroup: role.isBoardRole ? "BOARD" : /daglig leder/i.test(role.title) ? "MANAGEMENT" : /revisor|regnskapsf/i.test(role.title) ? "ADVISOR" : "OTHER",
    source: "BRREG",
  }));

  const nodes: BrregStructureNode[] = [
    {
      id: `main:${entity.orgNumber}`,
      type: "main_entity",
      label: entity.name,
      metadata: {
        orgNumber: entity.orgNumber,
        companyForm: entity.companyForm,
        status: entity.status,
        roleSummary: `${roleAssignments.length} registrerte roller`,
      },
    },
    ...subunits.map((subunit) => ({
      id: `subunit:${subunit.orgNumber}`,
      type: "subunit" as const,
      label: subunit.name,
      metadata: {
        orgNumber: subunit.orgNumber,
        status: subunit.status,
        trustNote: "Registrert underenhet i Brreg",
      },
    })),
    ...roleHolders.map((holder) => ({
      id: holder.id,
      type: holder.type === "COMPANY" ? ("related_entity" as const) : ("person" as const),
      label: holder.name,
      metadata: {
        orgNumber: holder.orgNumber,
        roleSummary: roleAssignments
          .filter((assignment) => assignment.roleHolderId === holder.id)
          .map((assignment) => assignment.roleType)
          .join(", "),
      },
    })),
  ];

  const edges: BrregStructureEdge[] = [
    ...subunits.map((subunit) => ({
      id: `edge:subunit:${subunit.orgNumber}`,
      sourceNodeId: `main:${entity.orgNumber}`,
      targetNodeId: `subunit:${subunit.orgNumber}`,
      relationshipType: "HAS_SUBUNIT" as const,
      label: "Underenhet",
      priority: "high" as const,
    })),
    ...roleAssignments.map((assignment) => ({
      id: `edge:role:${assignment.id}`,
      sourceNodeId: `main:${entity.orgNumber}`,
      targetNodeId: assignment.roleHolderId,
      relationshipType: "HAS_ROLE_HOLDER" as const,
      label: assignment.roleType,
      priority: getRolePriority(assignment.roleGroup),
    })),
    ...signature.rules.map((rule) => ({
      id: `edge:signature:${rule.id}`,
      sourceNodeId: `main:${entity.orgNumber}`,
      targetNodeId: `main:${entity.orgNumber}`,
      relationshipType: "HAS_SIGNATURE_RULE" as const,
      label: rule.rawText,
      priority: "high" as const,
    })),
    ...procuration.rules.map((rule) => ({
      id: `edge:procuration:${rule.id}`,
      sourceNodeId: `main:${entity.orgNumber}`,
      targetNodeId: `main:${entity.orgNumber}`,
      relationshipType: "HAS_PROCURATION_RULE" as const,
      label: rule.rawText,
      priority: "medium" as const,
    })),
  ];

  return {
    entity,
    subunits,
    roleHolders,
    roleAssignments,
    authorityRules: [...signature.rules, ...procuration.rules],
    nodes,
    edges,
    fetchedAt: new Date(),
    availability: {
      subunits: subunits.length > 0,
      roles: roleAssignments.length > 0,
      signature: signature.rules.length > 0,
      procuration: procuration.rules.length > 0,
    },
  };
}
