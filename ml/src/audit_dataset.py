"""Print privacy-preserving aggregate quality diagnostics for a CSV dataset."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from ml.src.dataset import DatasetError, audit_rows, read_rows


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python -m ml.src.audit_dataset <private-csv-path>", file=sys.stderr)
        return 2
    try:
        rows, headers = read_rows(Path(sys.argv[1]))
        print(json.dumps(audit_rows(rows, headers), indent=2, ensure_ascii=True))
        return 0
    except DatasetError as error:
        print(f"Dataset audit could not run: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
