# Oil & Gas Product Structure

## Goal

Bygg olje- og gassmodulen som en strukturert markedsanalyseflate med:

- et innsiktsfullt kart som felles arbeidsflate
- flere faner med tydelig analyseformål
- normaliserte ProjectX-API-er som eneste frontend-kilde
- reelle offisielle data fra SODIR, Havtil og Gassco

Kartet skal ikke erstattes av faner. Kartet skal være en gjennomgående analyseflate som følger brukeren på tvers av faner, mens hver fane svarer på et tydelig sett med spørsmål.

## Product Principles

- Kartet er den primære romlige analysen.
- Faner organiserer innsikten, ikke datakildene.
- Hver fane skal ha et klart spørsmål den svarer på.
- Samme filterstate skal kunne gjenbrukes på tvers av kart, grafer og tabeller.
- Hvis data ikke finnes åpent og reelt, skal seksjonen være tom, deaktivert eller merket som ikke tilgjengelig.

## Recommended Information Architecture

### 1. Marked

Formål:
- gi et raskt overblikk over norsk sokkel
- vise produksjon, reserver, investeringer og konsentrasjon

Brukerspørsmål:
- Hvor stor er produksjonen nå og hvordan utvikler den seg?
- Hvilke områder og operatører dominerer?
- Hvor ligger de største gjenværende ressursene?
- Hvor ventes investeringene å komme?

Kart:
- felt
- funn
- lisenser
- innretninger
- TUF / hovedrørledninger

Analyseflater:
- KPI-strip for sokkelen og valgt utsnitt
- produksjon over tid
- investeringer historisk og forventet
- reserver og gjenværende ressurser
- topp-felt, topp-operatører, områdeandeler

### 2. Leting & Funn

Formål:
- vise hvor fremtidig vekst kan komme fra

Brukerspørsmål:
- Hvor gjøres det funn?
- Hvilke funn er modne, umodne eller uavklarte?
- Hvilke lisenser og selskaper sitter på fremtidige muligheter?

Kart:
- funn
- lisenser
- tilknyttet infrastruktur
- survey som avansert lag

Analyseflater:
- funnportefølje
- funn etter år, område og hydrokarbon
- lisensaktivitet
- Petreg-meldinger og lisensoverføringer

### 3. Brønner & Boring

Formål:
- gi operasjonell og teknisk innsikt i boreaktivitet

Brukerspørsmål:
- Hvor bores det nå og historisk?
- Hvilke typer brønner dominerer?
- Hvilke områder har høyest aktivitetsnivå?

Kart:
- brønnbaner
- brønnpunkter
- felt, funn og lisenser som kontekst

Analyseflater:
- boring per år
- letebrønner vs produksjons-/injeksjonsbrønner
- statusfordeling
- dybde- og lengdeprofiler

### 4. Infrastruktur

Formål:
- vise hvordan sokkelen henger sammen fysisk

Brukerspørsmål:
- Hvilke funn ligger nær eksisterende infrastruktur?
- Hvilke rørledninger og knutepunkter er mest sentrale?
- Hvilke felt og innretninger deler kapasitet?

Kart:
- innretninger
- TUF / hovedrørledninger
- felt og funn
- terminal-/landanlegg når åpen data finnes

Analyseflater:
- kapasitetsnoder
- tilknytningsnærhet
- felt per vertsinfrastruktur
- fase og modenhet

### 5. Seismikk & Undersøkelser

Formål:
- vise geofysisk aktivitet og datainnsamling

Brukerspørsmål:
- Hvor samles det inn data nå?
- Hvilke områder har høy undersøkelsesaktivitet?
- Hvilke typer undersøkelser gjennomføres?

Kart:
- survey-områder
- type og status
- tidsfiltre

Analyseflater:
- planlagte og pågående undersøkelser
- undersøkelsestype over tid
- aktivitet per område og aktør

### 6. Havbunn & Nye Næringer

Formål:
- samle havbunn, CO2 og nye sokkelnæringer i én struktur

Brukerspørsmål:
- Hvor finnes relevante havbunnsdata?
- Hvor er aktivitet eller kunnskapsgrunnlag knyttet til CO2 og mineraler?
- Hvordan utvikler sokkelen seg utover olje og gass?

Kart:
- deep sea surveys
- CO2-relaterte lag
- batymetri og havbunnslag når de finnes åpent

Analyseflater:
- aktivitetsoversikt
- tidsserier der tilgjengelig
- områdeoppdeling

### 7. Selskaper & Rettigheter

Formål:
- gjøre selskaps- og eierbildet forståelig

Brukerspørsmål:
- Hvem er operatør hvor?
- Hvem er rettighetshaver i hvilke felt og lisenser?
- Hvordan endrer eksponeringen seg over tid?

Kart:
- felt og lisenser fargekodet etter operatør eller rettighetshaver

Analyseflater:
- operatørkonsentrasjon
- lisenshaverandeler
- lisensoverføringer
- deep-links til ProjectX-selskapsprofiler

### 8. Hendelser & Regulering

Formål:
- gi et hendelses- og risikolag rundt markedet

Brukerspørsmål:
- Hvilke regulatoriske hendelser påvirker selskaper og infrastruktur?
- Hvor kommer nye samtykker, tilsyn og avvik?
- Hva skjer i Gasscos sanntidsnomineringer?

Kart:
- Havtil-hendelser
- Petreg-lisenshendelser
- Gassco-overlay der geografi kan knyttes forsvarlig

Analyseflater:
- hendelsesfeed
- siste 12 måneder
- filtrering per selskap, type og område

## The Map's Role

Kartet skal være gjennomgående på alle faner.

Det betyr:

- samme kartkomponent og filtermodell beholdes
- lagsett endres per fane
- høyrepanel og bunnflater tilpasses fanens spørsmål
- `bbox` og valgt objekt skal fortsatt kunne styre KPI-er, tabeller og grafer

Anbefalt oppførsel:

- `Marked`: kartet vises som standard i bred visning med overordnede lag
- `Leting & Funn`: kartet vektlegger funn, lisenser og nærhet til infrastruktur
- `Brønner & Boring`: kartet vektlegger brønnbane og borelokasjoner
- `Seismikk & Undersøkelser`: kartet vektlegger survey-geometrier og tidsfiltre
- `Havbunn & Nye Næringer`: kartet vektlegger havbunnslag og CO2/mineral-lag

## Data Matrix

| Tab | Key questions | Primary sources | Current status | Next build |
| --- | --- | --- | --- | --- |
| Marked | Produksjon, reserver, investeringer, konsentrasjon | SODIR `profiles`, `field`, `field_reserves`, `field_investment_expected`, `company`, `facility`, `pipeline/TUF` | Delvis bygget | Strukturere som egen toppfane med egne KPI-er og benchmark |
| Leting & Funn | Funnportefølje, lisensaktivitet, framtidig ressursbase | SODIR `discovery`, `licence`, `field`, `petreg_licence_message`, `licence_transfer_hst` | Delvis bygget | Egen fane med funnportefølje, lisensoverføringer og modenhet |
| Brønner & Boring | Boreaktivitet, brønntyper, teknisk utvikling | SODIR wellbore-/brønnbane-data | Ikke bygget | Ny ingest + eget kartlag + boretabeller |
| Infrastruktur | Knytning, knutepunkter, transportsystem | SODIR `facility`, `pipeline/TUF`, `field`, `discovery` | Delvis bygget | Egen fane med tilknytningslogikk og nettverksanalyse |
| Seismikk & Undersøkelser | Survey-aktivitet og geofysikk | SODIR `survey`, eventuelle åpne seismikkmetadata | Delvis bygget | Egen fane, tidslinje og typefiltre |
| Havbunn & Nye Næringer | CO2, mineraler, havbunnsaktivitet | SODIR CO2/deep sea/havbunnslag, Sokkelåret-bakgrunnstall | Ikke bygget | Ny ingest og ny fane |
| Selskaper & Rettigheter | Operatører, rettighetshavere, overføringer | SODIR `company`, `field_operator_hst`, `field_licensee_hst`, `licence_licensee`, `licence_transfer_hst` | Delvis bygget | Egen fane med selskapsanalyse og ProjectX-kobling |
| Hendelser & Regulering | Tilsyn, samtykker, Petreg, sanntid | Havtil, Gassco `realTimeAtom.xml`, SODIR Petreg | Delvis bygget | Bedre geokobling og felles hendelsesmodell per objekt |

## Report-Derived Analytics

For å oppnå innsiktsnivået i SODIRs rapporter bør vi bygge på tre datalag:

### 1. Object and map data

Løpende data fra SODIR Data Service:

- felt
- funn
- lisenser
- innretninger
- rørledninger / TUF
- survey
- produksjonsprofiler
- reserver
- forventede investeringer

### 2. Annual background tables

Årlige analysetabeller som brukes i rapportpublikasjoner:

- ressursregnskap
- Sokkelåret-bakgrunnstall
- kapittelvise XLSX-tabeller når de finnes

Disse bør inn som egne importjobber og ikke blandes sammen med løpende objektdata.

### 3. Analytical layers

SODIRs egne analytiske vurderinger:

- ressursklasser
- uoppdagede ressurser
- mulighetsbilder
- rapporterte produksjonsbaner og utviklingsløp

Dette er viktig fordi rapportene ikke bare viser rå API-data; de viser også kvalitetssikrede årsanalyser og klassifiserte vurderinger.

## Specific Report Mapping

### Ressursrapport 2024

Sannsynlig underliggende datamiks:

- årlig ressursregnskap
- selskapsinnrapportering om produksjon, reserver, kostnader og planer
- SODIRs klassifisering av ressurser og prosjektmodenhet
- økonomiske forutsetninger og kostnadsbaner

Produktbruk:

- bør primært informere `Marked`, `Leting & Funn` og `Selskaper & Rettigheter`

### Sokkelåret 2025

Sannsynlig underliggende datamiks:

- løpende objektdata fra felt, funn, lisenser og undersøkelser
- produksjon, investeringer og bakgrunnstall per kapittel
- havbunns- og ny-næringsdata

Produktbruk:

- bør informere `Marked`, `Brønner & Boring`, `Seismikk & Undersøkelser` og `Havbunn & Nye Næringer`

## Recommended Build Order

### Phase 1. Information architecture cleanup

- del dagens modul inn i fanene over
- behold ett felles kart og én felles filterstate
- la `Marked` være default-fane

### Phase 2. Market intelligence hardening

- bygg ut `Marked` med benchmark mot hele sokkelen
- importer årlige bakgrunnstall for produksjon, investeringer og reserver
- legg til område-, operatør- og feltbenchmarks

### Phase 3. Exploration and rights

- bygg `Leting & Funn`
- bygg `Selskaper & Rettigheter`
- koble lisensoverføringer og Petreg tydeligere

### Phase 4. Technical subsurface and operations

- bygg `Brønner & Boring`
- bygg `Seismikk & Undersøkelser`
- legg til brønnbane, brønnstatus og survey-tidsfiltre

### Phase 5. Expanded seabed module

- bygg `Havbunn & Nye Næringer`
- legg til CO2, deep sea og relevante havbunnslag

### Phase 6. Regulatory and event maturity

- forbedre `Hendelser & Regulering`
- geoknytt flere hendelser til felt, innretning og lisens

## Delivery Notes

- Ikke prøv å vise alle lag samtidig.
- Kartet skal være innsiktsfullt, men ikke overfylt.
- Fanene skal redusere støy og gjøre modulen mer lesbar.
- Årlige rapporttabeller bør ha eget ingest-lag og egne metadata om publikasjon og årstall.
- Leverandørdata bør behandles som egen fremtidig arbeidspakke, fordi åpne offisielle kilder her er svakere enn for operatør- og lisensdata.

## Definition of a Better Module

Modulen er vesentlig bedre når:

- en bruker intuitivt forstår hvor de skal gå for marked, boring, seismikk og havbunn
- kartet fortsatt er en sentral arbeidsflate i alle faner
- rapportnær innsikt kan spores tilbake til konkrete åpne tabeller og publiseringer
- ProjectX tydelig skiller mellom løpende objektdata, årlige analysetabeller og analytiske vurderingslag
