import type { Route } from "next";
import { permanentRedirect } from "next/navigation";

/**
 * The screener and the overview merged into the single distress module at /distress. Existing links
 * and bookmarks carry their filters across; sort keys from the old screener have no equivalent in
 * the module and are dropped rather than silently reinterpreted.
 */
export default async function DistressSearchRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  const params_ = new URLSearchParams();

  const carryOver: Record<string, string> = {
    status: "status",
    sectorCode: "sectorCode",
    query: "query",
  };

  for (const [from, to] of Object.entries(carryOver)) {
    const value = query[from];
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === "string" && single.trim()) {
      params_.set(to, single.trim());
    }
  }

  const queryString = params_.toString();
  permanentRedirect(`/workspaces/${workspaceId}/distress${queryString ? `?${queryString}` : ""}` as Route);
}
