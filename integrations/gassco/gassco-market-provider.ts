import { PetroleumEventsSyncPayload } from "@/server/services/petroleum-market-types";

export async function fetchGasscoPetroleumEvents(): Promise<PetroleumEventsSyncPayload> {
  return {
    events: [],
    availabilityMessage:
      "Gassco UMM krever i praksis en disclaimer/session-flyt som ikke er stabilt tilgjengelig for maskinell henting i denne versjonen.",
  };
}
