# Njord offline kunnskapsgrunnlag

Njord besvarer juridiske, regnskapsfaglige og regulatoriske spørsmål med en ekte LLM som bruker
verktøy mot et lokalt, versjonert korpus. Det gjøres ingen internettsøk i brukerens spørringsflyt.

## Kildekrav

Bare dokumenter fra den eksplisitte listen over offisielle domener i
`server/knowledge/knowledge-domain.ts` kan importeres. Importen krever full provenance, juridisk
status, gyldighetsperiode, dokumentversjon og kontrolltidspunkt. En ny versjon overskriver aldri en
historisk versjon.

For EU/EØS-materiale lagres EU-rettsaktens status separat fra EØS-innlemmelse og norsk
gjennomføring, med referanse til EØS-komitébeslutning og norsk gjennomføringsregel når adapteren har
offisiell dokumentasjon. `NOT_ASSESSED` betyr manglende dekning og skal aldri tolkes som «ikke
relevant» eller «ikke gjennomført».

Planlagte kildeadaptere:

- Lovdata API: norske lover og forskrifter. Krever avklart API-avtale og viderebruksrett.
- Norsk RegnskapsStiftelse: NRS/NBS. Viderebruks- og lagringsrett må avklares før bulksynk.
- EUR-Lex/ELI: EU-rettsakter og EU-godkjent IFRS-materiale.
- EEA-Lex: EØS-relevans, innlemmelse, ikrafttredelse og tilpasninger.
- Stortingets åpne data og regjeringen.no: saker, vedtak, proposisjoner, høringer og budsjettiltak.
- Skatteetaten, Finanstilsynet og Brønnøysundregistrene: offisiell veiledning innen sine områder.

Stortingets åpne data er den første aktive adapteren. Den speiler saksmetadata og offisielle
vedtaks-/innstillingstekster, men markerer ikke en ferdigbehandlet stortingssak som gjeldende lov.

At et dokument er gratis tilgjengelig på nett er ikke i seg selv tilstrekkelig grunnlag for lokal
reproduksjon. Kildeeierens lisens og bruksvilkår skal godkjennes før en adapter aktiveres.

## Synkronisering

Det finnes ingen generisk JSON-import for kunnskapskorpuset. Hver kilde må ha en egen adapter med
runtime-validering og binding mellom kildesystem og offisielt domene. Synk en hel stortingssesjon:

```powershell
npm.cmd run knowledge:sync-stortinget -- --session 2025-2026
```

Responsen valideres før normalisering. Ugyldige statusverdier, manglende provenance, feil kombinasjon
av kildesystem og domene eller endret innhold uten ny versjonsnøkkel avvises. Synkjobben fyller aldri
databasen med demo-, seed- eller syntetisk faginnhold.

## Svarregler

- Njord skal sitere `citationId` fra verktøyresultatet.
- En modellantakelse skal aldri presenteres som gjeldende rett.
- Forslag, vedtak, ikrafttredelse, EØS-innlemmelse og norsk gjennomføring er separate statuser.
- Manglende treff betyr manglende lokal dekning, ikke at en regel ikke finnes.
- Juridiske og regnskapsfaglige svar må vise hvilken dato de gjelder for.

## Nåværende begrensning

Første versjon bruker PostgreSQL fulltekstsøk med dokument- og datofiltre. Skjemaet og verktøygrensen
er laget slik at semantisk retrieval og reranking kan legges til senere uten å endre LLM-verktøyene.
Det er ikke lastet inn noe kunnskapsinnhold automatisk; produksjonsdekning avhenger av godkjente
kildeavtaler og gjennomførte synkjobber.
