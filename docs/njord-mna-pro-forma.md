# Njord M&A-proforma

Njord kan bygge et ikke-revidert proforma resultatregnskap og en forenklet sluttbalanse for et
100 prosent oppkjøp. Funksjonen er kun tilgjengelig når den autentiserte brukeren har tilgang til
Due Diligence-modulen.

Tilgangskontrollen ligger på serversiden. Uten Due Diligence-tilgang fjernes både
`MNA_PRO_FORMA`-intensjonen og `build_mna_pro_forma` fra verktøyene språkmodellen mottar. Njord får
da instruks om å forklare tilgangskravet og ikke forsøke å beregne resultatet med andre verktøy.

## Datagrunnlag og forutsetninger

- Basisregnskap for kjøper og målselskap hentes fra lagrede, reelle regnskapsopplysninger.
- Automatisk valg foretrekker konsernregnskap og bruker selskapsregnskap når konsernregnskap ikke
  finnes. Valgt år og regnskapsomfang returneres eksplisitt.
- Av- og nedskrivninger til EBITDA spores til den konkrete publiserte linjen. Et brukeroppgitt
  overstyringstall spores som brukerinput.
- Kjøpesum, finansiering, transaksjonskostnader, virkelig-verdi-justeringer, skatt, rente,
  PPA-avskrivninger og synergier må oppgis av brukeren. Alle ikke-null forutsetninger må ha et
  ordrett tekstbevis fra den aktuelle meldingen. Dette gjelder også nullbeløp og valget om
  transaksjonskostnader skal resultatføres; Njord kan ikke bruke null som en stilltiende standard.
- Manglende regnskapsfelt eller forutsetninger behandles som ukjent, aldri som null.

## Beregning og svar

Verktøyet lager broer for omsetning, EBITDA, EBIT og årsresultat samt en sluttbalanse med eiendeler,
gjeld, egenkapital, utsatt skatt, kontanteffekt og goodwill. Balansen returnerer et eksplisitt
balansekontrollfelt. Resultatet merkes `COMPLETE` eller `PARTIAL`, og Njord må gjengi alle anvendte
forutsetninger og manglende input i svaret.

Resultatet er en scenarioanalyse, ikke et lovpliktig eller publisert proformaregnskap, en verdsettelse,
fairness opinion eller regnskapsfaglig attestasjon. Første versjon modellerer ikke blant annet
arbeidskapital, kontant-/gjeldsjustering, minoriteter, earn-out, valuta, integrasjonsprofil eller full
IFRS 3-/NGAAP-kjøpesumsallokering. Brukeren må bekrefte forutsetningene før resultatet brukes videre.
