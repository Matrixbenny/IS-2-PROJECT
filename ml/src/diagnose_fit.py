"""Is the category model underfitting, overfitting, or leaking? Measure it.

    python -m ml.src.diagnose_fit <csv> [--out ml/artifacts/fit_diagnosis.json]

Four checks, all with incident groups kept disjoint between training and test:

1. Train vs validation score per fold. A large gap means the model memorised its
   training wording (overfitting); a low training score means it cannot even fit
   what it has seen (underfitting).
2. Learning curve: validation score as training data grows. A curve still rising
   at 100% means more data would help; a flat curve means capacity or features
   are the limit.
3. Label-shuffle control: train on shuffled labels. The score must fall to chance
   (about 1 / number of categories). If it does not, the pipeline is leaking.
4. Regularisation sweep: shows whether a stronger or weaker penalty would change
   the picture, so the default is not just an unexamined choice.

The verdict is a rule, written out below, not an opinion. It says nothing about
real-world accuracy; see ml/src/readiness.py for the gate that does.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
from pathlib import Path
from typing import Any

from ml.src.dataset import CATEGORIES, DatasetError, read_rows, validate_for_training
from ml.src.train import _build_model

OVERFIT_GAP = 0.10        # train minus validation macro-F1 above this = overfitting
UNDERFIT_TRAIN_F1 = 0.80  # training macro-F1 below this = underfitting
PLATEAU_GAIN = 0.02       # last learning-curve step gaining less than this = plateau
CHANCE_MARGIN = 0.08      # shuffled-label score may exceed chance by at most this


def _macro_f1(y_true: list[str], y_pred: list[str]) -> float:
    from sklearn.metrics import f1_score

    return float(f1_score(y_true, y_pred, labels=list(CATEGORIES), average="macro", zero_division=0))


def _folds(rows: list[dict[str, str]], n_splits: int, seed: int):
    from sklearn.model_selection import StratifiedGroupKFold

    texts = [r["text"] for r in rows]
    labels = [r["label"] for r in rows]
    groups = [r["group_id"] for r in rows]
    return StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed).split(texts, labels, groups)


def _fit_score(model_name: str, train_rows, test_rows, c_value: float | None = None):
    model = _build_model(model_name)
    if c_value is not None:
        model.set_params(classifier__C=c_value)
    model.fit([r["text"] for r in train_rows], [r["label"] for r in train_rows])
    train_f1 = _macro_f1([r["label"] for r in train_rows], list(model.predict([r["text"] for r in train_rows])))
    test_f1 = _macro_f1([r["label"] for r in test_rows], list(model.predict([r["text"] for r in test_rows])))
    return train_f1, test_f1


def train_vs_validation(rows, model_name, c_value=None, n_splits=5, seed=42) -> dict[str, Any]:
    pairs = [
        _fit_score(model_name, [rows[i] for i in tr], [rows[i] for i in te], c_value)
        for tr, te in _folds(rows, n_splits, seed)
    ]
    train_mean = statistics.mean(p[0] for p in pairs)
    val_mean = statistics.mean(p[1] for p in pairs)
    return {
        "train_macro_f1": round(train_mean, 4),
        "validation_macro_f1": round(val_mean, 4),
        "validation_std": round(statistics.pstdev(p[1] for p in pairs), 4),
        "gap": round(train_mean - val_mean, 4),
    }


def learning_curve(rows, model_name, seed=42) -> list[dict[str, float]]:
    """Validation score when only a fraction of each training fold's incident groups is used."""
    rng = random.Random(seed)
    points = []
    for fraction in (0.2, 0.4, 0.6, 0.8, 1.0):
        scores = []
        for tr, te in _folds(rows, 5, seed):
            groups = sorted({rows[i]["group_id"] for i in tr})
            rng.shuffle(groups)
            keep = set(groups[: max(len(CATEGORIES), int(len(groups) * fraction))])
            subset = [rows[i] for i in tr if rows[i]["group_id"] in keep]
            if {r["label"] for r in subset} != set(CATEGORIES):
                continue  # a tiny subset can miss a category; skip rather than score it unfairly
            scores.append(_fit_score(model_name, subset, [rows[i] for i in te])[1])
        if scores:
            points.append({"training_fraction": fraction, "validation_macro_f1": round(statistics.mean(scores), 4)})
    return points


def shuffled_label_control(rows, model_name, seed=42) -> dict[str, float]:
    """Give every incident group a random label; a sound pipeline must drop to chance."""
    rng = random.Random(seed)
    by_group: dict[str, str] = {}
    shuffled = []
    for row in rows:
        if row["group_id"] not in by_group:
            by_group[row["group_id"]] = rng.choice(list(CATEGORIES))
        shuffled.append({**row, "label": by_group[row["group_id"]]})
    scores = []
    for tr, te in _folds(shuffled, 5, seed):
        train_rows, test_rows = [shuffled[i] for i in tr], [shuffled[i] for i in te]
        if len({r["label"] for r in train_rows}) < 2:
            continue
        model = _build_model(model_name)
        model.fit([r["text"] for r in train_rows], [r["label"] for r in train_rows])
        scores.append(_macro_f1([r["label"] for r in test_rows], list(model.predict([r["text"] for r in test_rows]))))
    return {"shuffled_macro_f1": round(statistics.mean(scores), 4), "chance": round(1 / len(CATEGORIES), 4)}


def regularisation_sweep(rows, model_name, values=(0.05, 0.1, 0.3, 1.0, 3.0)) -> list[dict[str, float]]:
    return [{"C": c, **train_vs_validation(rows, model_name, c_value=c)} for c in values]


def verdict(fit: dict[str, Any], curve: list[dict[str, float]], control: dict[str, float]) -> dict[str, Any]:
    findings = []
    if fit["train_macro_f1"] < UNDERFIT_TRAIN_F1:
        findings.append("UNDERFITTING: the model cannot fit even its own training data.")
    if fit["gap"] > OVERFIT_GAP:
        findings.append(f"OVERFITTING: training beats validation by {fit['gap']:.2f} (limit {OVERFIT_GAP}).")
    if len(curve) >= 2 and curve[-1]["validation_macro_f1"] - curve[-2]["validation_macro_f1"] >= PLATEAU_GAIN:
        findings.append("DATA-LIMITED: validation is still improving at full size; more independent incidents would help.")
    if control["shuffled_macro_f1"] > control["chance"] + CHANCE_MARGIN:
        findings.append("LEAKAGE SUSPECTED: shuffled labels score above chance.")
    return {
        "findings": findings or ["No over/underfitting, plateau or leakage signal at these thresholds."],
        "fit_ok": not any(f.startswith(("UNDERFITTING", "OVERFITTING", "LEAKAGE")) for f in findings),
        "thresholds": {
            "overfit_gap": OVERFIT_GAP, "underfit_train_f1": UNDERFIT_TRAIN_F1,
            "plateau_gain": PLATEAU_GAIN, "chance_margin": CHANCE_MARGIN,
        },
    }


def diagnose(rows: list[dict[str, str]], model_name: str) -> dict[str, Any]:
    fit = train_vs_validation(rows, model_name)
    curve = learning_curve(rows, model_name)
    control = shuffled_label_control(rows, model_name)
    return {
        "model": model_name,
        "rows": len(rows),
        "incident_groups": len({r["group_id"] for r in rows}),
        "train_vs_validation": fit,
        "learning_curve": curve,
        "label_shuffle_control": control,
        "regularisation_sweep": regularisation_sweep(rows, model_name) if model_name == "word_char_linear_svc" else [],
        "verdict": verdict(fit, curve, control),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", type=Path)
    parser.add_argument("--model", default="word_char_linear_svc")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "artifacts" / "fit_diagnosis.json")
    args = parser.parse_args()
    try:
        rows, headers = read_rows(args.csv)
        validate_for_training(rows, headers)
    except DatasetError as error:
        print(f"Stopped: {error}", file=sys.stderr)
        return 1
    result = diagnose(rows, args.model)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
