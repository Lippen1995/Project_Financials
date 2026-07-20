# KPI-register for lukket beta

**Status:** Definert, måleevne ikke komplett

**Rapportering:** Ukentlig fra betaåpning, uten syntetiske eller manuelt pyntede tall

## KPI-er

| ID | KPI | Definisjon | Datakilde | Foreslått terskel | Måleevne nå | Eier |
| --- | --- | --- | --- | --- | --- | --- |
| KPI-01 | Aktivering | Unike inviterte som fullfører første innlogging / unike inviterte | Invitasjoner, brukere og sesjon/aktiveringshendelse | Minst 60 % første uke | Delvis; entydig `activatedAt` mangler | Produkt |
| KPI-02 | Kjerneflyt | Aktive brukere som samme uke søker og åpner en profil / aktive brukere | `CompanySearchEvent` + profilvisningshendelse | Minst 70 % | Delvis; profilvisning må instrumenteres | Produkt / teknisk |
| KPI-03 | Dokumentert innsikt | Kjerneflyter som viser roller eller strukturert regnskap med kilde / fullførte kjerneflyter | Rolle-/regnskapsvisning med proveniens | Baseline måles i uke 1; ingen syntetiske data | Mangler visningshendelser | Data / produkt |
| KPI-04 | Datakvalitetsfeil | Bekreftede feil i organisasjons-, rolle- eller regnskapsdata per 100 profiler åpnet | Feedback + profilvisninger | 0 kritiske; trend ned uke for uke | Mangler samlet feedbackflyt | Data |
| KPI-05 | Njord nytte | Nyttige Njord-svar / alle vurderte Njord-svar | Svarfeedback | Minst 70 % før utvidelse | Ikke tilgjengelig; Njord er ikke aktiv | Produkt |
| KPI-06 | Njord faktastøtte | Svar som består kilde- og faktakontroll / evaluerte svar | Låst evalueringssett | 100 % for selskapsfakta og tall før produksjon | Planlagt til Sprint 3/4 | Teknisk / produkt |
| KPI-07 | Tilgjengelighet | Vellykkede syntetiske helsesjekker / alle planlagte sjekker | Ekstern uptime-monitor | Minst 99,5 % i beta, ekskludert avtalt vedlikehold | Ikke tilgjengelig før K1 | Teknisk |
| KPI-08 | Alvorlige hendelser | Antall P0/P1-hendelser i perioden | Hendelseslogg | 0 åpne P0; alle P1 med eier og tiltak | Hendelsesprosess mangler | Teknisk |
| KPI-09 | AI-kostnad | Faktisk modellkostnad / aktive brukere og per Njord-samtale | Leverandørbruk + intern tokenmåling | Innen godkjent K1-tak | Tokenbruk finnes; kostnad og Njord mangler | Produkt / teknisk |
| KPI-10 | Total betakostnad | Faktisk månedlig drift + AI + variable tjenester | Fakturaer og leverandørmåling | Innen godkjent K1-tak | Kostnadsregister opprettet, priser ikke verifisert | CEO |

Tersklene er arbeidsforslag og må godkjennes av navngitt produkteier/CEO. En terskel kan ikke endres etter at resultatet er sett uten at endringen logges med dato og begrunnelse.

## Minimum instrumentering før beta

- Invitasjon sendt, akseptert, tilbakekalt og utløpt.
- Første vellykkede innlogging eller eksplisitt `activatedAt`.
- Søk startet/fullført/feilet og resultatantall. `CompanySearchEvent` dekker mye av dette allerede.
- Profil åpnet med organisasjonsnummer, men uten å kopiere unødvendige persondata.
- Rolle- og strukturert regnskapsseksjon vist, tom eller feilet.
- Njord-forespørsel, modellbruk, kildeutfall og brukerfeedback når funksjonen aktiveres.
- Deployversjon, helsesjekk og hendelsesstatus.

## Datadisiplin

- Rapporten bruker bare registrerte hendelser og faktiske leverandørkostnader.
- Manglende målepunkt vises som «ikke målbart», ikke som null.
- Brukeridentifikatorer pseudonymiseres i KPI-rapporten der individnivå ikke er nødvendig.
- Søk og AI-bruk følger den eksisterende 30-dagers lagringsregelen med mindre personvernansvarlig beslutter noe strengere.
