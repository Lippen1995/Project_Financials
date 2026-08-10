# FI-SIM valideringsrapport: fi-sim-investor-2026.1-20260810-b

Datasettet er skrevet og validert.

| | |
|---|---|
| Kjørt | 2026-08-10T20:22:32.387Z |
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
| Selskaper forsøkt | 9004 |
| Selskaper med minst én periode | 7388 |
| Selskaper uten noen periode | 1616 |
| Perioder | 25874 |
| Statements | 51748 |
| – hybride | 9980 |
| – helt simulerte | 41768 |
| Rapporterte ankerlinjer | 62449 |
| Syntetiske linjer | 758066 |
| Andel linjer som er rapporterte ankere | 7.6 % |
| År hoppet over (før stiftelse eller ikke avsluttet) | 14883 |

## Profilfordeling

| Profil | Antall |
|---|---|
| SERVICE | 13789 |
| TRADE | 5094 |
| MANUFACTURING_CONSTRUCTION | 4570 |
| PROPERTY | 2214 |
| HOLDING_INVESTMENT | 207 |

## Scopefordeling

| Scope | Antall |
|---|---|
| COMPANY | 25091 |
| CONSOLIDATED | 783 |

## Ankertyper

Hvilke konsepter som ble bundet til en rapportert linje, og hvor ofte.

| Konsept | Antall |
|---|---|
| ProfitForPeriod | 4990 |
| AssetsTotal | 4990 |
| EquityTotal | 4988 |
| CurrentAssetsTotal | 4976 |
| LiabilitiesTotal | 4959 |
| ProfitBeforeTax | 4956 |
| OperatingResult | 4834 |
| OperatingIncomeTotal | 4802 |
| OperatingExpenseTotal | 4779 |
| CurrentLiabilitiesTotal | 4749 |
| AccumulatedResults | 4726 |
| NetFinancialResult | 4607 |
| LongTermLiabilitiesTotal | 4093 |

## Residualer

| | |
|---|---|
| Avrundingsdifferanser | 2692 |
| Ufordelte differanser til manuell kontroll | 0 |
| Største absolutte residual | 2000000 |

| Identitet | Antall |
|---|---|
| BalanceEquation | 1127 |
| ProfitBeforeTax | 746 |
| OperatingResult | 625 |
| LiabilitiesTotal | 193 |
| EquityTotal | 1 |

## Mappinggrad

Alle genererte linjer skrives med `metricKey = null`, jf. spec seksjon 11. Mapping kjøres som et eget, dataset-avgrenset overlay etter generering, og måles derfor ikke her.

**Et nygenerert datasett er dermed helt umappet.** Alt som drives av `metricKey` — standardisert visning, nøkkeltall og Njords linjeoppslag — er tomt til mapping er kjørt over datasettet. Det må gjøres før noen demonstrerer det.

## Feil

| Feilkode | Antall |
|---|---|
| CONTRADICTORY_REPORTED_ANCHORS | 1022 |
| INVALID_PERIOD | 685 |
| UNSOLVABLE_STATEMENT_IDENTITY | 108 |
| INVALID_UNIT_OR_CURRENCY | 83 |
| UNSUPPORTED_SIMULATION_PROFILE | 65 |

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
| 829997282 | COMPANY | UNSOLVABLE_STATEMENT_IDENTITY | Operating expenses solve to -27226, which no statement can publish |
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
| … og 1586 til | | | |

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
