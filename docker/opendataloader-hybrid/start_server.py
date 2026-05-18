#!/usr/bin/env python3
"""Custom server startup that patches Docling for optimal scanned-PDF performance.

Two problems are fixed here:

1. Scale: Docling hardcodes scale=3 for OCR (216 DPI equivalent for normal A4).
   Norwegian annual reports are often scanned and stored as PDFs with page dimensions
   equal to the scan pixel dimensions (e.g. 1728x2312 pt). At scale=3 this creates a
   5184x6936 px image per page (~36 Mpx), causing EasyOCR to take 45+ s/page.
   Patching scale=1 keeps the image at 1728x2312 px (~4 Mpx), cutting OCR to ~26 s/page.

2. OCR engine: EasyOCR (default) works well for Norwegian at scale=1.
   Tesseract CLI was tried but is 2x slower due to subprocess-spawn overhead.

Implementation note: EasyOcrModel.__init__ does `self.scale = 3` as a hard instance
assignment. A class-attribute patch alone would be shadowed, so we wrap __init__ instead.
EasyOcrModel instances are created lazily on the first OCR request (not at server startup),
so the patch must remain active for the duration of the server process.
"""

from docling.models.stages.ocr import easyocr_model as _eocr_mod

_orig_easyocr_init = _eocr_mod.EasyOcrModel.__init__


def _patched_easyocr_init(self, *args, **kwargs):
    _orig_easyocr_init(self, *args, **kwargs)
    self.scale = 1  # Override the hardcoded scale=3


_eocr_mod.EasyOcrModel.__init__ = _patched_easyocr_init  # type: ignore[method-assign]

import opendataloader_pdf.hybrid_server as _hs  # noqa: E402  (must be after patch)

if __name__ == "__main__":
    _hs.main()
