# Sprint 2 – dekning i åpent Brreg-regnskaps-API

**Rapportversjon:** structured-financial-coverage@2

**Generert:** 2026-07-27T10:20:45.276Z

**Utvalgsprofil:** sprint-2-closeout-stratified@1

**Mål / valgt / avvik:** 150 / 149 / 1

**Poolstørrelse:** 10816

**Poolfingeravtrykk:** ba1b6f23746c06589b4c1b176c7199e32f3dda5ab288f562c2c54f3a3e9bc3c6

**Utvalgsfingeravtrykk:** f60c309856719cecda80db8679f154e768678cde81d446d5f97d8e98ac699418

| Stratum | Mål | Valgt |
| --- | ---: | ---: |
| AS – aktiv | 40 | 40 |
| AS – oppløst | 25 | 25 |
| AS – konkurs | 25 | 25 |
| ASA – aktiv | 5 | 5 |
| ASA – ikke aktiv | 5 | 4 |
| ENK – aktiv | 10 | 10 |
| ENK – ikke aktiv | 10 | 10 |
| ANS/DA – aktiv | 10 | 10 |
| ANS/DA – ikke aktiv | 10 | 10 |
| Øvrige former – aktiv | 5 | 5 |
| Øvrige former – ikke aktiv | 5 | 5 |

**Kildekontroller fra / til:** 2026-07-27T09:23:26.299Z / 2026-07-27T10:10:03.100Z

## Sammendrag

| Måling | Antall |
| --- | ---: |
| Kontrollerte virksomheter | 149 |
| Tilgjengelig fra kilden | 95 |
| Ikke tilgjengelig fra kilden | 54 |
| Utdatert etter kildefeil | 0 |
| Kilde-/kontraktfeil | 0 |
| Virksomheter med lagret strukturert statement | 95 |

## Utvalgsfordeling

### Organisasjonsform

| Organisasjonsform | Kontrollert | Tilgjengelig | Ikke tilgjengelig | Utdatert | Feil | Tilgjengelighet |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ANS | 3 | 0 | 3 | 0 | 0 | 0 % |
| AS | 90 | 87 | 3 | 0 | 0 | 96,7 % |
| ASA | 9 | 6 | 3 | 0 | 0 | 66,7 % |
| DA | 17 | 0 | 17 | 0 | 0 | 0 % |
| ENK | 20 | 0 | 20 | 0 | 0 | 0 % |
| FLI | 6 | 0 | 6 | 0 | 0 | 0 % |
| NUF | 1 | 1 | 0 | 0 | 0 | 100 % |
| SA | 2 | 1 | 1 | 0 | 0 | 50 % |
| SPA | 1 | 0 | 1 | 0 | 0 | 0 % |

### Virksomhetsstatus

| Status | Kontrollert | Tilgjengelig | Ikke tilgjengelig | Utdatert | Feil | Tilgjengelighet |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ACTIVE | 70 | 43 | 27 | 0 | 0 | 61,4 % |
| BANKRUPT | 35 | 27 | 8 | 0 | 0 | 77,1 % |
| DISSOLVED | 44 | 25 | 19 | 0 | 0 | 56,8 % |

## Feltdekning i lagrede statements

| Felt | Tilgjengelig | Dekning |
| --- | ---: | ---: |
| Driftsinntekter | 87 / 95 | 91,6 % |
| Driftsresultat | 93 / 95 | 97,9 % |
| Årsresultat | 95 / 95 | 100 % |
| Egenkapital | 95 / 95 | 100 % |
| Sum eiendeler | 95 / 95 | 100 % |

## Oppstillingsplaner

| Oppstillingsplan | Antall |
| --- | ---: |
| store | 95 |

## Årsaker til manglende data

| Årsak | Antall |
| --- | ---: |
| Bare avviklingsregnskap er tilgjengelig. | 3 |
| HTTP 404: ingen regnskap | 48 |
| Oppstillingsplan ikke støttet | 3 |

Rapporten inneholder ikke selskapsnavn eller syntetiske verdier. Den beskriver bare faktisk observerte svar og lagrede strukturerte Brreg-statements.
