# Beta-charter

**Status:** Forslag til godkjenning

**Mål:** Lukket beta for 10–20 inviterte brukere

**Måldato:** 31. august 2026, bare dersom port G2 er bestått

## Betaløfte

En invitert bruker skal kunne logge inn, finne en norsk virksomhet, åpne en selskapsprofil og se de virksomhets-, rolle- og regnskapsopplysningene Fjord Insight faktisk kan dokumentere fra offisielle kilder. Manglende data skal vises som utilgjengelig. Njord kan være med først når svarene er kildeforankret, bruken er begrenset og en ekte modell har bestått avtalte kvalitets- og sikkerhetstester.

## Foreslått målgruppe

- 10–20 norske analytikere, rådgivere eller profesjonelle virksomhetsbrukere med et reelt behov for selskapsoppslag.
- Brukerne må akseptere at dette er en lukket beta og være villige til å gi strukturert tilbakemelding.
- Brukere med behov som krever komplett årsregnskapshistorikk eller regulatorisk fullstendighet tas ikke inn før dekningen er dokumentert.

**Åpen beslutning:** Navngi rekrutteringsansvarlig og dokumenter utvalgskriterier og planlagt kohortstørrelse senest 21. juli. Kandidatidentiteter skal ligge i et godkjent tilgangsstyrt system, ikke i repoet.

## Foreslått omfang

| Område | Betaomfang | Utgivelsesregel |
| --- | --- | --- |
| Tilgang | Invitasjon, registrering, innlogging og tilbakekallbar tilgang | Ikke-offentlige flater krever autentisering |
| Virksomhetssøk | Navn, organisasjonsnummer og de filtrene Brreg faktisk støtter eller som kan etterbehandles ærlig | Tom-, feil- og loadingtilstand må fungere |
| Selskapsprofil | Kjerneopplysninger, adresser, næringskode og kildesporbarhet | Brreg er master; SSB beriker kun kodebeskrivelse |
| Roller og styre | Registrerte roller fra Brreg | Tomtilstand når kilden ikke gir roller |
| Regnskap | Siste strukturerte regnskap fra Brreg når tilgjengelig | Ingen betaflate kan være avhengig av OCR; manglende eller ikke støttet oppstillingsplan gir tomtilstand |
| Feature gating | Eksisterende abonnementsstatus og server-side tilgangskontroll | Betalingskjøp er ikke nødvendig for lukket beta |
| Njord | Ekte modell via godkjente interne verktøy | Deaktivert til Sprint 3/4-porter, evaluering og kostnadstak er bestått |

## Utenfor betaomfanget

- OCR-/PDF-avhengig regnskapshistorikk som produksjonskrav.
- Komplett regnskapsdekning, konserntall eller bank-/forsikringsoppsett som det åpne strukturerte Brreg-API-et ikke leverer.
- Finanstilsynet-overlay før provider, datakontrakt og tomtilstand er implementert.
- Kjøp av komplett Brreg-leveranse (K2).
- Åpen selvbetjent lansering, offentlig markedsføring eller løfte om nasjonal fullstendighet.
- Nye produktmoduler som ikke er nødvendige for kjernereisen: innlogging → søk → profil → dokumentert innsikt → valgfri Njord.

Eksisterende funksjoner utenfor omfanget må enten skjules i beta, merkes som ikke tilgjengelige eller risikovurderes og godkjennes eksplisitt. De blir ikke automatisk en del av betaen fordi koden finnes.

## Roller og beslutningsmyndighet

| Rolle | Person | Myndighet | Stedfortreder | Frist |
| --- | --- | --- | --- | --- |
| Lanseringsmyndighet | Ikke navngitt | Endelig go/no-go og skriftlig risikoaksept | Ikke navngitt | 21. juli |
| Produkteier | Ikke navngitt | Omfang, målgruppe og KPI-er | Ikke navngitt | 21. juli |
| Teknisk eier | Ikke navngitt | Arkitektur, sikkerhet, release og drift | Ikke navngitt | 21. juli |
| Personvernansvarlig | Ikke navngitt | Behandlingsgrunnlag, lagring og rettigheter | Ikke navngitt | 21. juli |
| Betarekruttering og support | Ikke navngitt | Invitasjoner, kontaktpunkt og feedback | Ikke navngitt | 21. juli |

Rollenavn er ikke tilstrekkelig for å lukke GL-003. Personnavn og stedfortreder skal settes før Sprint 0 kan godkjennes.

## Godkjenning

| Beslutning | Besluttet av | Dato | Status |
| --- | --- | --- | --- |
| Betamål og målgruppe | – | – | Åpen |
| Funksjonsomfang | – | – | Åpen |
| Navngitte eiere og fullmakter | – | – | Åpen |
