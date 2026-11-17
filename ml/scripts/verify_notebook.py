"""Execute every code cell of Kenya_Watch_ML_Colab.ipynb in order to verify it runs
top-to-bottom without errors (headless matplotlib, no %pip magic)."""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")

NB = Path(__file__).resolve().parents[1] / "Kenya_Watch_ML_Colab.ipynb"
nb = json.loads(NB.read_text(encoding="utf-8"))

namespace = {"__name__": "__main__"}
executed = 0
for index, cell in enumerate(nb["cells"]):
    if cell["cell_type"] != "code":
        continue
    source = "".join(cell["source"])
    # Colab magic lines are not valid Python; drop them (deps are pre-installed here).
    lines = [line for line in source.splitlines() if not line.lstrip().startswith("%")]
    source = "\n".join(lines)
    if not source.strip():
        print(f"[cell {index}] skipped (magic-only)")
        continue
    print(f"--- running cell {index} ---")
    try:
        exec(compile(source, f"<cell {index}>", "exec"), namespace)
        executed += 1
        print(f"[cell {index}] OK")
    except Exception as error:  # noqa: BLE001
        print(f"[cell {index}] FAILED: {type(error).__name__}: {error}")
        sys.exit(1)

print(f"\nAll {executed} code cells executed successfully.")
