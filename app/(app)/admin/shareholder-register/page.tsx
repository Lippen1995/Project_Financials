import { redirect } from "next/navigation";

import ShareholderRegisterAdminClient from "@/app/(app)/admin/shareholder-register/ShareholderRegisterAdminClient";
import { getAdminUserOrNull } from "@/lib/admin-auth";
import { getShareholderRegisterImportSummaries } from "@/server/shareholdings/shareholder-register-repository";

export default async function ShareholderRegisterAdminPage() {
  const admin = await getAdminUserOrNull();
  if (!admin) {
    redirect("/admin");
  }

  const imports = await getShareholderRegisterImportSummaries();
  return <ShareholderRegisterAdminClient initialImports={imports} />;
}
