import env from "@/lib/env";
import { mapBrregRole } from "@/integrations/brreg/mappers";
import { fetchJson } from "@/integrations/http";
import { RolesProvider } from "@/integrations/provider-interface";

type BrregRolesResponse = {
  roller?: {
    rollegrupper?: Array<{
      roller?: any[];
    }>;
  };
};

export class BrregRolesProvider implements RolesProvider {
  async getRoles(orgNumber: string) {
    try {
      const response = await fetchJson<BrregRolesResponse>(
        `${env.brregRolesBaseUrl}/enheter/${orgNumber}/roller`,
      );

      return (
        response.roller?.rollegrupper?.flatMap((group) =>
          (group.roller ?? []).map((role) => mapBrregRole(role, orgNumber)),
        ) ?? []
      );
    } catch {
      return [];
    }
  }
}
