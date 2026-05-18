FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    curl \
    libgl1 \
    libglib2.0-0 \
    tesseract-ocr \
    tesseract-ocr-nor \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "opendataloader-pdf[hybrid]==2.2.1"

COPY docker/opendataloader-hybrid/entrypoint.sh /entrypoint.sh
COPY docker/opendataloader-hybrid/start_server.py /start_server.py
RUN sed -i 's/\r$//' /entrypoint.sh \
  && chmod +x /entrypoint.sh

EXPOSE 5002

ENTRYPOINT ["/entrypoint.sh"]
