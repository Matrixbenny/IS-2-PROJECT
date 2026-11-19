"""Does the model cope with how Kenyans actually write? A measured, honest benchmark.

The synthetic training data is English and Kiswahili only. Real reports mix English,
Kiswahili and Sheng in one sentence, spell words several ways, and use slang a glossary
has never seen. This script measures how a category classifier degrades on that kind of
text, and what helps.

How it avoids flattering itself
-------------------------------
The Kenya-lingo glossary is split in two. Half the terms are "known" (the normaliser and
the augmentation may use them). The other half are "unseen slang": they appear ONLY in the
test text. A system that merely memorises its own dictionary scores well on known slang
and gets no credit on unseen slang. Cross-validation is grouped by incident, so related
rows never sit on both sides of a split.

Test sets (built from held-out incidents only)
  original      the untouched synthetic sentence
  mixed         the sentence with a slang term and a code-switched clause added, plus
                SMS-style spelling noise
  slang-only    a short Sheng/Kiswahili sentence built around one slang term

Pipelines compared
  A  TF-IDF (word + character n-grams) on raw text
  B  A, with the glossary normaliser applied to training and test text
  C  B, plus training augmented with code-switched variants made from KNOWN slang

READ THE RIGHT COLUMN: the sentence templates used to build slang-only text are shared by
the augmentation and the test, so the "known" columns for pipeline C are flattered. The
"unseen" columns (new slang, same templates) are the honest signal of generalisation, and
they are far lower. The glossary also maps only a few dozen single-word terms to a crime
type, so vocabulary coverage, not the algorithm, is the main limit.

IMPORTANT LIMITS: every variant is machine-generated from the synthetic seed and the
glossary. This measures how the pipeline behaves, not real-world accuracy on Kenyan
reports. It says nothing about fairness or readiness for casework.

Usage:
    python -m ml.lingo.evaluate_lingo
"""
from __future__ import annotations

import json
import random
import re
import unicodedata
import warnings

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import FeatureUnion, Pipeline

from .common import ROOT, SYNTHETIC, node_tool

warnings.filterwarnings("ignore")
SEED = 20261120
OUT = ROOT / "ml" / "artifacts" / "lingo_evaluation.json"

# Which crime a glossary entry points at, judged from its canonical expansion.
CATEGORY_MARKERS = [
    ("Extortion", ("extort", "forced to pay")),
    ("Bribery", ("rushwa", "bribe", "demanded money")),
    ("Embezzlement", ("embezzle", "misappropriat", "missing funds", "public funds")),
    ("Procurement Fraud", ("tender", "procurement", "ghost supplier", "bid rigging")),
    ("Fraud/Forgery of Documents", ("forg", "fake document", "falsif", "counterfeit")),
    ("Nepotism/Favoritism", ("nepotism", "favoritism", "relative")),
    ("Conflict of Interest", ("conflict of interest",)),
    ("Abuse of Office", ("abuse of office", "misused")),
]
SLANG_TEMPLATES = [
    "Jamaa wa ofisi alikuwa anadai {t} kabla ya kunisaidia",
    "Aki mzee, walinidai {t} pale kaunti",
    "Sasa bro, ni {t} tu imekuwa mchezo huku wadi",
    "Niliambiwa nitoe {t} ndio nipate huduma",
    "Mambo ya {t} imezidi kwa ofisi ile, wananchi tunaumia",
]
PREFIXES = ["Sasa bro,", "Aki,", "Mzee,", "Nilikuwa pale ofisini,", "Wacha nikuambie,", "Kweli,"]
SUFFIXES = ["pole sana.", "sijui kama itasaidia.", "ni kweli kabisa.", "tafadhali msaada.", "maze ni hatari."]


def to_category(canonical: str) -> str | None:
    for category, markers in CATEGORY_MARKERS:
        if any(marker in canonical for marker in markers):
            return category
    return None


def split_lexicon(lexicon: dict[str, str], rng: random.Random):
    by_category: dict[str, list[tuple[str, str]]] = {}
    for term, canonical in lexicon.items():
        category = to_category(canonical)
        if category and len(term) >= 4 and " " not in term.strip():
            by_category.setdefault(category, []).append((term, canonical))
    known: dict[str, list[str]] = {}
    unseen: dict[str, list[str]] = {}
    for category, items in by_category.items():
        items.sort()
        rng.shuffle(items)
        half = max(1, len(items) // 2)
        unseen[category] = [term for term, _ in items[:half]]
        known[category] = [term for term, _ in items[half:]] or [items[0][0]]
    return known, unseen


class Normaliser:
    """Python twin of backend/utils/kenyaLingo.js, restricted to the terms it is allowed to know."""

    def __init__(self, glossary: dict[str, str]):
        ordered = sorted(glossary.items(), key=lambda item: -len(item[0]))
        self.patterns = [
            (re.compile(r"(?<![^\W_])" + re.escape(term) + r"(?![^\W_])"), f" {canonical} ")
            for term, canonical in ordered
        ]

    def __call__(self, text: str) -> str:
        text = unicodedata.normalize("NFKD", text)
        text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
        text = re.sub(r"[^\w]+", " ", text).strip()
        for pattern, replacement in self.patterns:
            text = pattern.sub(replacement, text)
        return re.sub(r"\s+", " ", text).strip()


def sms_noise(text: str, rng: random.Random) -> str:
    """Typical informal spelling: dropped vowels, doubled letters, no punctuation."""
    out = []
    for word in text.split():
        roll = rng.random()
        if len(word) > 5 and roll < 0.18:
            word = word[0] + re.sub(r"[aeiou]", "", word[1:])
        elif len(word) > 3 and roll < 0.3:
            index = rng.randrange(1, len(word))
            word = word[:index] + word[index] + word[index:]
        out.append(word)
    return re.sub(r"[.,;:!?]", "", " ".join(out)).lower()


def make_mixed(text: str, category: str, terms: dict[str, list[str]], rng: random.Random) -> str:
    term = rng.choice(terms[category])
    clause = f"{rng.choice(PREFIXES)} {term}"
    body = f"{clause} {text} {rng.choice(SUFFIXES)}" if rng.random() < 0.5 else f"{text} {clause} {rng.choice(SUFFIXES)}"
    return sms_noise(body, rng)


def make_slang_only(category: str, terms: dict[str, list[str]], rng: random.Random) -> str:
    return sms_noise(rng.choice(SLANG_TEMPLATES).format(t=rng.choice(terms[category])), rng)


def build_pipeline(normaliser: Normaliser | None):
    features = FeatureUnion([
        ("word", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1,
                                 preprocessor=normaliser if normaliser else None)),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2,
                                 preprocessor=normaliser if normaliser else str.lower)),
    ])
    return Pipeline([("features", features), ("model", LogisticRegression(max_iter=2000, class_weight="balanced"))])


def macro_f1(model, texts, labels):
    return f1_score(labels, model.predict(texts), average="macro", zero_division=0)


def main() -> int:
    rng = random.Random(SEED)
    frame = pd.read_csv(SYNTHETIC)
    frame = frame.dropna(subset=["text", "label", "group_id"]).reset_index(drop=True)
    lexicon = node_tool("export-lexicon")
    known_terms, unseen_terms = split_lexicon(lexicon, rng)
    known_glossary = {term: lexicon[term] for terms in known_terms.values() for term in terms}
    covered = sorted(set(known_terms) & set(unseen_terms))
    print(f"glossary: {len(lexicon)} terms; {sum(map(len, known_terms.values()))} known, "
          f"{sum(map(len, unseen_terms.values()))} held out as unseen slang; categories covered: {len(covered)}")

    folds = GroupKFold(n_splits=5)
    results = {name: {"original": [], "mixed-known": [], "mixed-unseen": [], "slang-known": [], "slang-unseen": []}
               for name in ("A raw text", "B + glossary normaliser", "C + code-switch augmentation")}
    plain = Normaliser(known_glossary)

    for train_idx, test_idx in folds.split(frame, groups=frame["group_id"]):
        train, test = frame.iloc[train_idx], frame.iloc[test_idx]
        test_in_scope = test[test["label"].isin(covered)]
        sets = {
            "original": (list(test["text"]), list(test["label"])),
        }
        for tag, terms in (("known", known_terms), ("unseen", unseen_terms)):
            sets[f"mixed-{tag}"] = (
                [make_mixed(t, c, terms, rng) for t, c in zip(test_in_scope["text"], test_in_scope["label"])],
                list(test_in_scope["label"]))
            sets[f"slang-{tag}"] = (
                [make_slang_only(c, terms, rng) for c in test_in_scope["label"]],
                list(test_in_scope["label"]))

        train_texts, train_labels = list(train["text"]), list(train["label"])
        aug_rows = train[train["label"].isin(covered)]
        aug_texts = train_texts + [make_mixed(t, c, known_terms, rng) for t, c in zip(aug_rows["text"], aug_rows["label"])] \
            + [make_slang_only(c, known_terms, rng) for c in aug_rows["label"]]
        aug_labels = train_labels + list(aug_rows["label"]) * 2

        configs = {
            "A raw text": (build_pipeline(None), train_texts, train_labels),
            "B + glossary normaliser": (build_pipeline(plain), train_texts, train_labels),
            "C + code-switch augmentation": (build_pipeline(plain), aug_texts, aug_labels),
        }
        for name, (pipeline, texts, labels) in configs.items():
            pipeline.fit(texts, labels)
            for set_name, (x, y) in sets.items():
                results[name][set_name].append(macro_f1(pipeline, x, y))

    summary = {name: {k: round(float(np.mean(v)), 3) for k, v in cols.items()} for name, cols in results.items()}
    spread = {name: {k: round(float(np.std(v)), 3) for k, v in cols.items()} for name, cols in results.items()}

    columns = ["original", "mixed-known", "mixed-unseen", "slang-known", "slang-unseen"]
    print("\nMacro-F1 (mean over 5 incident-grouped folds)")
    print(f"{'pipeline':<32}" + "".join(f"{c:>15}" for c in columns))
    for name, cols in summary.items():
        print(f"{name:<32}" + "".join(f"{cols[c]:>15.3f}" for c in columns))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "macro_f1_mean": summary, "macro_f1_std_across_folds": spread, "seed": SEED,
        "glossary_terms": len(lexicon), "categories_covered": covered,
        "caveat": ("Templates are shared between augmentation and test, so the known-slang columns for C are inflated; "
                   "use the unseen-slang columns as the generalisation signal. Synthetic, machine-generated variants. Measures pipeline behaviour on code-switched and noisy "
                   "text, not real-world accuracy, fairness or readiness for casework."),
    }, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
