"""Private CSV loading and validation helpers for the ML workspace."""

from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path
from typing import Any

CATEGORIES = (
    "Bribery",
    "Embezzlement",
    "Procurement Fraud",
    "Abuse of Office",
    "Nepotism/Favoritism",
    "Extortion",
    "Fraud/Forgery of Documents",
    "Conflict of Interest",
    "Other",
)
REQUIRED_COLUMNS = {"text", "label"}
TRAINING_COLUMNS = {"text", "label", "group_id"}
OPTIONAL_COLUMNS = {"language", "county"}
MIN_EXAMPLES_PER_CATEGORY = 50
MIN_GROUPS_PER_CATEGORY = 10


class DatasetError(ValueError):
    """Raised when a dataset is unsafe or unsuitable for the training workflow."""


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def read_rows(path: Path) -> tuple[list[dict[str, str]], set[str]]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            if reader.fieldnames is None:
                raise DatasetError("CSV must include a header row.")
            headers = set(reader.fieldnames)
            missing = REQUIRED_COLUMNS - headers
            if missing:
                raise DatasetError(f"CSV is missing required columns: {', '.join(sorted(missing))}.")
            if len(headers) != len(reader.fieldnames):
                raise DatasetError("CSV contains duplicate column names.")
            rows = [
                {key: (value or "").strip() for key, value in row.items() if key is not None}
                for row in reader
            ]
    except OSError as error:
        raise DatasetError(f"Could not read dataset: {error}") from error
    return rows, headers


def audit_rows(rows: list[dict[str, str]], headers: set[str]) -> dict[str, Any]:
    labels = Counter(row.get("label", "") for row in rows if row.get("label", ""))
    texts = [normalize_text(row.get("text", "")) for row in rows if row.get("text", "").strip()]
    duplicates = len(texts) - len(set(texts))
    invalid_labels = sum(
        bool(row.get("label", "")) and row.get("label", "") not in CATEGORIES
        for row in rows
    )
    report: dict[str, Any] = {
        "rows": len(rows),
        "empty_text": sum(not row.get("text", "").strip() for row in rows),
        "empty_label": sum(not row.get("label", "").strip() for row in rows),
        "invalid_label_values": invalid_labels,
        "exact_duplicate_text_rows": duplicates,
        "label_counts": dict(sorted(labels.items())),
        "text_length_words": {
            "min": min((len(row.get("text", "").split()) for row in rows if row.get("text", "").strip()), default=0),
            "max": max((len(row.get("text", "").split()) for row in rows if row.get("text", "").strip()), default=0),
        },
    }
    if "group_id" in headers:
        report["empty_group_id"] = sum(not row.get("group_id", "").strip() for row in rows)
        report["incident_group_counts_by_category"] = {
            category: len({
                row.get("group_id", "").strip()
                for row in rows
                if row.get("label") == category and row.get("group_id", "").strip()
            })
            for category in CATEGORIES
        }
    for column in sorted(OPTIONAL_COLUMNS & headers):
        report[f"empty_{column}"] = sum(not row.get(column, "").strip() for row in rows)
    return report


def validate_for_training(rows: list[dict[str, str]], headers: set[str]) -> None:
    missing = TRAINING_COLUMNS - headers
    if missing:
        raise DatasetError(f"Training CSV is missing required columns: {', '.join(sorted(missing))}.")
    if not rows:
        raise DatasetError("Training CSV has no data rows.")

    report = audit_rows(rows, headers)
    if report["empty_text"] or report["empty_label"]:
        raise DatasetError("Training requires non-empty text and labels; do not impute either.")
    if report["empty_group_id"]:
        raise DatasetError("Every row needs a pseudonymous incident group_id for leakage-resistant validation.")
    if report["invalid_label_values"]:
        raise DatasetError("Training labels must exactly match the canonical report categories.")
    if report["exact_duplicate_text_rows"]:
        raise DatasetError("Exact duplicate text is present; review duplicates before training.")

    labels = Counter(row["label"] for row in rows)
    absent = [category for category in CATEGORIES if not labels[category]]
    if absent:
        raise DatasetError(f"Training data must represent every category; absent: {', '.join(absent)}.")
    insufficient = [
        f"{category} ({labels[category]})"
        for category in CATEGORIES
        if labels[category] < MIN_EXAMPLES_PER_CATEGORY
    ]
    if insufficient:
        raise DatasetError(
            f"Need at least {MIN_EXAMPLES_PER_CATEGORY} examples per category; insufficient: "
            f"{', '.join(insufficient)}."
        )
    groups_by_category = {
        category: {
            row["group_id"] for row in rows if row["label"] == category
        }
        for category in CATEGORIES
    }
    insufficient_groups = [
        f"{category} ({len(groups_by_category[category])})"
        for category in CATEGORIES
        if len(groups_by_category[category]) < MIN_GROUPS_PER_CATEGORY
    ]
    if insufficient_groups:
        raise DatasetError(
            f"Need at least {MIN_GROUPS_PER_CATEGORY} distinct incident groups per category for "
            f"five-fold validation; insufficient: {', '.join(insufficient_groups)}."
        )
