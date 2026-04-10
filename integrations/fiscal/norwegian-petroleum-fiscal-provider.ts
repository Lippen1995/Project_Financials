export type FiscalSyncPayload = {
  snapshots: Array<Record<string, unknown>>;
  availabilityMessage?: string | null;
};

export async function fetchNorwegianPetroleumFiscalSnapshots(): Promise<FiscalSyncPayload> {
  // Offentlig fiscal-data er delvis tilgjengelig, men krever fortsatt manuell kildekuratering.
  // Vi leverer derfor en ærlig ramme uten syntetiske snapshots.
  return {
    snapshots: [],
    availabilityMessage:
      "Fiscal provider er aktivert som ramme, men ingen robuste offentlig maskinlesbare snapshots er konfigurert enda.",
  };
}
