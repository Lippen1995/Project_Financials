# Sprint 0 – kontrollsenter for beta og go-live

**Status:** Pågår

**Sprintperiode:** 20.–26. juli 2026

**Sist oppdatert:** 20. juli 2026
**Kostnadsnivå:** K0 – ingen nye eksterne kostnader

Dette er kontrollsenteret for Sprint 0 i [go-live-planen](../go-live-sprint-plan.md). Formålet er å gjøre omfang, ansvar, risiko, datakilder, måling, personvern og kostnader etterprøvbare før sikkerhets- og releasearbeidet starter.

## Status

| ID | Leveranse | Status | Eier | Frist | Bevis |
| --- | --- | --- | --- | --- | --- |
| GL-001 | Betamål og 10–20 målbrukere | Pågår | CEO / produkt | 21. juli | Navngitt rekrutteringsansvarlig og beskrevet målgruppe i [beta-charteret](./beta-charter.md) |
| GL-002 | Låst funksjonsomfang | Pågår | Produkt | 21. juli | Godkjent inn/ut-liste i [beta-charteret](./beta-charter.md) |
| GL-003 | Teknisk eier og lanseringsmyndighet | Blokkert | CEO | 21. juli | Personnavn, stedfortreder og beslutningsfullmakt i [beta-charteret](./beta-charter.md) |
| GL-004 | Risikologg | Opprettet | Produkt / teknisk | 22. juli | Alle kritiske risikoer har navngitt person og akseptert tiltak i [risikologgen](./risk-register.md) |
| GL-005 | Datakildekart | Opprettet | Teknisk | 23. juli | Alle beta-felt har kilde, intern flyt, proveniens og mangelhåndtering i [datakildekartet](./data-source-map.md) |
| GL-006 | Beta-KPI-er | Opprettet | CEO / produkt | 23. juli | KPI-definisjoner, målepunkt og ansvar er godkjent i [KPI-registeret](./beta-kpis.md) |
| GL-007 | Personvern og datalagring | Blokkert | CEO / personvernansvarlig | 24. juli | Behandlingsgrunnlag, lagringstid, sletting og kontaktpunkt er godkjent i [personvernregisteret](./privacy-and-retention.md) |
| GL-008 | Kostnadsregister | Opprettet | CEO / teknisk | 24. juli | Leverandørvalg, enhetspris, volum, varsler og kostnadstak er dokumentert i [kostnadsregisteret](./cost-register.md) |
| GL-009 | OCR er ikke produksjonsavhengighet | Pågår | Teknisk | 25. juli | Arkitektur og backlog gjør strukturert Brreg til hovedløp; lokal/integrasjonstest beviser at betaflaten avslår OCR-/PDF-avhengige tall |

`Opprettet` betyr at registeret finnes, ikke at beslutningene i det er godkjent. Sprint 0 er ferdig først når ingen kritisk beslutning mangler navngitt person og dato.

## Daglig arbeidsrekkefølge

1. CEO fyller inn personnavn og godkjenner beta-charteret.
2. Teknisk eier lukker røde kilde- og proveniensgap, særlig GL-009.
3. Personvernansvarlig beslutter formål, behandlingsgrunnlag, lagring og sletting.
4. Produkt kobler manglende målepunkter til backlog før KPI-ene godkjennes.
5. CEO godkjenner kostnadstak, men aktiverer ingen K1- eller K2-kostnad i Sprint 0.

## Endringsregel

Endringer i betaomfang, kritiske risikoer eller kostnadsnivå føres i det relevante registeret med dato og beslutningstaker. Nye funksjoner legges ikke direkte i sprinten.
