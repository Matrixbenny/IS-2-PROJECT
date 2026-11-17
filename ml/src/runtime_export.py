"""Export the fitted text model in a format the Node service can evaluate."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def export_runtime_model(model: Any, model_path: Path, runtime_path: Path, data_status: str) -> dict[str, Any]:
    model_sha256 = hashlib.sha256(model_path.read_bytes()).hexdigest()
    feature_transformer = model.named_steps["features"]
    classifier = model.named_steps["classifier"]
    if hasattr(feature_transformer, "transformer_list"):
        vectorizers = dict(feature_transformer.transformer_list)
    else:
        vectorizers = {"word": feature_transformer}

    runtime_model = {
        "schemaVersion": 1,
        "model": model.named_steps["classifier"].__class__.__name__,
        "modelVersion": model_sha256[:16],
        "trainingDataStatus": data_status,
        "realWorldPerformanceClaim": False,
        "categories": [str(category) for category in classifier.classes_],
        "features": {
            name: {
                "vocabulary": {
                    term: int(index)
                    for term, index in vectorizer.vocabulary_.items()
                },
                "idf": vectorizer.idf_.tolist(),
                "ngramRange": list(vectorizer.ngram_range),
            }
            for name, vectorizer in vectorizers.items()
        },
        "weights": classifier.coef_.tolist(),
        "intercepts": classifier.intercept_.tolist(),
    }
    runtime_path.write_text(
        json.dumps(runtime_model, ensure_ascii=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return {
        "model_version": runtime_model["modelVersion"],
        "artifact_sha256": model_sha256,
    }
