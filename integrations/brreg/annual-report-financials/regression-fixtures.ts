import { CanonicalMetricKey } from "@/integrations/brreg/annual-report-financials/taxonomy";

type DocumentFixture = {
  name: string;
  fiscalYear: number;
  pages: string[][];
  expected: {
    shouldPublish: boolean;
    classificationTypes: string[];
    unitScaleByPage: Record<number, 1 | 1000 | null>;
    factValues: Partial<Record<CanonicalMetricKey, number>>;
    requiredIssueCodes?: string[];
  };
};

type OcrLineFixture = {
  words: string[];
};

type OcrPageFixture = {
  pageNumber: number;
  lines: OcrLineFixture[];
};

type OcrFixture = {
  name: string;
  fiscalYear: number;
  pages: OcrPageFixture[];
  expected: {
    shouldPublish: boolean;
    classificationTypes: string[];
    unitScaleByPage: Record<number, 1 | 1000 | null>;
    factValues: Partial<Record<CanonicalMetricKey, number>>;
    requiredIssueCodes?: string[];
  };
};

export const documentRegressionFixtures: DocumentFixture[] = [
  {
    name: "published-happy-path",
    fiscalYear: 2024,
    pages: [
      ["Arsregnskap 2024", "Eksempel Finans AS", "Organisasjonsnummer 000000000"],
      [
        "Resultatregnskap",
        "Belop i: NOK",
        "2024 2023",
        "Salgsinntekter 103097000 95210000",
        "Sum driftsinntekter 103097000 95210000",
        "Sum driftskostnader 81887000 77500000",
        "Driftsresultat 21210000 17710000",
        "Sum finansinntekter 500000 350000",
        "Sum finanskostnader 1000000 900000",
        "Netto finans -500000 -550000",
        "Resultat for skattekostnad 20710000 17160000",
        "Skattekostnad 2489000 2100000",
        "Arsresultat 18221000 15060000",
      ],
      [
        "Balanse",
        "Belop i: NOK",
        "2024 2023",
        "Kundefordringer 12500000 11200000",
        "Andre fordringer 9200000 8000000",
        "Bankinnskudd, kontanter o.l. 15558000 14001000",
        "Sum omlopsmidler 37258000 33201000",
        "Varige driftsmidler 54897000 52500000",
        "Sum eiendeler 92155000 85701000",
      ],
      [
        "Egenkapital og gjeld",
        "Belop i: NOK",
        "2024 2023",
        "Aksjekapital 1000000 1000000",
        "Annen egenkapital 35372000 30000000",
        "Sum egenkapital 36372000 31000000",
        "Sum langsiktig gjeld 20000000 21000000",
        "Sum kortsiktig gjeld 35783000 33701000",
        "Sum gjeld 55783000 54701000",
        "Sum egenkapital og gjeld 92155000 85701000",
      ],
      [
        "Resultatregnskap i sammendrag",
        "Belop i NOK 1 000",
        "2024 2023",
        "Salgsinntekter 103097 95210",
        "Driftsresultat 21210 17710",
        "Arsresultat 18221 15060",
      ],
      [
        "Balanse i sammendrag",
        "TNOK",
        "2024 2023",
        "Sum eiendeler 92155 85701",
        "Sum egenkapital 36372 31000",
        "Sum gjeld 55783 54701",
        "Sum egenkapital og gjeld 92155 85701",
      ],
      [
        "Noter til regnskapet",
        "Alle tall i notene er NOK 1.000 dersom annet ikke er oppgitt",
        "Note 8 Bankinnskudd, kontanter o.l. 15558 14001",
      ],
      [
        "Uavhengig revisors beretning",
        "Opinion",
        "Grunnlag for konklusjon",
      ],
      [
        "Styrets arsberetning",
        "Fortsatt drift",
        "Virksomhetens art",
      ],
    ],
    expected: {
      shouldPublish: true,
      classificationTypes: [
        "COVER",
        "STATUTORY_INCOME",
        "STATUTORY_BALANCE",
        "STATUTORY_BALANCE_CONTINUATION",
        "SUPPLEMENTARY_INCOME",
        "SUPPLEMENTARY_BALANCE",
        "NOTE",
        "AUDITOR_REPORT",
        "BOARD_REPORT",
      ],
      unitScaleByPage: {
        2: 1,
        3: 1,
        4: 1,
        5: 1000,
        6: 1000,
        7: 1000,
      },
      factValues: {
        revenue: 103_097_000,
        operating_profit: 21_210_000,
        net_income: 18_221_000,
        cash_and_cash_equivalents: 15_558_000,
        total_assets: 92_155_000,
        total_equity: 36_372_000,
        total_liabilities: 55_783_000,
        total_equity_and_liabilities: 92_155_000,
      },
    },
  },
  {
    name: "manual-review-ambiguous",
    fiscalYear: 2024,
    pages: [
      ["Arsregnskap 2024", "Eksempel Finans AS"],
      [
        "Resultatregnskap",
        "Belop i: NOK",
        "Alle tall i notene er NOK 1 000",
        "2023 2024",
        "Salgsinntekter 103097000 95210000",
        "Sum driftsinntekter 103097000 95210000",
        "Sum driftskostnader 81887000 77500000",
        "Driftsresultat 21210000 17710000",
        "Arsresultat 18221000 15060000",
      ],
      [
        "Balanse",
        "Belop i: NOK",
        "2024 2023",
        "Kundefordringer 12500000 11200000",
        "Bankinnskudd, kontanter o.l. 15558000 14001000",
        "Sum eiendeler 92155000 85701000",
      ],
      [
        "Styrets arsberetning",
        "Fortsatt drift",
        "Virksomhetens art",
      ],
    ],
    expected: {
      shouldPublish: false,
      classificationTypes: ["COVER", "STATUTORY_INCOME", "STATUTORY_BALANCE", "BOARD_REPORT"],
      unitScaleByPage: {
        2: null,
        3: 1,
      },
      factValues: {
        total_assets: 92_155_000,
      },
      requiredIssueCodes: [
        "PAGE_UNIT_SCALE_CONFLICT",
        "SUSPICIOUS_COLUMN_SWAP",
        "REQUIRED_PRIMARY_METRICS_MISSING",
      ],
    },
  },
];

export const ocrRegressionFixtures: OcrFixture[] = [
  {
    name: "scan-like-duplicate-sections",
    fiscalYear: 2024,
    pages: [
      {
        pageNumber: 2,
        lines: [
          { words: ["Resultatregnskap"] },
          { words: ["Belop", "i:", "NOK"] },
          { words: ["2024", "2023"] },
          { words: ["Salgsinntekter103097000", "95210000"] },
          { words: ["Sum", "driftsinntekter", "103097000", "95210000"] },
          { words: ["Sum", "driftskostnader", "81887000", "77500000"] },
          { words: ["Driftsresultat", "21210000", "17710000"] },
          { words: ["Sum", "finansinntekter", "500000", "350000"] },
          { words: ["Sum", "finanskostnader", "1000000", "900000"] },
          { words: ["Netto", "finans", "(500000)", "(550000)"] },
          { words: ["Resultat", "for", "skattekostnad", "20710000", "17160000"] },
          { words: ["Skattekostnad", "2489000", "2100000"] },
          { words: ["Arsresultat", "18221000", "15060000"] },
        ],
      },
      {
        pageNumber: 3,
        lines: [
          { words: ["Balanse"] },
          { words: ["Belop", "i:", "NOK"] },
          { words: ["2024", "2023"] },
          { words: ["Kundefordringer", "12500000", "11200000"] },
          { words: ["Andre", "fordringer", "9200000", "8000000"] },
          { words: ["Bankinnskudd,", "kontanter", "o.l.", "15558000", "14001000"] },
          { words: ["Sum", "omlopsmidler", "37258000", "33201000"] },
          { words: ["Varige", "driftsmidler", "54897000", "52500000"] },
          { words: ["Sum", "eiendeler", "92155000", "85701000"] },
        ],
      },
      {
        pageNumber: 4,
        lines: [
          { words: ["Egenkapital", "og", "gjeld"] },
          { words: ["Belop", "i:", "NOK"] },
          { words: ["2024", "2023"] },
          { words: ["Aksjekapital", "1000000", "1000000"] },
          { words: ["Annen", "egenkapital", "35372000", "30000000"] },
          { words: ["Sum", "egenkapital", "36372000", "31000000"] },
          { words: ["Sum", "langsiktig", "gjeld", "20000000", "21000000"] },
          { words: ["Sum", "kortsiktig", "gjeld", "35783000", "33701000"] },
          { words: ["Sum", "gjeld", "55783000", "54701000"] },
          { words: ["Sum", "egenkapital", "og", "gjeld", "92155000", "85701000"] },
        ],
      },
      {
        pageNumber: 5,
        lines: [
          { words: ["Resultatregnskap", "i", "sammendrag"] },
          { words: ["Belop", "i", "NOK", "1", "000"] },
          { words: ["2024", "2023"] },
          { words: ["Salgsinntekter", "103097", "95210"] },
          { words: ["Driftsresultat", "21210", "17710"] },
          { words: ["Arsresultat", "18221", "15060"] },
        ],
      },
      {
        pageNumber: 6,
        lines: [
          { words: ["Balanse", "i", "sammendrag"] },
          { words: ["TNOK"] },
          { words: ["2024", "2023"] },
          { words: ["Sum", "eiendeler", "92155", "85701"] },
          { words: ["Sum", "egenkapital", "36372", "31000"] },
          { words: ["Sum", "gjeld", "55783", "54701"] },
          { words: ["Sum", "egenkapital", "og", "gjeld", "92155", "85701"] },
        ],
      },
      {
        pageNumber: 7,
        lines: [
          { words: ["Noter", "til", "regnskapet"] },
          { words: ["Alle", "tall", "i", "notene", "er", "NOK", "1.000"] },
          { words: ["Note8", "Bankinnskudd,", "kontanter", "o.l.", "15558", "14001"] },
        ],
      },
      {
        pageNumber: 8,
        lines: [
          { words: ["Uavhengig", "revisors", "beretning"] },
          { words: ["Opinion"] },
        ],
      },
    ],
    expected: {
      shouldPublish: true,
      classificationTypes: [
        "STATUTORY_INCOME",
        "STATUTORY_BALANCE",
        "STATUTORY_BALANCE_CONTINUATION",
        "SUPPLEMENTARY_INCOME",
        "SUPPLEMENTARY_BALANCE",
        "NOTE",
        "AUDITOR_REPORT",
      ],
      unitScaleByPage: {
        2: 1,
        3: 1,
        4: 1,
        5: 1000,
        6: 1000,
        7: 1000,
      },
      factValues: {
        revenue: 103_097_000,
        operating_profit: 21_210_000,
        net_financial_items: -500_000,
        net_income: 18_221_000,
        cash_and_cash_equivalents: 15_558_000,
        total_assets: 92_155_000,
        total_equity_and_liabilities: 92_155_000,
      },
    },
  },
  {
    name: "formatting-edge-manual-review",
    fiscalYear: 2024,
    pages: [
      {
        pageNumber: 2,
        lines: [
          { words: ["Resultatregnskap"] },
          { words: ["Belop", "i:", "NOK"] },
          { words: ["2024", "2023"] },
          { words: ["Salgsinntekter", "103097000", "95210000"] },
          { words: ["Annen", "driftsinntekt", "(1200000)"] },
          { words: ["Sum", "driftsinntekter", "101897000", "95210000"] },
          { words: ["Sum", "driftskostnader", "81887000", "77500000"] },
          { words: ["Driftsresultat", "21010000", "17710000"] },
          { words: ["Arsresultat", "18021000"] },
        ],
      },
      {
        pageNumber: 3,
        lines: [
          { words: ["Balanse"] },
          { words: ["Belop", "i:", "NOK"] },
          { words: ["2024", "2023"] },
          { words: ["Bankinnskudd,", "kontanter", "o.l.", "15558000", ""] },
          { words: ["Sum", "eiendeler", "92155000", "85701000"] },
        ],
      },
    ],
    expected: {
      shouldPublish: false,
      classificationTypes: ["STATUTORY_INCOME", "STATUTORY_BALANCE"],
      unitScaleByPage: {
        2: 1,
        3: 1,
      },
      factValues: {
        other_operating_income: -1_200_000,
        cash_and_cash_equivalents: 15_558_000,
        total_assets: 92_155_000,
      },
      requiredIssueCodes: ["REQUIRED_PRIMARY_METRICS_MISSING"],
    },
  },
];
