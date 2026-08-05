import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const config = [
  {
    // `quarantine` holds retired PDF/OCR entry points — see quarantine/README.md.
    ignores: [".next/**", "node_modules/**", "dist/**", "coverage/**", "quarantine/**"],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default config;
