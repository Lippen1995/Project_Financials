#!/usr/bin/env python3
"""Custom server startup that uses Tesseract OCR instead of EasyOCR.

Tesseract is significantly faster than EasyOCR on CPU (~3-5s/page vs ~35s/page)
and has dedicated Norwegian language models, making it suitable for scanned
Norwegian annual reports processed without GPU acceleration.
"""

# EasyOCR/ISO-639-1 codes → Tesseract language codes
_LANG_MAP = {
    "no": "nor",
    "nb": "nor",
    "nn": "nor",
    "en": "eng",
    "de": "deu",
    "fr": "fra",
    "sv": "swe",
    "da": "dan",
    "fi": "fin",
    # Accept Tesseract codes directly
    "nor": "nor",
    "eng": "eng",
    "deu": "deu",
    "fra": "fra",
    "swe": "swe",
    "dan": "dan",
}


def _to_tesseract_langs(lang_list):
    """Translate EasyOCR/ISO-639-1 lang codes to Tesseract codes."""
    return [_LANG_MAP.get(l.strip(), l.strip()) for l in lang_list if l.strip()]


import opendataloader_pdf.hybrid_server as _hs

from docling.datamodel.accelerator_options import AcceleratorOptions
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    PictureDescriptionVlmOptions,
    TableFormerMode,
    TableStructureOptions,
    TesseractCliOcrOptions,
)
from docling.document_converter import DocumentConverter, PdfFormatOption


def _patched_create_converter(
    force_full_page_ocr=False,
    ocr_lang=None,
    enrich_formula=False,
    enrich_picture_description=False,
    picture_description_prompt=None,
    device="auto",
):
    tess_langs = _to_tesseract_langs(ocr_lang) if ocr_lang else ["nor", "eng"]

    ocr_options = TesseractCliOcrOptions(
        force_full_page_ocr=force_full_page_ocr,
        lang=tess_langs,
    )

    picture_description_options = None
    if enrich_picture_description:
        prompt = picture_description_prompt or _hs.DEFAULT_PICTURE_DESCRIPTION_PROMPT
        picture_description_options = PictureDescriptionVlmOptions(
            repo_id="HuggingFaceTB/SmolVLM-256M-Instruct",
            prompt=prompt,
            generation_config={"max_new_tokens": 300, "do_sample": False},
        )

    pipeline_kwargs = {
        "do_ocr": True,
        "do_table_structure": True,
        "ocr_options": ocr_options,
        "table_structure_options": TableStructureOptions(mode=TableFormerMode.ACCURATE),
        "do_formula_enrichment": enrich_formula,
        "do_picture_description": enrich_picture_description,
        "generate_picture_images": enrich_picture_description,
        "accelerator_options": AcceleratorOptions(device=device),
    }
    if picture_description_options is not None:
        pipeline_kwargs["picture_description_options"] = picture_description_options

    pipeline_options = PdfPipelineOptions(**pipeline_kwargs)

    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
    )


_hs.create_converter = _patched_create_converter

if __name__ == "__main__":
    _hs.main()
