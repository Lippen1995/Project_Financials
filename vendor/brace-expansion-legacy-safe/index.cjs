"use strict";

// Intentionally plain CommonJS: ESLint loads this adapter before the project's
// TypeScript toolchain is available.
const { expand } = require("brace-expansion-safe");

module.exports = function expandWithLegacyInterface(pattern) {
  return expand(pattern);
};
