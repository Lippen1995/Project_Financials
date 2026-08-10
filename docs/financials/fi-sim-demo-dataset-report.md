# FI-SIM valideringsrapport: fi-sim-demo-2026.1-a

Datasettet er skrevet og validert.

| | |
|---|---|
| Kjørt | 2026-08-09T13:17:25.390Z |
| Taksonomi | FI-SIM-2026.1 |
| Generator | fi-sim-generator-2026.1 |
| Antakelser | fi-sim-assumptions-2026.1 |
| Profilregler | fi-sim-profile-rules-2026.1 |
| Rapportert datasett ankrene er frosset fra | reported:0 |
| Scope | COMPANY |
| Siste fullførte regnskapsår | 2025 |

## Dekning

| | |
|---|---|
| Selskaper forsøkt | 1000 |
| Selskaper med minst én periode | 822 |
| Selskaper uten noen periode | 178 |
| Perioder | 2949 |
| Statements | 5898 |
| – hybride | 1006 |
| – helt simulerte | 4892 |
| Rapporterte ankerlinjer | 6312 |
| Syntetiske linjer | 87173 |
| Andel linjer som er rapporterte ankere | 6.8 % |
| År hoppet over (før stiftelse eller ikke avsluttet) | 1427 |

## Profilfordeling

| Profil | Antall |
|---|---|
| SERVICE | 1559 |
| TRADE | 583 |
| MANUFACTURING_CONSTRUCTION | 497 |
| PROPERTY | 277 |
| HOLDING_INVESTMENT | 33 |

## Ankertyper

Hvilke konsepter som ble bundet til en rapportert linje, og hvor ofte.

| Konsept | Antall |
|---|---|
| ProfitForPeriod | 503 |
| AssetsTotal | 503 |
| EquityTotal | 503 |
| ProfitBeforeTax | 500 |
| CurrentAssetsTotal | 500 |
| LiabilitiesTotal | 500 |
| OperatingResult | 491 |
| OperatingIncomeTotal | 488 |
| OperatingExpenseTotal | 487 |
| CurrentLiabilitiesTotal | 486 |
| AccumulatedResults | 478 |
| NetFinancialResult | 473 |
| LongTermLiabilitiesTotal | 400 |

## Residualer

| | |
|---|---|
| Avrundingsdifferanser | 292 |
| Ufordelte differanser til manuell kontroll | 0 |
| Største absolutte residual | 4000 |

| Identitet | Antall |
|---|---|
| BalanceEquation | 121 |
| ProfitBeforeTax | 78 |
| OperatingResult | 74 |
| LiabilitiesTotal | 19 |

## Mappinggrad

Alle genererte linjer skrives med `metricKey = null`, jf. spec seksjon 11. Mapping kjøres som et eget, dataset-avgrenset overlay etter generering, og måles derfor ikke her.

**Et nygenerert datasett er dermed helt umappet.** Alt som drives av `metricKey` — standardisert visning, nøkkeltall og Njords linjeoppslag — er tomt til mapping er kjørt over datasettet. Det må gjøres før noen demonstrerer det.

## Feil

| Feilkode | Antall |
|---|---|
| CONTRADICTORY_REPORTED_ANCHORS | 108 |
| INVALID_PERIOD | 88 |
| UNSUPPORTED_SIMULATION_PROFILE | 11 |
| INVALID_UNIT_OR_CURRENCY | 4 |
| UNSOLVABLE_STATEMENT_IDENTITY | 1 |

## Selskaper som ikke støttes

| Orgnr | Kode | Årsak |
|---|---|---|
| 811413682 | INVALID_UNIT_OR_CURRENCY | Anchor AccumulatedResults is EUR/1, the statement is NOK/1 |
| 811634662 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 812099302 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -88310282 against reported anchors, beyond the review tolerance of 13 |
| 812619942 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 813399652 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 813422832 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 813855992 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 814469832 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -94271482 against reported anchors, beyond the review tolerance of 16 |
| 814726282 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 815696832 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 815728092 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 816161762 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -101414006 against reported anchors, beyond the review tolerance of 34 |
| 816299802 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 816793432 | UNSUPPORTED_SIMULATION_PROFILE | Bank og annen kredittgivning har egen regnskapsoppstilling og er ikke modellert i v1. |
| 816814332 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -114514408 against reported anchors, beyond the review tolerance of 10 |
| 816910412 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 816914582 | UNSUPPORTED_SIMULATION_PROFILE | Bank og annen kredittgivning har egen regnskapsoppstilling og er ikke modellert i v1. |
| 817107702 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 817244742 | UNSUPPORTED_SIMULATION_PROFILE | Bank og annen kredittgivning har egen regnskapsoppstilling og er ikke modellert i v1. |
| 818040032 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 818232942 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 818695322 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 818779542 | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 77263 exceeds reported total assets 40253 |
| 819320152 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 819419892 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 819439842 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 819607222 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 819902712 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 820255992 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 820380932 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 820649532 | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 30000 exceeds reported total assets 2267 |
| 820761502 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 820765052 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 821204682 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 822154662 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -149010348 against reported anchors, beyond the review tolerance of 30 |
| 822237622 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 822347452 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 822547052 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 823255802 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 823577222 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 824991502 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -97807501 against reported anchors, beyond the review tolerance of 51 |
| 825293922 | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 30000 exceeds reported total assets 0 |
| 825583122 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 825602712 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -88154228 against reported anchors, beyond the review tolerance of 10 |
| 825904042 | INVALID_UNIT_OR_CURRENCY | Anchor AccumulatedResults is EUR/1, the statement is NOK/1 |
| 826029722 | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 636738 exceeds reported total assets 593452 |
| 826156082 | CONTRADICTORY_REPORTED_ANCHORS | ProfitBeforeTax is off by -7391380 against reported anchors, beyond the review tolerance of 11 |
| 826311312 | CONTRADICTORY_REPORTED_ANCHORS | LiabilitiesTotal is off by 138474 against reported anchors, beyond the review tolerance of 169 |
| 826384352 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 826809302 | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 30000 exceeds reported total assets 0 |
| 827264342 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 827269972 | CONTRADICTORY_REPORTED_ANCHORS | BalanceEquation is off by -28814 against reported anchors, beyond the review tolerance of 36 |
| 828166522 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 829161672 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 829231212 | UNSOLVABLE_STATEMENT_IDENTITY | Operating expenses solve to -27217, which no statement can publish |
| 829290162 | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 461264 exceeds reported total assets 458458 |
| 829401142 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 830087192 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -163183990 against reported anchors, beyond the review tolerance of 14 |
| 830162852 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -121776278 against reported anchors, beyond the review tolerance of 29 |
| 830306862 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 830341072 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -89319451 against reported anchors, beyond the review tolerance of 10 |
| 830669752 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 831046872 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 831068892 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 831140402 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -97580857 against reported anchors, beyond the review tolerance of 10 |
| 831556412 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 831571152 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 831824352 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832055522 | INVALID_UNIT_OR_CURRENCY | Anchor AccumulatedResults is USD/1, the statement is NOK/1 |
| 832065072 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832318132 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832433802 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832451312 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -61107475 against reported anchors, beyond the review tolerance of 10 |
| 832522252 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -41564126 against reported anchors, beyond the review tolerance of 13 |
| 832836842 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832891932 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832892092 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832958492 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 832991872 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -3896582 against reported anchors, beyond the review tolerance of 10 |
| 833100912 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833274872 | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 38000 exceeds reported total assets 0 |
| 833481312 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833537822 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833622692 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833785702 | CONTRADICTORY_REPORTED_ANCHORS | Reported equity 50830 exceeds reported total assets 0 |
| 833793802 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833801082 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 833838962 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 834094932 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 834097842 | CONTRADICTORY_REPORTED_ANCHORS | OperatingResult is off by -12135821 against reported anchors, beyond the review tolerance of 166 |
| 834810212 | NO_PUBLISHABLE_PERIOD | The company was registered 2025-01-08, after this period starts |
| 834864312 | NO_PUBLISHABLE_PERIOD | The company was registered 2025-01-16, after this period starts |
| 834907402 | NO_PUBLISHABLE_PERIOD | The company was registered 2025-02-04, after this period starts |
| 834929422 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 834940132 | NO_PUBLISHABLE_PERIOD | The company was registered 2025-01-29, after this period starts |
| 835054462 | NO_PUBLISHABLE_PERIOD | The company was registered 2025-02-18, after this period starts |
| 835145972 | INVALID_PERIOD | The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded |
| 835146502 | NO_PUBLISHABLE_PERIOD | The company was registered 2025-03-03, after this period starts |
| 835197492 | NO_PUBLISHABLE_PERIOD | The company was registered 2025-03-12, after this period starts |
| 835226042 | NO_PUBLISHABLE_PERIOD | The company was registered 2025-03-24, after this period starts |
| … og 78 til | | |

## Perioder som ikke kan publiseres

_Ingen. Alle perioder består validering._

## Perioder som venter på manuell kontroll

_Ingen._
