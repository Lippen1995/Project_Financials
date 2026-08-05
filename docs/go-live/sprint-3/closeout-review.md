# Sprint 3 – closeout review

**Status:** K0 teknisk fullført – avventer eksplisitt CEO-godkjenning

**Gjennomgangsdato:** 29. juli 2026

**Kostnadsnivå:** K0 – ingen ny ekstern kostnad eller modellbruk aktivert

## Konklusjon

Sprint 3 har levert det leverandøruavhengige analysefundamentet,
datakontraktene, verktøygrensene, kildekravene, tomtilstandene,
sikkerhetskontrollene, kostnadsreservasjonen, feedbacken,
analysepersistensen og den deterministiske 50-case evalueringsrunneren som
kreves før en ekte modell kan prøves.

K0-arbeidet kan godkjennes som teknisk fullført. Godkjenningen skal ikke tolkes
som valg av modell, leverandør eller host, og den åpner ikke K1-kostnad eller
kundebruk.

## Leveransestatus

| Område | Status | Gjenstående port |
| --- | --- | --- |
| GL-301–GL-305 | K0 teknisk lukket | Ekte modellbevis etter godkjent G1-evalueringsramme |
| GL-306 | Lukket for én appinstans | Delt limiter og hostbevis i G1/G2 |
| GL-307 | K0 teknisk lukket | Avstemming mot ekte leverandørkost etter godkjent G1-evaluering |
| GL-308 | K0 teknisk lukket | Ingen |
| GL-309 | Runner lukket, modellresultat åpent | Gjennomgått observasjonsinnsamler og Terra/Luna-sammenligning etter godkjent G1-evaluering |
| GL-310–GL-315 | K0 teknisk lukket | Staging-/modellbevis i Sprint 4 |
| AI-økonomi i admin | K0 teknisk lukket | Reelle priser/kurs, varsel og kostnadsavstemming etter godkjent G1-evaluering |

## Beslutningsunderlag

- [Sprint 3-kontrollpunkt](./README.md)
- [AI-delunderlag til G1 for Njord-modell og kostnad](./g1-ai-decision-pack.md)
- [Kostnadsregister](../cost-register.md)
- [Sprintplan og G1-kriterier](../../go-live-sprint-plan.md)

## Åpne vilkår

1. CEO må eksplisitt godkjenne eller avvise Sprint 3 K0.
2. En evalueringstillatelse i G1 må godkjennes før en modellnøkkel brukes
   eller en ekstern kostnad påløper. Foreslått G1-A/G1-B er ikke en vedtatt
   endring av portstrukturen.
3. Observasjonsinnsamleren for ekte modeller må gjennomgås før G1-A-kjøringen;
   K0-runneren sammenligner filer og utløser bevisst ingen modellkall.
4. G1-B må velge betamodell etter faktisk Fjord Insight-evaluering.
5. Delt limiter, secret store, TLS, host-adferd og hard stopp må bevises på
   valgt plattform før offentlig beta.
6. G2 er fortsatt en separat port for utsendelse til betabrukere.

## Signering

| Beslutning | Status | Dato / besluttet av |
| --- | --- | --- |
| Godkjenn Sprint 3 som K0 teknisk fullført med vilkårene over | Avventer | — |
| Godkjenn foreslått G1-evalueringsramme | Avventer separat beslutning | — |
| Godkjenn betamodell og ordinær AI-ramme | Avventer evalueringsresultat | — |
