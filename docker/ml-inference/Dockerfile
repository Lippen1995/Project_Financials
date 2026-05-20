# ML Inference Service
#
# Purpose: hosts in-house trained classifiers (unit-scale, page-type, ...) and
# exposes them over HTTP for Node.js to call. Designed to fit on a Raspberry Pi
# 5 — slim image, CPU-only Python stack, no GPU dependencies.
#
# Models are mounted at /models via a Docker volume. The container loads
# whichever model file is present at startup; replacing the file and
# restarting the container is the "deploy" step.

FROM python:3.12-slim

WORKDIR /app

# Install only what's needed for inference — keep image small for the Pi.
# scikit-learn covers TF-IDF + logistic regression. We deliberately do NOT
# install torch here; that's a separate "ml-training" image when needed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app /app

# /models is the contract: training drops files here, inference reads them.
VOLUME ["/models"]

ENV MODEL_DIR=/models
ENV PORT=8800

EXPOSE 8800

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8800"]
