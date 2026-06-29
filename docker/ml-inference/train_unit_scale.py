"""
Trains the unit-scale classifier.

Inputs:
    --train  Path to JSONL training set (output from training-data-export-service)
    --val    Path to JSONL validation set
    --test   Path to JSONL test set
    --out    Path where the trained model bundle will be saved (.joblib)

When the supplied training set is too small (a fresh deployment with no
reviewer corrections yet), the script seeds it with synthetic examples
generated from the regex patterns currently used in unit-scale.ts. This way
the first deployment produces a working model that already matches the
existing rules; subsequent training rounds incorporate human corrections to
go beyond the rules.

Output bundle structure:
    {
        "pipeline":   sklearn.Pipeline,    # TF-IDF + LogisticRegression
        "labels":     [1, 1000],            # classes the model can predict
        "trained_at": "2026-05-20T...Z",
        "metrics":    {"precision": ..., "recall": ..., "f1": ..., "accuracy": ...},
    }
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Iterable, List, Tuple

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.pipeline import Pipeline

# ──────────────────────────────────────────────────────────────────────────────
# Bootstrap data — derived from unit-scale.ts regex coverage
# ──────────────────────────────────────────────────────────────────────────────
#
# These examples are synthetic but realistic — they mirror what the
# unit-scale.ts regexes detect today. We use them as seed data so the very
# first deployed model is no worse than the regex baseline, even before any
# reviewer corrections are available.
#
# Add more variants here whenever the regex is extended; the trainer will
# pick them up next run.

BOOTSTRAP_EXAMPLES: List[Tuple[str, int]] = [
    # unitScale=1 (kroner / whole NOK)
    ("Beløp i NOK", 1),
    ("Beløp i NOK ", 1),
    ("Beløp i hele NOK", 1),
    ("Beløp i kroner", 1),
    ("Tall i NOK", 1),
    ("Tall i kroner", 1),
    ("Belop i NOK", 1),  # OCR no diacritic
    ("Beløp i8 NOK", 1),  # OCR digit noise
    ("Beløp i  NOK", 1),  # double space
    ("Belop : NOK", 1),

    # unitScale=1000 (tusen NOK)
    ("Beløp i NOK 1000", 1000),
    ("Beløp i NOK 1.000", 1000),
    ("Beløp i 1000 NOK", 1000),
    ("Beløp i NOK (1000)", 1000),
    ("Tall i tusen kroner", 1000),
    ("Beløp i hele tusen", 1000),
    ("Belop i NOK 1000", 1000),  # OCR
    ("Beløp i kr 1000", 1000),
    ("Tall i 1000 NOK", 1000),
    ("Beløp NOK 1 000", 1000),
]


def load_jsonl(path: Path) -> List[dict]:
    if not path.exists():
        return []
    out: List[dict] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
    return out


def extract_text_and_label(example: dict) -> Tuple[str, int] | None:
    """Pull the feature text + integer label from one JSONL row.

    New unit-scale exports are page-level examples and provide
    features.pageContextText. Older exports only have features.rawLabel, so we
    keep that as a backwards-compatible fallback.
    """
    features = example.get("features") or {}
    raw_label = features.get("pageContextText") or features.get("rawLabel")
    label = example.get("label")
    if not isinstance(raw_label, str) or not isinstance(label, int):
        return None
    return raw_label, label


def merge_with_bootstrap(rows: Iterable[dict]) -> Tuple[List[str], List[int]]:
    texts: List[str] = [t for t, _ in BOOTSTRAP_EXAMPLES]
    labels: List[int] = [v for _, v in BOOTSTRAP_EXAMPLES]
    for row in rows:
        extracted = extract_text_and_label(row)
        if extracted is None:
            continue
        text, lab = extracted
        texts.append(text)
        labels.append(lab)
    return texts, labels


def build_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    # Norwegian text often has hyphenated words and digit
                    # noise from OCR. char_wb captures sub-word patterns
                    # like "NOK", "1000", "tusen" reliably across whitespace.
                    analyzer="char_wb",
                    ngram_range=(2, 5),
                    min_df=1,
                    lowercase=True,
                    strip_accents="unicode",
                ),
            ),
            (
                "clf",
                LogisticRegression(
                    max_iter=1000,
                    class_weight="balanced",
                    solver="liblinear",
                ),
            ),
        ]
    )


def evaluate(pipeline: Pipeline, texts: List[str], labels: List[int]) -> dict:
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
    args = parser.parse_args()

    train_rows = load_jsonl(args.train)
    val_rows = load_jsonl(args.val) if args.val else []
    test_rows = load_jsonl(args.test) if args.test else []

    texts, labels = merge_with_bootstrap(train_rows)

    print(f"Training on {len(texts)} examples ({len(train_rows)} from reviewers, {len(BOOTSTRAP_EXAMPLES)} bootstrap)")
    pipeline = build_pipeline()
    pipeline.fit(texts, labels)

    val_texts: List[str] = []
    val_labels: List[int] = []
    for row in val_rows:
        extracted = extract_text_and_label(row)
        if extracted:
            val_texts.append(extracted[0])
            val_labels.append(extracted[1])

    test_texts: List[str] = []
    test_labels: List[int] = []
    for row in test_rows:
        extracted = extract_text_and_label(row)
        if extracted:
            test_texts.append(extracted[0])
            test_labels.append(extracted[1])

    metrics = {
        "train": evaluate(pipeline, texts, labels),
        "validation": evaluate(pipeline, val_texts, val_labels),
        "test": evaluate(pipeline, test_texts, test_labels),
        "label_distribution_train": {
            str(label): labels.count(label) for label in sorted(set(labels))
        },
    }

    bundle = {
        "pipeline": pipeline,
        "labels": sorted(set(labels)),
        "trained_at": dt.datetime.utcnow().isoformat() + "Z",
        "metrics": metrics,
        "algorithm": "tfidf+logreg",
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.out)
    print(f"Saved model bundle to {args.out}")
    print(json.dumps(metrics, indent=2))

    # Write a metadata sidecar next to the .joblib. The Node.js registration
    # script (scripts/register-ml-model.ts) reads this — it cannot open a
    # joblib pickle, so all the facts it needs are mirrored here as plain JSON.
    reviewer_examples = len(train_rows)
    metadata = {
        "taskType": "UNIT_SCALE_CLASSIFIER",
        "algorithm": "tfidf+logreg",
        # Path as seen *inside the inference container*, where /models is the volume.
        "binaryPath": f"/models/{args.out.name}",
        "trainedAt": bundle["trained_at"],
        "evaluationMetrics": metrics,
        "trainingDataSnapshot": {
            "bootstrapExamples": len(BOOTSTRAP_EXAMPLES),
            "reviewerExamples": reviewer_examples,
            "totalTrainExamples": len(texts),
            "validationExamples": len(val_texts),
            "testExamples": len(test_texts),
            "featureText": "features.pageContextText fallback features.rawLabel",
        },
        "summary": (
            f"TF-IDF + logistic regression trained on {len(texts)} examples "
            f"({reviewer_examples} reviewer examples, {len(BOOTSTRAP_EXAMPLES)} bootstrap)."
        ),
    }
    metadata_path = args.out.with_suffix(".metadata.json")
    with metadata_path.open("w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2, ensure_ascii=False)
    print(f"Saved metadata sidecar to {metadata_path}")


if __name__ == "__main__":
    main()
