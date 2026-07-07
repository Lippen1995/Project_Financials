import { Card } from "@/components/ui/card";
import { getGroupIpListItems } from "@/server/ip/ip-data";
import { IpPortfolio } from "@/components/company/ip/ip-portfolio";

type Props = {
  orgNumber: string;
};

/**
 * Server Component: fetches the portfolio on the server (deduped + cached),
 * renders the static overview and attribution, and streams lean rows to the
 * interactive client island. No client-side data fetching, no REST route.
 */
export async function IpTab({ orgNumber }: Props) {
  const rights = await getGroupIpListItems(orgNumber);

  return (
    <div className="space-y-6">
      <IpPortfolio orgNumber={orgNumber} rights={rights} />

      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] text-sm leading-6 text-slate-600">
        <p>
          Kilde:{" "}
          <a
            href="https://data.norge.no/en/datasets/76b92ef6-9b07-336c-bd3b-c7e10b6ad72b/the-registry-for-patents-designs-and-trademarks-in-norway"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Patentstyret – Register for patenter, varemerker og design
          </a>
          . Elsertifikater hentes fra{" "}
          <a href="https://api.nve.no/doc/elsertifikater/" target="_blank" rel="noreferrer" className="underline">
            NVE sitt Elsertifikater-API
          </a>
          . Gjenbruk skjer under{" "}
          <a href="https://data.norge.no/nlod/no/2.0" target="_blank" rel="noreferrer" className="underline">
            Norsk lisens for offentlige data (NLOD) 2.0
          </a>
          .
        </p>
        <p className="mt-1">
          Patentsøknader kan være skjult i opptil 18 måneder. Designsøknader kan være skjult i opptil 6 måneder.
        </p>
      </Card>
    </div>
  );
}
