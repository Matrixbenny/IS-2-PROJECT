"""Mine candidate Sheng/Kiswahili glossary terms from text the project may lawfully use.

The live normaliser (backend/utils/kenyaLingo.js) only knows the words someone wrote
into it. When a Sheng report is mis-classified, the usual cause is a term that is
missing from the glossary, or present but mapped to a canon that carries no weight
in classifier.js.

This script does not add anything. It reads the synthetic seed corpus (authored for
the project) and any licensed corpora fetched by fetch_corpora.py, finds words that
co-occur with a corruption concept, and writes them to a review file *with the canon
that the surrounding text already produced*. A Kenyan lexicographer or reviewer
decides, term by term, what each word should normalise to.

Two review files are produced:
  * lingo_slang_candidates.csv - slang/dialect terms worth adding to the glossary
  * lingo_gap_candidates.csv   - sentences whose words are unknown but whose canon
                                 clearly names a corruption concept (a gap to close)

Usage:
    python -m ml.lingo.mine_slang_candidates
    python -m ml.lingo.mine_slang_candidates --min-count 2 --top 200
"""
from __future__ import annotations

import argparse
import csv
import math
import re
from collections import Counter
from pathlib import Path

from .common import ROOT, SYNTHETIC, load_corpus, node_tool

PROCESSED = ROOT / "ml" / "data" / "processed"
SLANG_OUT = PROCESSED / "lingo_slang_candidates.csv"
GAP_OUT = PROCESSED / "lingo_gap_candidates.csv"

# Canon words the classifier actually scores (see backend/utils/classifier.js and
# the CATEGORY_KEYWORDS table). A candidate is only interesting if it sits next to
# one of these, because that is how the model learns the association.
CORRUPTION_CANONS = {
    "bribe", "bribery", "kickback", "gratification", "embezzle", "misappropriat",
    "extort", "fraud", "forg", "forgery", "tender", "procurement", "nepotism",
    "favoritism", "conflict", "abuse", "inflated", "ghost", "coerced", "threatened",
    "forced", "demanded", "diversion", "diverted", "stolen", "kickbacks",
}

# Words that are already handled (or are pure noise). Sourced from the live stop set
# plus English function words that the canon expansion introduces.
NOISE = set(
    "na ya wa kwa katika ni la za cha vya kuwa huo hiyo hao huu hii hizi yake wake wao "
    "kama lakini au pia sana bado tu hata ili kwamba alisema walisema amesema pia hiyo "
    "the of and to in is was for on at by with from that this it be as an or are not "
    "i my me we you he she they them his her their our your alinitaka alituomba "
    "alisema walisema amesema niliona tuliona nimeona alifanya walifanya".split()
)

TOKEN = re.compile(r"[a-zA-Z']+")


def canon_words(text: str) -> list[str]:
    """Tokens of already-normalised text that carry a corruption concept."""
    return [t for t in TOKEN.findall(text.lower()) if t in CORRUPTION_CANONS]


def raw_tokens(text: str) -> list[str]:
    return [t.lower() for t in TOKEN.findall(text)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-count", type=int, default=3, help="minimum occurrences of a candidate")
    parser.add_argument("--window", type=int, default=6, help="words either side of a canon")
    parser.add_argument("--top", type=int, default=150, help="rows written per file")
    args = parser.parse_args()

    rows = []
    if SYNTHETIC.exists():
        with SYNTHETIC.open(encoding="utf-8") as handle:
            rows.extend(csv.DictReader(handle))
    else:
        print(f"warning: synthetic seed not found at {SYNTHETIC}")
    rows.extend(load_corpus())
    if not rows:
        print("No text to mine. Run: python -m ml.src.generate_synthetic_dataset")
        return 1

    lexicon = node_tool("export-lexicon")  # term -> canon already handled
    known = {w for term in lexicon for w in term.split()}

    # One batched call, so Python and the live service apply exactly the same
    # normalisation without spawning Node once per row.
    normalised_rows = node_tool("normalise", [row.get("text") or "" for row in rows])

    near_canon = Counter()
    contexts: dict[str, str] = {}
    totals = Counter()
    gaps: list[tuple[str, str, str]] = []

    for row, normalised in zip(rows, normalised_rows):
        text = row.get("text") or ""
        canon_tokens = canon_words(normalised)
        words = raw_tokens(text)
        totals.update(words)
        if not canon_tokens:
            continue

        canon_set = set(canon_tokens)
        for index, word in enumerate(words):
            if word in canon_set:
                lo, hi = max(0, index - args.window), min(len(words), index + args.window + 1)
                span = words[lo:hi]
                for neighbour in span:
                    if neighbour != word:
                        near_canon[neighbour] += 1
                contexts.setdefault(word, text.strip()[:220])

        # A sentence that names a corruption concept, but whose only such word is
        # one the classifier already scores, still tells us nothing new. A gap is a
        # sentence with canon words whose *slang* part is unknown to the glossary.
        unknown = [w for w in words if w not in known and w not in canon_set and w not in NOISE and len(w) > 3]
        if unknown and canon_tokens:
            gap_text = " ".join(unknown[:12])
            gaps.append((gap_text, " ".join(sorted(canon_set)), text.strip()[:220]))

    def g2(k1: int, n1: int, k2: int, n2: int) -> float:
        def term(k, n, p):
            if not 0 < p < 1:
                return 0.0
            return k * math.log(p) + (n - k) * math.log(1 - p)

        p = (k1 + k2) / (n1 + n2)
        return 2 * (term(k1, n1, k1 / n1) + term(k2, n2, k2 / n2) - term(k1, n1, p) - term(k2, n2, p))

    near_total = sum(near_canon.values()) or 1
    grand_total = sum(totals.values()) or 1

    candidates = []
    for word, near in near_canon.items():
        total = totals[word]
        if total < args.min_count or len(word) < 3 or word in NOISE or word in known:
            continue
        if word in CORRUPTION_CANONS:
            continue
        elsewhere = max(grand_total - near_total, 1)
        score = g2(near, near_total, max(total - near, 0), elsewhere)
        if near / near_total <= total / grand_total:  # not over-represented near canon
            continue
        candidates.append((word, near, total, round(score, 1), contexts.get(word, "")))
    candidates.sort(key=lambda item: -item[3])

    PROCESSED.mkdir(parents=True, exist_ok=True)
    with SLANG_OUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["term", "near_canon_count", "corpus_count", "g2_score",
                         "example_context", "reviewer_decision", "canonical_form", "reviewer_notes"])
        writer.writerows(candidates[: args.top])

    with GAP_OUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["unknown_terms", "canon_present", "example_sentence",
                         "reviewer_decision", "reason", "reviewer_notes"])
        for unknown, canon, sentence in gaps[: args.top]:
            writer.writerow([unknown, canon, sentence, "", "", ""])

    print(f"{len(rows)} documents, {grand_total} tokens, {near_total} canon-adjacent tokens")
    print(f"wrote {min(len(candidates), args.top)} slang candidates to {SLANG_OUT.relative_to(ROOT)}")
    print(f"wrote {min(len(gaps), args.top)} gap rows to {GAP_OUT.relative_to(ROOT)}")
    print("\nTop candidates (term  near  total  G2):")
    for word, near, total, score, _ in candidates[:15]:
        print(f"  {word:<16} {near:>4}  {total:>5}  {score}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
