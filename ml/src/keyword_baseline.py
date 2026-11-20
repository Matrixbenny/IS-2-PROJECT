"""Score the live keyword classifier against the synthetic labels.

The trainer compares the learned models with each other; this script measures the
*product's* own triage rule (backend/utils/classifier.js) on the same data, so the
number quoted for "keyword rules used in live triage" comes from the shipped code
rather than from a copy that can drift away from it.

    python -m ml.src.keyword_baseline ml/data/synthetic/kenya_watch_synthetic_seed.csv

Prints macro-F1, accuracy and the per-category F1 of the keyword classifier.
"""
from __future__ import annotations

import csv
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"


def classify_many(texts: list[str]) -> list[str]:
    """Ask the real classifier for one label per text, in a single Node call."""
    payload = json.dumps([{"title": "", "description": t, "evidenceCount": 0} for t in texts])
    process = subprocess.run(
        ["node", "scripts/lingo-tools.js", "classify"],
        cwd=BACKEND, input=payload, capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return json.loads(process.stdout)


def f1_per_class(truth: list[str], predicted: list[str]) -> dict[str, float]:
    labels = sorted(set(truth))
    scores = {}
    for label in labels:
        tp = sum(1 for t, p in zip(truth, predicted) if t == label and p == label)
        fp = sum(1 for t, p in zip(truth, predicted) if t != label and p == label)
        fn = sum(1 for t, p in zip(truth, predicted) if t == label and p != label)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        scores[label] = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return scores


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "ml/data/synthetic/kenya_watch_synthetic_seed.csv")
    with path.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    truth = [row["label"] for row in rows]
    predicted = classify_many([row["text"] for row in rows])

    overall = f1_per_class(truth, predicted)
    macro = sum(overall.values()) / len(overall)
    accuracy = sum(1 for t, p in zip(truth, predicted) if t == p) / len(truth)

    by_language = defaultdict(lambda: [0, 0])
    for row, t, p in zip(rows, truth, predicted):
        by_language[row.get("language", "?")][0] += 1
        by_language[row.get("language", "?")][1] += int(t == p)

    print(f"documents: {len(rows)}")
    print(f"keyword classifier macro-F1: {macro:.4f}")
    print(f"keyword classifier accuracy: {accuracy:.4f}")
    print("\nper-category F1:")
    for label, score in sorted(overall.items(), key=lambda kv: kv[1]):
        print(f"  {label:<28} {score:.3f}")
    print("\naccuracy by language:")
    for language, (total, correct) in sorted(by_language.items()):
        print(f"  {language}: {correct}/{total} = {correct / total:.3f}")

    out = ROOT / "ml" / "artifacts" / "keyword_baseline.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "documents": len(rows), "macro_f1": round(macro, 4), "accuracy": round(accuracy, 4),
        "per_category_f1": {k: round(v, 4) for k, v in overall.items()},
        "accuracy_by_language": {k: round(c / t, 4) for k, (t, c) in by_language.items()},
    }, indent=2), encoding="utf-8")
    print(f"\nwrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
