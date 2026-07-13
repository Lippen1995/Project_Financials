import { PeopleSearchClient } from "@/components/people/people-search-client";
import { getAvailableRoleTypes } from "@/server/registry/role-search-service";

export const metadata = { title: "Personer og roller" };

function readParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const searchScope = readParam(params.scope) === "roles" ? "roles" : "persons";
  const roleTypes = await getAvailableRoleTypes();
  return (
    <main className="space-y-8 pb-12">
      <section>
        <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
          Personer og roller
        </div>
        <h1 className="editorial-display mt-3 text-[2.5rem] leading-tight text-[var(--px-text)]">
          Søk etter personer og roller
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--px-muted)]">
          Finn en person og se alle rollene vedkommende har på tvers av norske selskaper, eller
          filtrer på rolletype for å finne daglige ledere, styreledere og styremedlemmer. Basert på
          Enhetsregisterets rolledata.
        </p>
      </section>

      <PeopleSearchClient
        roleTypes={roleTypes}
        initialQuery={readParam(params.query)}
        initialRoleType={readParam(params.roleType)}
        searchScope={searchScope}
      />
    </main>
  );
}
