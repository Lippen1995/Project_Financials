# Sprint 2 – dekning i åpent Brreg-regnskaps-API

**Rapportversjon:** structured-financial-coverage@1

**Generert:** 2026-07-27T09:23:35.414Z

**Omfang:** Første tekniske K0-livebevis, 10 virksomheter valgt deterministisk
av ingest-jobben blant lokale selskaper som ikke var kontrollert tidligere.
Utvalget er ikke representativt for hele det norske selskapsuniverset.

## Sammendrag

| Måling | Antall |
| --- | ---: |
| Kontrollerte virksomheter | 10 |
| Tilgjengelig fra kilden | 8 |
| Ikke tilgjengelig fra kilden | 2 |
| Kilde-/kontraktfeil | 0 |
| Virksomheter med lagret strukturert statement | 8 |

## Feltdekning i lagrede statements

| Felt | Tilgjengelig | Dekning |
| --- | ---: | ---: |
| Driftsinntekter | 7 / 8 | 87,5 % |
| Driftsresultat | 7 / 8 | 87,5 % |
| Årsresultat | 8 / 8 | 100 % |
| Egenkapital | 8 / 8 | 100 % |
| Sum eiendeler | 8 / 8 | 100 % |

## Oppstillingsplaner

| Oppstillingsplan | Antall |
| --- | ---: |
| store | 8 |

## Årsaker til manglende data

| Årsak | Antall |
| --- | ---: |
| Bare avviklingsregnskap er tilgjengelig. | 1 |
| HTTP 404: ingen regnskap | 1 |

Rapporten inneholder ikke selskapsnavn eller syntetiske verdier. Den beskriver
bare faktisk observerte svar og lagrede strukturerte Brreg-statements.
