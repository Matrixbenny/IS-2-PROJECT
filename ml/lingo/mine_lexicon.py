"""Mine candidate Kiswahili vocabulary around corruption terms from licensed corpora.

The live normaliser (backend/utils/kenyaLingo.js) maps Sheng, Kiswahili and dialect
terms to canonical forms. It only knows the words someone wrote into it. This script
looks in the licensed corpora for words that keep company with the known corruption
vocabulary (by a log-likelihood score) and are NOT yet in the glossary, and writes
them to a review file.

Nothing here is added automatically. A Kenyan lexicographer or reviewer decides, term by
term, whether a candidate is real corruption vocabulary, what it should be normalised to,
and whether it belongs in the glossary. Statistics suggest; people decide.

Usage:
    python -m ml.lingo.mine_lexicon
"""
from __future__ import annotations

import csv
import math
from collections import Counter
from pathlib import Path

from .common import ROOT, load_corpus, node_tool, tokens

OUT = ROOT / "ml" / "data" / "processed" / "lingo_candidates.csv"
WINDOW = 8
MIN_COUNT = 3
MIN_CORPUS_COUNT = 6
CORRUPTION_CANONICAL = ("rushwa", "bribe", "embezzle", "extort", "fraud", "forg", "misappropriat", "tender")
TOP = 150

# Kiswahili stems that name corruption directly; the lexicon's own keys are added too.
SEED_STEMS = {
    "rushwa", "hongo", "ufisadi", "fisadi", "zabuni", "ubadhirifu", "ulaghai", "udanganyifu",
    "wizi", "kughushi", "upendeleo", "unyang'anyi", "kuiba",
}
STOP = set(
    "na ya wa kwa katika ni la za cha vya kuwa huo hiyo hao huu hii hizi yake wake wao kama "
    "lakini au pia sana bado tu hata ili kwamba alisema walisema amesema the of and to in".split()
)


def main() -> int:
    corpus = load_corpus("sw")
    if not corpus:
        print("No Kiswahili corpus found. Run: python -m ml.lingo.fetch_corpora")
        return 1

    lexicon = node_tool("export-lexicon")
    known = {word for term in lexicon for word in term.split()}
    # Seeds: direct corruption stems plus glossary terms that normalise to a corruption
    # concept (not generic words that merely appear in the glossary).
    seeds = set(SEED_STEMS) | {
        word
        for term, canonical in lexicon.items()
        if any(marker in canonical for marker in CORRUPTION_CANONICAL)
        for word in term.split() if len(word) > 4
    }

    unigram = Counter()
    near_seed = Counter()
    total_tokens = 0
    seed_windows = 0
    contexts: dict[str, str] = {}
    for row in corpus:
        words = tokens(row["text"])
        total_tokens += len(words)
        unigram.update(words)
        for index, word in enumerate(words):
            if word in seeds:
                seed_windows += 1
                lo, hi = max(0, index - WINDOW), min(len(words), index + WINDOW + 1)
                neighbours = {w for w in words[lo:hi] if w != word}
                near_seed.update(neighbours)
                for neighbour in neighbours:
                    contexts.setdefault(neighbour, " ".join(words[lo:hi]))

    if seed_windows == 0:
        print("The corpus sample contains no corruption vocabulary; fetch more rows (--max-rows).")
        return 1

    def log_likelihood(k1, n1, k2, n2):
        """Dunning G2: how surprising is the word's frequency near seeds vs elsewhere."""
        def term(k, n, p):
            return k * math.log(p) + (n - k) * math.log(1 - p) if 0 < p < 1 else 0.0
        p = (k1 + k2) / (n1 + n2)
        return 2 * (term(k1, n1, k1 / n1) + term(k2, n2, k2 / n2) - term(k1, n1, p) - term(k2, n2, p))

    near_total = sum(near_seed.values())
    candidates = []
    for word, count in near_seed.items():
        corpus_count = unigram[word]
        if (count < MIN_COUNT or corpus_count < MIN_CORPUS_COUNT or len(word) < 4
                or word in STOP or word in known or word in seeds):
            continue
        elsewhere = max(total_tokens - near_total, 1)
        score = log_likelihood(count, near_total, max(corpus_count - count, 0), elsewhere)
        # Keep only words that are over-represented near corruption terms.
        if count / near_total <= corpus_count / total_tokens:
            continue
        candidates.append((word, count, corpus_count, round(score, 1), contexts[word]))
    candidates.sort(key=lambda item: -item[3])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["term", "near_seed_count", "corpus_count", "g2_score", "example_context",
                         "reviewer_decision", "canonical_form", "reviewer_notes"])
        for word, near, total, score, context in candidates[:TOP]:
            writer.writerow([word, near, total, score, context, "", "", ""])
    print(f"{len(corpus)} documents, {total_tokens} tokens, {seed_windows} corruption-term windows")
    print(f"wrote {min(TOP, len(candidates))} candidates for human review to {OUT.relative_to(ROOT)}")
    for word, near, total, score, _ in candidates[:15]:
        print(f"  {word:<16} near-seed {near:>3}  corpus {total:>4}  G2 {score}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
