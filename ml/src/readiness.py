"""The gate between "a model that scores well" and "a model we may call accurate".

    python -m ml.src.readiness [--artifacts ml/artifacts]

A model trained on synthetic text can score 0.88 and still be useless on real
reports, because real reports are written differently. So no score earns the word
"accurate" until every check below passes on adjudicated REAL reports. Each check
is a number against a stated limit; the result is written to readiness.json and
the process exits non-zero if the model is not ready.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REAL_STATUS = "adjudicated_real_reports"
MIN_ROWS = 450
MIN_ROWS_PER_CATEGORY = 30
MIN_LOWER_BOUND_F1 = 0.70       # mean fold macro-F1 minus two standard deviations
MIN_CATEGORY_RECALL = 0.50
MAX_LANGUAGE_GAP = 0.10         # best minus worst language macro-F1


def check(name: str, passed: bool, detail: str) -> dict[str, Any]:
    return {"check": name, "passed": bool(passed), "detail": detail}


def assess(evaluation: dict[str, Any], fit: dict[str, Any] | None) -> dict[str, Any]:
    checks = []
    status = evaluation.get("data_status")
    checks.append(check("data are adjudicated real reports", status == REAL_STATUS, f"data_status = {status}"))

    rows = int(evaluation.get("rows", 0))
    checks.append(check("enough reports", rows >= MIN_ROWS, f"{rows} rows (need {MIN_ROWS})"))

    counts = evaluation.get("category_counts", {})
    thin = sorted(name for name, n in counts.items() if n < MIN_ROWS_PER_CATEGORY)
    checks.append(check(
        "every category has enough examples", bool(counts) and not thin,
        f"too few in: {', '.join(thin)}" if thin else f"all categories have at least {MIN_ROWS_PER_CATEGORY}",
    ))

    mean = float(evaluation.get("outer_fold_macro_f1_mean", 0))
    std = float(evaluation.get("outer_fold_macro_f1_std", 1))
    lower = mean - 2 * std
    checks.append(check(
        "held-out score is high and stable", lower >= MIN_LOWER_BOUND_F1,
        f"mean {mean:.3f}, std {std:.3f}, lower bound {lower:.3f} (need {MIN_LOWER_BOUND_F1})",
    ))

    per_category = evaluation.get("nested_out_of_fold", {}).get("per_category", {})
    weak = sorted(name for name, m in per_category.items() if m.get("recall", 0) < MIN_CATEGORY_RECALL)
    checks.append(check(
        "no category is routinely missed", bool(per_category) and not weak,
        f"recall below {MIN_CATEGORY_RECALL}: {', '.join(weak)}" if weak else "every category recall is acceptable",
    ))

    languages = evaluation.get("subgroups", {}).get("language", {})
    scores = {k: v["macro_f1"] for k, v in languages.items() if v.get("status") == "aggregate_only"}
    gap = (max(scores.values()) - min(scores.values())) if len(scores) >= 2 else None
    checks.append(check(
        "English and Kiswahili perform alike", gap is not None and gap <= MAX_LANGUAGE_GAP,
        "language scores unavailable" if gap is None else f"gap {gap:.3f} (limit {MAX_LANGUAGE_GAP})",
    ))

    checks.append(check(
        "no over/underfitting or leakage", bool(fit) and fit.get("verdict", {}).get("fit_ok") is True,
        "run ml.src.diagnose_fit" if not fit else "; ".join(fit["verdict"]["findings"]),
    ))

    ready = all(c["passed"] for c in checks)
    return {
        "ready_to_claim_real_world_accuracy": ready,
        "checks": checks,
        "meaning": (
            "All checks passed on adjudicated real reports. Report the held-out score with its spread, never a single number."
            if ready else
            "Not ready. Do not describe this model as accurate on real reports; it is a pipeline demonstration."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--artifacts", type=Path, default=Path(__file__).resolve().parents[1] / "artifacts")
    args = parser.parse_args()
    try:
        evaluation = json.loads((args.artifacts / "evaluation.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        print("No evaluation.json: train first (python -m ml.src.train <csv>).", file=sys.stderr)
        return 2
    fit_path = args.artifacts / "fit_diagnosis.json"
    fit = json.loads(fit_path.read_text(encoding="utf-8")) if fit_path.is_file() else None
    result = assess(evaluation, fit)
    (args.artifacts / "readiness.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    for item in result["checks"]:
        print(f"[{'PASS' if item['passed'] else 'FAIL'}] {item['check']}: {item['detail']}")
    print("\n" + result["meaning"])
    return 0 if result["ready_to_claim_real_world_accuracy"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
