# FI-SIM valideringsrapport: fi-sim-investor-2026.1-20260810-c

Datasettet er skrevet og validert.

| | |
|---|---|
| Kjørt | 2026-08-10T20:45:20.933Z |
| Taksonomi | FI-SIM-2026.1 |
| Generator | fi-sim-generator-2026.1 |
| Antakelser | fi-sim-assumptions-2026.1 |
| Profilregler | fi-sim-profile-rules-2026.1 |
| Rapportert datasett ankrene er frosset fra | reported:0 |
| Scope | BOTH |
| Siste fullførte regnskapsår | 2025 |

## Dekning

| | |
|---|---|
| Selskaper forsøkt | 10843 |
| Selskaper med minst én periode | 9004 |
| Selskaper uten noen periode | 1839 |
| Perioder | 33354 |
| Statements | 66708 |
| – hybride | 11926 |
| – helt simulerte | 54782 |
| Rapporterte ankerlinjer | 74747 |
| Syntetiske linjer | 982771 |
| Andel linjer som er rapporterte ankere | 7.1 % |
| År hoppet over (før stiftelse eller ikke avsluttet) | 15855 |

## Profilfordeling

| Profil | Antall |
|---|---|
| SERVICE | 17667 |
| TRADE | 6512 |
| MANUFACTURING_CONSTRUCTION | 5873 |
| PROPERTY | 2988 |
| HOLDING_INVESTMENT | 314 |

## Scopefordeling

| Scope | Antall |
|---|---|
| COMPANY | 32291 |
| CONSOLIDATED | 1063 |

## Ankertyper

Hvilke konsepter som ble bundet til en rapportert linje, og hvor ofte.

| Konsept | Antall |
|---|---|
| ProfitForPeriod | 5963 |
| AssetsTotal | 5963 |
| EquityTotal | 5960 |
| CurrentAssetsTotal | 5949 |
| LiabilitiesTotal | 5929 |
| ProfitBeforeTax | 5925 |
| OperatingResult | 5797 |
| OperatingIncomeTotal | 5763 |
| OperatingExpenseTotal | 5741 |
| CurrentLiabilitiesTotal | 5709 |
| AccumulatedResults | 5645 |
| NetFinancialResult | 5559 |
| LongTermLiabilitiesTotal | 4844 |

## Residualer

| | |
|---|---|
| Avrundingsdifferanser | 3281 |
| Ufordelte differanser til manuell kontroll | 0 |
| Største absolutte residual | 2000000 |

| Identitet | Antall |
|---|---|
| BalanceEquation | 1364 |
| ProfitBeforeTax | 913 |
| OperatingResult | 770 |
| LiabilitiesTotal | 233 |
| EquityTotal | 1 |

## Mappinggrad

Alle genererte linjer skrives med `metricKey = null`, jf. spec seksjon 11. Mapping kjøres som et eget, dataset-avgrenset overlay etter generering, og måles derfor ikke her.

**Et nygenerert datasett er dermed helt umappet.** Alt som drives av `metricKey` — standardisert visning, nøkkeltall og Njords linjeoppslag — er tomt til mapping er kjørt over datasettet. Det må gjøres før noen demonstrerer det.

## Feil

| Feilkode | Antall |
|---|---|
| CONTRADICTORY_REPORTED_ANCHORS | 1216 |
| INVALID_PERIOD | 830 |
| INVALID_UNIT_OR_CURRENCY | 117 |
| UNSUPPORTED_SIMULATION_PROFILE | 85 |
| UNSOLVABLE_STATEMENT_IDENTITY | 37 |

## Selskaper som ikke støttes

| Orgnr | Scope | Kode | Årsak |
|---|---|---|---|
| 811413682 | COMPANY | INVALID_UNIT_OR_CURRENCY | Anchor AccumulatedResults is EUR/1, the statement is NOK/1 |
| 811413682 | CONSOLIDATED | INVALID_UNIT_OR_CURRENCY | Anchor AccumulatedResults is EUR/1, the statement is NOK/1 |
| 811634662 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 812099302 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -88310282 against reported anchors, beyond the review tolerance of 13 |
| 812619942 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 813399652 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 813422832 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 813855992 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 814469832 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -94271482 against reported anchors, beyond the review tolerance of 16 |
| 814726282 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 815696832 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 815728092 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 816161762 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -101414006 against reported anchors, beyond the review tolerance of 34 |
| 816299802 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 816793432 | COMPANY | UNSUPPORTED_SIMULATION_PROFILE | Bank og annen kredittgivning har egen regnskapsoppstilling og er ikke modellert i v1. |
| 816814332 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -114514408 against reported anchors, beyond the review tolerance of 10 |
| 816910412 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 816914582 | COMPANY | UNSUPPORTED_SIMULATION_PROFILE | Bank og annen kredittgivning har egen regnskapsoppstilling og er ikke modellert i v1. |
| 817107702 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 817244742 | COMPANY | UNSUPPORTED_SIMULATION_PROFILE | Bank og annen kredittgivning har egen regnskapsoppstilling og er ikke modellert i v1. |
| 818040032 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 818232942 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 818695322 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 818779542 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 77263 exceeds reported total assets 40253 |
| 819320152 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 819419892 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 819439842 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 819607222 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 819902712 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 820255992 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 820380932 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 820649532 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 30000 exceeds reported total assets 2267 |
| 820761502 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 820765052 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 821204682 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 822154662 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -149010348 against reported anchors, beyond the review tolerance of 30 |
| 822237622 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 822347452 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 822547052 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 823255802 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 823577222 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 824991502 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -97807501 against reported anchors, beyond the review tolerance of 51 |
| 825293922 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 30000 exceeds reported total assets 0 |
| 825583122 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 825602712 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -88154228 against reported anchors, beyond the review tolerance of 10 |
| 825904042 | COMPANY | INVALID_UNIT_OR_CURRENCY | Anchor AccumulatedResults is EUR/1, the statement is NOK/1 |
| 825904042 | CONSOLIDATED | INVALID_UNIT_OR_CURRENCY | Anchor AccumulatedResults is EUR/1, the statement is NOK/1 |
| 826029722 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 636738 exceeds reported total assets 593452 |
| 826156082 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | ProfitBeforeTax is off by -7391380 against reported anchors, beyond the review tolerance of 11 |
| 826311312 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | LiabilitiesTotal is off by 138474 against reported anchors, beyond the review tolerance of 169 |
| 826384352 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 826809302 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 30000 exceeds reported total assets 0 |
| 827264342 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 827269972 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | BalanceEquation is off by -28814 against reported anchors, beyond the review tolerance of 36 |
| 828166522 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 829161672 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 829231212 | COMPANY | UNSOLVABLE_STATEMENT_IDENTITY | Operating expenses solve to -27217, which no statement can publish |
| 829290162 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 461264 exceeds reported total assets 458458 |
| 829401142 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 830087192 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -163183990 against reported anchors, beyond the review tolerance of 14 |
| 830162852 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -121776278 against reported anchors, beyond the review tolerance of 29 |
| 830306862 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 830341072 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -89319451 against reported anchors, beyond the review tolerance of 10 |
| 830669752 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 831046872 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 831068892 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 831140402 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -97580857 against reported anchors, beyond the review tolerance of 10 |
| 831556412 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 831571152 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 831824352 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832055522 | COMPANY | INVALID_UNIT_OR_CURRENCY | Anchor AccumulatedResults is USD/1, the statement is NOK/1 |
| 832055522 | CONSOLIDATED | INVALID_UNIT_OR_CURRENCY | Anchor AccumulatedResults is USD/1, the statement is NOK/1 |
| 832065072 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832318132 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832433802 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832451312 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -61107475 against reported anchors, beyond the review tolerance of 10 |
| 832522252 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -41564126 against reported anchors, beyond the review tolerance of 13 |
| 832836842 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832891932 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832892092 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832958492 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832991872 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -3896582 against reported anchors, beyond the review tolerance of 10 |
| 833100912 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833274872 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 38000 exceeds reported total assets 0 |
| 833481312 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833537822 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833622692 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833785702 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 50830 exceeds reported total assets 0 |
| 833793802 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833801082 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833838962 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 834094932 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 834097842 | COMPANY | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -12135821 against reported anchors, beyond the review tolerance of 166 |
| 834810212 | COMPANY | NO_PUBLISHABLE_PERIOD | The company was registered 2025-01-08, after this period starts |
| 834864312 | COMPANY | NO_PUBLISHABLE_PERIOD | The company was registered 2025-01-16, after this period starts |
| 834907402 | COMPANY | NO_PUBLISHABLE_PERIOD | The company was registered 2025-02-04, after this period starts |
| 834929422 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 834940132 | COMPANY | NO_PUBLISHABLE_PERIOD | The company was registered 2025-01-29, after this period starts |
| 835054462 | COMPANY | NO_PUBLISHABLE_PERIOD | The company was registered 2025-02-18, after this period starts |
| 835145972 | COMPANY | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| … og 1805 til | | | |

## Perioder som ikke kan publiseres

_Ingen. Alle perioder består validering._

## Perioder som venter på manuell kontroll

| Orgnr | Scope | År | Residual |
|---|---|---|---|
| 910686909 | COMPANY | 2024 | -1000000 |
| 914892902 | COMPANY | 2024 | -1000 |
| 919967072 | CONSOLIDATED | 2025 | 1000000 |
| 931046489 | COMPANY | 2024 | -1125 |
| 932137305 | COMPANY | 2024 | 127 |
| 938702675 | COMPANY | 2024 | 2000000 |
| 938702675 | COMPANY | 2025 | -1000000 |
| 963865724 | COMPANY | 2024 | 2000000 |
| 986529551 | COMPANY | 2024 | 1000000 |
| 986529551 | COMPANY | 2025 | 1000000 |
| 986529551 | CONSOLIDATED | 2025 | -1000000 |
| 991036393 | CONSOLIDATED | 2025 | -1000 |
| 991279539 | COMPANY | 2025 | -1000000 |
| 991279539 | CONSOLIDATED | 2025 | -1000000 |
| 991478450 | COMPANY | 2025 | 1000000 |
| 992614145 | COMPANY | 2024 | -1000000 |
| 996739848 | CONSOLIDATED | 2025 | -2000000 |
| 999256864 | CONSOLIDATED | 2024 | -1000000 |
