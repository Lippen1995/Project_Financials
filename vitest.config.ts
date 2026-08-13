import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 15_000,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.claude/**",
      "**/.codex-worktrees/**",
      "**/output/**",
      // Retired PDF/OCR entry points — see quarantine/README.md.
      "**/quarantine/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  // Next compiles components with the automatic JSX runtime, so they do not import React.
  // Without this, esbuild's classic transform makes any such component throw when rendered
  // in a test.
  esbuild: {
    jsx: "automatic",
  },
});
