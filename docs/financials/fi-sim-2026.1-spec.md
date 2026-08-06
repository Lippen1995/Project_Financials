# FI-SIM-2026.1: normativ spesifikasjon

**Status:** Godkjent implementasjonsgrunnlag

**Versjon:** `FI-SIM-2026.1`

**Dato:** 6. august 2026

**Omfang:** Investor-demo, resultatregnskap og balanse

Denne spesifikasjonen definerer Fjord Insights originale simuleringstaksonomi, profilvalg, genereringsregler og valideringskrav. Ordene **SKAL**, **SKAL IKKE**, **BØR** og **KAN** er normative.

## 1. Formål

`FI-SIM-2026.1` skal gjøre det mulig å demonstrere finansielle tabeller, grafer, metrics, analyser og Njord før rapportert regnskapsdekning er tilstrekkelig. Simuleringen skal bevare alle rapporterte verdier som immutable ankere og fylle ut manglende struktur rundt dem.

Taksonomien gjelder bare for:

- resultatregnskap
- balanse
- maksimalt fem fullførte regnskapsår
- eksplisitt godkjente investor-demo-miljøer

Taksonomien gjelder ikke for kontantstrøm, noter, dokumenter, selskapsmaster, personer, roller, eierskap eller regulatoriske data.

## 2. Eierskap og XBRL-grense

`FI-SIM-2026.1` er Fjord Insights eget verk. Den bruker åpne tekniske XBRL-mekanismer for konsepter, labels, presentation relationships og calculation relationships.

Implementasjonen skal bruke dette namespace-et:

```text
urn:fjord-insight:taxonomy:fi-sim:2026.1
```

Foretrukket prefix er `fi-sim`.

Taksonomien skal ikke importere, kopiere, oversette, gjenbruke eller etterligne IFRS-filer, namespace, QName, labels, definisjoner, referanser, presentation trees eller calculation linkbases. Produkt, API og eksport skal ikke omtale `FI-SIM` som IFRS-basert, IFRS-kompatibel eller IFRS-compliant.

## 3. Datakontrakt

### 3.1 Konsept

Hvert konsept skal ha:

- stabil `conceptKey`
- QName i `FI-SIM-2026.1`-namespace-et
- original norsk `sourceLabel`
- original definisjon
- `statementFamily`: `INCOME_STATEMENT` eller `BALANCE_SHEET`
- `periodType`: `duration` eller `instant`
- `balance`: `debit`, `credit` eller `none`
- monetær datatype
- presentation role og sorteringsrekkefølge
- calculation relationships der konseptet inngår i en identitet
- liste over profiler der konseptet er tillatt

`conceptKey`, `sourceLabel` og intern `metricKey` er tre separate felt. Generatoren skal alltid opprette en ny simulert linje med `metricKey = null`.

### 3.2 Linjebinding

En simulert linje skal ha nøyaktig én av:

1. `reportedFinancialLineItemId`, som peker på et rapportert anker, eller
2. `syntheticValue`, som eies av simuleringslaget.

En ankerbinding skal ikke lagre en kopi av den rapporterte verdien. Live-viewet skal løse verdien fra den rapporterte linjen ved lesing.

Hver live-linje skal eksponere:

- `valueOrigin`: `reported` eller `synthetic`
- `statementOrigin`: `reported`, `hybrid` eller `simulated`
- `financialDatasetVersion`
- `taxonomyVersion` for simulerte og hybride statements
- generator- og regelversjon for syntetiske linjer

### 3.3 Fortegn og enheter

Generatoren skal lagre normale kostnader, eiendeler, egenkapital og gjeld som positive størrelser. Calculation relationships bestemmer om en størrelse legges til eller trekkes fra.

Negative verdier er bare tillatt når konseptets økonomiske betydning støtter reversering, tap eller negativ egenkapital. Valuta og `unitScale` skal være eksplisitte og felles innen samme statement.

## 4. Konseptkatalog

Tabellene under er den normative katalogen for `FI-SIM-2026.1`. Kolonnen «mapping-orakel» viser gjeldende canonical key i produktets finansrapport. Den er bare testfasit og skal ikke brukes av generatoren til å forhåndsmappe linjer. `null` betyr at v1 bevisst lar konseptet stå uten canonical mapping.

### 4.1 Resultatregnskap

| Concept key | Original label | Balance | Mapping-orakel |
|---|---|---:|---|
| `ServiceRevenue` | Tjenesteomsetning | credit | `sales_revenue` |
| `MerchandiseRevenue` | Vareomsetning | credit | `sales_revenue` |
| `ContractRevenue` | Prosjekt- og kontraktsinntekter | credit | `sales_revenue` |
| `RentalRevenue` | Leieinntekter | credit | `sales_revenue` |
| `OtherOperatingIncome` | Øvrige driftsinntekter | credit | `other_operating_revenue` |
| `OperatingIncomeTotal` | Sum driftsinntekter | credit | `total_operating_revenue` |
| `MerchandiseCost` | Vareforbruk | debit | `cost_of_goods_sold` |
| `MaterialsAndSubcontractors` | Materialer og underleverandører | debit | `cost_of_goods_sold` |
| `PersonnelExpense` | Personalkostnader | debit | `salary_costs` |
| `PropertyOperatingExpense` | Eiendomsrelaterte driftskostnader | debit | `other_operating_costs` |
| `AdministrativeExpense` | Administrasjonskostnader | debit | `other_operating_costs` |
| `OtherOperatingExpense` | Øvrige driftskostnader | debit | `other_operating_costs` |
| `DepreciationExpense` | Avskrivninger | debit | `depreciation` |
| `OperatingExpenseTotal` | Sum driftskostnader | debit | `total_operating_costs` |
| `OperatingResult` | Driftsresultat | credit | `ebit` |
| `InterestIncome` | Renteinntekter | credit | `other_interest_income` |
| `DividendIncome` | Utbytteinntekter | credit | `other_financial_income` |
| `InvestmentGainLoss` | Resultat fra investeringer | none | `other_financial_income` |
| `InterestExpense` | Rentekostnader | debit | `other_interest_cost` |
| `OtherFinancialExpense` | Øvrige finanskostnader | debit | `other_financial_cost` |
| `NetFinancialResult` | Netto finansresultat | none | `net_finance` |
| `ProfitBeforeTax` | Resultat før skatt | credit | `profit_before_tax` |
| `TaxExpense` | Skattekostnad | debit | `tax_expense` |
| `ProfitForPeriod` | Årsresultat | credit | `net_income` |
| `RoundingDifferenceIncome` | Avrundingsdifferanse resultat | none | `null` |
| `UnallocatedResidualIncome` | Ufordelt differanse resultat | none | `null` |

Alle resultatkonsepter har `periodType = duration`.

### 4.2 Balanse

| Concept key | Original label | Balance | Mapping-orakel |
|---|---|---:|---|
| `DevelopmentAssets` | Utviklingsrelaterte eiendeler | debit | `intangible_assets` |
| `PropertyPlantEquipment` | Varige driftsmidler | debit | `tangible_assets` |
| `InvestmentProperty` | Investeringseiendom | debit | `tangible_assets` |
| `LongTermInvestments` | Langsiktige investeringer | debit | `financial_fixed_assets` |
| `OtherNoncurrentAssets` | Øvrige langsiktige eiendeler | debit | `financial_fixed_assets` |
| `NoncurrentAssetsTotal` | Sum langsiktige eiendeler | debit | `total_fixed_assets` |
| `Inventory` | Varelager | debit | `inventory` |
| `ContractAssets` | Opptjente ikke fakturerte inntekter | debit | `other_short_term_receivables` |
| `TradeReceivables` | Kundefordringer | debit | `accounts_receivable` |
| `OtherReceivables` | Øvrige kortsiktige fordringer | debit | `other_short_term_receivables` |
| `Cash` | Bankinnskudd og kontanter | debit | `cash_and_equivalents` |
| `CurrentAssetsTotal` | Sum kortsiktige eiendeler | debit | `total_current_assets` |
| `AssetsTotal` | Sum eiendeler | debit | `total_assets` |
| `ShareCapital` | Selskapskapital | credit | `paid_in_equity` |
| `PaidInPremium` | Annen innskutt kapital | credit | `paid_in_equity` |
| `AccumulatedResults` | Opptjente resultater | credit | `retained_earnings` |
| `EquityTotal` | Sum egenkapital | credit | `total_equity` |
| `LongTermBankBorrowings` | Langsiktig bankgjeld | credit | `long_term_debt` |
| `OtherLongTermLiabilities` | Øvrig langsiktig gjeld | credit | `provisions` |
| `LongTermLiabilitiesTotal` | Sum langsiktig gjeld | credit | `total_long_term_debt` |
| `ShortTermBankBorrowings` | Kortsiktig bankgjeld | credit | `other_short_term_debt` |
| `TradePayables` | Leverandørgjeld | credit | `supplier_debt` |
| `TaxPayable` | Betalbar skatt | credit | `tax_payable` |
| `PayrollAndPublicDutiesPayable` | Skyldige lønns- og offentlige avgifter | credit | `public_charges` |
| `OtherCurrentLiabilities` | Øvrig kortsiktig gjeld | credit | `other_short_term_debt` |
| `CurrentLiabilitiesTotal` | Sum kortsiktig gjeld | credit | `total_short_term_debt` |
| `LiabilitiesTotal` | Sum gjeld | credit | `null` |
| `EquityAndLiabilitiesTotal` | Sum egenkapital og gjeld | credit | `total_equity_and_liabilities` |
| `RoundingDifferenceBalance` | Avrundingsdifferanse balanse | none | `null` |
| `UnallocatedResidualBalance` | Ufordelt differanse balanse | none | `null` |

Alle balansekonsepter har `periodType = instant`.

## 5. Presentation roles og profiler

Taksonomien skal tilby ett resultat-role og ett balanse-role per profil. Et statement skal bare inneholde konsepter som profilen tillater, rapporterte ankere som må vises, og nødvendige totalsummer.

### 5.1 `SERVICE`

Brukes for tjenesteytende virksomheter.

- Inntekter: `ServiceRevenue`, eventuelt `OtherOperatingIncome`.
- Kostnader: `PersonnelExpense`, `AdministrativeExpense`, `OtherOperatingExpense`, eventuelt `DepreciationExpense`.
- Balanse: typisk `TradeReceivables`, `Cash`, begrensede driftsmidler og ingen obligatorisk lagerlinje.

### 5.2 `TRADE`

Brukes for varehandel.

- Inntekter: `MerchandiseRevenue`.
- Kostnader: `MerchandiseCost`, `PersonnelExpense`, `OtherOperatingExpense`, eventuelt `DepreciationExpense`.
- Balanse: `Inventory`, `TradeReceivables`, `TradePayables` og `Cash` er sentrale.

### 5.3 `MANUFACTURING_CONSTRUCTION`

Brukes for produksjon, prosjekt- og byggvirksomhet.

- Inntekter: `ContractRevenue` eller `MerchandiseRevenue`.
- Kostnader: `MaterialsAndSubcontractors`, `PersonnelExpense`, `OtherOperatingExpense`, `DepreciationExpense`.
- Balanse: `Inventory` eller `ContractAssets`, driftsmidler, fordringer og leverandørgjeld.

### 5.4 `PROPERTY`

Brukes for eiendomseie og -drift.

- Inntekter: `RentalRevenue`.
- Kostnader: `PropertyOperatingExpense`, `AdministrativeExpense`, `DepreciationExpense`.
- Balanse: `InvestmentProperty`, bankgjeld, fordringer og kontanter.

### 5.5 `HOLDING_INVESTMENT`

Brukes for holding- og investeringsvirksomhet.

- Inntekter: `DividendIncome`, `InterestIncome` og/eller `InvestmentGainLoss`.
- Ordinær driftsomsetning er ikke påkrevd.
- Balanse: `LongTermInvestments`, eventuelt fordringer, kontanter og begrenset driftskapital.

### 5.6 `DORMANT_PRE_REVENUE`

Brukes for sovende eller før-omsetningsvirksomheter.

- Ingen inntektslinje er påkrevd.
- Kostnader begrenses normalt til `AdministrativeExpense` og `OtherOperatingExpense`.
- Balanse består normalt av kontanter, egenkapital og få gjeldslinjer.

### 5.7 Ikke støttede profiler

Banker og forsikringsforetak skal ikke bruke en generell profil. Profilvelgeren skal returnere `UNSUPPORTED_SIMULATION_PROFILE` til egne profiler er spesifisert og godkjent.

## 6. Deterministisk profilvalg

Profilvalg skal bruke reell selskapsmetadata i denne prioriteten:

1. regulatorisk overlay som krever blokkering eller særprofil
2. SSB-næringskode og kodeverksversjon
3. organisasjonsform
4. eksplisitt, versjonert profilregel
5. `SERVICE` som dokumentert standard bare når ingen særregel gjelder

Profilvalg skal ikke bruke selskapsnavn, hardkodede organisasjonsnumre eller tilfeldig variasjon. Valgt profil og regel-ID skal lagres med statementet.

## 7. Perioder og scope

Generatoren skal opprette inntil fem siste fullførte regnskapsår. Den skal aldri opprette en periode som starter før selskapets reelle stiftelsesdato.

`COMPANY` er standard scope. Et annet scope skal bare genereres når et rapportert statement eller en eksplisitt, reell selskapsrelasjon gir grunnlag for dette. Generatoren skal aldri anta at et selskap har konsernregnskap.

## 8. Calculation relationships

Følgende identiteter skal gjelde eksakt etter residualbehandling:

```text
OperatingIncomeTotal = sum(active operating income children)
OperatingExpenseTotal = sum(active operating expense children)
OperatingResult = OperatingIncomeTotal - OperatingExpenseTotal

NetFinancialResult =
  InterestIncome
  + DividendIncome
  + InvestmentGainLoss
  - InterestExpense
  - OtherFinancialExpense

ProfitBeforeTax = OperatingResult + NetFinancialResult
ProfitForPeriod = ProfitBeforeTax - TaxExpense

NoncurrentAssetsTotal = sum(active noncurrent asset children)
CurrentAssetsTotal = sum(active current asset children)
AssetsTotal = NoncurrentAssetsTotal + CurrentAssetsTotal

EquityTotal = ShareCapital + PaidInPremium + AccumulatedResults
LongTermLiabilitiesTotal = sum(active long-term liability children)
CurrentLiabilitiesTotal = sum(active current liability children)
LiabilitiesTotal = LongTermLiabilitiesTotal + CurrentLiabilitiesTotal
EquityAndLiabilitiesTotal = EquityTotal + LiabilitiesTotal
AssetsTotal = EquityAndLiabilitiesTotal
```

Fraværende valgfrie barn behandles som fraværende, ikke som publiserte null-linjer.

## 9. Generator

### 9.1 Versjonering og seed

Generatorens output skal være identisk for samme:

- organisasjonsnummer
- periode og scope
- rapporterte ankere
- `FI-SIM`-versjon
- profilversjon
- antakelsesversjon
- generatorversjon

Pseudo-tilfeldighet skal komme fra en stabil kryptografisk hash av disse feltene. Generatoren skal ikke bruke klokkeslett eller prosessglobal tilfeldig tilstand.

### 9.2 Genereringsrekkefølge

Generatoren skal:

1. velge profil og perioder
2. laste og fryse rapporterte ankere
3. velge semantisk relevante linjer
4. løse resultatregnskapets identiteter
5. løse balansens identiteter
6. bygge flerårsbro for opptjente resultater
7. håndtere residualer
8. validere alle identities og proveniensregler
9. lagre et immutable dataset

### 9.3 Rapporterte ankere

Rapporterte ankere er harde constraints. Ved konflikt skal generatoren aldri endre, skalere, omklassifisere eller overskrive dem.

Når rapportert omsetning er 100 og rapportert driftsresultat er 20, skal aktive syntetiske driftskostnader til sammen bli 80. Fordelingen mellom kostnadslinjer bestemmes av profilen og den deterministiske antakelsesversjonen.

Et rapportert anker skal refereres fra simuleringslaget. Det skal ikke materialiseres som en ny syntetisk verdi.

### 9.4 Flerårsbro

Generatoren skal ha en intern, versjonert bro:

```text
AccumulatedResults[t] =
  AccumulatedResults[t-1]
  + ProfitForPeriod[t]
  - assumedDistribution[t]
  + explicitCapitalAdjustment[t]
```

`assumedDistribution` og `explicitCapitalAdjustment` er generator-metadata, ikke publiserte kontantstrøm- eller noteopplysninger. Hvis rapporterte egenkapitalankere gjør broen inkonsistent, gjelder residual- eller feilreglene.

## 10. Residualer og feil

Toleranser beregnes per identitet:

```text
roundingTolerance = max(2 * unitScale, 0.0001 * abs(parentTotal))
reviewTolerance   = max(10 * unitScale, 0.0010 * abs(parentTotal))
```

- Differanse innen `roundingTolerance` skal vises som `RoundingDifferenceIncome` eller `RoundingDifferenceBalance` når den ikke kan absorberes uten å endre et rapportert anker.
- Differanse over `roundingTolerance` og innen `reviewTolerance` skal vises som en eksplisitt `UnallocatedResidual...`-linje og merke statementet for manuell kontroll.
- Differanse over `reviewTolerance`, motsigende harde ankere eller uløselig negativ struktur skal gi kontrollert feil.
- En material residual skal aldri skjules i en plausibel driftslinje.

Kontrollerte feilkoder skal minst dekke:

- `CONTRADICTORY_REPORTED_ANCHORS`
- `UNSOLVABLE_STATEMENT_IDENTITY`
- `UNSUPPORTED_SIMULATION_PROFILE`
- `INVALID_PERIOD`
- `INVALID_UNIT_OR_CURRENCY`
- `MISSING_REPORTED_ANCHOR_REFERENCE`

## 11. Metric mapping

Generatoren skal ikke bruke mapping-orakelet i konseptkatalogen. Flyten er:

1. Generatoren skriver `conceptKey`, QName og `sourceLabel` med `metricKey = null`.
2. Den samme normaliserings- og matchingmotoren som brukes for rapporterte linjer behandler linjen.
3. I simulert modus leses og skrives mapping-regler i et simulert, dataset-avgrenset mapping-overlay.
4. Rapporterte `MetricAlias`-records og rapporterte linjer skal ikke endres av demo-mapping.
5. Resultatet lagres i simuleringslaget og eksponeres gjennom Live Table.
6. Et separat test-orakel sammenligner resultatet med katalogens forventede mapping.

Demo-datasettet kan bevisst inneholde noen umappede concepts for å demonstrere mapping-funksjonen. Disse skal være eksplisitt listet i dataset-manifestet, ikke valgt tilfeldig.

## 12. Publisering og merking

Et dataset kan bare aktiveres når alle statements har bestått validering. Et statement er:

- `reported` når alle live-linjer er rapporterte
- `hybrid` når det inneholder både rapporterte og syntetiske linjer
- `simulated` når alle live-linjer er syntetiske

UI og eksport skal vise «Simulert for demonstrasjon – ikke rapporterte selskapsdata» for hybride og simulerte statements. Hver syntetiske linje skal ha egen synlig markering. Grafer og metrics kan bruke verdiene, men skal videreføre datasetversjon og statement-opprinnelse.

API-er skal aldri eksponere en simulert dokumentreferanse, innsendingsdato eller kildehenvisning som kan tolkes som en rapportert filing.

## 13. Mutasjoner og referanser

Live statement-ID-er skal være kildeavgrensede, for eksempel `reported:<id>` og `simulated:<id>`. En simulert ID skal aldri brukes som fremmednøkkel til en rapportert tabell.

I `FI-SIM-2026.1` skal kommentarer, diligence-evidence og andre mutasjoner som krever en rapportert `FinancialStatement`-fremmednøkkel avvises for simulerte statements. Rapporterte ankerlinjer i et hybrid-statement gir ikke rett til å behandle hele statementet som rapportert.

## 14. Akseptansekriterier

En implementasjon følger `FI-SIM-2026.1` når den beviser at:

- samme input og versjoner gir byte-stabilt økonomisk output
- alle rapporterte ankere løses som referanser og forblir uendret
- alle calculation relationships balanserer eksakt
- ingen periode ligger før stiftelsesdato eller etter siste fullførte regnskapsår
- linjeutvalget varierer semantisk mellom profiler
- nye linjer starter med `metricKey = null`
- demo-mapping ikke endrer rapporterte aliases eller linjer
- alle syntetiske verdier bærer korrekt proveniens gjennom API, UI, graf, metric, eksport og Njord
- banker og forsikringsforetak ikke får en misvisende generell profil
- rapportert modus fungerer uten at noen simuleringstabell finnes

## 15. Livsløp

`FI-SIM-2026.1`, profilene, mapping-overlayet og alle concepts er del av det midlertidige simuleringslaget. De skal fjernes som del av GL-511 før lukket beta eller produksjon.

En ny taksonomiversjon skal få nytt namespace, nytt manifest og ny datasetversjon. Et eksisterende aktivert dataset skal aldri endres i stedet.
