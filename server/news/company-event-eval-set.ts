export type CompanyEventEvalCase = {
  id: string;
  companyOrgNumber: string;
  sourceId: string;
  canonicalUrl: string;
  expectedLabel: "RELEVANT" | "NOT_RELEVANT";
  expectedMinScore?: number;
  expectedMaxScore?: number;
  notes: string;
};

export const COMPANY_EVENT_EVAL_SET: CompanyEventEvalCase[] = [
  {
    id: "eqnr-bay-du-nord-relevant",
    companyOrgNumber: "923609016",
    sourceId: "google-news-upstream",
    canonicalUrl:
      "https://news.google.com/rss/articles/CBMiwgFBVV95cUxOOXJRRjJ2ak01TWllWWF2Tl9Ld3p1NUQzcmp6dE1FS0JxOE56UmJWbkFMU3ZnODlEbWQ4Ylk4eE9kb19jMlM0ZUZ1alg0TURQTkZCa1RZTDFLRmlvOWxHR1F3NG1ZWmFzTlNTTVFrcWpkNFZRbnM3V19kYXdCbXZ3dnpYSXBUMzlITUEycm5WUDFORmxXQTdqamwzcjhVM0JsOV82b19nZ1Q1LWpnSTh4OENOQUVfcU43cngxZGdXeFY5UQ?oc=5",
    expectedLabel: "RELEVANT",
    expectedMinScore: 55,
    notes: "Direkte Equinor-artikkel om Bay du Nord bør rangeres høyt for Equinor ASA.",
  },
  {
    id: "eqnr-chairman-relevant",
    companyOrgNumber: "923609016",
    sourceId: "google-news-upstream",
    canonicalUrl:
      "https://news.google.com/rss/articles/CBMingFBVV95cUxOaTloZVZHdlBPVnE4bm41NDJubzRmMUdSdzR4VXpGaExOc2RYZTV5SWN0OXRRYXdaVjcyY1FZbC1Ka3ZrNzk4U1diX1Blamw5LV9rRDBXaGg0UEo1LVBxNG9veEl2Z0pXeHpBNFN0WU8zYWNQQjF3NnIwSVE3R3Y4eXY5LWZyblV4aTAxYy1TQTVaUHVOVUxiblJSRUd5dw?oc=5",
    expectedLabel: "RELEVANT",
    expectedMinScore: 48,
    notes: "Styreleder-endring i Equinor er relevant for Equinor ASA.",
  },
  {
    id: "eqnr-bil-oslo-bay-du-nord-not-relevant",
    companyOrgNumber: "981617517",
    sourceId: "google-news-upstream",
    canonicalUrl:
      "https://news.google.com/rss/articles/CBMiwgFBVV95cUxOOXJRRjJ2ak01TWllWWF2Tl9Ld3p1NUQzcmp6dE1FS0JxOE56UmJWbkFMU3ZnODlEbWQ4Ylk4eE9kb19jMlM0ZUZ1alg0TURQTkZCa1RZTDFLRmlvOWxHR1F3NG1ZWmFzTlNTTVFrcWpkNFZRbnM3V19kYXdCbXZ3dnpYSXBUMzlITUEycm5WUDFORmxXQTdqamwzcjhVM0JsOV82b19nZ1Q1LWpnSTh4OENOQUVfcU43cngxZGdXeFY5UQ?oc=5",
    expectedLabel: "NOT_RELEVANT",
    expectedMaxScore: 24,
    notes: "EQUINOR BIL OSLO skal ikke arve Equinor ASA sine offshore-nyheter.",
  },
  {
    id: "eqnr-bil-bergen-chairman-not-relevant",
    companyOrgNumber: "993015253",
    sourceId: "google-news-upstream",
    canonicalUrl:
      "https://news.google.com/rss/articles/CBMingFBVV95cUxOaTloZVZHdlBPVnE4bm41NDJubzRmMUdSdzR4VXpGaExOc2RYZTV5SWN0OXRRYXdaVjcyY1FZbC1Ka3ZrNzk4U1diX1Blamw5LV9rRDBXaGg0UEo1LVBxNG9veEl2Z0pXeHpBNFN0WU8zYWNQQjF3NnIwSVE3R3Y4eXY5LWZyblV4aTAxYy1TQTVaUHVOVUxiblJSRUd5dw?oc=5",
    expectedLabel: "NOT_RELEVANT",
    expectedMaxScore: 24,
    notes: "EQUINOR BIL BERGEN skal ikke få høy score på Equinor ASA styreleder-nyhet.",
  },
  {
    id: "tor-og-peter-ai50-not-relevant",
    companyOrgNumber: "932551578",
    sourceId: "google-news-ai-software",
    canonicalUrl:
      "https://news.google.com/rss/articles/CBMiSkFVX3lxTE5uUGIzcFRTdFZwdkxZTnpHdUpfVmhCQ21iczlSQjJrMnlSa19sYzB4S2JuVC1wSWo1UFhRWnlpVWtrb0NIN1RmS2Nn?oc=5",
    expectedLabel: "NOT_RELEVANT",
    expectedMaxScore: 22,
    notes: "Eiendomsselskap skal ikke få høy score på Forbes AI 50-listen.",
  },
  {
    id: "the-next-platform-next-as-not-relevant",
    companyOrgNumber: "926534300",
    sourceId: "google-news-ai-software",
    canonicalUrl:
      "https://news.google.com/rss/articles/CBMipwFBVV95cUxNSjFCa1Fmc2swMGk1TThSN184M0dKSEw2UWJDY3gtSlJaanJIVkI1Vk1rb2RjTDlFUE0zNk9acHN4QldZbXB2Si1fQmRXZUhITWRDRXRhVnNDeXVnTFZNUnRuZEN4SWo1UmlrMFB6YUsyODB1b2hsV25ld2lBUWprUHliUE1vYTREWXVyZ0FjMERqSEs5S2x6aWtrejMxRjRTUm5MZUxqYw?oc=5",
    expectedLabel: "NOT_RELEVANT",
    expectedMaxScore: 20,
    notes: "THE NEXT AS er ikke relevant mål for The Next Platform-artikkel om Nvidia.",
  },
  {
    id: "commerce-ai-export-controls-not-relevant",
    companyOrgNumber: "983952232",
    sourceId: "google-news-ai-software",
    canonicalUrl:
      "https://news.google.com/rss/articles/CBMitAFBVV95cUxOUG1tSjQtaTZic1hubHhJRUwzMHZuMkRCMzZFWUR1bWczNld2dkNQT0g1cG4wSFFZalJ2U1lyTVN3OWkyQVlOSGlMSjcwbk1uUmJBUUdwb1FBYnlOQjUyWHhKNi1PWnhPYjRUSWFRV3I3bDlNel9OeG9KVWVLdkFTQ2Vqb1NuZTFqRXlNSlA2b3U2SjZOYm0tYjd6RVdPZXBKV2llandEZ05oUmR1RHpYX3drTkY?oc=5",
    expectedLabel: "NOT_RELEVANT",
    expectedMaxScore: 22,
    notes: "COMMERCE AS skal ikke få høy score på amerikanske AI eksportkontrollsaker kun pga navnematch.",
  },
  {
    id: "quantum-science-not-relevant",
    companyOrgNumber: "989164155",
    sourceId: "scmp-business",
    canonicalUrl: "https://www.scmp.com/news/china/science/article/3355781/chinese-ai-lets-everyday-users-command-quantum-computing-natural-language",
    expectedLabel: "NOT_RELEVANT",
    expectedMaxScore: 20,
    notes: "QUANTUM AS er investeringsselskap, ikke automatisk relevant for kinesisk quantum-AI artikkel.",
  },
  {
    id: "bad-og-prosjekt-upstream-not-relevant",
    companyOrgNumber: "815354982",
    sourceId: "google-news-upstream",
    canonicalUrl:
      "https://news.google.com/rss/articles/CBMivgFBVV95cUxPcG9sWVhTUVZLYlNLeUkzcklkYTRTRlBLS0tfdFl6Q0ZqR0F1S0NkT083NFlULWZPYTNvdXlKNlh4MmpLejB4R19aSS1hTW9qMDg5SjY4TzJ3M2toMHFTM1BsMkNyUGJUUjhOcm9ZdmtfN1RGd0xCaEh6RnZVcno1ZjBIalNuaVNydTBOdDNWRUtBdnZmcU9yMElYM0hSZHlFd1dIQlI5RzhYblpWaWZUUHJqT0JnUDNqLVQzMHFR?oc=5",
    expectedLabel: "NOT_RELEVANT",
    expectedMaxScore: 24,
    notes: "Byggselskap skal ikke kobles sterkt til offshore-riggartikkel uten tydelig kontekst.",
  },
  {
    id: "cutn-go-shipping-not-relevant",
    companyOrgNumber: "928002527",
    sourceId: "marinelink",
    canonicalUrl: "https://www.marinelink.com/news/cma-cgm-notre-dame-makes-maiden-call-539884",
    expectedLabel: "NOT_RELEVANT",
    expectedMaxScore: 28,
    notes: "Frisørselskap skal ikke få commodity/shipping-score på containerartikkel.",
  },
  {
    id: "preg-barnehager-permian-not-relevant",
    companyOrgNumber: "930452343",
    sourceId: "google-news-us-shale",
    canonicalUrl:
      "https://news.google.com/rss/articles/CBMi2wFBVV95cUxQT3FjM1F6clhaeGdlZTNmY0dPQ0RkSU1SN05fTlBkSl9KU0pnajNSdnktSDlDVUdRakFjbWdkWUMteHdTeWRiYU5qMm1CSjVSbllNZVNuclplbUhrRkQ5djlmNmozb1hPV1Vpa0hCX3Q3QXNIdkE2b05JVTVIVmg4VWR0ZXQycG5aVWNtWVdncGw3VEhpelZWVW1ERzJzQ2NCTFVqUXlTWk5KSWdIc3dfMHc5cWRKWTNEM0VDeGk4dFpjTjJBMmlmYUdGWlo4d1gxVWFfNnNJWjFIaXPSAeABQVVfeXFMT2twRnF3aGpuaTRpRnpyNFZTMmU2Tm5ucFZDWGcyckZ4TGlsTHR2VmRTREwteVZtb0pXMWJTOEVsNEdHWXNUb0t3aGZKM1BaNTZIbDk0V1p4Rk9qeTFmdk1MbUVwVU5raVktaDdKNGZSWWRxRG9JUmQ2VU9DMHZZSnd4X1JsSkMyakx5S0hWR2hKZzJpUG5pbFVRUXg3M3dzUUk0bXR0TWh0cXdxZmtKaDJIMk1aVmVCNlN5U0FqbXl1TVNlMG9mcFlYb3YtSnpFd3piWHNnX1FtM2dweWdHVGY?oc=5",
    expectedLabel: "NOT_RELEVANT",
    expectedMaxScore: 22,
    notes: "Barnehageselskap skal ikke knyttes høyt til Permian Basin royalty-artikkel.",
  },
  {
    id: "hands-on-tech-chips-not-relevant",
    companyOrgNumber: "984008759",
    sourceId: "google-news-ai-software",
    canonicalUrl:
      "https://news.google.com/rss/articles/CBMirgFBVV95cUxQdTRXNVpXRy1LVk0xZWdqWU5CT254RXhkS3NvY0pxcXdBekpkZjR6VlRLYkNadHVGQ1F3ejU1Mk5sUHJiTWVWWjlCX0JzWWtWX1FEQThTemtGTTd1WlgyMVFucWc2RWRWOUxlT0h0WkVoOFpPSXV4aGxnYzU5VXJLVzhiVU9Ub3RSTkgyaXh4SFR3RW5sUl8xNThRRTZiY0VIS3dBR0VSc3VkTUVOSmfSAcIBQVVfeXFMUFdwanFUTUhFdldHRTFyMmJrWlJjaUhLcDlqbXI3S0lsU2xTWW9LX3Uxd0JkQWp0ZHNrU29adW95XzltNUVURHUyY0NiMHlkbEtCNGpFYmNtTzR5VW5FQjQxRWh5bTl2dnk0cmpoUndXLWZ3cTN6alk2OTFRdmFNSHpUWlZGcVpnV1NubURRT29lUjRxczhWNU5pUWd4a1dSUHZ2YUdlSmMwdlhWQlZKSTE2VDdUNk12VEUxMEUyYS1Tamc?oc=5",
    expectedLabel: "NOT_RELEVANT",
    expectedMaxScore: 20,
    notes: "HANDS ON TECHNOLOGY DA skal ikke tolkes som relevant for tortilla chips-artikkel.",
  },
];
