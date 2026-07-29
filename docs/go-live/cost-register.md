# Kostnadsregister for beta

**Status:** Sprint 0-ramme godkjent; leverandørvalg og aktivering gjenstår til G1

**Regel:** Sprint 0 er K0. Ingen ny ekstern kostnad kan aktiveres før port G1.

## Rammer

- K0: ingen nye eksterne kostnader; lokalt arbeid og åpne kilder.
- K1: maksimalt NOK 5 000 eks. mva. per måned. Delrammer er NOK 2 500 for AI, NOK 2 000 for drift/database og NOK 500 for e-post/overvåking. Ubrukte delrammer kan ikke flyttes uten CEO-beslutning.
- K2: komplett betalt Brreg-leveranse behandles separat. Arbeidsestimatet på NOK 480 000 per år er ikke en gyldig kjøpspris før det er verifisert skriftlig.
- Et estimat uten leverandørkilde, dato, volum og avgifter kan ikke godkjennes i G1.
- Utviklingsinnsats føres separat i timer og inngår ikke i K1.
- Ingen K1-kostnad er aktivert gjennom Sprint 0-godkjenningen.

## Kostnadskontroller

- Varsler skal utløses ved 50, 75 og 90 prosent av totalrammen og relevante delrammer.
- Leverandørens harde stopp eller Fjord Insights dokumenterte nødstopp skal tre i kraft ved 100 prosent.
- Kontrollgrense per aktiv bruker er NOK 400 eks. mva. per måned.
- Kontrollgrense per fullført analyse er NOK 125 eks. mva.
- En kontrollgrense er en gjennomgangsutløser, ikke tillatelse til å overstige total- eller delrammen.
- Kostnad per aktiv bruker og fullført analyse beregnes etter definisjonene i [KPI-registeret](./beta-kpis.md).
- CEO må godkjenne leverandør, avtale, personvernunderlag, datert pris og teknisk kostnadskontroll ved G1 før aktivering.

## Register

| ID | Kategori | Behov i beta | Leverandør | Prismodell / volumdriver | Foreløpig tak | Pris verifisert | Eier | Beslutningsport |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-01 | Webhosting / compute | Next.js, cron og helsecheck 24/7 | Ikke valgt | Kjøretid, requests, funksjonsvarighet | Del av NOK 2 000/mnd drift/database | Nei | Simen Lippestad | G1 |
| C-02 | PostgreSQL | Separat staging og produksjon, backup/restore | Ikke valgt | Lagring, compute, connections og backup | Del av NOK 2 000/mnd drift/database | Nei | Simen Lippestad | G1 |
| C-03 | Artifact-/objektlagring | Ingen PDF-/OCR-artifacts i beta-produksjon; bare andre godkjente produksjons-artifacts ved dokumentert behov | Ikke valgt | GB lagret, requests og egress | Del av NOK 2 000/mnd dersom godkjent | Nei | Simen Lippestad | G1 |
| C-04 | Overvåking og feilsporing | Uptime, feilrate, responstid og varsler | Ikke valgt | Events, hosts og retensjon | Del av NOK 500/mnd e-post/overvåking | Nei | Simen Lippestad | G1 |
| C-05 | Transaksjonell e-post | Invitasjon, auth og support dersom nødvendig | Ikke valgt | Sendte e-poster | Del av NOK 500/mnd e-post/overvåking | Nei | Simen Lippestad | G1 |
| C-06 | Domene og DNS | Stabil beta-URL og TLS | Ikke valgt | Årsavgift / sone | Del av NOK 2 000/mnd drift/database, periodisert | Nei | Simen Lippestad | G1 |
| C-07 | Njord / AI | Ekte modell etter bestått evaluering | OpenAI er kandidat; Terra primær kandidat og Sol kvalitetsutfordrer | Input-, cache- og outputtokens, verktøy, feil og retries | Foreslått NOK 350 evaltak innen NOK 2 500/mnd hardt maksimum | Kandidatpriser kontrollert 29. juli 2026; må revalideres ved aktivering | Simen Lippestad | G1 |
| C-08 | Betaling | Ikke nødvendig for lukket beta | Stripe-integrasjon finnes | Transaksjoner og eventuelle tillegg | NOK 0 i beta | Ikke relevant | Simen Lippestad | Utsatt |
| C-09 | Åpne Brreg-/SSB-kilder | Søk, profiler, roller, klassifikasjon og strukturert regnskap | Brreg / SSB | Åpen API-bruk innen vilkår og grenser | NOK 0 i nye avgifter | API-vilkår må bekreftes | Simen Lippestad | Sprint 1 |
| C-10 | Komplett Brreg-regnskap | Ikke nødvendig for K0/K1-beta | Brreg | Årlig leveranse | Ingen fullmakt | Nei | Simen Lippestad | Separat K2 |

## Krav til G1-underlaget

For hvert aktivt K1-element skal registeret suppleres med:

- valgt leverandør og produktnivå;
- datert lenke eller skriftlig pristilbud;
- inkludert volum, forventet volum og verstefall;
- valuta, MVA/avgifter og om årsbetaling kreves;
- varsel ved 50, 75 og 90 prosent av taket;
- hardt tak eller dokumentert nødprosedyre der leverandøren ikke støtter det;
- kostnad per aktiv betabruker og per Njord-samtale;
- eier for faktura, kostnadsalarm og avvik.

## Beslutningslogg

| Dato | Kostnad | Beslutning | Besluttet av |
| --- | --- | --- | --- |
| 24. juli 2026 | K0 | Ingen nye eksterne kostnader kan aktiveres før G1. | Simen Lippestad (CEO) |
| 24. juli 2026 | K1 | Månedstak NOK 5 000 eks. mva.: AI NOK 2 500, drift/database NOK 2 000 og e-post/overvåking NOK 500. Varsler 50/75/90 prosent og hard stopp ved 100 prosent. Kontrollgrenser NOK 400 per aktiv bruker/måned og NOK 125 per fullført analyse. Aktivering krever ny CEO-godkjenning ved G1. | Simen Lippestad (CEO) |
| 24. juli 2026 | K2 | Ingen kjøpsfullmakt. Komplett betalt Brreg-leveranse krever separat CEO-/styrebeslutning og verifisert tilbud. | Simen Lippestad (CEO) |
| 29. juli 2026 | C-07 beslutningsunderlag | [AI-delunderlaget til G1](./sprint-3/g1-ai-decision-pack.md) anbefaler Terra som primær kandidat, Sol som kvalitetsutfordrer, 15 prosent valutabuffer og en separat evalueringsramme på NOK 350. Foreslått G1-A/G1-B er ikke en godkjent endring av porten. Dette er en anbefaling, ikke en godkjenning eller aktivering. | Avventer CEO |
