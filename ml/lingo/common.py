"""Shared helpers for the Kenyan-language experiments."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
RAW_LINGO = ROOT / "ml" / "data" / "raw" / "lingo"
SYNTHETIC = ROOT / "ml" / "data" / "synthetic" / "kenya_watch_synthetic_seed.csv"
TOKEN = re.compile(r"[a-zA-Z']+")


def node_tool(command: str, payload=None):
    """Run the project's own Node lingo tools, so Python and the live service agree."""
    process = subprocess.run(
        ["node", "scripts/lingo-tools.js", command],
        cwd=BACKEND,
        input=json.dumps(payload) if payload is not None else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(process.stdout)


def load_corpus(language: str | None = None):
    """Licensed corpora fetched by fetch_corpora.py (empty list if not fetched yet)."""
    rows = []
    for path in sorted(RAW_LINGO.glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                row = json.loads(line)
                if language is None or row["language"] == language:
                    rows.append(row)
    return rows


def tokens(text: str):
    return [match.group(0).lower() for match in TOKEN.finditer(text)]
