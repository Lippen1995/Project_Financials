# GL-511: fjerning av FI-SIM-laget

**Status:** Øvd 9. august 2026 i engangsdatabase. Ikke utført.

FI-SIM er et midlertidig lag. Denne listen er øvd i sin helhet før investor-demoen, ikke skrevet i etterkant, slik at feilene ble funnet mens de var billige.

## Hva som fjernes, og hva som blir stående

| Blir fjernet | Blir stående |
|---|---|
| `SimulatedFinancialDataset`, `-Statement`, `-Line`, `-LineMapping`, `SimulatedMetricAlias` | `FinancialStatement`, `FinancialLineItem` — den rapporterte kjernen |
| `ActiveFinancialDataset`, `FinancialDatasetActivationAudit` | `FinancialDatasetRevision` og `bump_reported_financial_dataset_revision` |
| Seks simuleringsenums og sju guard-funksjoner | `live_financial_dataset_v1`, `live_financial_statements_v2`, `live_financial_line_items_v2` — samme navn, én gren |
| `server/financials/fi-sim/**` og de fem jobbene | `fjord_financial_runtime` |

`FinancialDatasetRevision` blir stående med vilje. Den versjonerer det *rapporterte* datasettet, som er det cacher, analyser og lagrede snapshots nøkler på. Å droppe den ville strippet proveniensen fra hver rapporterte rad som allerede bærer `reported:<n>`.

Live-viewene beholder navnene sine. Etter fjerningen har de nøyaktig én gren, og ingen konsument endres.

## Rekkefølge

| # | Steg | Kommando | Eier | Bevis |
|---|---|---|---|---|
| 1 | Bekreft at ingen demo er aktiv | `npm run fi-sim:activation -- --action status` | Den som kjører | Utskriften sier «rapportert» |
| 2 | Deaktiver hvis den er det | `npm run fi-sim:activation -- --action deactivate --actor <deg> --reason "GL-511"` | Den som kjører | Revisjonsloggen får en `DEACTIVATE`-rad |
| 3 | Øv hele fjerningen på nytt mot en kopi | `npm run fi-sim:rehearse-teardown` mot `gl_511_rehearsal_*` | Den som kjører | Skriptet ender med «rehearsal passed» |
| 4 | Slå av flagget i miljøet | `FJORD_FINANCIAL_SIMULATION_ENABLED=false` | Drift | Miljøvariabelen er borte fra deployen |
| 5 | Flytt `prisma/teardown/gl-511/` inn i `prisma/migrations/` med tidsstempel | — | Den som kjører | Migrasjonen er i kjeden |
| 6 | Slett FI-SIM-koden | Se «Filer som slettes» | Den som kjører | `npm run test` og `npm run build` grønne |
| 7 | Kjør migrasjonen | `npm run db:migrate:deploy` | Drift | `db:migrate:status` er ren |
| 8 | **Restart applikasjonen** | — | Drift | Se fallgruven under |
| 9 | Kjør hele testpakken og tomtilstander | `npm run test`, `npm run typecheck`, `npm run financials:check-source-access` | Den som kjører | Alt grønt, kildetilgang-gjeld 0 |
| 10 | Fjern medlemskap i `fjord_financial_simulation_admin` | `REVOKE fjord_financial_simulation_admin FROM <runtime-bruker>` | Drift | `\du` viser ikke medlemskapet |

## Fallgruven som bare en øving finner

**Applikasjonen må restartes etter steg 7.** Når et view redefineres, invaliderer Postgres alle bufrede planer som pekte på det gamle, og svarer neste spørring på samme tilkobling med `cached plan must not change result type` i stedet for å planlegge på nytt. Med en kjørende prosess ser det ut som om fjerningen ødela produktet. Det gjorde den ikke — tilkoblingspoolen må resirkuleres. Øvingsskriptet gjør det samme ved å koble ned poolen etter at SQL-en er kjørt.

## Filer som slettes

Sprengradiusen holdes liten med vilje, og `fi-sim-teardown-surface.test.ts` holder den slik: **ingen kjøretidskode importerer fra `server/financials/fi-sim/`.** Bare fem jobber gjør det.

```text
server/financials/fi-sim/**            hele katalogen: katalog, generator, mapping, aktivering
scripts/generate-fi-sim-dataset.ts
scripts/map-fi-sim-dataset.ts
scripts/manage-fi-sim-activation.ts
scripts/verify-fi-sim-foundation.ts
scripts/rehearse-gl-511-teardown.ts
prisma/teardown/gl-511/               etter at den er flyttet inn i migrations
```

Tilhørende `package.json`-skript: `fi-sim:generate`, `fi-sim:map`, `fi-sim:activation`, `fi-sim:rehearse-teardown`, `financials:verify-simulation-foundation`.

Prisma-modellene `SimulatedFinancial*`, `SimulatedMetricAlias`, `ActiveFinancialDataset` og `FinancialDatasetActivationAudit` fjernes fra `schema.prisma` sammen med de seks enumene.

## Merkingen som kan bli stående

`lib/financial-simulation-disclosure.ts` og de ti filene som bruker den overlever fjerningen uskadd: uten et simulert datasett rapporterer den alltid `simulated: false` og et null-varsel, så banneret og linjemarkøren slutter simpelthen å vises. De kan fjernes senere som ryddearbeid. Listen står i `fi-sim-teardown-surface.test.ts`.

Ett unntak må håndteres i steg 6: `server/financials/mapping/mapping-store.ts` skriver til `SimulatedMetricAlias` når datasettet er simulert. Den grenen fjernes, og `resolveActiveMappingTarget` blir konstant `{ kind: "reported" }`.

## Hva øvingen beviste

| Port | Bevis |
|---|---|
| Applikasjonen kjører uten simuleringstabeller | Øvingen slipper 20 databaseobjekter og krever deretter identisk svar fra `listCompanyStatements`, `getCompanyFinancials`, `searchCompanyUniverse` og `aggregateCompanyFinancials` |
| Ingen cache, indeks, analyse eller eksport peker på en simulert datasettversjon | 14 versjonskolonner funnet gjennom `information_schema` og sjekket; skriptet feiler også hvis den finner *null* kolonner, så sjekken kan ikke bli tom i det stille |
| Rapporterte selskaper viser samme output som før | Byte-sammenligning før og etter |
| Selskaper uten data viser ærlig tomtilstand | Et selskap uten tall er med i øvingen og gir fortsatt tom liste i rapportert modus |
| Runtime-rollen leser bare viewene | `has_table_privilege` sjekkes på nytt etter fjerningen |

Øvingen bygger et ekte datasett først — genererer, mapper, aktiverer, deaktiverer — slik at den faktisk fjerner noe.

## Det øvingen ikke dekker

- **Steg 6 er ikke øvd.** Slettingen av filene og at `npm run build` fortsatt går, er ikke kjørt; sprengradiusen er bevist ved import-inventar, ikke ved å slette.
- **Runtime-principalen må være provisjonert før steg 10.** Koden bruker `FJORD_FINANCIAL_RUNTIME_DATABASE_URL` når den er satt; er den ikke det, deler finanslesning tilkobling med resten av applikasjonen og steg 10 fjerner et medlemskap ingen har. Se åpent punkt 2 i implementasjonsplanen.
