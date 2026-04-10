import { NextResponse } from "next/server";

import { IPRightType } from "@/lib/types";
import { getCompanyByReference } from "@/server/services/company-service";
import { getIPRightDetail } from "@/server/services/company-ip-service";

const allowedTypes = new Set<IPRightType>(["patent", "trademark", "design"]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; type: string; applicationNumber: string }> },
) {
  const { slug, type, applicationNumber } = await context.params;

  if (!allowedTypes.has(type as IPRightType)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const orgNumberMatch = slug.match(/\d{9}/);
  const orgNumber = orgNumberMatch?.[0] ?? (await getCompanyByReference(slug))?.orgNumber;

  if (!orgNumber) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    const detail = await getIPRightDetail(type as IPRightType, applicationNumber, orgNumber);
    if (!detail) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    return NextResponse.json({ data: detail });
  } catch {
    return NextResponse.json({ error: "Unable to load detail" }, { status: 502 });
  }
}
