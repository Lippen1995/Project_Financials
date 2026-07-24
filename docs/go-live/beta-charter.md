# Beta-charter

**Status:** Godkjent som del av Sprint 0-signeringen 24. juli 2026; implementasjon og G1/G2-porter gjenstår

**Mål:** Lukket beta med 12 primærbrukere og inntil 8 reservekandidater

**Måldato:** 30. september 2026 dersom omfanget under er realisert og port G2 er bestått. Planen forutsetter 70 effektive utviklingstimer per uke i minst to koordinerte arbeidsstrømmer. Dersom kapasiteten er under 60 effektive timer i to sammenhengende uker, skal CEO revidere datoen. Datoen skal ikke brukes til å redusere betaen tilbake til et selskapsoppslag.

**Styrende produktbeslutning:** [Produktposisjonering for Fjord Insight](./product-positioning.md)

## Betaløfte

Fjord Insight og Njord skal hjelpe en profesjonell bruker å gjennomføre en konkret selskaps- eller markedsanalyse med mindre manuelt arbeid og et bedre dokumentert resultat enn brukerens eksisterende kombinasjon av oppslagstjenester, Brreg, regneark, nettsøk og manuell analyse.

En enkel flyt fra søk til selskapsprofil er nødvendig, men validerer ikke betaløftet alene. Betaen skal demonstrere minst tre komplette, formålsbaserte arbeidsflyter. Alle selskaps-, person- og regnskapsfakta skal komme fra reelle, godkjente kilder. Manglende data skal vises som utilgjengelig og skal aldri erstattes av antakelser eller syntetisk innhold.

## Målgruppe og kohort

- 12 primærbrukere og inntil 8 reservekandidater blant analytikere, M&A-/corporate-development-brukere, kommersielle sourcere, innkjøps-/risikobrukere og strategibrukere med et reelt analysebehov.
- Kohorten skal samlet dekke de tre prioriterte beta-arbeidsflytene, og hver deltaker skal ha én definert analyseoppgave som kan sammenlignes med dagens metode.
- Brukerne må bidra med strukturert før-/etter-måling, vurdering av Njord og oppfølging av analyseresultatet.
- Behov som krever udokumentert historikk, komplett eierskap, regulatorisk fullstendighet eller andre datadomener uten godkjent kilde, tas ikke inn før dekningen er dokumentert.

| Arbeidsflyt / bruksmål | Primærbrukere | Merknad |
| --- | ---: | --- |
| M&A / corporate development | 4 | Skal gjennomføre M&A-screening på en reell oppgave |
| Kundesourcing | 2 | Skal definere og bruke en kommersiell målprofil |
| Leverandørvalidering | 2 | Skal sammenligne reelle leverandøralternativer |
| Strategi / konkurrent- / bransjeanalyse | 4 | Skal definere univers og dokumentere en konklusjon |

Simen Lippestad er ansvarlig for rekruttering og support. Kandidatnavn ferdigstilles før betaåpning og lagres i et godkjent tilgangsstyrt system, ikke i repoet. Inntil 8 reservekandidater kan brukes ved frafall. Baseline-metoden for spart tid besluttes i KPI-arbeidet.

## Kritisk brukerreise

> Definer formål → søk eller be Njord bygge universet → analyser og sammenlign → undersøk selskaper eller personer → dokumenter konklusjonen → lagre eller overvåk resultatet

Arbeidsflyten må bevare kriterier, kildegrunnlag, beregninger, usikkerhet og det lagrede resultatet. Et løst chat-svar eller en profilvisning regnes ikke som en fullført analyse.

## Minimumsomfang

### Arbeidsflyt 1 – M&A-screening

Definer støttede kriterier, bygg longlist fra reelle data, vis inklusjons-/eksklusjonsgrunnlag, ranger kandidater, åpne selskapsanalyse, sammenlign og lagre shortlist.

### Arbeidsflyt 2 – kunde- eller leverandørsourcing

Definer målprofil, finn og filtrer relevante selskaper, ranger etter dokumenterte signaler, gjennomfør enkel validering og lagre resultatet i en arbeidsliste.

### Arbeidsflyt 3 – konkurrent- eller bransjeanalyse

Definer bransjeunivers, sammenlign tilgjengelige nøkkeltall, identifiser trender og avvik, få en kildebasert Njord-analyse og lagre konklusjonen.

Styre- og lederrekruttering er en mulig fjerde arbeidsflyt, men er utenfor minimumsomfanget inntil person-/rollehistorikk, datakvalitet og behandlingsgrunnlag har bestått en egen port.

## Felles produktevner

| Område | Betaomfang | Utgivelsesregel |
| --- | --- | --- |
| Tilgang | Invitasjon, registrering, innlogging og tilbakekallbar tilgang | Ikke-offentlige flater krever autentisering |
| Formål og kriterier | Velg arbeidsflyt, registrer mål og bruk bare kriterier med dokumentert datadekning | Ustøttede kriterier merkes før analysen kjøres |
| Søk og universbygging | Navn, organisasjonsnummer, næring, geografi og andre filtre støttet av normaliserte reelle data | Vis kriterier, dekningsbegrensning og resultatantall |
| Selskapsanalyse | Kjerneopplysninger, roller, tilgjengelige finanser, kilder og relevante sammenligninger | Brreg er master; SSB beriker kun kodeverk |
| Sammenligning og rangering | Etterprøvbare beregninger for et avgrenset univers | Formler, perioder, manglende data og vekting er synlige |
| Arbeidslister | Longlist, shortlist eller analyseutvalg med formål, kriterier og tidspunkt | Ingen syntetiske selskaper; tilgang følger brukeren |
| Dokumentasjon | Lagret konklusjon med kilder, beregninger, antakelser og usikkerhet | Eksport kan utsettes dersom resultatet kan følges opp i beta |
| Njord | Ekte modell integrert i de tre arbeidsflytene via godkjente interne verktøy | Må bestå kvalitets-, sikkerhets- og kostnadsporter; ikke en valgfri bonusflate |
| Feature gating | Server-side tilgangskontroll basert på eksisterende abonnementsstatus | Betalingskjøp er ikke nødvendig for lukket beta |

## Njord i beta

Njord skal kunne avklare målet, velge relevante datadomener og godkjente verktøy dynamisk, foreslå støttede kriterier, bygge eller analysere et univers, forklare rangering og avvik, skille fakta fra beregning/hypotese, vise kilder og videreføre resultatet til brukerens liste eller analyseobjekt. Njord får tilgang til all normalisert Fjord Insight-data brukeren er autorisert for gjennom kontrollerte verktøy, men ikke direkte database- eller infrastrukturtillatelse. Arkitekturgrensen er låst i [ADR-0001](../adr/ADR-0001-njord-dynamic-authorized-data-access.md).

Njord er beta-kritisk, men skal holdes deaktivert dersom evaluerings- eller sikkerhetsporten ikke er bestått. I så fall kan betaen ikke erklæres som validering av det reviderte verdiforslaget; den må flyttes eller eksplisitt klassifiseres som en teknisk forbeta.

## Utenfor betaomfanget

- OCR-/PDF-avhengige tall som produksjonskrav.
- Datadomener uten reell, lovlig kilde og dokumentert normalisering/proveniens.
- Komplett nasjonal dekning, regnskapshistorikk eller konsern-/eierskapsdata før dekningen er bevist.
- Finanstilsynet-overlay før provider, datakontrakt og tomtilstand er implementert.
- Kjøp av komplett Brreg-leveranse (K2) uten separat beslutning.
- Åpen selvbetjent lansering eller offentlig markedsføring med udokumenterte løfter.
- Scenario-, sensitivitets-, nettverks- eller personanalyse utenfor godkjente arbeidsflyter.

Eksisterende funksjoner utenfor omfanget skal skjules, merkes som ikke tilgjengelige eller risikovurderes og godkjennes eksplisitt. At kode finnes gjør ikke funksjonen beta-godkjent.

## Roller og beslutningsmyndighet

| Rolle | Person | Myndighet | Stedfortreder | Frist |
| --- | --- | --- | --- | --- |
| Lanseringsmyndighet | Simen Lippestad (CEO) | Endelig go/no-go og skriftlig risikoaksept | Ikke utpekt | Navngitt 22. juli 2026 |
| Produkteier | Simen Lippestad (CEO) | Omfang, arbeidsflyter, målgruppe og KPI-er | Ikke utpekt | Navngitt 22. juli 2026 |
| Teknisk eier | Simen Lippestad (CEO) | Arkitektur, sikkerhet, release og drift | Ikke utpekt | Navngitt 22. juli 2026 |
| Dataansvarlig | Simen Lippestad (CEO) | Kildedekning, normalisering og proveniens | Ikke utpekt | Navngitt 22. juli 2026 |
| Personvernansvarlig | Simen Lippestad (CEO) | Behandlingsgrunnlag, lagring og rettigheter | Ikke utpekt | Navngitt 22. juli 2026 |
| Betarekruttering og support | Simen Lippestad (CEO) | Kohort, invitasjoner, kontaktpunkt og feedback | Ikke utpekt | Navngitt 22. juli 2026 |

Simen Lippestad dekker alle rollene som CEO. Ingen stedfortreder utpekes nå. CEO har 22. juli 2026 akseptert nøkkelpersonrisikoen frem til første betalende kunde eller 30. september 2026, avhengig av hva som kommer først. Før utløpet skal stedfortreder vurderes på nytt, og kritiske tilganger, deploy- og gjenopprettingsprosedyrer skal være dokumentert slik at ansvar kan overtas.

## Godkjenning

| Beslutning | Besluttet av | Dato | Status |
| --- | --- | --- | --- |
| Produktposisjonering og betaløfte | Simen Lippestad (CEO) | 22. juli 2026 | Godkjent |
| Tre prioriterte beta-arbeidsflyter | Simen Lippestad (CEO) | 22. juli 2026 | Retning godkjent; datadekning og gjennomførbarhet avgjøres i GL-011 |
| Målgruppe og rekrutteringsplan | Simen Lippestad (CEO) | 22. juli 2026 | Godkjent: 12 primærbrukere, inntil 8 reserver; kandidatnavn ferdigstilles før betaåpning |
| Funksjons- og dataomfang per arbeidsflyt | Simen Lippestad (CEO) | 22. juli 2026 | GL-011 teknisk lukket; dynamisk datatilgang godkjent, estimert backlog dokumentert |
| Navngitte eiere og fullmakter | Simen Lippestad | 22. juli 2026 | Godkjent; ingen stedfortreder, tidsavgrenset nøkkelpersonrisiko akseptert |
| Revidert betadato etter omfangsvurdering | Simen Lippestad (CEO) | 22. juli 2026 | Godkjent: 30. september 2026; 70 effektive timer per uke og kapasitetsutløst datorevisjon |
| Personvern-, KPI-, OCR-, risiko- og kostnadsramme | Simen Lippestad (CEO) | 24. juli 2026 | Godkjent og inkludert i samlet Sprint 0-signering |
| Samlet beta-charter og Sprint 0 | Simen Lippestad (CEO) | 24. juli 2026 | Godkjent; videre leveranse krever G1/G2 etter planen |
