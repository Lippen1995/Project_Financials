# GL-011 – arbeidsflyt-, kode- og datagapanalyse

**Status:** Teknisk analyse og planleggingsgrunnlag godkjent av CEO 22. juli 2026

**Dato:** 22. juli 2026

**Ansvarlig:** Simen Lippestad (CEO / produkt / teknisk / data)

**Omfang:** M&A-screening, kunde-/leverandørsourcing og konkurrent-/bransjeanalyse

## Konklusjon

Ingen av de tre godkjente beta-arbeidsflytene kan i dag gjennomføres komplett fra formål til lagret resultat uten manuelle sprang. Repoet har reelle og delvis godt testede byggeklosser, men mangler det sammenbindende analyselaget.

De viktigste eksisterende byggeklossene er:

- lokalt Brreg-registerspeil med selskaps-, nærings- og geografisøk;
- selskapsprofil med roller, publiserte regnskap, eierskap, kunngjøringer og dokumenter;
- workspace, watchlist, industriovervåkning, grupper og monitorer;
- distress-screening med deterministiske finansielle indikatorer;
- eierskaps- og konserngraf når aksjonærdata finnes;
- Njord-agent med modelladapter, verktøyregister, tilgangskontroll og enkelte deterministiske finansverktøy;
- en vertikal petroleumsløsning med markedsdata og aggregering.

Følgende felles kjerne mangler:

1. et serverlagret analyseobjekt;
2. en versjonert univers-/screeningtjeneste som brukes av både UI og Njord;
3. deterministisk flerkriteriefiltrering, sammenligning og rangering;
4. arbeidslister med formål, kriterier, inklusjonsgrunn og batchlagring;
5. generell bransjeaggregering;
6. varig Njord-kontekst og lagret analyseforløp;
7. kilde- og beregningsspor i Njords sluttresultat;
8. ende-til-ende-tester av de tre arbeidsflytene.

## Nåværende arkitektur

```text
Brreg-registerspeil ──→ standardsøk ──→ midlertidig treffsett ──→ selskapsprofil
       │                                      │                       │
       ├── SSB næring/geografi                ├── enkel sortering     ├── regnskap
       └── siste publiserte finanser           └── Njord-rader         ├── roller/eierskap
                                                                       └── kunngjøringer

Workspace ──→ watchlist / grupper / monitorer / distress

Njord ──→ enkeltforespørsel ──→ godkjente verktøy ──→ tekst + midlertidige selskapsrader

Mangler: formål ─→ kriterier ─→ versjonert univers ─→ beregning ─→ konklusjon ─→ lagret resultat
```

## Kapasitetsstatus

| Kapasitet | Status | Bevis og begrensning |
| --- | --- | --- |
| Selskapsmaster og grunnsøk | Støttet | `RegistryEntity` brukes i [entity-search-service.ts](../../server/registry/entity-search-service.ts); filtrerer navn/org.nr., næring, kommune/poststed, organisasjonsform og status |
| Næring og geografi | Støttet | Brreg-kode berikes av SSB i [ssb-industry-code-provider.ts](../../integrations/ssb/ssb-industry-code-provider.ts); geografi er registrert adresse, ikke operasjonell eksponering |
| Finansielle profilverdier | Delvis | Siste strukturerte Brreg-regnskap er OCR-uavhengig; historikk avhenger av PDF-/ekstraksjonsløpet i [structured-financials-service.ts](../../server/services/structured-financials-service.ts) og [annual-report-financials-service.ts](../../server/services/annual-report-financials-service.ts) |
| Finansiell universscreening | Mangler | `SearchFilters` i [types.ts](../../lib/types.ts) har ingen terskler for omsetning, EBIT, vekst, margin eller eiendeler; verdier legges på etter kandidatsøket |
| Eierskap og konsern | Delvis | Aksjonærregister og `OwnershipEdge` støtter årsbasert graf når data er importert; ingen regel for «stor industriell eier» |
| Roller og personer | Delvis | Nåværende og avregistrerte roller kan søkes; pålitelig tidsfestet karrierehistorikk mangler |
| Watchlist/arbeidsliste | Delvis | `WorkspaceWatch`, grupper og monitorer lagrer selskaper/queries; ingen analyseformål, kriterieversjon, longlist/shortlist-type eller serverlagret rekkefølge |
| Selskapsammenligning | Delvis | Watchlist viser flere selskapers nøkkeltall; ingen dedikert sammenligningsmodell, felles periodevalg eller dekningsspor |
| Bransjeaggregering | Mangler generelt | Distress og petroleum har egne aggregater; ingen generell tjeneste for vekst, margin, konsentrasjon eller vinnere/tapere |
| Njord-verktøy og gating | Støttet som fundament | Modelladapter, eksplisitt verktøyregister, Premium/DD-gating og kvoter finnes i [agent-loop.ts](../../server/ai-search/agent/agent-loop.ts) og [tools/index.ts](../../server/ai-search/tools/index.ts) |
| Njord-samtalekontekst | Mangler | [ai-search-panel.tsx](../../components/search/ai-search-panel.tsx) sender bare gjeldende spørsmål; tidligere meldinger finnes bare i React-state |
| Njord-proveniens i sluttresultat | Mangler | Kunnskapssitater valideres, men selskaps-/tallpåstander vises uten komplett kilde- og beregningsspor |
| Analyse-/konklusjonslagring | Mangler | Prisma har ingen generell analysemodell; DD-konklusjon er knyttet til ett primærselskap og Njord er ikke integrert |

## Arbeidsflyt 1 – M&A-screening

| Steg | Status | Gap |
| --- | --- | --- |
| Definer kriterier | Delvis | Fritekst og grunnfiltre finnes; eksakte finans-, vekst- og eierkriterier mangler |
| Bygg univers | Delvis | Næring/geografi fungerer, men søket er kandidatsøk og ikke reproduserbar full universspørring |
| Filtrer | Mangler | Ingen samlet filtrering på omsetning, EBIT, vekst, margin, ansatte og eier |
| Ranger | Delvis | Kolonnesortering og modellvurdering finnes; ingen versjonert M&A-score eller manglende-data-policy |
| Analyser selskap | Støttet/delvis | Profilen er sterk, men datadekningen varierer og analysekonteksten følger ikke med |
| Sammenlign | Delvis | Watchlist gir enkel tabell; ingen deterministisk side-ved-side-analyse |
| Lagre longlist/shortlist | Mangler som arbeidsflyt | Bokmerking finnes, men ikke formålsbasert longlist/shortlist med kriteriespor |

**Status:** Ikke beta-klar.

## Arbeidsflyt 2 – kunde-/leverandørsourcing

| Steg | Status | Gap |
| --- | --- | --- |
| Definer målprofil | Delvis | Grunnfiltre/fritext finnes; målprofil kan ikke lagres og videreføres |
| Finn selskaper | Støttet/delvis | Register, næring og geografi er sterke; aktivitetssøk kan bruke nettsidekorpus som ikke er source of truth |
| Filtrer/ranger | Delvis | Monitorer har ansatte/omsetning; ingen generell attraktivitet, investeringskapasitet eller risikoscore |
| Valider | Delvis | Profil, roller, finanser, distress og eierskap finnes med varierende dekning |
| Lagre arbeidsliste | Delvis | Watchlist kan brukes som bokmerkeliste, men mangler målprofil, kriteriespor, notater og batchlagring |

**Status:** Ikke beta-klar, men nærmest en komplett første arbeidsflyt.

## Arbeidsflyt 3 – konkurrent-/bransjeanalyse

| Steg | Status | Gap |
| --- | --- | --- |
| Definer univers | Delvis | Næringskode/geografi finnes; universet kan ikke lagres og reproduseres |
| Sammenlign nøkkeltall | Delvis | Selskapsverdier finnes; ingen generell peer-tabell med felles periode og dekningsregler |
| Identifiser trend/avvik | Mangler generelt | Historikk er ikke OCR-uavhengig og ingen generell trend-/percentiltjeneste finnes |
| Aggreger bransje | Mangler generelt | Ingen omsetning, margin, konsentrasjon eller geografisk aggregat utenfor spesialmoduler |
| Få Njord-analyse | Delvis | Njord kan hente enkeltdossierer, men mangler komplett univers, varig kontekst og kildevisning |
| Lagre konklusjon | Mangler | Ingen generell analyse-/konklusjonsmodell |

**Status:** Ikke beta-klar. Petroleum er nærmere teknisk, men er for sektorspesifikt til å validere den generelle produktposisjonen alene.

## Databegrensninger som må styre betaen

1. Siste strukturerte Brreg-regnskap kan brukes uten OCR. Flerårig historikk kan ikke være et absolutt betakrav før en godkjent historisk kilde og dekning er dokumentert.
2. Eierskap og konsern kan brukes når relevant aksjonærår finnes. Manglende år skal gi «ikke tilgjengelig», ikke eksklusjon eller negativ score.
3. «Stor industriell eier» har ingen implementert eller godkjent klassifikasjon.
4. Rolledata støtter søk og nåværende/avregistrerte roller, men ikke sikre påstander om tidsfestet CFO-/ledererfaring.
5. `CompanyWebProfile` og generell nyhetsinnhenting kan gi hypoteser og discovery, men kan ikke overstyre offisielle selskapsfakta eller alene avgjøre inklusjon i betauniverset.
6. Petroleumskilder gir verdifull vertikal dekning, men representerer ikke generell norsk bransjedekning.

## Proveniensgap

Kjerneobjektene `Company`, `Address`, `IndustryCode`, `Person`, `Role`, `FinancialStatement` og aksjonærregisterrader har god proveniens. Følgende må normaliseres eller eksplisitt dokumenteres før de brukes som analysegrunnlag:

- `RegistryEntity`, `RegistryPerson` og `RegistryRoleAssignment` har snapshot-tid, men ikke hele femfeltskontrakten;
- `OwnershipEdge` mangler direkte spor til kildeimporten;
- `NewsArticle`, `CompanyEvent` og deler av dokumentmodellen følger ikke den samme eksplisitte provenienskontrakten.

## Njord-gap

Njord er teknisk solid for en enkelt avgrenset forespørsel, men ikke ennå en flertrinns digital analytiker:

- ingen serverlagret samtale eller analyse;
- hvert spørsmål mangler tidligere mål, kriterier og utvalg;
- UI og Njord bruker ikke én felles univers-/screeningkontrakt;
- 16 verktøykall er utilstrekkelig til å profilere en større longlist uten batchverktøy;
- rangering er delvis modellbasert og ikke fullt reproduserbar;
- sluttresultatet viser ikke komplett selskaps-/tallproveniens;
- evalueringssett, ekte modelltest, rate limit, dagstak og NOK-kostnadstak mangler.

## Testbevis

Hovedgjennomgangen kjørte 11 relevante testfiler med 67 tester. Alle besto. Testene dekker blant annet søk, sortering, distress-beregning, eierskapsstruktur, Njord-agentløkken og enkelte Njord-verktøy. Parallelle, overlappende kontrollkjøringer av data- og Njord-modulene besto også.

Følgende er fortsatt ubevist:

- komplett registerfilteradferd over et reelt univers;
- publisering og lesing av strukturert regnskap ende-til-ende;
- watchlist/grupper/monitorer som samlet arbeidsflyt;
- ekte modell og Njord-kvalitet;
- noen av de tre beta-arbeidsflytene ende-til-ende;
- provenienskontrakten på tvers av alle eksterne og avledede records.

## Kodehelse og hotspots

| Område | Vurdering | Hovedrisiko |
| --- | ---: | --- |
| Njord/AI-kjerne | 6,8/10 | God kontrakt/testbarhet, men sentral agent-loop og enrichment har stor funksjonell blast radius |
| Frontend for arbeidsflyter | 4,4/10 | Store komponenter og ingen felles analysetilstand eller ende-til-ende-tester |
| Data-/servicelag | Omtrent 5/10 | Sterke domeneprimitiver, men screening er fragmentert og flere tjenester er svært store |

Sentrale hotspots er `workspace-collaboration-service.ts` (1 758 linjer), `distress-analysis-service.ts` (1 491 linjer), `watchlist-view.tsx` (1 313 linjer), selskapsprofilen og den over 3 300 linjer lange annual-report-servicen. De har få eller ingen direkte arbeidsflyttester.

## Minimum ny implementering før reell beta

1. `Analysis`/analyseobjekt med formål, kriterier, status, univers, kildegrunnlag, konklusjon og oppfølging.
2. Felles `CompanyUniverseQuery` med offisielt registergrunnlag, numeric filters, dekningsflagg og versjonering.
3. Deterministiske beregnings-/rangeringstjenester per arbeidsflyt; Njord forklarer resultatet, men eier ikke tallgrunnlaget.
4. Arbeidslister med longlist/shortlist/sourcing-/peer-type, batchlagring og inklusjonsgrunn.
5. Sammenligningsread-model med felles periode, manglende-data-policy og kildevisning.
6. Minimumsaggregater for bransjeanalyse.
7. Njord-samtale-/analysekontekst, batchverktøy og faktaproveniens i UI.
8. Evalueringssett og ende-til-ende-tester for hver arbeidsflyt.
9. Proveniensretting for registerspeil og avledede data som inngår i betaresultater.

## CEO-beslutning – dynamisk datatilgang

Simen Lippestad har 22. juli 2026 besluttet at Njord ikke skal begrenses til en fast feltliste per arbeidsflyt. LLM-en skal velge hvilke datadomener og analyseverktøy som er relevante for oppgaven, basert på sin kunnskap og brukerens mål.

Beslutningen er avgrenset slik:

- Njord får dynamisk tilgang til all normalisert Fjord Insight-data brukeren er autorisert for, gjennom godkjente interne verktøy;
- LLM-en får ikke direkte database-, filsystem-, nettverks- eller hemmelighetstilgang;
- verktøylaget håndhever tilgang, datakvalitet, deterministiske beregninger, resultatgrenser og proveniens;
- alle valgte kriterier, kilder, beregninger og hypoteser skal lagres og vises;
- manglende data forblir nullable og skal ikke automatisk gi negativ rangering;
- alle tre arbeidsflytene skal ende i et lagret, kildebasert resultat.

Beslutningen er dokumentert i [ADR-0001](../adr/ADR-0001-njord-dynamic-authorized-data-access.md). Den erstatter anbefalingen om en fast feltavgrensning per arbeidsflyt. Gapene er estimert og koblet til en avhengighetsordnet backlog i [GL-011-leveranseestimatet](./gl011-delivery-estimate.md). GL-011 og GL-012 er godkjent av CEO med måldato 30. september 2026 og den dokumenterte kapasitetsregelen.
