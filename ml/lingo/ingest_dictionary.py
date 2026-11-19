"""Turn a dictionary PDF we hold written permission for into a REVIEW CSV.

Nothing here touches the live glossary. Every row is a suggestion for a human
(an Admin, ideally with a native speaker) to approve through the normal
Reviewer -> Admin workflow. Run:

    python -m ml.lingo.ingest_dictionary --pdf <file.pdf> --source btl-digo

The source must be registered in ml/lingo/permissions.json; an unregistered
source is refused, which is the same gate the corpus fetcher applies to licences.
Needs the `pdftotext` command (poppler).
"""
import argparse
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent / "data" / "lingo"

# Entries that describe wrongdoing, public money or officialdom are the ones the
# classifier can use; the rest of a dictionary is not needed for triage.
RELEVANT = re.compile(
    r"\b(bribe|bribery|corrupt|steal|theft|thief|rob|cheat|fraud|swindle|embezzl|extort|"
    r"money|fine|tax|debt|tender|bid|police|arrest|prison|court|judge|law|official|"
    r"government|chief|office|land|title|plot|bursary|school fees|permit|licen[cs]e|"
    r"unfair|illegal|forge|fake|threat|demand|ask for payment|favou?r|hospital|clinic)\b",
    re.I,
)
SKIP = {"a", "e", "i", "o", "u"}


def pdf_to_text(pdf: Path) -> str:
    result = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        sys.exit(f"pdftotext failed: {result.stderr.strip()}")
    return result.stdout


def parse_entries(text: str):
    """Headwords start at column 0 after a blank line; indented lines belong to the entry above."""
    entries, current, previous_blank = [], None, True
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            previous_blank = True
            continue
        starts_entry = previous_blank and not raw[:1].isspace() and re.match(r"^[a-z][a-z'’-]*[0-9]?\b", line)
        previous_blank = False
        if "Digo -- English -- Swahili Dictionary" in line:
            continue
        if starts_entry:
            current = [line]
            entries.append(current)
        elif current is not None:
            current.append(line.strip())
    return [" ".join(e) for e in entries]


def split_entry(entry: str):
    match = re.match(r"^([a-z][a-z'’-]*)[0-9]?\s*(\([^)]*\))?\s*(.*)$", entry)
    if not match:
        return None
    headword, rest = match.group(1), match.group(3)
    gloss = rest.split(". ", 1)[0]
    english, _, swahili = gloss.partition(";")
    return headword, english.strip(), swahili.strip().rstrip(".")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--source", required=True)
    args = parser.parse_args()

    registry = json.loads((HERE / "permissions.json").read_text(encoding="utf-8"))
    permission = next((p for p in registry["permissions"] if p["id"] == args.source), None)
    if not permission:
        sys.exit(f"'{args.source}' has no entry in permissions.json - refusing to ingest.")

    rows, seen = [], set()
    for entry in parse_entries(pdf_to_text(args.pdf)):
        parts = split_entry(entry)
        if not parts or parts[0] in SKIP or parts[0] in seen:
            continue
        headword, english, swahili = parts
        if RELEVANT.search(english) or RELEVANT.search(swahili):
            seen.add(headword)
            rows.append({"term": headword, "language": permission["language"], "english": english,
                         "kiswahili": swahili, "source": args.source, "status": "needs-human-review"})

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{args.source}_review.csv"
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["term", "language", "english", "kiswahili", "source", "status"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"{len(rows)} candidate terms written to {out} (review only; nothing added to the glossary).")


if __name__ == "__main__":
    main()
