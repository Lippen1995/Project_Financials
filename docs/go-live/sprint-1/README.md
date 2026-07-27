# Sprint 1 – kontrollsenter

**Status:** Fullført og formelt godkjent av CEO 27. juli 2026

**Sprintperiode:** 24. juli–9. august 2026

**Startbeslutning:** CEO Simen Lippestad ba om umiddelbar oppstart 24. juli 2026, tre dager før opprinnelig plan.

**Kostnadsnivå:** K0 – ingen nye løpende eksterne kostnader

**Mål:** Minimum sikkerhet, et etterprøvbart analysefundament og en repeterbar releaseprosess før K1 kan vurderes.

## Status

| ID | Leveranse | Status | Eier | Bevis / neste port |
| --- | --- | --- | --- | --- |
| GL-101 | Hemmeligheter og nøkler | Teknisk lukket | Simen Lippestad | `.env` er ignorert. Alle 1 494 Git-sporede filer fullskannes strømmet; private miljøfiler og kjente nøkkelformater blokkeres. To sporede HAR-filer med lokale Auth.js callback-/CSRF-cookieverdier er fjernet, og HAR-output ignoreres. Faktiske produksjonshemmeligheter opprettes først ved G1. |
| GL-102 | Avhengighetskontroll | Teknisk lukket | Simen Lippestad | Første leveranse gikk fra 23 funn til 0. Den nye `brace-expansion`-advisoryen 25. juli ble lukket uten hovedversjonsløft: sårbare legacy-konsumenter rutes gjennom en lokal CommonJS-kompatibilitetsadapter til den offisielt patchede `brace-expansion@5.0.8`. Ren `npm ci`, kompatibilitetstest, lint og `npm audit --audit-level=high` er grønne med 0 funn. |
| GL-103 | Tilgangskontroll | Teknisk lukket | Simen Lippestad | Alle 56 `app/api/admin`-ruter bruker `requireAdmin` eller `requireFinancialReviewer`, som verifiserer rollen i databasen. Alle 12 interne ruter bruker reviewer-rolle eller tjenestehemmelighet. Den skrivende company-exposure-ruten krever nå administrator. Produksjon feiler lukket uten `AUTH_SECRET` og gyldig kanonisk auth-origin. |
| GL-104 | Inputvalidering | Teknisk lukket | Simen Lippestad | Den automatiske porten inventerer 136 API-rutefiler: 80 muterende og 91 med GET (noen filer har begge), med 61 body-, 71 path- og 51 query-flater uten manglende valideringsbevis. Aksjonærregister-import krever autorisert administrator, CSV MIME/filnavn, deklarert og faktisk størrelsesgrense samt eksakt Skatteetaten-headerkontrakt. Direkte organisasjonsnummerfelt bruker én MOD11-kontrakt. |
| GL-105 | Misbruksvern | K0 teknisk lukket | Simen Lippestad | Prosesslokal rate limiting: credentials 10/15 min per IP+e-post, LinkedIn 20/15 min per identitet, primærsøk 60/min og forslag 120/min per IP, Njord søk 10/5 min per bruker, Njord distress 30/min per bruker. Delt lager er obligatorisk før mer enn én appinstans. |
| GL-106 | Nettlesersikkerhet | K0 teknisk lukket | Simen Lippestad | En håndhevet CSP er testet mot produksjonsbygget, Next.js-runtime, login, søk/Njord-flaten og kartet med begge eksterne tilekilder. Auth.js krever sikre cookies og en eksplisitt kanonisk HTTPS-origin i produksjon; produksjonsresponsen viser `__Host`/`__Secure`, `HttpOnly`, `Secure` og `SameSite=Lax`. HSTS og øvrige globale hoder er aktive, og `X-Powered-By` er fjernet. Faktisk TLS, HTTP-redirect og trygg `Host`-header verifiseres på valgt host ved G1. |
| GL-107 | Databaseendringer | Teknisk lukket | Simen Lippestad | 37 versjonerte migrasjoner passerer fra tom database og fra full legacy-kopi. Legacy-rehearsal og lokal adopsjon bevarte 6 729 616 registry-rader, ga 0 ugyldige proveniensrader og tom schema-diff mot clean replay. `db push` er ikke del av releasebanen. |
| GL-108 | Releaseoppskrift | K0 teknisk lukket | Simen Lippestad | [Release- og rollbackoppskriften](./release-and-rollback.md) dekker lokal port, migrasjon, engangsadopsjon, deploy, smoke og rollback. Leverandørspesifikke backup-/restore-/deploykommandoer kan først fylles inn når host velges ved G1. |
| GL-109 | Automatiske porter | Teknisk lukket | Simen Lippestad | Releasekandidat `50c39f3dcd34bc3563ae151123295b315aae48fb` passerte ren installasjon, full filskann, API-inventar, audit, Prisma-generering, typekontroll, full Vitest-suite (1 879 bestått, 12 hoppet over), lint uten feil, produksjonsbygg og migrasjonsreplay i begge starttilstander. |

Fullt beslutningsgrunnlag og eksplisitte restvilkår står i [closeout-review.md](./closeout-review.md).

## Beslutninger tatt ved oppstart

1. Sårbare pakker oppgraderes innen kompatible hovedversjoner; ingen kritiske advisories aksepteres.
2. Den sårbare og urettede `xlsx`-pakken fjernes. SODIR-kildelenken beholdes, mens arkfaner er ærlig utilgjengelige.
3. Produksjonsskjema endres kun gjennom versjonerte migrasjoner.
4. Rate limiting lagrer kun hash av limiter-identiteten, ikke rå e-postadresse eller IP i lageret.
5. CSP aktiveres først etter test mot innlogging, kart, Next.js-runtime og Njord. Den statiske beta-policyen er nå håndhevet; en nonce-policy vurderes senere hvis kravet forsvarer at alle sider gjøres dynamiske.
6. `unsafe-inline` og brede HTTPS-bilder er en eksplisitt gjenværende CSP-risiko. Den må enten fjernes med nonce/bildeproxy eller godkjennes som tidsavgrenset risiko før offentlig beta.

## Vedtatte vilkår og G1-porter

- Sprint 1 er teknisk lukket på K0. Godkjenningen åpner ikke offentlig beta og aktiverer ingen K1-kostnad.
- Host-spesifikk releaseappendiks og nettverksbevis flyttes til G1.
- G1 må verifisere backup/restore, TLS, tvungen HTTP-til-HTTPS og avvisning av ukjent `Host` på valgt host.
- Deploytopologien må være én appinstans inntil limiteren har delt atomisk lager.
- CSP-restrisikoen (`unsafe-inline` og bred `img-src https:`) må reduseres eller tidsavgrenset risikoaksepteres før offentlig beta.

## Godkjenningsregel

Sprint 1 kan først lukkes når:

- alle GL-101–GL-109 enten er lukket med bevis eller har en eksplisitt CEO-godkjent risikoaksept;
- full CI-lik port er grønn fra en ren installasjon;
- en annen utvikler kan følge releaseoppskriften uten muntlige spesialinstruksjoner;
- ingen K1-kostnad er aktivert uten separat G1-beslutning.

Kriteriene ble vurdert som oppfylt av Simen Lippestad (CEO) 27. juli 2026.
Godkjenningen og avgrensningen mot G1 er registrert i
[closeout-review.md](./closeout-review.md).
