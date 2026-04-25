#!/usr/bin/env sh
set -eu

PORT="${OPENDATALOADER_HYBRID_PORT:-5002}"
OCR_LANG="${OPENDATALOADER_HYBRID_OCR_LANG:-nor,en}"
LOG_LEVEL="${OPENDATALOADER_HYBRID_LOG_LEVEL:-info}"
EXTRA_ARGS="${OPENDATALOADER_HYBRID_EXTRA_ARGS:-}"

exec sh -lc "opendataloader-pdf-hybrid --host 0.0.0.0 --port \"$PORT\" --force-ocr --ocr-lang \"$OCR_LANG\" --log-level \"$LOG_LEVEL\" $EXTRA_ARGS"
