# RapidOCR sidecar for OCR evaluation. Containerized so it runs anywhere Docker
# does, without touching the host Python install. ONNX-based — no PaddlePaddle.
FROM python:3.11-slim

# libgl/glib are needed by opencv (a RapidOCR dependency) at import time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    rapidocr_onnxruntime==1.3.24 \
    PyMuPDF==1.24.10 \
    pillow==10.4.0 \
    numpy==1.26.4

WORKDIR /app
COPY rapidocr_ocr.py /app/rapidocr_ocr.py

ENTRYPOINT ["python", "/app/rapidocr_ocr.py"]
