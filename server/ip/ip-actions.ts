"use server";

import { IPRightType, IpCaseDetailView } from "@/lib/types";
import { getIpCaseDetail } from "@/server/ip/ip-data";

type PatentstyretRightType = Exclude<IPRightType, "elCertificate">;

const ALLOWED_TYPES = new Set<PatentstyretRightType>(["patent", "trademark", "design"]);

function isPatentstyretRightType(type: IPRightType): type is PatentstyretRightType {
  return ALLOWED_TYPES.has(type as PatentstyretRightType);
}

export async function loadIpCaseDetailAction(input: {
  type: IPRightType;
  applicationNumber: string;
  orgNumber: string;
}): Promise<IpCaseDetailView | null> {
  if (!isPatentstyretRightType(input.type)) {
    return null;
  }

  const applicationNumber = input.applicationNumber.trim();
  if (!applicationNumber) {
    return null;
  }

  return getIpCaseDetail(input.type, applicationNumber, input.orgNumber);
}
