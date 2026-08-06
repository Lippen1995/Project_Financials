# Karantene – kode som ikke er i bruk

**Status:** Ikke i bruk. Ikke slettet.

**Dato:** 5.–6. august 2026

Mappen inneholder to atskilte ting:

| Sti | Innhold |
| --- | --- |
| `quarantine/` (rot) | Det pensjonerte PDF-/OCR-løpet |
| `quarantine/orphaned/` | Filer uten én eneste importør, se eget avsnitt nederst |

Resten av dette dokumentet handler om OCR-delen.

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

---

# `orphaned/` – filer uten importører

**Dato:** 6. august 2026

21 filer, 3 975 kodelinjer. Ingen av dem ble importert av noe som helst da de
ble flyttet, kontrollert både med importgraf og med et direkte søk rett før
flyttingen. Ingen av dem hadde testfiler.

De er ikke slettet. Årsaken er at «null importører» forteller hvorfor en fil
ikke er i bruk, men ikke om den burde vært det — noe kan være skrevet ferdig
før det ble koblet på.

## Erstattet av 5C-redesignen (22.–23. juni 2026)

Alle sist endret i samme to dager, av «redesign company ownership tabs» og
«full-width overview». Dette er versjonene fra før redesignen.

`organization-tab.tsx` · `financial-chart.tsx` · `legal-structure.tsx` ·
`overview-side-panel.tsx` · `overview/key-figures-overview.tsx` ·
`overview/company-info.tsx` · `overview/ai-summary.tsx`

Merk: Konsern-fanen er ikke bygget om ennå. `organization-tab.tsx` og
`legal-structure.tsx` kan være referansemateriale for det arbeidet.

## Den som ikke passer inn

`overview/overview-aside.tsx` — sist endret 24. juli 2026 av «harden Njord and
structured financials», altså nylig og ikke som del av redesignen. Enten ble
den foreldreløs som en bieffekt av det arbeidet, eller så er den skrevet for
noe som ikke er koblet på. Denne er den minst opplagte i hele settet.

## Nylig foreldreløse (juni–juli 2026)

`search/search-form.tsx` · `search/filter-panel.tsx` ·
`watchlist/watchlist-quick-add.tsx` · `watchlist/watchlist-event-feed.tsx` ·
`dashboard/relevant-insights-section.tsx`

Foreldreløse i løpet av den siste måneden. Vanligvis betyr det «erstattet»,
men det kan også bety «skrevet før det ble koblet på».

## Eldre, mest sannsynlig reelt død (mars–mai 2026)

`server/services/legal-structure-service.ts` ·
`server/persistence/financial-cache.ts` · `server/actions/workspace-actions.ts` ·
`company/ebit-chart.tsx` · `company/company-table.tsx` ·
`company/metric-grid.tsx` · `company/roles-list.tsx` · `auth/login-form.tsx`

`legal-structure-service.ts` gjorde fire direkte Brreg-kall og hadde ingen
kallere. Hadde noe koblet den på igjen, ville den brutt GL-A01 med en gang.
