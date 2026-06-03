#!/usr/bin/env python3
"""RapidOCR sidecar: render PDF pages and OCR them, emit per-page text as JSON.

Engine-agnostic contract (matches the TS OcrEnginePage type):
    stdout JSON: {"engine": "rapidocr", "pages": [{"pageNumber": int, "text": str}]}

Usage:
    python rapidocr_ocr.py /work/input.pdf 6,8,2   # pages are 1-based
If no page list is given, all pages are processed.
"""
import json
import sys

import fitz  # PyMuPDF — render PDF pages to images
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

# 200 DPI keeps memory in check inside the container while staying well above
# the threshold where digit recognition degrades. (300 DPI on a full A4 scan
# spiked container memory past the limit.)
RENDER_DPI = 200


def render_page(page) -> np.ndarray:
    zoom = RENDER_DPI / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    return np.array(img)


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: rapidocr_ocr.py <pdf> [pages]"}))
        return 2

    pdf_path = sys.argv[1]
    page_filter = None
    if len(sys.argv) >= 3 and sys.argv[2].strip():
        page_filter = {int(p) for p in sys.argv[2].split(",") if p.strip()}

    ocr = RapidOCR()
    doc = fitz.open(pdf_path)
    pages_out = []

    for idx in range(len(doc)):
        page_number = idx + 1  # 1-based
        if page_filter is not None and page_number not in page_filter:
            continue
        img = render_page(doc[idx])
        result, _ = ocr(img)
        # result is a list of [box, text, score]; join recognised text by line.
        lines = [item[1] for item in result] if result else []
        pages_out.append({"pageNumber": page_number, "text": "\n".join(lines)})

    print(json.dumps({"engine": "rapidocr", "pages": pages_out}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
