"""Fetch licence-verified Kenyan-language text samples for lexicon and language work.

Why this exists: the project wants its language handling to learn real Kenyan usage,
but only from text it is allowed to use. This script reads ml/lingo/sources.json,
asks the Hugging Face hub for each dataset's own licence metadata, and downloads a
bounded sample only when that licence is on the allowlist. Every download is recorded
(source, licence, date, row count, SHA-256) in ml/data/raw/lingo/provenance.json.

Output stays in the git-ignored ml/data/raw/ folder. Nothing here scrapes a website or
a social platform.

Usage:
    python -m ml.lingo.fetch_corpora --max-rows 300
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW_DIR = HERE.parent / "data" / "raw" / "lingo"
PAGE = 100  # the public dataset server returns at most 100 rows per request
USER_AGENT = "kenya-watch-research/1.0 (academic project)"


def http_json(url: str, retries: int = 3):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == retries - 1:
                raise RuntimeError(f"request failed for {url}: {error}") from error
            time.sleep(2 * (attempt + 1))


def declared_licences(dataset_id: str) -> list[str]:
    info = http_json(f"https://huggingface.co/api/datasets/{dataset_id}")
    licence = (info.get("cardData") or {}).get("license")
    if isinstance(licence, str):
        licence = [licence]
    return [item.lower() for item in (licence or [])]


def licence_decision(declared: list[str], config: dict) -> tuple[bool, str]:
    """Usable when at least one declared licence is on the allowlist.

    Dual-licensed works (for example Wikipedia: CC BY-SA 3.0 or GFDL) let the user
    choose one, so a single approved licence is enough. No declared licence, or only
    unapproved ones, means the source is refused.
    """
    allowed = set(config["allowed_licences"])
    if not declared:
        return False, "no licence declared in the dataset metadata"
    if not any(item in allowed for item in declared):
        return False, f"no declared licence is on the allowlist: {', '.join(declared)}"
    return True, "ok"


def fetch_rows(source: dict, max_rows: int):
    rows = []
    offset = 0
    while len(rows) < max_rows:
        length = min(PAGE, max_rows - len(rows))
        query = urllib.parse.urlencode({
            "dataset": source["id"], "config": source["config"], "split": source["split"],
            "offset": offset, "length": length,
        })
        payload = http_json(f"https://datasets-server.huggingface.co/rows?{query}")
        batch = payload.get("rows", [])
        if not batch:
            break
        rows.extend(item["row"] for item in batch)
        offset += len(batch)
        time.sleep(0.4)  # be polite to the public service
    return rows[:max_rows]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--max-rows", type=int, default=300, help="rows per source (default 300)")
    args = parser.parse_args(argv)

    config = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    provenance = []
    for source in config["sources"]:
        name = f"{source['id'].replace('/', '__')}__{source['config']}"
        declared = declared_licences(source["id"])
        allowed, reason = licence_decision(declared, config)
        entry = {"source": source["id"], "config": source["config"], "licence": declared,
                 "language": source["language"], "register": source["register"],
                 "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        if not allowed:
            entry.update(status="refused", reason=reason)
            print(f"REFUSED {name}: {reason}")
            provenance.append(entry)
            continue
        rows = fetch_rows(source, args.max_rows)
        texts = []
        for row in rows:
            parts = [str(row.get(field, "")).strip() for field in source["text_fields"]]
            text = " ".join(part for part in parts if part)
            if text:
                texts.append({"text": text, "language": source["language"], "register": source["register"]})
        body = "\n".join(json.dumps(item, ensure_ascii=False) for item in texts) + "\n"
        (RAW_DIR / f"{name}.jsonl").write_text(body, encoding="utf-8")
        entry.update(
            status="fetched", rows=len(texts),
            noncommercial_only=any(item in config["noncommercial_licences"] for item in declared),
            sha256=hashlib.sha256(body.encode("utf-8")).hexdigest(),
        )
        print(f"fetched {name}: {len(texts)} rows, licence {declared}")
        provenance.append(entry)

    (RAW_DIR / "provenance.json").write_text(json.dumps(provenance, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
