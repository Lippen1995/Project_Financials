"""
Trains the financial-fact extractor.

This is the first supervised model for "which accounting fact is this row?"
It does not hallucinate values: numeric extraction remains grounded in the PDF
row/parser output, while this model learns the canonical metric key from the
reviewed row/page context.

Input JSONL rows are produced by scripts/export-financial-fact-training-data.ts.
The output bundle is consumed by docker/ml-inference/app/main.py.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Iterable, List, Tuple

import joblib
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.pipeline import Pipeline


def load_jsonl(path: Path | None) -> List[dict]:
    if path is None or not path.exists():
        return []
    rows: List[dict] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def exclude_label_prefix(rows: List[dict], prefix: str | None) -> List[dict]:
    if not prefix:
        return rows
    return [
        row
        for row in rows
        if not isinstance(row.get("label"), str)
        or not row["label"].startswith(prefix)
    ]


FEATURE_VARIANTS = (
    "full_context",
    "no_nearby_context",
    "row_identity_context",
    "row_text_only",
)
VECTORIZER_VARIANTS = ("char", "char_word")


def preprocess_context(text: str, feature_variant: str) -> str:
    parts = [part.strip() for part in text.split(" | ") if part.strip()]
    if feature_variant == "full_context":
        return text
    if feature_variant == "no_nearby_context":
        return " | ".join(
            part for part in parts if not part.startswith("nearbyRow")
        )
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
    raise ValueError(f"Unknown feature variant: {feature_variant}")


def extract_text_and_label(example: dict, feature_variant: str) -> Tuple[str, str] | None:
    features = example.get("features") or {}
    text = features.get("factContextText") or features.get("sourceRowText") or features.get("rawLabel")
    label = example.get("label")
    if not isinstance(text, str) or not text.strip() or not isinstance(label, str) or not label.strip():
        return None
    return preprocess_context(text, feature_variant), label


def examples_to_xy(rows: Iterable[dict], feature_variant: str) -> Tuple[List[str], List[str]]:
    texts: List[str] = []
    labels: List[str] = []
    for row in rows:
        extracted = extract_text_and_label(row, feature_variant)
        if extracted is None:
            continue
        text, label = extracted
        texts.append(text)
        labels.append(label)
    return texts, labels


def build_vectorizer(vectorizer_variant: str):
    if vectorizer_variant == "char":
        return TfidfVectorizer(
            analyzer="char_wb",
            ngram_range=(2, 6),
            min_df=1,
            max_features=80_000,
            lowercase=True,
            strip_accents="unicode",
        )
    if vectorizer_variant == "char_word":
        return FeatureUnion(
            [
                (
                    "char",
                    TfidfVectorizer(
                        analyzer="char_wb",
                        ngram_range=(2, 6),
                        min_df=1,
                        max_features=70_000,
                        lowercase=True,
                        strip_accents="unicode",
                    ),
                ),
                (
                    "word",
                    TfidfVectorizer(
                        analyzer="word",
                        token_pattern=r"(?u)\b[\w./=-]+\b",
                        ngram_range=(1, 3),
                        min_df=1,
                        max_features=30_000,
                        lowercase=True,
                        strip_accents="unicode",
                    ),
                ),
            ]
        )
    raise ValueError(f"Unknown vectorizer variant: {vectorizer_variant}")


def build_pipeline(labels: List[str], vectorizer_variant: str) -> Pipeline:
    unique_labels = sorted(set(labels))
    classifier = DummyClassifier(strategy="most_frequent")
    if len(unique_labels) >= 2:
        classifier = SGDClassifier(
            loss="log_loss",
            max_iter=1000,
            tol=1e-3,
            class_weight="balanced",
            random_state=42,
        )

    return Pipeline(
        steps=[
            ("features", build_vectorizer(vectorizer_variant)),
            ("clf", classifier),
        ]
    )


def evaluate(pipeline: Pipeline, texts: List[str], labels: List[str]) -> dict:
    if not texts:
        return {
            "precision": None,
            "recall": None,
            "f1": None,
            "accuracy": None,
            "support": 0,
        }
    predictions = pipeline.predict(texts)
    return {
        "precision": float(precision_score(labels, predictions, average="weighted", zero_division=0)),
        "recall": float(recall_score(labels, predictions, average="weighted", zero_division=0)),
        "f1": float(f1_score(labels, predictions, average="weighted", zero_division=0)),
        "accuracy": float(accuracy_score(labels, predictions)),
        "support": len(texts),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--val", type=Path, required=False)
    parser.add_argument("--test", type=Path, required=False)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--exclude-label-prefix",
        type=str,
        required=False,
        default=None,
        help="Exclude labels with this prefix, e.g. as_reported_ for the canonical metric model.",
    )
    args = parser.parse_args()

    train_rows_raw = load_jsonl(args.train)
    val_rows_raw = load_jsonl(args.val)
    test_rows_raw = load_jsonl(args.test)
    train_rows = exclude_label_prefix(train_rows_raw, args.exclude_label_prefix)
    val_rows = exclude_label_prefix(val_rows_raw, args.exclude_label_prefix)
    test_rows = exclude_label_prefix(test_rows_raw, args.exclude_label_prefix)

    trained_candidates = []
    best_candidate = None

    for feature_variant in FEATURE_VARIANTS:
        train_texts, train_labels = examples_to_xy(train_rows, feature_variant)
        val_texts, val_labels = examples_to_xy(val_rows, feature_variant)
        test_texts, test_labels = examples_to_xy(test_rows, feature_variant)
        if not train_texts:
            continue
        for vectorizer_variant in VECTORIZER_VARIANTS:
            pipeline = build_pipeline(train_labels, vectorizer_variant)
            pipeline.fit(train_texts, train_labels)
            metrics = {
                "train": evaluate(pipeline, train_texts, train_labels),
                "validation": evaluate(pipeline, val_texts, val_labels),
                "test": evaluate(pipeline, test_texts, test_labels),
            }
            candidate = {
                "pipeline": pipeline,
                "feature_variant": feature_variant,
                "vectorizer_variant": vectorizer_variant,
                "metrics": metrics,
                "train_labels": train_labels,
                "train_texts": train_texts,
                "val_texts": val_texts,
                "test_texts": test_texts,
            }
            trained_candidates.append(candidate)
            validation = metrics["validation"]
            ranking = (
                validation.get("accuracy") or -1,
                validation.get("f1") or -1,
            )
            if best_candidate is None:
                best_candidate = candidate
            else:
                best_validation = best_candidate["metrics"]["validation"]
                best_ranking = (
                    best_validation.get("accuracy") or -1,
                    best_validation.get("f1") or -1,
                )
                if ranking > best_ranking:
                    best_candidate = candidate

    if best_candidate is None:
        raise SystemExit("No usable training examples found.")

    pipeline = best_candidate["pipeline"]
    train_labels = best_candidate["train_labels"]

    metrics = {
        **best_candidate["metrics"],
        "label_distribution_train": {
            label: train_labels.count(label) for label in sorted(set(train_labels))
        },
        "model_selection": [
            {
                "feature_variant": candidate["feature_variant"],
                "vectorizer_variant": candidate["vectorizer_variant"],
                "train": candidate["metrics"]["train"],
                "validation": candidate["metrics"]["validation"],
                "test": candidate["metrics"]["test"],
            }
            for candidate in trained_candidates
        ],
    }

    trained_at = dt.datetime.utcnow().isoformat() + "Z"
    bundle = {
        "pipeline": pipeline,
        "labels": sorted(set(train_labels)),
        "trained_at": trained_at,
        "metrics": metrics,
        "feature_variant": best_candidate["feature_variant"],
        "vectorizer_variant": best_candidate["vectorizer_variant"],
        "excluded_label_prefix": args.exclude_label_prefix,
        "algorithm": (
            "tfidf+sgd-logloss:financial_fact_extractor:"
            f"{best_candidate['feature_variant']}:{best_candidate['vectorizer_variant']}"
        ),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.out)
    print(f"Saved model bundle to {args.out}")
    print(json.dumps(metrics, indent=2))

    metadata = {
        # The DB enum does not yet have a dedicated fact-extractor value; keep
        # the registry-compatible task type while making the subtype explicit.
        "taskType": "OTHER",
        "modelFamily": "FINANCIAL_FACT_EXTRACTOR",
        "algorithm": bundle["algorithm"],
        "binaryPath": f"/models/{args.out.name}",
        "trainedAt": trained_at,
        "evaluationMetrics": metrics,
        "trainingDataSnapshot": {
            "reviewerExamples": len(best_candidate["train_texts"]),
            "validationExamples": len(best_candidate["val_texts"]),
            "testExamples": len(best_candidate["test_texts"]),
            "rawReviewerExamples": len(train_rows_raw),
            "rawValidationExamples": len(val_rows_raw),
            "rawTestExamples": len(test_rows_raw),
            "distinctMetricKeys": len(set(train_labels)),
            "featureText": "features.factContextText fallback sourceRowText/rawLabel",
            "selectedFeatureVariant": best_candidate["feature_variant"],
            "selectedVectorizerVariant": best_candidate["vectorizer_variant"],
            "excludedLabelPrefix": args.exclude_label_prefix,
        },
        "summary": (
            f"TF-IDF + logistic regression financial fact extractor trained on "
            f"{len(best_candidate['train_texts'])} reviewer examples across "
            f"{len(set(train_labels))} metric keys."
        ),
    }
    metadata_path = args.out.with_suffix(".metadata.json")
    with metadata_path.open("w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2, ensure_ascii=False)
    print(f"Saved metadata sidecar to {metadata_path}")


if __name__ == "__main__":
    main()
