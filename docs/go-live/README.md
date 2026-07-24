# Sprint 0 – kontrollsenter for beta og go-live

**Status:** Fullført og formelt godkjent av CEO 24. juli 2026

**Sprintperiode:** 20.–26. juli 2026

**Sist oppdatert:** 24. juli 2026
**Kostnadsnivå:** K0 – ingen nye eksterne kostnader; K1-ramme er godkjent, men kan først aktiveres ved G1

Dette er kontrollsenteret for Sprint 0 i [go-live-planen](../go-live-sprint-plan.md). Formålet er å gjøre produktposisjon, arbeidsflyter, omfang, ansvar, risiko, datakilder, måling, personvern og kostnader etterprøvbare før sikkerhets- og releasearbeidet starter. [Den reviderte produktposisjoneringen](./product-positioning.md) er styrende fra 22. juli 2026.

Sprint 1 ble startet 24. juli 2026 og følges i [Sprint 1-kontrollsenteret](./sprint-1/README.md).

## Status

| ID | Leveranse | Status | Eier | Frist | Bevis |
| --- | --- | --- | --- | --- | --- |
| GL-001 | Betamål og målbrukere | Lukket | Simen Lippestad (CEO) | 22. juli 2026 | 12 primærbrukere og inntil 8 reserver er fordelt per bruksmål; CEO rekrutterer kandidatene før betaåpning etter [beta-charteret](./beta-charter.md) |
| GL-002 | Låst funksjonsomfang | Lukket | Simen Lippestad (CEO / produkt) | 24. juli 2026 | Tre ende-til-ende-arbeidsflyter, Njord-rolle, felles produktevner og eksplisitt inn/ut-liste er låst i [beta-charteret](./beta-charter.md); endringer følger endringsregelen |
| GL-003 | Teknisk eier og lanseringsmyndighet | Lukket | Simen Lippestad (CEO) | 22. juli 2026 | Alle roller og fullmakter er navngitt; CEO har tidsavgrenset akseptert nøkkelpersonrisikoen i [beta-charteret](./beta-charter.md) |
| GL-004 | Risikologg | Lukket som Sprint 0-styring | Simen Lippestad (CEO) | 24. juli 2026 | Alle risikoer har navngitt eier, eksplisitt prioritet, frist/port, tiltak og beviskrav i [risikologgen](./risk-register.md); åpne risikoer følges videre i sprintene |
| GL-005 | Datakildekart | Lukket som Sprint 0-baseline | Simen Lippestad (CEO / data / teknisk) | 24. juli 2026 | [Datakildekartet](./data-source-map.md) kobler betadomener til source of truth, intern flyt, proveniens, mangelhåndtering og dokumenterte gap; faktisk dekning og ingest-bevis følges i Sprint 1–2 |
| GL-006 | Beta-KPI-er | Lukket som Sprint 0-beslutning | Simen Lippestad (CEO / produkt) | 24. juli 2026 | [KPI-registeret](./beta-kpis.md) låser nevnere, baseline, Njord-evaluering, survey, kostnad og fireukers beslutningsregel; KPI-B01–B12 dekker instrumentering og pilot |
| GL-007 | Personvern og datalagring | Lukket som Sprint 0-beslutning | Simen Lippestad (CEO / personvernansvarlig) | 24. juli 2026 | [Personvernregisteret](./privacy-and-retention.md) låser behandlingsansvarlig, grunnlag, retensjon, rettigheter, tilgang, Njord-spor, research og DPIA-port; leverandør-, DPIA- og implementasjonsbevis er G1/G2-krav |
| GL-008 | Kostnadsregister | Lukket som Sprint 0-beslutning | Simen Lippestad (CEO / budsjettansvarlig) | 24. juli 2026 | [Kostnadsregisteret](./cost-register.md) låser K0, K1-tak på NOK 5 000 eks. mva./mnd., delrammer, enhetsgrenser, varsler og hard stopp; K1-aktivering krever separat G1-godkjenning og K2 har ingen fullmakt |
| GL-009 | OCR er ikke produksjonsavhengighet | Lukket som Sprint 0-bevis | Simen Lippestad (CEO / teknisk) | 24. juli 2026 | [Bevisrapporten](./ocr-independence-evidence.md) dokumenterer sikker standard, offentlig kildeport, tomtilstand, blokkert rålinje-API, 31 regresjonstester, 10 målrettede tester, typesjekk og produksjonsbygg; faktisk deploykonfigurasjon og tom artifact-lagring er G2-krav |
| GL-010 | Produktposisjon og kritisk brukerreise | Lukket | Simen Lippestad (CEO) | 22. juli 2026 | [Produktposisjoneringen](./product-positioning.md), Njords kjernerolle og tre prioriterte arbeidsflyter er formelt godkjent; gjennomførbarhet håndteres i GL-011 |
| GL-011 | Arbeidsflyt-/datagapanalyse | Lukket | Simen Lippestad (CEO) | 22. juli 2026 | [GL-011-analysen](./workflow-data-gap-analysis.md) kartlegger kode/data; [ADR-0001](../adr/ADR-0001-njord-dynamic-authorized-data-access.md) låser arkitekturen; [estimat/backlog](./gl011-delivery-estimate.md) kobler gap til 445–660 timer og avhengigheter |
| GL-012 | Revidert dato og leveranseplan | Lukket | Simen Lippestad (CEO) | 22. juli 2026 | Lukket beta er målsatt til 30. september 2026 med 70 effektive utviklingstimer per uke, minst to arbeidsstrømmer og obligatorisk datorevisjon ved under 60 timer i to sammenhengende uker; se [estimatet](./gl011-delivery-estimate.md) |

`Opprettet` betyr at registeret finnes, ikke at beslutningene i det er godkjent. Sprint 0 er ferdig først når ingen kritisk beslutning mangler navngitt person og dato.

Samlet godkjenningsgrunnlag, CEO-signatur og avgrensningen mot senere leveranseporter finnes i [Sprint 0-signeringen](./sprint-0-signoff.md).

## Formell lukking

Simen Lippestad godkjente Sprint 0 som fullført 24. juli 2026. Alle GL-001–GL-012 er lukket som beslutning, styringsgrunnlag, planleggingsbaseline eller Sprint 0-bevis. Åpne implementeringsoppgaver og risikoporter følger Sprint 1–5, G1 og G2 og er ikke skjult av denne lukkingen.

## Vedtatt arbeidsrekkefølge videre

1. CEO/produkteier navngir beslutningstaker og godkjenner produktposisjonen som mottatt 22. juli.
2. Produkt, teknisk og data bryter de tre arbeidsflytene ned i støttede evner og dokumenterte datagap.
3. Lanseringsmyndigheten rebaseliner dato og sprintomfang etter gapanalysen.
4. CEO fyller inn personnavn og godkjenner beta-charteret.
5. Teknisk eier følger GL-009 videre til G2 med deploy-, lagrings- og tilgangsbevis.
6. Personvernansvarlig beslutter formål, behandlingsgrunnlag, lagring og sletting for analyseobjekter og Njord-spor.
7. Produkt kobler målepunktene i det reviderte KPI-registeret til backlog.
8. CEO godkjenner kostnadstak, men aktiverer ingen K1- eller K2-kostnad i Sprint 0.

## Endringsregel

Endringer i betaomfang, kritiske risikoer eller kostnadsnivå føres i det relevante registeret med dato og beslutningstaker. Nye funksjoner legges ikke direkte i sprinten.
