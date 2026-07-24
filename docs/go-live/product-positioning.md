# Styrende produktposisjonering for Fjord Insight

**Status:** Besluttet produktretning for Sprint 0

**Beslutningsdato:** 22. juli 2026

**Formell godkjenner:** Simen Lippestad (CEO)

**Godkjent:** 22. juli 2026

Godkjenningen låser produktretningen, Njord som kjernekomponent og de tre prioriterte beta-arbeidsflytene. Den forhåndsgodkjenner ikke datadekning, teknisk gjennomførbarhet eller betadato; disse avgjøres gjennom GL-011 og GL-012.

Dette dokumentet styrer beta-charteret, prioriteringen og evalueringen av Fjord Insight. Ved konflikt med eldre formuleringer om betaens produktmål gjelder dette dokumentet. Krav til offisielle kilder, proveniens, personvern, sikkerhet og ærlige tomtilstander gjelder fortsatt uendret.

## Produktets kjerne

Fjord Insight er en intelligent analyseplattform for norske selskaper, personer og markeder, med Njord som brukerens private digitale analytiker. Produktet er ikke primært en selskapsdatabase eller en ny brukerflate for de samme grunnopplysningene som allerede finnes i offentlige registre og tradisjonelle oppslagstjenester.

Fjord Insight skal gjøre selskapsdata:

- bredere og mer sammenkoblet;
- historisk og søkbar;
- analyserbar og sammenlignbar;
- relevant for konkrete arbeidsoppgaver;
- enklere å omsette til dokumentert beslutningsgrunnlag.

Data er grunnlaget. Analyseverktøyene gjør dataene anvendelige. Arbeidsflytene gjør produktet relevant. Njord binder delene sammen.

## Verdiforslag og ønsket overgang

Produktet skal føre brukeren fra «finn informasjon om dette selskapet» til «hjelp meg å forstå markedet, identifisere de riktige selskapene, analysere og sammenligne dem og ta en bedre beslutning».

Fjord Insight skal utvikles rundt brukerens formål, ikke rundt strukturen i de eksterne datakildene. Verdien måles derfor i fullførte analyseoppgaver, spart tid, relevante funn og videre bruk av resultatet — ikke bare i søk, profilvisninger eller antall datapunkter.

## Prioriterte bruksmål

### M&A og corporate development

Identifisere, avgrense, rangere og sammenligne oppkjøpskandidater; forstå eiere og konsern; analysere historiske regnskap, risiko og avvik; lagre longlist/shortlist og følge kandidater over tid.

### Kunde- og markedssourcing

Definere en kommersiell idealprofil; segmentere markedet; prioritere selskaper; forstå relevante beslutningstakere, eiere og organisasjon; organisere og følge opp prospekter.

### Leverandørvalidering og motpartsanalyse

Vurdere finansiell robusthet, juridisk status, roller, konserntilknytning, avhengigheter og negative utviklingstrekk; sammenligne alternativer og dokumentere vurderingen.

### Styre- og lederrekruttering

Finne personer med relevant erfaring; analysere nåværende og tidligere roller, sektor- og selskapseksponering, nettverk og mulige interessekonflikter. Arbeidsflyten tas bare inn i beta dersom person- og rolledata har dokumentert tilstrekkelig kvalitet og lovlig behandlingsgrunnlag.

### Konkurrent- og bransjeanalyse

Definere et relevant selskapsunivers; sammenligne størrelse, vekst, lønnsomhet og kapitalstruktur; identifisere mønstre, avvik, vinnere og tapere; forstå geografi, segmenter, verdikjeder, eiere og strategiske bevegelser over tid.

## Njords produktkontrakt

Njord er en kjernekomponent, ikke en generell chatbot eller en valgfri tilleggsfunksjon. Njord skal være integrert i analysearbeidsflytene og kunne:

1. forstå brukerens mål og stille nødvendige oppfølgingsspørsmål;
2. definere og synliggjøre utvalgskriterier;
3. velge dynamisk blant alle autoriserte, normaliserte datadomener gjennom godkjente interne søke- og analyseverktøy;
4. bygge et relevant selskaps- eller personunivers;
5. analysere, sammenligne og rangere resultatene;
6. identifisere mønstre, avvik, risiko og manglende data;
7. skille dokumenterte fakta, beregninger, antakelser og hypoteser;
8. vise kilder, perioder og beregningsgrunnlag;
9. uttrykke usikkerhet og aldri fylle datagap med oppdiktet innhold;
10. foreslå neste analytiske steg;
11. lagre eller videreføre resultatet i brukerens arbeidsflyt.

Njord skal utføre strukturerte, flertrinns analyseoppgaver. LLM-en velger selv hvilke autoriserte datadomener, verktøy og analysetrinn som er relevante. Verktøylaget håndhever tilgang, datakvalitet, deterministiske beregninger og proveniens; LLM-en har ikke direkte database- eller infrastrukturtillgang. Et fritt tekstsvar uten etterprøvbar plan, verktøybruk, grunnlag og videreførbart resultat oppfyller ikke produktkontrakten. Se [ADR-0001](../adr/ADR-0001-njord-dynamic-authorized-data-access.md).

## Logisk produktarkitektur

```text
Brukerens formål
        ↓
Njord planlegger analysen og avklarer kriterier
        ↓
Godkjente interne søke- og analyseverktøy
        ↓
Normaliserte selskaps-, person-, markeds- og dokumentdata
        ↓
Beregninger, sammenligninger og rangering
        ↓
Kildebasert analyse, lagret resultat og anbefalte neste steg
```

Frontend og Njord skal ikke konsumere rå eksterne API-responser. Alle fakta skal følge provider-, normaliserings-, domene-, persistence/cache- og service-lagene og beholde påkrevd proveniens.

## Differensiering

Fjord Insight skal over tid differensiere seg gjennom:

1. **Større omfang:** finans, eierskap, konsern, personer, roller, historiske endringer, kunngjøringer, dokumenter, immaterielle rettigheter, geografi og markeds-/bransjedata når reelle og lovlige kilder finnes.
2. **Bedre tilgang:** avansert søk, naturlig språk, screening, filtrering, sammenligning, nettverk, historikk, overvåkning, arbeidsflater, eksport og senere API/integrasjoner.
3. **Bedre analyse:** regnskaps-, peer-, trend-, eierskaps-, nettverks-, bransje-, risiko-, scenario- og sensitivitetsanalyse.
4. **Formålstilpasning:** de samme dataene skal tolkes og rangeres forskjellig for M&A, sourcing, leverandørkontroll, rekruttering og markedsanalyse.
5. **Et intelligent arbeidslag:** plattformen skal hjelpe brukeren å formulere, gjennomføre, dokumentere, følge opp og gjenta analysen.

## Betaens hypotese og kritiske brukerreise

Betaen skal teste om Fjord Insight og Njord sammen kan løse konkrete profesjonelle analyseoppgaver bedre enn brukerens eksisterende kombinasjon av oppslagstjenester, Brreg, regneark, nettsøk og manuell analyse.

**Kjernehypotese:** Fjord Insight reduserer tiden, kompleksiteten og det manuelle arbeidet i en selskaps-, person- eller bransjeanalyse, samtidig som resultatet blir bedre dokumentert og mer anvendelig.

**Kritisk brukerreise:**

> Definer formål → søk eller be Njord bygge universet → analyser og sammenlign → undersøk selskaper eller personer → dokumenter konklusjonen → lagre eller overvåk resultatet

Søk og selskapsprofil er nødvendige byggeklosser, men er ikke alene tilstrekkelige til å validere verdiforslaget.

## Minimum for beta

Betaen skal ha minst tre komplette arbeidsflyter:

1. **M&A-screening:** definer kriterier, bygg longlist, ranger, analyser selskaper, sammenlign og lagre shortlist.
2. **Kunde- eller leverandørsourcing:** definer målprofil, finn og ranger selskaper, gjennomfør enkel validering og lagre arbeidsliste.
3. **Konkurrent- eller bransjeanalyse:** definer univers, sammenlign nøkkeltall, identifiser trender og avvik, få Njords kildebaserte analyse og lagre konklusjoner.

Styre- og lederrekruttering kan være en fjerde arbeidsflyt etter en egen kvalitets- og personvernport.

En arbeidsflyt er ikke beta-klar dersom nødvendige data mangler. Den skal da avgrenses, deaktiveres eller vise tydelig utilgjengelighet. Historikk, eierskap, konsern, personer, geografi og dokumentdata er krav som må få reelle kilder og dokumentert dekning; de er ikke tillatelse til å simulere innhold.

## Kommersiell posisjonering

Fjord Insight skal ikke markedsføres som en billigere oppslagstjeneste, en ny selskapskatalog, en generell KI-chat eller et oppslagsverk med flere datapunkter.

Budskapet skal knyttes til arbeidsresultatet: finn bedre oppkjøpskandidater, identifiser relevante kunder, reduser leverandørrisiko, finn riktige styrekandidater, forstå konkurrenter og analyser bransjer raskere — med mindre tid brukt på datainnhenting og mer på beslutninger.
