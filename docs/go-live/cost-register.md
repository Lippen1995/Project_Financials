# Kostnadsregister for beta

**Status:** Opprettet, priser og leverandører ikke godkjent

**Regel:** Sprint 0 er K0. Ingen ny ekstern kostnad kan aktiveres før port G1.

## Rammer

- K0: ingen nye eksterne kostnader; lokalt arbeid og åpne kilder.
- K1: foreløpig ramme i go-live-planen er USD 35–60 per måned for drift og normalt USD 25, maksimalt USD 50 per måned for AI. Beløpene er ikke verifiserte tilbud.
- K2: komplett betalt Brreg-leveranse behandles separat. Arbeidsestimatet på NOK 480 000 per år er ikke en gyldig kjøpspris før det er verifisert skriftlig.
- Et estimat uten leverandørkilde, dato, volum og avgifter kan ikke godkjennes i G1.

## Register

| ID | Kategori | Behov i beta | Leverandør | Prismodell / volumdriver | Foreløpig tak | Pris verifisert | Eier | Beslutningsport |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-01 | Webhosting / compute | Next.js, cron og helsecheck 24/7 | Ikke valgt | Kjøretid, requests, funksjonsvarighet | Del av USD 60/mnd drift | Nei | Teknisk | G1 |
| C-02 | PostgreSQL | Separat staging og produksjon, backup/restore | Ikke valgt | Lagring, compute, connections og backup | Del av USD 60/mnd drift | Nei | Teknisk | G1 |
| C-03 | Artifact-/objektlagring | Bare hvis nødvendige produksjons-artifacts godkjennes | Ikke valgt | GB lagret, requests og egress | Ikke satt | Nei | Teknisk / personvern | G1 |
| C-04 | Overvåking og feilsporing | Uptime, feilrate, responstid og varsler | Ikke valgt | Events, hosts og retensjon | Del av USD 60/mnd drift | Nei | Teknisk | G1 |
| C-05 | Transaksjonell e-post | Invitasjon, auth og support dersom nødvendig | Ikke valgt | Sendte e-poster | Ikke satt | Nei | Produkt / teknisk | G1 |
| C-06 | Domene og DNS | Stabil beta-URL og TLS | Ikke valgt | Årsavgift / sone | Ikke satt | Nei | CEO | G1 |
| C-07 | Njord / AI | Ekte modell etter bestått evaluering | Ikke valgt | Input-, cache- og outputtokens | USD 50/mnd hardt maksimum | Nei | Produkt / teknisk | G1 |
| C-08 | Betaling | Ikke nødvendig for lukket beta | Stripe-integrasjon finnes | Transaksjoner og eventuelle tillegg | USD 0 i beta | Ikke relevant | CEO / produkt | Utsatt |
| C-09 | Åpne Brreg-/SSB-kilder | Søk, profiler, roller, klassifikasjon og strukturert regnskap | Brreg / SSB | Åpen API-bruk innen vilkår og grenser | USD 0 i nye avgifter | API-vilkår må bekreftes | Teknisk | Sprint 0/1 |
| C-10 | Komplett Brreg-regnskap | Ikke nødvendig for K0/K1-beta | Brreg | Årlig leveranse | Ingen fullmakt | Nei | CEO | Separat K2 |

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
| – | Alle K1/K2 | Åpen: ingen kostnadsfullmakt er registrert | – |
