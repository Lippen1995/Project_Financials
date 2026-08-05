# Karantene – pensjonerte PDF-/OCR-flater

**Status:** Ikke i bruk. Ikke slettet.

**Dato:** 5. august 2026

Denne mappen inneholder inngangspunktene til PDF-/OCR-løpet: adminsider,
API-ruter og planlagte jobber. De er flyttet hit fordi
[go-live-planen](../docs/go-live-sprint-plan.md) tar OCR ut av den
produksjonskritiske dataflyten, og fordi det ikke holder at en flate «ikke
brukes» — så lenge ruten finnes, kan den nås.

Ingenting er slettet. Filene er flyttet med historikken i behold, slik at de
kan leses, sammenlignes og eventuelt hentes tilbake.

## Hva som er her

| Innhold | Antall |
| --- | ---: |
| Filer totalt | 423 |
| Kodelinjer | 121 248 |
| API-ruter | 48 |
| Adminsider | 23 |
| Testfiler | ~100 |

Det aktive treet gikk fra omtrent 264 000 til 142 512 kodelinjer.

Hele ekstraksjonslaget ligger her: OCR, sideklassifisering,
tabellrekonstruksjon, geometry-first, OpenDataLoader, PDF-beslutningsmotoren,
gold-set- og shadow-verktøyene, modellkandidatløpet og den manuelle
kontrollflaten.

Alt under `quarantine/` er utelatt fra `tsconfig.json`, `vitest.config.ts` og
ESLint. Next.js ruter bare det som ligger under `app/`, så flatene er
utilgjengelige selv med direkte URL.

Testene fulgte koden sin. Suiten gikk fra 2 025 til 849 tester. Det er ikke
tapt dekning av noe som er i drift — det er tester for kode som ikke lenger
kjører.

## Hva som IKKE er her

Tjenester, integrasjoner og Prisma-modeller er urørt. Karantenen fjerner
tilgangen til flatene, ikke koden bak dem eller dataene. Det betyr at:

- `AnnualReportFiling`, `AnnualReportReviewedFact`, `FinancialFact` og de andre
  modellene finnes fortsatt, med data;
- manuelle korreksjoner gjort av en person er fortsatt lagret;
- ingen migrasjon er kjørt som del av karantenen.

Avhengighetene i `package.json` er også urørt. `tesseract.js` og
`@opendataloader/pdf` har ingen bruk igjen i det aktive treet, men fjernes ikke
nå, siden koden her fortsatt refererer dem og en tilbakeflytting da ville
mangle dem. `pdf-parse` har fortsatt en reell bruker i drift:
innsidehandel-parsing fra Newsweb, som ikke er OCR.

Følgende adminflater er bevisst beholdt og ligger fortsatt under `app/`:

- `/admin/metric-mapping` – regnskapsmapping, som er infrastruktur for den
  betalte K2-leveransen, ikke OCR-arv;
- `/admin/ai-economics`, `/admin/users`, `/admin/company-events`,
  `/admin/shareholder-register`.

## Hvis noe skal tilbake

1. Flytt katalogen tilbake til samme sti under `app/`.
2. Legg tilbake eventuelle `npm`-skript den trenger.
3. Kjør `npm run typecheck` og `npm test` – karantenen har ikke blitt
   typesjekket, så koden kan ha blitt utdatert av endringer i tjenestelaget.

Punkt 3 er den viktige. Jo lenger dette ligger her, jo mer vil det ha råtnet.
Karantenen er en pause for å kunne vurdere hva som faktisk trengs, ikke et
arkiv som holder seg selv ved like.

## Videre

Sletting krever egen beslutning. Se GL-A04 i
[go-live-planen](../docs/go-live-sprint-plan.md).
