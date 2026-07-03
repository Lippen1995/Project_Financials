# Annual report extraction artifacts - 2026-07-03

This branch originally included generated extraction, OCR, visual-audit, and ML dataset artifacts in commit `ca50d9f37d0577935a86e098e4d5ab66fc32a90b`.

The commit was too large to push to GitHub: approximately 17,145 files and 7.21 GiB of payload. To preserve the implementation value while making the branch publishable, the full local artifact state was retained in:

- Local branch: `backup-huge-annual-report-artifacts-ca50d9f`
- Local tag: `backup-huge-annual-report-artifacts-ca50d9f`
- Local workspace artifact directories listed below

## Local Artifact Inventory

| Path | Files | Approx size |
| --- | ---: | ---: |
| `output/manual-review-visual-audit/` | 16,814 | 7.05 GiB |
| `output/manual-review-visuals/` | 294 | 158.15 MiB |
| `output/ml-datasets/` | 8 | 10.46 MiB |
| `tmp/` | 8 | 0.03 MiB |
| `output/benchmarks/` | 143 | 4.27 MiB |

## High-Value Artifacts

- `output/manual-review-visual-audit/audit-items.json`
- `output/manual-review-visual-audit/view-*/audit-sheet-*.png`
- `output/manual-review-visuals/*/contact-sheet.png`
- `output/ml-datasets/financial-facts/train.jsonl`
- `output/ml-datasets/financial-facts/validation.jsonl`
- `output/ml-datasets/financial-facts/test.jsonl`
- `output/ml-datasets/financial-facts/manifest.json`
- `output/benchmarks/annual-report-extraction-accuracy/latest.json`

## Publishing Policy

Generated artifacts are intentionally not pushed through Git because they are reproducible output and exceed practical Git transport limits. Keep them in local artifact storage or move them to object storage before sharing outside this machine.

The source changes, schema migration, tests, and this manifest are the publishable product change.
