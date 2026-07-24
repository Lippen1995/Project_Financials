# Formell signering av Sprint 0

**Status:** Godkjent – Sprint 0 fullført

**Beslutningstaker:** Simen Lippestad (CEO)

**Beslutningsdato:** 24. juli 2026

## Beslutning som skal tas

CEO godkjenner at Sprint 0 har etablert et tilstrekkelig tydelig og operasjonelt grunnlag for videre utvikling mot lukket beta 30. september 2026.

Godkjenningen betyr at produktretning, omfang, ansvar, planleggingsgrunnlag, styringsrammer og Sprint 0-bevis er låst. Den betyr ikke at produktet er beta- eller produksjonsklart. Første eksterne kostnad krever G1, og utsendelse til betabrukere krever G2.

## Akseptansekriterier

| Kriterium | Status | Beslutning / bevis |
| --- | --- | --- |
| Produktretning og verdiforslag | Oppfylt | [Produktposisjoneringen](./product-positioning.md) er godkjent av CEO |
| Njord som kjernekomponent | Oppfylt | Produktposisjon, [beta-charter](./beta-charter.md) og [ADR-0001](../adr/ADR-0001-njord-dynamic-authorized-data-access.md) |
| Ansvar og lanseringsmyndighet | Oppfylt | Simen Lippestad dekker alle styringsroller; tidsavgrenset nøkkelpersonrisiko er akseptert |
| Betakohort | Oppfylt for Sprint 0 | 12 primærbrukere og inntil 8 reserver er fordelt per bruksmål; navn lagres utenfor repoet før betaåpning |
| Tre arbeidsflyter valgt | Oppfylt | M&A, kunde-/leverandørsourcing og konkurrent-/bransjeanalyse |
| Arbeidsflyt-/datagapanalyse | Oppfylt | [GL-011](./workflow-data-gap-analysis.md) og [leveranseestimatet](./gl011-delivery-estimate.md) |
| Betaomfang låst | Oppfylt | Inn-, ut- og endringsregel i beta-charteret |
| Måldato og kapasitet | Oppfylt | 30. september 2026; 70 effektive utviklingstimer per uke; datorevisjon ved under 60 timer i to uker |
| Datakilder kartlagt | Oppfylt som baseline | [Datakildekartet](./data-source-map.md) viser kilder, proveniens, mangelhåndtering og gap |
| Personvernramme | Oppfylt som styringsbeslutning | [Personvern- og retensjonsregisteret](./privacy-and-retention.md); DPIA, leverandører og implementasjon er senere porter |
| KPI-metode | Oppfylt som styringsbeslutning | [KPI-registeret](./beta-kpis.md); instrumentering og ikke-syntetisk pilot gjenstår |
| OCR-uavhengighet | Oppfylt som Sprint 0-bevis | [GL-009-rapporten](./ocr-independence-evidence.md), kildeport, tomtilstand, tester, typesjekk og produksjonsbygg |
| Risikoer med eiere og frister | Oppfylt | [Risikoregisteret](./risk-register.md) har person, prioritet, port, tiltak og bevis for alle risikoer |
| Kostnadsrammer | Oppfylt | [Kostnadsregisteret](./cost-register.md): K0 låst; K1 maks. NOK 5 000 eks. mva./mnd.; K2 uten fullmakt |
| Produksjonsarkitektur | Oppfylt som plan | Lagdeling og source-of-truth-regler i repoet; Njord-grense i ADR-0001; produksjonsøvelser gjenstår |
| Go-to-market og betarekruttering | Oppfylt som plan | CEO rekrutterer definert kohort rett før betaåpning |
| Go/no-go-kriterier | Oppfylt | G1/G2 og KPI-basert fireukers beslutningsregel er definert |

## Låste beslutninger

- Fjord Insight er en intelligent analyseplattform, ikke en ny selskapskatalog.
- Njord er brukerens digitale analytiker og en beta-kritisk kjernekomponent.
- Betaen skal validere tre komplette arbeidsflyter, ikke bare søk og selskapsprofil.
- LLM-en kan velge relevante autoriserte data og verktøy dynamisk, men får ikke direkte database-, nettverks-, filsystem- eller hemmelighetstilgang.
- Reelle, godkjente datakilder og ærlige tomtilstander er absolutte krav.
- Offentlig betaflate bruker bare strukturerte Brreg-regnskap; PDF/OCR er ikke fallback.
- Maakeholmen AS, org.nr. 931 075 268, er midlertidig behandlingsansvarlig frem til dokumentert overføring til selskapet under dannelse.
- Lukket beta siktes mot 30. september 2026 med 70 effektive utviklingstimer per uke.
- K1 er begrenset til NOK 5 000 eks. mva. per måned og kan ikke aktiveres før ny CEO-beslutning ved G1.

## Forhold som uttrykkelig ikke lukkes av Sprint 0

- implementasjon av de tre ende-til-ende-arbeidsflytene;
- full datadekning for historikk, eierskap, konsern og markedsdata;
- Njord-integrasjon og bestått evalueringssett;
- DPIA, databehandleravtaler og teknisk personvernbevis;
- autentiserings-, sikkerhets-, backup-, restore- og rollbackøvelser;
- KPI-instrumentering og ikke-syntetisk pilot;
- valg og aktivering av eksterne leverandører;
- produksjonslik G2-verifikasjon av OCR-kildeport og tom artifact-lagring;
- navngiving og invitasjon av faktiske betabrukere.

Disse er planlagte leveranser og porter, ikke skjulte Sprint 0-mangler.

## Formell beslutning

| Beslutning | Besluttet av | Dato | Status |
| --- | --- | --- | --- |
| Sprint 0 godkjennes som fullført | Simen Lippestad (CEO) | 24. juli 2026 | Godkjent |

CEO-godkjenningen ble gitt eksplisitt 24. juli 2026. Videre arbeid følger den vedtatte sprintplanen, og ingen G1- eller G2-port anses bestått gjennom denne signeringen.
