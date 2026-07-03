"""
ML Inference Service (FastAPI)

Loads trained classifiers from /models at startup and exposes predict
endpoints. New models are deployed by overwriting the file in /models and
restarting the container.

Endpoints:
    GET  /healthz                  Liveness probe.
    GET  /models                   List loaded models.
    POST /predict/unit-scale       Predict unit scale (1, 1000, 1_000_000).

Designed for Raspberry Pi 5 — CPU-only scikit-learn, no GPU code paths.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml-inference")

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/models"))
UNIT_SCALE_MODEL_FILENAME = "unit_scale_classifier.joblib"
FINANCIAL_FACT_MODEL_FILENAME = "financial_fact_extractor.joblib"

app = FastAPI(title="Fjord Insight ML Inference", version="1.0.0")

# ──────────────────────────────────────────────────────────────────────────────
# Model registry — populated at startup
# ──────────────────────────────────────────────────────────────────────────────

class LoadedModel:
    """Holds an in-memory model and the metadata we publish about it."""

    def __init__(self, name: str, path: Path) -> None:
        self.name = name
        self.path = path
        self.loaded_at: Optional[str] = None
        self.pipeline: Any = None

    def load(self) -> None:
        bundle = joblib.load(self.path)
        # Expected bundle shape:
        #   {"pipeline": sklearn.Pipeline, "labels": [...], "trained_at": "...", "metrics": {...}}
        self.pipeline = bundle.get("pipeline") if isinstance(bundle, dict) else bundle
        self.labels = bundle.get("labels") if isinstance(bundle, dict) else None
        self.trained_at = bundle.get("trained_at") if isinstance(bundle, dict) else None
        self.metrics = bundle.get("metrics") if isinstance(bundle, dict) else None
        self.feature_variant = bundle.get("feature_variant") if isinstance(bundle, dict) else None
        self.vectorizer_variant = bundle.get("vectorizer_variant") if isinstance(bundle, dict) else None
        self.excluded_label_prefix = bundle.get("excluded_label_prefix") if isinstance(bundle, dict) else None


models: Dict[str, LoadedModel] = {}


@app.on_event("startup")
async def load_all_models() -> None:
    """Best-effort load. A missing file is logged but not fatal — the
    /predict endpoint will return 503 if its model is missing, while the
    rest of the service keeps serving."""
    if not MODEL_DIR.exists():
        logger.warning("MODEL_DIR %s does not exist; no models loaded.", MODEL_DIR)
        return

    unit_scale_path = MODEL_DIR / UNIT_SCALE_MODEL_FILENAME
    if unit_scale_path.exists():
        try:
            handle = LoadedModel(name="unit_scale_classifier", path=unit_scale_path)
            handle.load()
            models["unit_scale"] = handle
            logger.info("Loaded unit_scale_classifier from %s", unit_scale_path)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to load unit_scale_classifier at %s", unit_scale_path)
    else:
        logger.info("No unit_scale_classifier model file at %s (expected during cold-start).", unit_scale_path)

    financial_fact_path = MODEL_DIR / FINANCIAL_FACT_MODEL_FILENAME
    if financial_fact_path.exists():
        try:
            handle = LoadedModel(name="financial_fact_extractor", path=financial_fact_path)
            handle.load()
            models["financial_fact"] = handle
            logger.info("Loaded financial_fact_extractor from %s", financial_fact_path)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to load financial_fact_extractor at %s", financial_fact_path)
    else:
        logger.info("No financial_fact_extractor model file at %s (expected during cold-start).", financial_fact_path)


# ──────────────────────────────────────────────────────────────────────────────
# Health + introspection
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/healthz")
async def healthz() -> Dict[str, Any]:
    return {
        "status": "ok",
        "models_loaded": list(models.keys()),
    }


@app.get("/models")
async def list_models() -> Dict[str, Any]:
    return {
        name: {
            "name": handle.name,
            "path": str(handle.path),
            "trained_at": handle.trained_at,
            "metrics": handle.metrics,
            "labels": handle.labels,
            "feature_variant": getattr(handle, "feature_variant", None),
            "vectorizer_variant": getattr(handle, "vectorizer_variant", None),
            "excluded_label_prefix": getattr(handle, "excluded_label_prefix", None),
        }
        for name, handle in models.items()
    }


# ──────────────────────────────────────────────────────────────────────────────
# Unit-scale prediction
# ──────────────────────────────────────────────────────────────────────────────

class UnitScalePredictRequest(BaseModel):
    raw_label: str = Field(..., description="Surrounding header text from the page")
    proposed_unit_scale: Optional[int] = Field(None, description="Machine's prior guess, if any")


class UnitScalePredictResponse(BaseModel):
    unit_scale: int
    confidence: float
    model_version: Optional[str] = None


class FinancialFactPredictRequest(BaseModel):
    row_context: str = Field(..., description="Page/row context for one extracted financial fact candidate")
    proposed_metric_key: Optional[str] = Field(None, description="Machine's prior canonical key, if any")


class FinancialFactPredictResponse(BaseModel):
    metric_key: str
    confidence: float
    model_version: Optional[str] = None


def preprocess_financial_fact_context(row_context: str, feature_variant: Optional[str]) -> str:
    parts = [part.strip() for part in row_context.split(" | ") if part.strip()]
    if feature_variant in (None, "full_context"):
        return row_context
    if feature_variant == "no_nearby_context":
        return " | ".join(part for part in parts if not part.startswith("nearbyRow"))
    if feature_variant == "row_identity_context":
        prefixes = (
            "proposedMetricKey=",
            "page=",
            "fiscalYear=",
            "statementType=",
            "scope=",
            "section=",
            "note=",
            "unitScale=",
            "value=",
            "label=",
            "row=",
        )
        return " | ".join(part for part in parts if part.startswith(prefixes))
    if feature_variant == "row_text_only":
        prefixes = ("proposedMetricKey=", "label=", "row=")
        return " | ".join(part for part in parts if part.startswith(prefixes))
    logger.warning("Unknown financial fact feature variant %s; using full context.", feature_variant)
    return row_context


@app.post("/predict/unit-scale", response_model=UnitScalePredictResponse)
async def predict_unit_scale(req: UnitScalePredictRequest) -> UnitScalePredictResponse:
    model = models.get("unit_scale")
    if model is None or model.pipeline is None:
        raise HTTPException(
            status_code=503,
            detail="unit_scale_classifier not loaded — train and deploy a model first.",
        )

    # The trained pipeline accepts a list of texts; we always send one.
    predicted = model.pipeline.predict([req.raw_label])[0]
    # `decision_function` or `predict_proba` may or may not be available
    # depending on the sklearn estimator. Try predict_proba first for a
    # natural confidence; fall back to a constant.
    confidence = 1.0
    if hasattr(model.pipeline, "predict_proba"):
        try:
            probs = model.pipeline.predict_proba([req.raw_label])[0]
            confidence = float(max(probs))
        except Exception:  # noqa: BLE001
            confidence = 1.0

    return UnitScalePredictResponse(
        unit_scale=int(predicted),
        confidence=confidence,
        model_version=model.trained_at,
    )


@app.post("/predict/financial-fact", response_model=FinancialFactPredictResponse)
async def predict_financial_fact(req: FinancialFactPredictRequest) -> FinancialFactPredictResponse:
    model = models.get("financial_fact")
    if model is None or model.pipeline is None:
        raise HTTPException(
            status_code=503,
            detail="financial_fact_extractor not loaded — train and deploy a model first.",
        )

    row_context = req.row_context
    if req.proposed_metric_key:
        row_context = f"proposedMetricKey={req.proposed_metric_key} | {row_context}"
    row_context = preprocess_financial_fact_context(
        row_context,
        getattr(model, "feature_variant", None),
    )

    predicted = model.pipeline.predict([row_context])[0]
    confidence = 1.0
    if hasattr(model.pipeline, "predict_proba"):
        try:
            probs = model.pipeline.predict_proba([row_context])[0]
            confidence = float(max(probs))
        except Exception:  # noqa: BLE001
            confidence = 1.0

    return FinancialFactPredictResponse(
        metric_key=str(predicted),
        confidence=confidence,
        model_version=model.trained_at,
    )
