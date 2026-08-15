# G1-bevis: modellkallsteder

**Status:** K0 teknisk kontroll fullført 15. august 2026 – ingen modell eller kostnad aktivert

## Resultat

Det aktive kilde-treet har ett leverandørkallsted for språkmodeller:

- `server/ai-search/llm/openai-client.ts`

Njord, søkeintensjon og dashboardets scope-klassifisering bruker alle
`LlmClient`. Seks konkrete transport-, konstruksjons- og kjøresteder er
registrert med tillatt signal per fil; bare OpenAI-adapteren har lov til å eie
provider-transporten. De to klassifisererne bygger den felles sikre
systeminstruksen og kjører den samme injeksjonsinspeksjonen før adapteren kan
kalles.

Søkeintensjon krever et eksplisitt output-tokenbudsjett, aktiv betalt
AI-hovedbryter og konfigurert nøkkel. De to aktive brukerflatene reserverer
kvote og kostnadsramme før søket, registrerer observert tokenbruk og frigir en
ubenyttet reservasjon. Dashboardets separate scope-klassifisering krever både
tokenbudsjett og en callback som sluttfører observert bruk, men er fortsatt
fail-closed i produktflyten: resolver-ruten sender ikke budsjett og kan derfor
ikke utløse modellbruk.

Hvis leverandøren returnerer et potensielt belastet svar uten nødvendig
regnskapsmetadata, markeres hendelsen som feilet og hele token- og
kostnadsreservasjonen overføres til forbruksfeltene. Kapasiteten gis dermed ikke
tilbake før manuell avstemming kan fastslå faktisk forbruk.

## Automatisk port

`lib/llm-callsite-inventory.test.ts` skanner JavaScript-, TypeScript- og
Python-kilder fra repository-roten. Genererte mapper, andre worktrees,
sikkerhetskopier, test-fixtures og `quarantine` er eksplisitt utelatt fordi de
ikke er del av aktiv runtime. Direkte provider-URL-er, kjente
provider-SDK-signaturer, konstruksjon av LLM-klienter og kjøring gjennom den
typede `LlmClient`-grensen må være registrert med riktig signal per fil. Et
provider-kall lagt i en fil som bare er godkjent som LLM-konsument feiler
derfor også testen.

Den samme regresjonspakken kontrollerer:

- leverandøruavhengig JSON-respons og eksplisitt outputgrense i `LlmClient`;
- obligatorisk heltallig outputgrense for hvert faktisk adapterkall;
- sikker systeminstruks for begge søkeklassifiserere;
- avvisning før modellkall ved instruksjons-/hemmelighetsuthenting;
- null modellkall uten budsjett, hovedbryter eller nøkkel;
- uendret registrering av faktisk provider-tokenbruk.
- bevaring og sluttføring av provider-tokenbruk også når svaret mangler en
  brukbar assistentmelding.
- konservativ belastning av full reservasjon når leverandørens
  regnskapsmetadata mangler.

## Avgrensning

Kontrollen lukker det kodebaserte avviket i GL-A03/R-019. Den godkjenner ikke
G1, modellvalg, leverandøravtale, ekte modellbruk eller K1-kostnad. Faktisk
provideradferd, kostnadsavstemming, flerinstansgrenser og modell-evaluering
forblir egne G1/G2-porter.

De konkrete søkeproviderne og deres proveniens er fortsatt eksplisitt
OpenAI-spesifikke. `LlmClient` fjerner direkte transportkall fra produktlogikken,
men denne K0-kontrollen er ikke i seg selv bevis på at søk kan bytte provider
uten ny provider-wiring og korrekt kildemapping.
