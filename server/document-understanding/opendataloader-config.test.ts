import { describe, expect, it } from "vitest";

import {
  chooseOpenDataLoaderRoute,
  resolveOpenDataLoaderConfig,
} from "@/server/document-understanding/opendataloader-config";

describe("opendataloader-config", () => {
  it("resolves safe local defaults when enabled", () => {
    const config = resolveOpenDataLoaderConfig({
      OPENDATALOADER_ENABLED: "true",
      OPENDATALOADER_MODE: "local",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.enabled).toBe(true);
    expect(config.mode).toBe("local");
    expect(config.storeAnnotatedPdf).toBe(true);
    expect(config.fallbackToLegacy).toBe(true);
  });

  it("routes reliable digital PDFs to local mode", () => {
    const route = chooseOpenDataLoaderRoute({
      config: resolveOpenDataLoaderConfig({
        OPENDATALOADER_ENABLED: "true",
        OPENDATALOADER_MODE: "auto",
      } as unknown as NodeJS.ProcessEnv),
      preflight: {
        pageCount: 3,
        hasTextLayer: true,
        hasReliableTextLayer: true,
        parsedPages: [],
      },
    });

    expect(route.executionMode).toBe("local");
    expect(route.reasonCode).toBe("RELIABLE_TEXT_LAYER");
  });

  it("routes scanned PDFs to hybrid OCR mode", () => {
    const route = chooseOpenDataLoaderRoute({
      config: resolveOpenDataLoaderConfig({
        OPENDATALOADER_ENABLED: "true",
        OPENDATALOADER_MODE: "auto",
      } as unknown as NodeJS.ProcessEnv),
      preflight: {
        pageCount: 3,
        hasTextLayer: false,
        hasReliableTextLayer: false,
        parsedPages: [],
      },
    });

    expect(route.executionMode).toBe("hybrid");
    expect(route.requiresOcr).toBe(true);
    expect(route.hybridMode).toBe("full");
  });

  it("prefers structure-tree extraction when requested and text exists", () => {
    const route = chooseOpenDataLoaderRoute({
      config: resolveOpenDataLoaderConfig({
        OPENDATALOADER_ENABLED: "true",
        OPENDATALOADER_MODE: "auto",
        OPENDATALOADER_USE_STRUCT_TREE: "true",
      } as unknown as NodeJS.ProcessEnv),
      preflight: {
        pageCount: 3,
        hasTextLayer: true,
        hasReliableTextLayer: true,
        parsedPages: [],
      },
    });

    expect(route.executionMode).toBe("local");
    expect(route.useStructTree).toBe(true);
    expect(route.reasonCode).toBe("STRUCT_TREE_PREFERRED");
  });

  it("honors forced OCR routing", () => {
    const route = chooseOpenDataLoaderRoute({
      config: resolveOpenDataLoaderConfig({
        OPENDATALOADER_ENABLED: "true",
        OPENDATALOADER_MODE: "local",
        OPENDATALOADER_FORCE_OCR: "true",
      } as unknown as NodeJS.ProcessEnv),
      preflight: {
        pageCount: 3,
        hasTextLayer: true,
        hasReliableTextLayer: true,
        parsedPages: [],
      },
    });

    expect(route.executionMode).toBe("hybrid");
    expect(route.requiresOcr).toBe(true);
    expect(route.reasonCode).toBe("FORCED_OCR");
  });
});
