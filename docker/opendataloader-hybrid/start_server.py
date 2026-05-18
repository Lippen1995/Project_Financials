#!/usr/bin/env python3
"""Custom server startup that patches Docling for optimal scanned-PDF performance.

Two problems are fixed here:

1. Scale: Docling hardcodes scale=3 for OCR (216 DPI equivalent for normal A4).
   Norwegian annual reports are often scanned and stored as PDFs with page dimensions
   equal to the scan pixel dimensions (e.g. 1728×2312 pt). At scale=3 this creates a
   5184×6936 px image per page (~36 Mpx), causing EasyOCR to take 45+ s/page.
   Patching scale=1 keeps the image at 1728×2312 px (~4 Mpx), cutting OCR to ~5 s/page.

2. OCR engine: EasyOCR (default) works well for Norwegian at scale=1.
   Tesseract CLI was tried but is 2× slower due to subprocess-spawn overhead.
"""

# Patch scale before models are imported — the attribute is read at __init__ time
from docling.models.stages.ocr import easyocr_model as _eocr_mod
_eocr_mod.EasyOcrModel.scale = 1  # type: ignore[attr-defined]

import opendataloader_pdf.hybrid_server as _hs  # noqa: E402  (must be after patch)

if __name__ == "__main__":
    _hs.main()
