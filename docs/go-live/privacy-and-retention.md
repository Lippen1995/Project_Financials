# Personvern- og retensjonsregister

**Status:** Krever godkjenning – dette dokumentet er ikke juridisk rådgivning

**Blokkerer:** GL-007 og port G2 inntil ansvarlig, behandlingsgrunnlag, lagring og kontaktpunkt er besluttet

## Foreløpig datakart

| Datakategori | Eksempler | Formål | Nåværende lagring / atferd | Beslutning eller tiltak før beta | Status |
| --- | --- | --- | --- | --- | --- |
| Konto og autentisering | Navn, e-post, passordhash, OAuth-konto, sesjon | Tilgang til lukket beta | Prisma/Auth.js; passord hashes med bcrypt | Behandlingsgrunnlag, kontosletting, sesjonslevetid og sikkerhetskontakt | Åpen |
| Frivillig brukerprofil | Arbeidsgiver, telefon, LinkedIn, utdanning, lokasjon og interesser | Profil og samarbeid | `UserProfile` har mange valgfrie personfelt | Dataminimer betaskjemaet; begrunn hvert felt; ikke krev unødvendige felt | Åpen |
| Workspace og samarbeid | Medlemskap, invitasjoner, kommentarer, DD-innhold | B2B-samarbeid | Lagres til raden slettes/arkiveres; helhetlig retensjon ikke definert | Retensjon ved utløpt beta, arbeidsforhold og workspace-sletting | Åpen |
| Søkehistorikk | Søkestreng, filtre, resultatantall, bruker | Historikk, kvote og produktmåling | 30 dager; daglig autentisert cleanup er implementert | Verifiser cron i produksjon og dokumenter formålet | Delvis |
| AI-bruk | Modell, tokenbruk, kildeproveniens og eventuelt søkeinnhold | Kostnad, kvote, kvalitet og sikkerhet | `AiSearchUsageEvent`; 30 dagers cleanup | Avklar hvilke prompt-/svarfelt som sendes/lagres og leverandørens databehandling | Åpen |
| Offentlige roller | Person-/virksomhetsnavn og registrert rolle | Vise offisiell selskapsinformasjon | Brreg-data normaliseres og caches | Fastsett oppdatering, retting og sletting når Brreg endrer data | Åpen |
| Årsrapport-artifacts | PDF, tekst, navn og mulige signaturer | Regnskapsuttrekk og kvalitet | Rå og avledede artifacts kan lagres lokalt/persistent | Ikke nødvendig for betaens strukturerte regnskapsløp; avgrens tilgang og fastsett retensjon | Åpen |
| Logger og monitorering | IP, user-agent, feil, request-id | Sikkerhet og drift | Avhenger av valgt K1-plattform | Minimer, rediger hemmeligheter/persondata og fastsett kort retensjon | Åpen |
| Betaling | Stripe-kunde-/abonnements-ID | Abonnement | Felter finnes; kjøpsflyt er ikke betakrav | Ikke aktiver før personvern, webhook-sikkerhet og avtale er godkjent | Utsatt |

## Beslutninger som må tas

| ID | Beslutning | Eier | Frist | Status |
| --- | --- | --- | --- | --- |
| P-01 | Navngi behandlingsansvarlig virksomhet og personvernkontakt | CEO | 21. juli | Åpen |
| P-02 | Dokumenter formål og behandlingsgrunnlag per kategori | Personvernansvarlig | 24. juli | Åpen |
| P-03 | Fastsett retensjon og slettemekanisme for konto, profil, workspace og logger | Personvern / teknisk | 24. juli | Åpen |
| P-04 | Definer prosess for innsyn, retting, eksport og sletting | Personvern / support | 24. juli | Åpen |
| P-05 | Avklar databehandlere, region og avtaler for K1-hosting, monitorering og AI | CEO / teknisk | Port G1 | Åpen |
| P-06 | Bestem om årsrapport-artifacts skal finnes i beta-produksjon | Produkt / personvern | 25. juli | Åpen |
| P-07 | Publiser personverninformasjon og AI-forbehold | Produkt / personvern | Før G2 | Åpen |

## Foreløpige sikkerhets- og minimeringsregler

- Ingen produksjonsdata, brukerdata eller hemmeligheter skal inn i repo, testfixture eller supportdokument.
- Ikke logg passord, tokens, komplette OAuth-profiler eller rå AI-prompter som standard.
- Betaen samler bare data som er nødvendig for tilgang, kjernefunksjon, sikkerhet og avtalte KPI-er.
- Tilgang til workspace-, review- og admininnhold følger minste privilegium og logges der endringen er sikkerhetsrelevant.
- Endring eller sletting i offisiell kilde skal ikke erstattes med gammel cache som om den fortsatt var gjeldende.
- Manglende juridisk beslutning gir deaktivert funksjon, ikke implisitt samtykke.

## Godkjenning

| Rolle | Person | Dato | Resultat |
| --- | --- | --- | --- |
| Behandlingsansvarlig / CEO | – | – | Ikke godkjent |
| Personvernansvarlig | – | – | Ikke godkjent |
| Teknisk eier | – | – | Ikke godkjent |
