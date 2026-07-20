# Risikologg for lukket beta

**Status:** Aktiv

**Skala:** Sannsynlighet og konsekvens vurderes som lav, middels eller høy.

| ID | Risiko | Sannsynlighet | Konsekvens | Rolleeier | Tiltak før beta | Utløser / bevis | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-001 | Teknisk eier og lanseringsmyndighet er ikke navngitt | Høy | Høy | CEO | Navngi eier og stedfortreder med eksplisitt fullmakt | Godkjent beta-charter innen 21. juli | Åpen |
| R-002 | Behandlingsgrunnlag, lagringstid og rettighetsprosess er ikke godkjent | Høy | Høy | CEO / personvern | Godkjenn personvernregisteret; implementer nødvendige slette- og innsynsprosesser | Skriftlig beslutning og testbevis | Åpen |
| R-003 | Eksisterende produktflate er større enn definert betakjerne | Høy | Høy | Produkt | Lag funksjonsinventar; skjul eller avslå ikke-godkjente flater | Signert omfang og staging-gjennomgang | Åpen |
| R-004 | Regnskapsvisning kan falle tilbake på PDF-/OCR-løp | Middels | Høy | Teknisk | Bruk strukturert Brreg som betaens eneste tallkilde; slå av historikk som krever OCR | Ende-til-ende-test med kilde og tomtilstand | Åpen |
| R-005 | Strukturert Brreg dekker bare siste filing og støtter ikke alle oppstillingsplaner | Høy | Middels | Produkt / data | Mål dekning; vis utilgjengelig uten retry-loop eller konstruerte tall | Datadekningsrapport og feileksempler | Åpen |
| R-006 | Njord er ikke koblet til en ekte modell og har ikke bestått evalueringsport | Høy | Høy | Produkt / teknisk | Hold Njord av; aktiver bare etter evalueringssett, verktøygrenser og kostnadstak | Sprint 3/4-bevis | Åpen |
| R-007 | Produksjonsbackup, restore, overvåking og rollback er ikke bevist | Høy | Høy | Teknisk | Velg drift etter G1; gjennomfør restore-, deploy- og rollbackøvelse | Øvelseslogg før G2 | Åpen |
| R-008 | Hemmeligheter eller adminruter kan være feilkonfigurert | Middels | Høy | Teknisk / sikkerhet | Secret-scan, ruteinventar, auth-test og rotasjonsoppskrift i Sprint 1 | Automatiske tester og kontrolliste | Åpen |
| R-009 | Faktiske drifts- og modellpriser er ikke verifisert | Høy | Middels | CEO / teknisk | Verifiser leverandørpris, volum og avgifter rett før G1; sett harde varsler og tak | Datert prisbevis og godkjent budsjett | Åpen |
| R-010 | Brreg eller SSB er tregt, utilgjengelig eller rate-limiter | Middels | Middels | Teknisk | Timeout, kontrollert feil, cache og backoff; aldri erstatte med syntetiske data | Feiløvelse i staging | Åpen |
| R-011 | Personnavn/signaturer i roller og årsrapport-artifacts lagres lenger enn nødvendig | Middels | Høy | Personvern / data | Avgrens beta til nødvendige felt; beslutning om artifact-retensjon og tilgang | Godkjent retensjon og tilgangstest | Åpen |
| R-012 | KPI-er kan ikke måles med dagens hendelsesmodell | Høy | Middels | Produkt / teknisk | Legg bare nødvendige, dataminimerte målepunkter i backlog | KPI-register viser grønt målepunkt | Åpen |

## Akseptregel

En risiko med høy konsekvens kan ikke lukkes uten bevis. Hvis risikoen ikke kan fjernes, kreves skriftlig aksept fra navngitt lanseringsmyndighet med dato, begrunnelse og utløpsdato.

## Beslutningslogg

| Dato | Risiko | Beslutning | Besluttet av | Utløper |
| --- | --- | --- | --- | --- |
| – | – | Ingen risikoaksepter registrert | – | – |
