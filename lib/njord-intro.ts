import type { Route } from "next";

/**
 * Redaksjonelt innhold for «Bli kjent med Njord» (/njord).
 *
 * Siden forklarer hva den digitale analytikeren er, hvordan han arbeider og hvor navnet kommer
 * fra. Alt her er redaksjonell tekst om produktet og om norrøn mytologi — ingen selskapsdata,
 * ingen regnskapstall og ingen eksempler som kan forveksles med reelle virksomheter.
 */

export type NjordCapability = {
  num: string;
  icon: string;
  title: string;
  /** Én linje i listen til venstre. */
  lead: string;
  /** Åpningen i detaljkortet til høyre. */
  body: string;
  steps: readonly string[];
  sources: readonly string[];
};

export const NJORD_CAPABILITIES: readonly NjordCapability[] = [
  {
    num: "01",
    icon: "search",
    title: "Undersøker",
    lead: "Finner relevant informasjon på tvers av kilder.",
    body: "Njord starter der en analytiker starter: med å finne ut hva som faktisk finnes om selskapet, og hvor det står.",
    steps: [
      "Slår opp selskapet i Enhetsregisteret og henter juridisk grunndata.",
      "Ser etter siste publiserte årsregnskap og hva som er tilgjengelig av historikk.",
      "Sjekker om det finnes kunngjøringer, meldinger eller registrerte rettigheter.",
    ],
    sources: ["Enhetsregisteret", "Regnskapsregisteret", "Kunngjøringer", "SSB Klass"],
  },
  {
    num: "02",
    icon: "hub",
    title: "Kobler",
    lead: "Ser sammenhenger mellom selskaper, personer, eierskap, tall og hendelser.",
    body: "Enkeltopplysninger sier lite. Njord setter dem sammen til en struktur du kan resonnere i.",
    steps: [
      "Kobler roller og styreverv til personene bak selskapet.",
      "Bygger eierskapsbildet fra årsbundne aksjonærregister-snapshots.",
      "Knytter hendelser og meldinger til riktig selskap i strukturen.",
    ],
    sources: ["Aksjonærregisteret", "Roller og styre", "NewsWeb", "Selskapsstruktur"],
  },
  {
    num: "03",
    icon: "insights",
    title: "Analyserer",
    lead: "Går videre enn gjenfinning og forklarer hva informasjonen betyr.",
    body: "Njord stopper ikke ved oppslaget. Han forsøker å si noe om retning, drivere og hva som er verdt å se nærmere på.",
    steps: [
      "Leser tidsserier i regnskapet framfor et enkelt år.",
      "Setter tallene i sammenheng med bransje og næringskode.",
      "Peker på hva som skiller signal fra støy i utviklingen.",
    ],
    sources: ["Regnskapsregisteret", "Nøkkeltall", "SSB Klass"],
  },
  {
    num: "04",
    icon: "verified",
    title: "Dokumenterer",
    lead: "Viser grunnlaget og kildene bak konklusjonene.",
    body: "Hver påstand kan spores tilbake til kildesystemet den kommer fra, med tidspunkt for henting og normalisering.",
    steps: [
      "Merker hver påstand som dokumentert fakta, beregning eller forklaring.",
      "Oppgir kildesystem, kildetype og kilde-ID for oppslaget.",
      "Viser når data ble hentet og når det ble normalisert.",
    ],
    sources: ["Kildesporing", "Proveniens", "Publiserte snapshots"],
  },
  {
    num: "05",
    icon: "category",
    title: "Forstår kontekst",
    lead: "Tar hensyn til selskapet, problemstillingen og researchen du alt har gjort.",
    body: "Njord arbeider i den analysen du står i — ikke i et tomt chattevindu.",
    steps: [
      "Kjenner selskapet du har åpent og fanen du arbeider i.",
      "Bygger videre på tidligere søk og analyser i arbeidsflaten.",
      "Tilpasser svaret til om spørsmålet er due diligence, motpart eller marked.",
    ],
    sources: ["Analysekontekst", "Søkehistorikk", "DD-rom"],
  },
  {
    num: "06",
    icon: "help",
    title: "Utfordrer",
    lead: "Identifiserer motstridende informasjon, hull og alternative forklaringer.",
    body: "En analytiker som bare bekrefter er til liten nytte. Njord sier også hva som ikke stemmer.",
    steps: [
      "Flagger motstridende opplysninger mellom kilder.",
      "Oppgir hvilke datapunkter som mangler for å konkludere.",
      "Foreslår alternative forklaringer på det du ser.",
    ],
    sources: ["Valideringsregler", "Dekningsgap", "Manuell gjennomgang"],
  },
];

export type NjordSourceRow = {
  name: string;
  origin: string;
};

export const NJORD_SOURCES: readonly NjordSourceRow[] = [
  { name: "Enhetsregisteret", origin: "Brønnøysund" },
  { name: "Regnskapsregisteret", origin: "Årsregnskap" },
  { name: "Aksjonærregisteret", origin: "Skatteetaten" },
  { name: "NewsWeb og nyhetskilder", origin: "Meldinger" },
];

export type NjordClaimKind = {
  label: string;
  description: string;
  provenance: string;
};

/**
 * Anatomien i et Njord-svar. Dette er en beskrivelse av svarformatet, ikke et gjengitt svar:
 * siden skal forklare hvordan grunnlaget merkes uten å finne opp selskaper eller tall.
 */
export const NJORD_CLAIM_KINDS: readonly NjordClaimKind[] = [
  {
    label: "Fakta",
    description: "En opplysning som er hentet direkte fra en kilde og kan slås opp igjen.",
    provenance: "Kildesystem og kilde-ID",
  },
  {
    label: "Beregning",
    description: "En verdi Njord har regnet ut, med formelen han brukte oppgitt.",
    provenance: "Formel og inngangsverdier",
  },
  {
    label: "Forklaring",
    description: "En tolkning av hva tallene kan bety, tydelig merket som vurdering.",
    provenance: "Merket som resonnement",
  },
  {
    label: "Forbehold",
    description: "Det som mangler for å konkludere — år uten publisert regnskap, eller kilder som spriker.",
    provenance: "Dekningsgap",
  },
];

export type NjordAssociation = {
  num: string;
  title: string;
};

export const NJORD_ASSOCIATIONS: readonly NjordAssociation[] = [
  { num: "01", title: "Havet" },
  { num: "02", title: "Sjøfart" },
  { num: "03", title: "Vind" },
  { num: "04", title: "Fiske" },
  { num: "05", title: "Handel" },
  { num: "06", title: "Rikdom og velstand" },
  { num: "07", title: "Trygg ferdsel" },
];

export type NjordTranslation = {
  myth: string;
  product: string;
  detail: string;
};

export const NJORD_TRANSLATIONS: readonly NjordTranslation[] = [
  {
    myth: "Havet",
    product: "Et hav av informasjon",
    detail: "Registre, regnskap, dokumenter og meldinger — mer enn noen kan lese gjennom.",
  },
  {
    myth: "Navigasjon og sjøfart",
    product: "Navigerer komplekse datasett",
    detail: "Finner vei mellom kilder som ikke er laget for å leses sammen.",
  },
  {
    myth: "Handel",
    product: "Forstår selskaper og transaksjoner",
    detail: "Eierskap, roller, motparter og markedene de opererer i.",
  },
  {
    myth: "Rikdom og velstand",
    product: "Hjelper deg forstå økonomisk verdi",
    detail: "Hva tallene betyr — ikke bare hva de er.",
  },
  {
    myth: "Gode reiser",
    product: "Leder deg gjennom researchprosessen",
    detail: "Fra første oppslag til dokumentert vurdering.",
  },
  {
    myth: "Mellom ulike verdener",
    product: "Kobler ulike datakilder",
    detail: "Regnskap, eierskap, roller og hendelser i samme resonnement.",
  },
  {
    myth: "Nóatún",
    product: "Fjord Insight som Njords hjem",
    detail: "Stedet analysen reiser ut fra — og kommer tilbake til.",
  },
];

export type NjordPassageStage = {
  icon: string;
  label: string;
};

/** Overgangen fra hav til innsikt, som bærer seksjonen mellom mytologien og produktet. */
export const NJORD_PASSAGE_STAGES: readonly NjordPassageStage[] = [
  { icon: "waves", label: "Hav" },
  { icon: "explore", label: "Navigasjon" },
  { icon: "map", label: "Kart" },
  { icon: "hub", label: "Nettverk" },
  { icon: "database", label: "Data" },
  { icon: "lightbulb", label: "Innsikt" },
];

export type NjordChapterFact = {
  label: string;
  value: string;
};

export type NjordChapter = {
  n: number;
  num: string;
  title: string;
  lead: string;
  paras: readonly string[];
  facts: readonly NjordChapterFact[];
};

export const NJORD_CHAPTERS: readonly NjordChapter[] = [
  {
    n: 1,
    num: "01",
    title: "Vanene",
    lead: "Njord tilhørte vanene – gudeslekten som særlig ble knyttet til fruktbarhet, avling, rikdom og velstand. Der æsene ofte forbindes med makt, krig og orden, representerte vanene i større grad det som vokser, formerer seg og gir avkastning.",
    paras: [
      "Vanene var én av de to store gudeslektene i norrøn mytologi. De andre var æsene, med Odin og Tor som de mest kjente skikkelsene. Skillet mellom de to gruppene er ikke alltid klart i kildene, men vanene synes å ha vært særlig forbundet med fruktbarhet, naturens kretsløp, materiell velstand og evnen til å skape gode avlinger.",
      "Njord er en av de tydeligste representantene for denne verdenen. Hans maktområde var ikke bare havet, men også rikdommen som havet kunne bringe. Gode vinder gjorde reisen mulig. Fisk, handel og sjøfart kunne skape velstand. For mennesker som levde langs den nordiske kysten var havet både næringsvei, ferdselsåre og kilde til fare.",
      "Også Njords barn, Frøy og Frøya, hører til vanene. Frøy forbindes sterkt med fruktbarhet, fred og gode avlinger, mens Frøya blant annet knyttes til kjærlighet, begjær og den magiske tradisjonen seiðr. Familien representerer derfor flere sider av det samme grunnleggende prinsippet: livskraft, overflod og det som gjør et samfunn rikt.",
      "Men Njord skulle ikke forbli blant vanene. En konflikt mellom de to gudeslektene førte ham til æsenes verden – og gjorde ham til en av de viktigste broene mellom dem.",
    ],
    facts: [
      { label: "Slekt", value: "Vanene" },
      { label: "Domene", value: "Hav, vind, fiske, velstand" },
    ],
  },
  {
    n: 2,
    num: "02",
    title: "Krigen mellom æser og vaner",
    lead: "De to gudeslektene møttes i krig. Ingen av dem vant avgjørende, og konflikten endte ikke med underkastelse, men med forhandling – og en fred som forandret Njords skjebne.",
    paras: [
      "Fortellingen om krigen mellom æser og vaner er en av de mest gåtefulle delene av norrøn mytologi. Kildene forteller ikke én fullstendig og sammenhengende historie, men etterlater spor av en konflikt mellom to gudeverdener som til slutt måtte lære å eksistere sammen.",
      "I Voluspå omtales det som verdens første krig. En skikkelse ved navn Gullveig blir stukket med spyd og brent i Odins hall, men vender tilbake til livet. Deretter bryter konflikten ut. Hvorfor denne hendelsen fører til krig, og hvilken rolle Gullveig egentlig spiller, er blant spørsmålene kildene ikke gir et entydig svar på.",
      "Krigen ser heller ikke ut til å ende med en klar seierherre. Æsene klarer ikke å knuse vanene, og vanene klarer ikke å erobre æsenes verden. I stedet oppstår noe langt mer interessant: de forhandler.",
      "Det gjør krigen spesiell. Resultatet blir ikke at den ene gudeverdenen forsvinner, men at de to gradvis veves sammen. Etter freden kan vaneguder leve blant æsene og få en plass i deres gudeverden.",
      "For Njord blir dette vendepunktet. Han går fra å være en gud blant vanene til å bli sendt til æsene som del av fredsoppgjøret.",
    ],
    facts: [
      { label: "Kilde", value: "Voluspå" },
      { label: "Utfall", value: "Forhandlet fred" },
    ],
  },
  {
    n: 3,
    num: "03",
    title: "Fredsavtalen",
    lead: "Krigen tok slutt gjennom en utveksling av gisler. Njord og Frøy ble sendt til æsene, mens vanene mottok fremstående skikkelser fra æsenes side. Slik ble tidligere fiender bundet sammen.",
    paras: [
      "I det norrøne samfunnet kunne utveksling av gisler være en måte å sikre fred mellom rivaliserende grupper. Den samme logikken brukes i fortellingen om æsene og vanene. Etter krigen sender partene viktige medlemmer til hverandre som garanti for den nye freden.",
      "Vanene sender Njord og sønnen Frøy til æsene. Begge skal etter hvert få fremtredende roller i den felles gudeverdenen. Fra æsene sendes blant andre Høne, en imponerende skikkelse som vanene tror vil egne seg som leder, sammen med den vise Mimir.",
      "Men fredsavtalen blir ikke problemfri. Vanene oppdager at Høne er avhengig av Mimirs råd for å treffe gode beslutninger. De føler seg ført bak lyset, dreper Mimir og sender hodet hans tilbake til Odin. Selv etter dette bryter ikke krigen ut på nytt.",
      "Andre tradisjoner forteller at æser og vaner også spyttet i et felles kar som tegn på fred. Av dette skal den usedvanlig vise Kvasir ha blitt skapt. Fortellingen gjør selve forsoningen til opphavet til visdom.",
      "Njord blir dermed mer enn bare et gissel. Han blir et levende symbol på den nye ordenen: en vanegud som får sin faste plass blant æsene.",
    ],
    facts: [
      { label: "Sendt til æsene", value: "Njord og Frøy" },
      { label: "Sendt til vanene", value: "Høne og Mimir" },
    ],
  },
  {
    n: 4,
    num: "04",
    title: "Njord hos æsene",
    lead: "Hos æsene beholdt Njord sin gamle makt. Han rådet over vind og sjø, kunne stille stormen og ble påkalt for rikdom, gode reiser og velstand.",
    paras: [
      "At Njord flytter til æsenes verden betyr ikke at han mister sin identitet som vanegud. Tvert imot fortsetter han å representere nettopp de kreftene som gjorde ham viktig blant vanene.",
      "Snorre beskriver ham som en gud som råder over vinden og kan roe både hav og ild. Mennesker skal påkalle ham når de skal ut på sjøen eller drive fangst. Han forbindes også direkte med rikdom og eiendom og kan gi dem som ber ham om det stor velstand.",
      "Det er en rolle som passer svært godt inn i det samfunnet den norrøne mytologien vokste frem fra. Havet bandt Skandinavia sammen. Det var veien til handel, fiske, krig, nye bosettinger og fremmede markeder. En gud som kunne sikre gunstig vind og trygg ferd, rådde derfor over langt mer enn været.",
      "Njord skiller seg samtidig fra flere av de mest kjente æsene. Han er ikke først og fremst en krigsgud eller en helt som bekjemper monstre. Hans makt er roligere, men svært konkret: vind som fører skipet fremover, fangst som fyller båten og handel som skaper rikdom.",
      "Det gjør også Njord til et godt bilde på hva som skjedde etter krigen mellom gudene. Han blir ikke gjort om til en æse. Han bringer vanenes verden med seg inn blant dem.",
    ],
    facts: [
      { label: "Rår over", value: "Vind, hav og ild" },
      { label: "Påkalt for", value: "Ferd, fangst og velstand" },
    ],
  },
  {
    n: 5,
    num: "05",
    title: "Frøy og Frøya",
    lead: "Njord var far til Frøy og Frøya, to av de mest betydningsfulle gudene i norrøn mytologi. Gjennom dem fortsatte vanenes forbindelse til fruktbarhet, kjærlighet, rikdom og livskraft.",
    paras: [
      "Frøy og Frøya er Njords barn og deler hans tilhørighet til vanene. Sammen danner de en familie som i særlig grad forbindes med de kreftene som gjør livet mulig og ønskelig: fruktbar jord, kjærlighet, begjær, fred, rikdom og gode år.",
      "Frøy beskrives som en gud knyttet til solskinn, regn og jordens grøde. Han kunne påkalles for gode avlinger og fred. I en verden der sviktende avlinger kunne bety sult, var dette ingen mindre guddommelig funksjon. Frøy representerte selve håpet om at jorden skulle gi mer tilbake enn menneskene hadde sådd.",
      "Frøya hadde et bredere og mer sammensatt domene. Hun forbindes med kjærlighet og begjær, men også med magi, rikdom og krig. Halvparten av dem som faller i kamp skal ifølge tradisjonen komme til hennes hall, Fólkvangr, mens den andre halvparten går til Odin.",
      "Hun knyttes også til seiðr – en form for magi som ifølge Snorre var kjent blant vanene og som Frøya lærte æsene. Dermed blir hun, som faren, en formidler mellom de to gudeslektene.",
      "Njord, Frøy og Frøya viser hvorfor vanene ikke forsvinner etter krigen. Deres egenskaper blir i stedet en sentral del av den norrøne gudeverdenen.",
    ],
    facts: [
      { label: "Frøy", value: "Grøde, fred og gode år" },
      { label: "Frøya", value: "Kjærlighet, rikdom og seiðr" },
    ],
  },
  {
    n: 6,
    num: "06",
    title: "Njord og Skade",
    lead: "Njord hørte hjemme ved sjøen. Skade hørte hjemme i fjellet. Ekteskapet deres ble en fortelling om to verdener som kunne møtes – men ikke forenes.",
    paras: [
      "Fortellingen begynner med et drap. Skades far, jotnen Tjatse, blir drept av æsene. Skade tar våpen og reiser til Åsgard for å kreve hevn eller erstatning. Gudene tilbyr forsoning, og en del av oppgjøret er at hun skal få velge seg en ektemann blant dem. Men hun får ikke se ansiktene deres – hun må velge kun ved å se føttene.",
      "Skade antar at de vakreste føttene må tilhøre Balder, den vakreste av gudene. Hun velger dem – og oppdager at mannen er Njord.",
      "De forsøker likevel å leve sammen. Problemet er hvor. Skade elsker Þrymheimr, hjemmet i fjellene hun har etter sin far. Der finnes snø, høyder og lyden av ulver. Njord vil tilbake til Nóatún ved sjøen, hvor han hører bølgene og sjøfuglene.",
      "De inngår et kompromiss og forsøker å bo vekselvis på de to stedene. Men ingen av dem trives i den andres verden. Njord klager over ulvenes hyl i fjellet. Skade forteller at hun ikke får sove ved sjøen på grunn av sjøfuglenes skrik. Til slutt går de hver til sitt.",
      "Det er en uvanlig jordnær gudefortelling. Ingen av dem er nødvendigvis skurken. De er ganske enkelt formet av to forskjellige landskap. Njord er havet. Skade er fjellet. Ekteskapet deres viser at selv guder kan oppdage at kompromiss ikke alltid er nok.",
    ],
    facts: [
      { label: "Skades hjem", value: "Þrymheimr, fjellet" },
      { label: "Njords hjem", value: "Nóatún, havet" },
    ],
  },
  {
    n: 7,
    num: "07",
    title: "Nóatún",
    lead: "Ved sjøen lå Nóatún – «skipenes tun» – Njords hjem blant gudene. Herfra rådet han over hav, vind, sjøfart og den rikdommen som fulgte med dem.",
    paras: [
      "Navnet Nóatún blir vanligvis tolket som «skipenes tun» eller «skipsgården». Allerede i navnet ligger derfor forbindelsen mellom Njord og sjøfarten.",
      "I Grímnismál nevnes Nóatún blant gudenes boliger. Det fremstilles som stedet der Njord har reist sin hall. Forestillingen passer godt med resten av karakteren hans: dette er ikke en gud som bor langt fra menneskenes verden, men en gud hvis hjem er knyttet til skip, kyst og ferdsel.",
      "For mennesker i det førmoderne Skandinavia var et skip langt mer enn et transportmiddel. Det kunne være redskapet som brakte mat hjem, åpnet handelsveier eller gjorde det mulig å reise til nye landområder. Skipet representerte både muligheter og risiko.",
      "Dermed blir Nóatún mer enn bare et mytologisk bosted. Det fungerer som et uttrykk for hele Njords domene: punktet der land møter hav, og der menneskene er avhengige av naturkreftene for å lykkes.",
      "Det er også her kontrasten til Skade blir tydeligst. Hun lengter etter fjellene. Njord lengter tilbake til bølgene og sjøfuglene. Når han vender tilbake til Nóatún, vender han ikke bare hjem til en hall. Han vender tilbake til det landskapet som definerer hvem han er.",
      "Historien om Njord begynner blant vanene, går gjennom krig og fred, og fører ham inn blant æsene. Men gjennom hele fortellingen forblir én ting den samme: Njord hører hjemme ved sjøen.",
    ],
    facts: [
      { label: "Betydning", value: "Skipenes tun" },
      { label: "Nevnt i", value: "Grímnismál" },
    ],
  },
];

/** Startpunkter som sender leseren rett inn i det ekte Njord-søket. */
export const NJORD_PROMPT_SUGGESTIONS: readonly string[] = [
  "Hva bør jeg se etter i dette selskapets siste regnskap?",
  "Hvem kontrollerer selskapet, og hvor sikkert er grunnlaget?",
  "Hvilke datapunkter mangler for å konkludere?",
];

/**
 * Lenken til den faktiske Njord-flaten. Introsiden simulerer aldri et svar — knappene her
 * åpner AI-søket der Njord er koblet til kildene.
 */
export function njordAskHref(query?: string | null): Route {
  const trimmed = query?.trim() ?? "";
  if (!trimmed) {
    return "/search?ai=1" as Route;
  }
  return `/search?ai=1&query=${encodeURIComponent(trimmed)}` as Route;
}

export const NJORD_CHAPTER_ANCHOR_PREFIX = "kapittel-";

export function njordChapterAnchor(chapter: number) {
  return `${NJORD_CHAPTER_ANCHOR_PREFIX}${chapter}`;
}
