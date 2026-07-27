# Safe legacy brace expansion adapter

The ESLint 9 / Next.js 15 lint toolchain still consumes the legacy
`brace-expansion` CommonJS interface, where the package itself is a callable
function. The only upstream release patched for CVE-2026-14257 is
`brace-expansion@5.0.8`, which exposes an `expand` named export instead.

This local package preserves the legacy callable interface while delegating all
expansion work to the official patched implementation. The root npm override
routes every transitive legacy consumer through this adapter.

`index.cjs` is intentionally plain CommonJS rather than TypeScript: ESLint must
be able to load the adapter before the project's TypeScript toolchain runs.

Remove the adapter when the full lint dependency graph natively consumes a
patched `brace-expansion` release.
