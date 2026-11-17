"""Builds Kenya_Watch_ML_Colab.ipynb - a self-contained Colab notebook that mirrors
the offline pipeline in ml/src/ and is organised around the supervisor's ML rubric:
1. Introduction/Problem  2. Dataset & Preprocessing  3. Methodology & Model Selection
4. Model Evaluation      5. Deployment.

Run: python ml/scripts/build_colab_notebook.py   (from the project root)
The notebook embeds the repository's synthetic corpus so it runs with no uploads.
"""
import csv
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "ml" / "Kenya_Watch_ML_Colab.ipynb"
CSV = ROOT / "ml" / "data" / "synthetic" / "kenya_watch_synthetic_seed.csv"

# Embed the corpus as an inline CSV string so Colab needs no file upload. This keeps the
# notebook completely reproducible: the same 540 rows the repository generator produces.
rows = list(csv.reader(CSV.open(encoding="utf-8-sig", newline="")))
header, body = rows[0], rows[1:]
# Re-quote with csv.writer so narratives containing commas/newlines survive embedding.
_buffer = io.StringIO()
writer = csv.writer(_buffer, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
writer.writerows([header] + body)
csv_literal = _buffer.getvalue().rstrip("\n")

cells = []


def md(text):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": text.strip("\n") + "\n"})


def code(text):
    cells.append({"cell_type": "code", "execution_count": None, "metadata": {},
                  "outputs": [], "source": text.strip("\n") + "\n"})


# =====================================================================
md("""
# Kenya Watch — Machine Learning Component
### Report Category Classification for Corruption Reports in Kenya

**Project:** A Machine Learning-Based Web Platform for Anonymous Reporting and Tracking of
Corruption Cases in Kenya
**Student:** Nyangabi Benvictor Mwangi (155499) — BBIT 4C, Strathmore University
**Supervisor:** Ms. Zainabu Muti

---

## Purpose

This notebook reproduces the offline ML pipeline in the project repository (`ml/src/`) so the
complete workflow can be inspected and re-run in one place. It is organised to map directly onto
the assessment rubric:

| Rubric component | Section |
|---|---|
| Introduction & Problem Definition | **1** |
| Dataset & Preprocessing (description, EDA, feature engineering) | **2** |
| Methodology & Model Selection (choice, justification, implementation) | **3** |
| Model Evaluation (metrics, comparison, visualisation) | **4** |
| Deployment (integration strategy + demonstration) | **5** |

**To run:** `Runtime ▸ Run all`. No uploads or setup required.

## ⚠️ Honest scope statement (please read first)

The corpus used here is a **synthetic, hand-authored demonstration corpus** of fictional
reports — not real citizen submissions. It exists to exercise and validate the *pipeline*.
Therefore:

- The scores in Section 4 measure performance **on the synthetic corpus only**.
- They are **not** an estimate of accuracy on real Kenyan corruption reports.
- The model produced here is **not** wired into the live web application. The live app uses a
  transparent keyword classifier (`backend/utils/classifier.js`) as assistive triage only
  (design decisions #5/#28: ML assists, it never blocks the workflow).
- Using real reports requires the data-governance process documented in `ml/README.md`.
""")

# =====================================================================
md("""
---
# 1. Introduction and Problem Definition
*(Rubric: 2 marks clarity of problem definition · 3 marks relevance and motivation)*

## 1.1 The problem

Corruption in Kenya is widespread, under-reported and rarely followed up. Citizens who witness or
experience bribery, embezzlement, procurement fraud or abuse of office are deterred by three things:

1. **Fear of retaliation** — reporting means becoming identifiable.
2. **No feedback** — complaints disappear, so trust in the process erodes.
3. **No prioritisation** — oversight bodies are overwhelmed, and serious cases are not triaged fast enough.

Kenya Watch addresses (1) with an anonymity-first architecture: anonymous reporters have **no
account at all**, and their identity is never collected, so there is nothing to leak. It addresses
(2) with a tracking reference + secret access key and a moderated agency-response loop.

This notebook addresses **(3) — triage**.

## 1.2 Where machine learning fits

A human review team cannot read and prioritise every narrative quickly. The platform therefore
uses lightweight text classification to **assist** triage:

- **Suggest a category** for each report (8 statutory categories + `Other`).
- **Signal urgency** so High/Critical cases escalate if unclaimed past a threshold.

**The ML layer is assistive, never decision-making:** it runs asynchronously after submission so it
can never block a report; it never sees or uses reporter identity (which is not collected for
anonymous reports); and category labels used for training come from a **double-blind human review**
workflow, not from the reporter's own selection.

## 1.3 Why this matters

Speed of first response is the single biggest driver of citizen trust in a reporting platform. A
reliable triage assist shortens time-to-first-review, surfaces severe cases early, and — because the
system also collects independent human labels — makes the machine layer **measurable and
accountable** rather than a black box.
""")

# =====================================================================
md("""
---
# 2. Dataset and Preprocessing
*(Rubric: 3 marks dataset description · 4 marks preprocessing/feature engineering · 2 marks EDA)*

## 2.1 Dataset description

| Property | Value |
|---|---|
| Source | Deterministic, hand-authored **synthetic** corpus (`ml/src/generate_synthetic_dataset.py`) |
| Size | **540 rows** = 9 categories × 15 scenario groups × 4 variants |
| Variants per scenario | 2 English + 2 draft Kiswahili |
| Labels | The 8 statutory categories (Anti-Corruption and Economic Crimes Act) + `Other` |
| Incident grouping | Each fictional incident = one `group_id`; all variants of one incident stay in the same fold |
| Real personal data | **None** |

**Schema:** `text, label, group_id, language, county`

- `text` — the report narrative (the only model input besides metadata used for evaluation).
- `label` — independently assignable category (the target).
- `group_id` — the **incident** key. Critical for leakage-free validation (explained in §3.2).
- `language`, `county` — used **only** for aggregate subgroup evaluation, never as features.

**Why synthetic first?** Training on real reports requires institutional approval, de-identification
and reviewed labels. The synthetic corpus validates the pipeline's *mechanics* — grouping, nested
validation, metric computation — before any sensitive data is touched.

## 2.2 The corpus is embedded below

So that this notebook runs anywhere with **no file uploads**, the 540-row corpus is embedded as a
CSV string. It is byte-identical to `ml/data/synthetic/kenya_watch_synthetic_seed.csv` in the
repository.
""")

code("""
%pip -q install "scikit-learn>=1.5,<2" "joblib>=1.4,<2" pandas matplotlib
""")

code(f'''
import io, csv, json, statistics
from collections import Counter
from pathlib import Path
import pandas as pd

CATEGORIES = (
    "Bribery", "Embezzlement", "Procurement Fraud", "Abuse of Office",
    "Nepotism/Favoritism", "Extortion", "Fraud/Forgery of Documents",
    "Conflict of Interest", "Other",
)

CSV_DATA = {csv_literal!r}   # repr() keeps quoting/commas safe

df = pd.read_csv(io.StringIO(CSV_DATA), dtype=str, keep_default_na=False)
df = df.apply(lambda col: col.str.strip())

# --- Dataset audit gates (mirrors ml/src/dataset.py::validate_for_training) ---
counts = Counter(df["label"])
groups = {{c: df[df["label"] == c]["group_id"].nunique() for c in CATEGORIES}}
duplicates = len(df) - len({{t.strip().casefold() for t in df["text"]}})

assert set(counts) == set(CATEGORIES), f"missing categories: {{set(CATEGORIES) - set(counts)}}"
assert duplicates == 0, f"exact duplicate text rows: {{duplicates}}"
assert all(groups[c] >= 10 for c in CATEGORIES), "each category needs >=10 incident groups"

print(f"Rows               : {{len(df)}}")
print(f"Distinct incidents : {{df['group_id'].nunique()}}")
print(f"Rows per category  : {{dict(sorted(counts.items()))}}")
print(f"Duplicate texts    : {{duplicates}}")
''')

md("""
## 2.3 Exploratory Data Analysis

*(Rubric: 2 marks — key insights, supported by visuals/statistics)*
""")

code("""
df["word_count"] = df["text"].str.split().str.len()

print("Shape:", df.shape)
print("\\nClass distribution:")
print(df["label"].value_counts().to_string())
print("\\nLanguage mix:")
print(df["language"].value_counts().to_string())
print("\\nNarrative length in words:")
print(df["word_count"].describe().round(1).to_string())
print("\\nIncident groups per category:")
print(pd.Series(groups).to_string())
""")

code("""
import matplotlib.pyplot as plt

fig, axes = plt.subplots(2, 2, figsize=(14, 9))

# (a) Class balance
counts_sorted = df["label"].value_counts().sort_values()
axes[0, 0].barh(counts_sorted.index, counts_sorted.values, color="#0d9488")
axes[0, 0].set_title("(a) Rows per category")
axes[0, 0].set_xlabel("rows")

# (b) Narratives per incident -> shows the grouping structure
per_group = df.groupby("group_id").size()
axes[0, 1].hist(per_group.values, bins=range(1, per_group.max() + 2), color="#0f766e",
                edgecolor="white", align="left")
axes[0, 1].set_title("(b) Variants per incident group")
axes[0, 1].set_xlabel("rows describing the same incident")

# (c) Narrative length by language
for lang, colour in (("English", "#0f766e"), ("Kiswahili", "#f59e0b")):
    axes[1, 0].hist(df[df["language"] == lang]["word_count"], bins=12, alpha=0.75,
                    label=lang, color=colour)
axes[1, 0].set_title("(c) Narrative length by language")
axes[1, 0].set_xlabel("words per report")
axes[1, 0].legend()

# (d) Vocabulary overlap: shared vs unique words per category
from sklearn.feature_extraction.text import CountVectorizer
vec = CountVectorizer(lowercase=True)
vocab_by_cat = {}
for cat in CATEGORIES:
    vec.fit(df[df["label"] == cat]["text"])
    vocab_by_cat[cat] = set(vec.vocabulary_)
shared = set.intersection(*vocab_by_cat.values())
axes[1, 1].barh(list(vocab_by_cat), [len(vocab_by_cat[c] - shared) for c in vocab_by_cat],
                color="#0d9488")
axes[1, 1].set_title(f"(d) Category-distinctive words (shared vocabulary = {len(shared)})")
axes[1, 1].set_xlabel("unique terms")

plt.tight_layout()
plt.show()
""")

md("""
### Insights that shaped the modelling decisions

1. **Balanced classes** (60 rows per category) — a property of the *designed* corpus, not of real
   reports. Real corruption reporting will be heavily imbalanced, which is why the pipeline uses
   `class_weight="balanced"` and reports **macro F1** rather than plain accuracy.
2. **Narratives are not independent**: each incident appears as 4 paraphrases. Treating rows as
   independent would let the model memorise an incident in training and be scored on a paraphrase
   of it — textbook leakage. Validation therefore **groups by incident**.
3. **Short narratives** (~20–30 words) — favour sparse TF-IDF over long-context models.
4. **Two languages** with different morphology — Kiswahili is agglutinative, so word tokens
   fragment; character n-grams recover much of that signal.
5. **Distinctive vs shared vocabulary** (panel d) — categories do have discriminative vocabulary,
   but share a large common core (words like *report*, *officer*, *payment*), which is exactly why a
   simple keyword classifier alone cannot separate them.

## 2.4 Preprocessing and feature engineering

Preprocessing is embedded **inside** the model pipeline rather than applied to the whole dataset up
front. This is deliberate: vectorisers are then fitted on training folds only, so no information
from the held-out fold leaks into the features.

| Step | Setting / purpose |
|---|---|
| Case folding + Unicode accent stripping | Normalise surface variation |
| Whitespace collapse | Remove formatting noise |
| **Word TF-IDF, n-grams (1–2), sublinear TF** | Captures phrases like *"bid rigging"*; sublinear TF dampens long repeated narratives |
| **Character TF-IDF, `char_wb`, n-grams (3–5)** | Robust to inflection, compounding, misspelling, Kiswahili morphology |
| `min_df=2` | Drops singleton terms (noise on small corpora) |
| `max_features=50 000` per vectoriser | Bounds dimensionality |
| `class_weight="balanced"` | Prepares for class imbalance in real data |
| **No stop-word removal** | Words like *not*, *without*, *before* carry meaning in allegations ("paid **without** receipt") |
""")

# =====================================================================
md("""
---
# 3. Methodology and Model Selection
*(Rubric: 4 marks model selection & justification · 3 marks technical implementation)*

## 3.1 Model candidates and justification

Two **pre-declared** candidates are compared — not an open-ended hyperparameter search. On a
synthetic corpus an exhaustive search would inflate results without adding evidence about real data.

| Candidate | Why it is included | Known weakness |
|---|---|---|
| **Word TF-IDF (1–2) + Logistic Regression** (`balanced`) | Strong, interpretable text baseline; coefficient signs show which words drive a label | Ignores morphology; brittle to misspelling |
| **Word + char TF-IDF → Linear SVM** (`balanced`) | Character n-grams absorb spelling and Kiswahili agglutination; linear SVM handles very high-dimensional sparse input efficiently | Decision scores are less interpretable than probabilities |
| *(considered, rejected)* fine-tuned transformer (e.g. mBERT) | Potentially strongest on real multilingual text | No real labelled data to fine-tune on; 540 synthetic rows would demonstrate only over-fitting; too heavy for the deployment target |

**Why linear models on TF-IDF are the right choice here:** the input is short, domain-specific
narrative text; the corpus is small; interpretability matters for a governance-sensitive platform;
and the model must be cheap enough to run on submission without noticeable latency.

## 3.2 Validation design — the decisive methodological choice

```
OUTER : 5-fold StratifiedGroupKFold   → estimates end-to-end generalisation
INNER : 3-fold stratified GROUP CV    → selects between the two candidates
METRIC: macro F1                      → every category weighs equally
GROUP : incident group_id             → paraphrases of one incident never straddle a fold
```

Three properties make this defensible:

1. **Grouped folds** — prevents paraphrase leakage (§2.3 insight 2).
2. **Nested selection** — model choice happens *inside* each outer training fold, so the reported
   score includes the cost of choosing a model. Reporting the score of a model chosen on all the
   data would be optimistically biased.
3. **Trivial baseline alongside** — a fold-local majority-class predictor is scored on the same
   folds, so every result is interpreted relative to what a do-nothing strategy achieves.

## 3.3 Hyperparameters (fixed a priori)

| Component | Setting | Rationale |
|---|---|---|
| Word TF-IDF | `ngram_range=(1,2)`, `min_df=2`, `max_features=50000`, `sublinear_tf=True` | Phrases + noise control |
| Char TF-IDF | `analyzer="char_wb"`, `ngram_range=(3,5)`, `min_df=2`, `max_features=50000` | Multilingual morphology |
| Logistic Regression | `class_weight="balanced"`, `max_iter=2000`, `random_state=42` | Imbalance-aware, reproducible |
| Linear SVM | `class_weight="balanced"`, `random_state=42` | High-dimensional sparse strength |
| Outer / inner folds | 5 / 3, shuffled, seeds 42 / 100+fold | Stable, pre-declared |
""")

md("## 3.4 Implementation — model construction")

code("""
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC

MODEL_CANDIDATES = ("word_logistic", "word_char_linear_svc")


def _word_features():
    return TfidfVectorizer(
        analyzer="word", lowercase=True, strip_accents="unicode",
        ngram_range=(1, 2), min_df=2, max_features=50000, sublinear_tf=True,
    )


def _char_features():
    return TfidfVectorizer(
        analyzer="char_wb", lowercase=True, strip_accents="unicode",
        ngram_range=(3, 5), min_df=2, max_features=50000, sublinear_tf=True,
    )


def build_model(name):
    if name == "word_logistic":
        return Pipeline([
            ("features", _word_features()),
            ("classifier", LogisticRegression(class_weight="balanced", max_iter=2000,
                                              random_state=42)),
        ])
    if name == "word_char_linear_svc":
        return Pipeline([
            ("features", FeatureUnion([("word", _word_features()), ("char", _char_features())])),
            ("classifier", LinearSVC(class_weight="balanced", random_state=42)),
        ])
    raise ValueError(f"unknown candidate: {name}")


# Sanity check: both pipelines build and fit on a stratified sample covering all 9 classes.
_sample = df.groupby("label").head(6)   # 54 rows, every category represented
for _name in MODEL_CANDIDATES:
    _model = build_model(_name).fit(_sample["text"], _sample["label"])
    _accuracy = (_model.predict(_sample["text"]) == _sample["label"]).mean()
    print(f"{_name:26s} build+fit OK on {len(_sample)} rows (in-sample accuracy {_accuracy:.2f})")
""")

md("## 3.5 Implementation — nested grouped cross-validation")

code("""
import numpy as np
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, f1_score,
                             precision_recall_fscore_support, confusion_matrix)

TEXTS = df["text"].tolist()
LABELS = df["label"].tolist()
GROUPS = df["group_id"].tolist()


def compute_metrics(y_true, y_pred, labels=CATEGORIES):
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=labels, zero_division=0)
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y_true, y_pred)), 4),
        "macro_f1": round(float(f1_score(y_true, y_pred, labels=labels, average="macro",
                                         zero_division=0)), 4),
        "per_category": {
            c: {"precision": round(float(p[i]), 4), "recall": round(float(r[i]), 4),
                "f1": round(float(f[i]), 4), "support": int(s[i])}
            for i, c in enumerate(labels)
        },
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
    }


def cross_validate_candidate(train_idx, name, n_splits, seed):
    \"\"\"Grouped CV inside an outer training fold; returns out-of-fold predictions + macro F1.\"\"\"
    t = [TEXTS[i] for i in train_idx]
    y = [LABELS[i] for i in train_idx]
    g = [GROUPS[i] for i in train_idx]
    splitter = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)
    preds = [None] * len(train_idx)
    for tr, te in splitter.split(t, y, g):
        assert not (set(g[i] for i in tr) & set(g[i] for i in te)), "group leakage"
        model = build_model(name).fit([t[i] for i in tr], [y[i] for i in tr])
        for i, pred in zip(te, model.predict([t[i] for i in te])):
            preds[i] = str(pred)
    return preds, compute_metrics(y, preds)["macro_f1"]


def select_model(train_idx, n_splits=3, seed=42):
    scores = {name: cross_validate_candidate(train_idx, name, n_splits, seed)[1]
              for name in MODEL_CANDIDATES}
    return max(scores, key=scores.get), scores


print("Helpers ready.")
""")

code("""
outer_splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
oof_preds = [None] * len(df)
baseline_preds = [None] * len(df)
fold_records = []

for fold, (tr, te) in enumerate(outer_splitter.split(TEXTS, LABELS, GROUPS), start=1):
    # Leakage guard: no incident on both sides of the split.
    assert not (set(GROUPS[i] for i in tr) & set(GROUPS[i] for i in te)), "group leakage"

    chosen, inner_scores = select_model(tr, n_splits=3, seed=100 + fold)

    model = build_model(chosen).fit([TEXTS[i] for i in tr], [LABELS[i] for i in tr])
    fold_pred = model.predict([TEXTS[i] for i in te])
    for i, pred in zip(te, fold_pred):
        oof_preds[i] = str(pred)

    majority = Counter(LABELS[i] for i in tr).most_common(1)[0][0]
    for i in te:
        baseline_preds[i] = majority

    fold_records.append({
        "fold": fold,
        "selected": chosen,
        "test_rows": len(te),
        "test_incidents": len({GROUPS[i] for i in te}),
        "macro_f1": round(float(f1_score([LABELS[i] for i in te], fold_pred,
                                         labels=CATEGORIES, average="macro",
                                         zero_division=0)), 4),
        **{f"inner_{k}": v for k, v in inner_scores.items()},
    })

folds_df = pd.DataFrame(fold_records)
assert all(p is not None for p in oof_preds), "every row needs an out-of-fold prediction"
print(folds_df.to_string(index=False))
""")

# =====================================================================
md("""
---
# 4. Model Evaluation
*(Rubric: 4 marks metrics & interpretation · 2 marks comparative analysis · 2 marks visualisation)*

## 4.1 Metrics and why each is used

| Metric | What it means | Why it is here |
|---|---|---|
| **Accuracy** | % of reports assigned the correct category | Intuitive headline number |
| **Balanced accuracy** | Mean recall across categories | Insensitive to class sizes |
| **Macro F1** | Mean of per-category F1 scores | **Primary metric** — a rare category counts as much as a common one |
| **Per-category precision / recall / F1** | Which categories are reliable, which are confused | Operational: a missed *Extortion* case matters more than a missed *Other* |
| **Confusion matrix** | Where mistakes go | Reveals semantic boundaries the model confuses |
""")

md("## 4.2 Headline results vs. trivial baseline")

code("""
headline = pd.DataFrame([
    {"model": "Fold-local majority baseline",
     "accuracy": compute_metrics(LABELS, baseline_preds)["accuracy"],
     "balanced_accuracy": compute_metrics(LABELS, baseline_preds)["balanced_accuracy"],
     "macro_f1": compute_metrics(LABELS, baseline_preds)["macro_f1"]},
    {"model": "Nested grouped CV (selected model)",
     **{k: v for k, v in compute_metrics(LABELS, oof_preds).items()
        if k in ("accuracy", "balanced_accuracy", "macro_f1")}},
])

print(headline.to_string(index=False))
print()
print(f"Out-of-fold macro F1 across outer folds: "
      f"mean {folds_df.macro_f1.mean():.4f}  (spread {folds_df.macro_f1.std(ddof=0):.4f})")
print(f"Models chosen per fold: {folds_df.selected.value_counts().to_dict()}")
""")

md("""
## 4.3 Comparative analysis

Three comparisons are reported, which is what "benchmarking against baseline models or other
approaches" requires:

1. **Model vs trivial baseline** (table above). The majority classifier scores ≈1/9 ≈ 0.11 by
   chance on a balanced 9-class problem; the trained model must clear that by a wide margin to be
   worth deploying.
2. **Candidate vs candidate** — the per-fold inner scores (`inner_word_logistic` vs
   `inner_word_char_linear_svc`) show *which* model won during selection and by how much,
   rather than hiding the comparison inside a single final number.
3. **Category vs category** — per-category F1 (§4.5) shows whether errors concentrate in one
   semantic boundary (e.g. *Bribery* vs *Extortion*), which is the most actionable comparison for
   the review team.
""")

md("## 4.4 Visual representation")

code("""
fig, axes = plt.subplots(1, 2, figsize=(15, 6))

headline.set_index("model")[["accuracy", "balanced_accuracy", "macro_f1"]].plot.bar(
    ax=axes[0], color=["#94a3b8", "#0d9488", "#0f766e"], rot=10)
axes[0].set_ylim(0, 1.05)
axes[0].set_ylabel("score")
axes[0].set_title("(a) Trained model vs trivial baseline")
axes[0].legend(loc="lower right")

cm = compute_metrics(LABELS, oof_preds)["confusion_matrix"]
im = axes[1].imshow(cm, cmap="Blues")
axes[1].set_xticks(range(len(CATEGORIES)))
axes[1].set_yticks(range(len(CATEGORIES)))
axes[1].set_xticklabels([c[:12] for c in CATEGORIES], rotation=60, ha="right", fontsize=8)
axes[1].set_yticklabels([c[:16] for c in CATEGORIES], fontsize=8)
axes[1].set_xlabel("Predicted")
axes[1].set_ylabel("Actual")
axes[1].set_title("(b) Confusion matrix (out-of-fold)")
vmax = max(max(row) for row in cm)
for i in range(len(CATEGORIES)):
    for j in range(len(CATEGORIES)):
        if cm[i][j]:
            axes[1].text(j, i, cm[i][j], ha="center", va="center", fontsize=7,
                         color="white" if cm[i][j] > vmax / 2 else "black")
fig.colorbar(im, ax=axes[1], fraction=0.046)
plt.tight_layout()
plt.show()
""")

md("""
## 4.5 Per-category performance and its operational meaning
""")

code("""
per_cat = pd.DataFrame(compute_metrics(LABELS, oof_preds)["per_category"]).T
per_cat.columns = ["precision", "recall", "F1", "support"]
per_cat = per_cat.sort_values("F1")
print(per_cat.to_string())

per_cat["F1"].plot(kind="barh", figsize=(9, 4.2), color="#0d9488",
                   title="Per-category F1 (out-of-fold predictions)")
plt.xlabel("F1")
plt.xlim(0, 1.0)
plt.tight_layout()
plt.show()
""")

md("""
**Operational reading:** in the live platform a low per-category F1 is not a failure — it is a
reason to set a **confidence floor**. Below the floor the suggestion is shown as "unclassified —
human decides", and the double-blind review decides the label. The model never auto-labels a report.
""")

md("""
## 4.6 Language subgroup analysis (an exploratory fairness check)

Kenya Watch is multilingual by design, so metrics are computed per language. This is an
**exploratory** look, not a fairness guarantee — and the Kiswahili in this corpus is draft text that
has not been reviewed by a native speaker, so a gap here is a signal to obtain proper review, not a
conclusion.
""")

code("""
subgroup_rows = []
for language in sorted(df["language"].unique()):
    idx = df.index[df["language"] == language].tolist()
    present = tuple(c for c in CATEGORIES if c in {LABELS[i] for i in idx})
    m = compute_metrics([LABELS[i] for i in idx], [oof_preds[i] for i in idx], present)
    subgroup_rows.append({"language": language, "rows": len(idx),
                          "accuracy": m["accuracy"], "macro_f1": m["macro_f1"]})
print(pd.DataFrame(subgroup_rows).to_string(index=False))
""")

md("""
## 4.7 What these numbers do **not** prove

Stated plainly, because this matters more than any score:

1. **The data is synthetic.** It was written to be learnable: templatic phrasing and balanced classes
   inflate scores. These numbers say nothing about real Kenyan corruption reports.
2. **No temporal holdout.** Real deployment needs a later-in-time, incident-separated test set to
   detect drift as language and reporting patterns change.
3. **No native-speaker validation** of Kiswahili, and no code-switching (English/Swahili mixed within
   one narrative), which is very common in real reports.
4. **No probability calibration.** If a confidence threshold is used operationally, calibration must
   be measured separately.
5. **Fairness is unexplored** beyond a language split; proper evaluation needs stakeholder-defined
   acceptable error rates per category.

> **The defensible claim concerns the pipeline, not the score:** "I built and validated a
> leakage-resistant, nested, multilingual text-classification pipeline, and I can explain precisely
> why its current numbers cannot be presented as real-world accuracy."
""")

# =====================================================================
md("""
---
# 5. Deployment
*(Rubric: 2 marks deployment strategy · 6 marks demonstration)*

## 5.1 Where this sits in the live system

```
Citizen submits ──► POST /api/reports ──► report saved ──► response returned immediately
                                                │
                                                └─► setImmediate(...)   [asynchronous — never blocks]
                                                        │
                                              classifyInBackground()
                                                        │
                             ┌──────────────────────────┴─────────────────────────┐
                             │                                                    │
              backend/utils/classifier.js  (LIVE TODAY)          ml/artifacts/category_model.joblib
              weighted keyword triage → category + urgency        (OFFLINE — not wired in)
```

**The live app deliberately uses the transparent keyword classifier, not this notebook's model.**
Three reasons:

1. **No approved real training data yet.** Wiring a synthetic-trained model into a live reporting
   platform would be indefensible.
2. **Auditability.** A reviewer can see exactly which words triggered a triage suggestion. An opaque
   suggestion on someone's corruption report is a governance problem.
3. **Robustness.** The keyword layer cannot fail in a way that blocks submission (decision #28).

## 5.2 Rollout plan (governance-gated)

| Step | Requirement | Status |
|---|---|---|
| 1 | Collect adjudicated labels via double-blind review (`categoryReview`) | **Live workflow exists** |
| 2 | Export approved dataset (`ml/scripts/export-reviewed-dataset.js`, allowlist + approval) | **Implemented** |
| 3 | De-identify and verify narratives manually | Documented process |
| 4 | Re-run this pipeline on real data | **This notebook / `ml/src/train.py`** |
| 5 | Freeze a later-time, incident-separated holdout | Future |
| 6 | **Shadow mode** — model predicts silently, compared with human decisions | Future |
| 7 | **Assist-only** deployment with a confidence floor | Future |

## 5.3 Serving options when approved

The artifact is a `joblib`-serialised scikit-learn `Pipeline`, so integration is straightforward and
already isolated behind one function (`classifyInBackground` in `backend/routes/report.routes.js`):

- **(a) Python sidecar** — a small FastAPI/Flask service exposing `POST /classify`, called by Express.
- **(b) Export to ONNX** — run natively from Node without a Python runtime.
- **(c) Batch pre-computation** — classify on a queue worker; no request-path dependency at all.

Option (c) is the lowest-risk first step because it keeps the public submission path completely
independent of the model.

## 5.4 Demonstration (in-notebook)

Below: fit the final model on all data, then classify **unseen** sentences — including one Kiswahili
example and one deliberately ambiguous report — to show what the reviewer-facing suggestion looks
like, and to show that the model's margin is low when the text is ambiguous.
""")

code("""
final_model_name, final_scores = select_model(list(range(len(df))), n_splits=5, seed=42)
final_model = build_model(final_model_name).fit(TEXTS, LABELS)

print(f"Selected candidate : {final_model_name}")
print(f"Inner macro F1     : { {k: round(v, 4) for k, v in final_scores.items()} }")
print()

demonstration_samples = [
    # Clear example: an unofficial payment for a permit
    "An officer at the county offices told me to pay 10,000 shillings in cash before he would "
    "sign my business permit.",
    # Clear example: funds unaccounted for
    "The money collected from market stalls every week does not appear in the ward development "
    "account and nobody can explain where it went.",
    # Clear example: tender manipulation
    "The same company won three tenders in one month and all of them were evaluated by the same "
    "committee member.",
    # Kiswahili
    "Afisa aliniomba kitu kidogo kabla ya kunipatia kibali cha biashara yangu.",
    # Ambiguous / insufficient information
    "I have concerns about how things are handled at the office but I do not have details.",
]

def suggest(text, model, top_k=2):
    \"\"\"Ranked (category, score) suggestions - how a reviewer would see it.\"\"\"
    if hasattr(model, "decision_function"):
        scores = model.decision_function([text])[0]
        order = scores.argsort()[::-1][:top_k]
        return [(model.classes_[i], float(scores[i])) for i in order]
    return [(model.predict([text])[0], float("nan"))]


print(f"{'SUGGESTION':34s} {'RUNNER-UP':28s} SAMPLE")
print("-" * 118)
for sample in demonstration_samples:
    ranked = suggest(sample, final_model)
    first = f"{ranked[0][0]} ({ranked[0][1]:+.2f})"
    second = f"{ranked[1][0]} ({ranked[1][1]:+.2f})" if len(ranked) > 1 else ""
    print(f"{first:34s} {second:28s} {sample[:58]}")

print()
print("Interpretation")
print("-------------")
print("The suggestion list is advisory. Because the model is a LinearSVC, raw scores are")
print("ranked margins, not probabilities - so the app would show the top suggestion")
print("together with a calibrated confidence once calibration has been measured on real data.")
print("Where the top two scores are close, the case is genuinely ambiguous and the")
print("reviewer's independent judgment decides.")
""")

md("""
### How the same triage concept appears in the running application

Walk through these three touchpoints during the live demo:

1. **Reviewer Queue** — each case displays an urgency badge (`Low/Medium/High/Critical`) and the
   suggested category, visible to reviewers only. The queue is sorted urgency-first, then by
   classification age.
2. **Admin overview → Escalations** — flags `High`/`Critical` cases still unclaimed past the
   threshold, timed from *classification completion*, not from submission.
3. **Public statistics** — a category × urgency heatmap (aggregate only) so the public can see where
   triage pressure is concentrated, without exposing any individual case.

### Persisting the artifact
""")

code("""
import joblib

# In Colab this writes to /content/artifacts; in the repository it mirrors ml/artifacts/.
artifact_dir = Path("artifacts")
artifact_dir.mkdir(parents=True, exist_ok=True)
joblib.dump(final_model, artifact_dir / "category_model.joblib")
(artifact_dir / "model_metadata.json").write_text(json.dumps({
    "model": final_model_name,
    "categories": list(CATEGORIES),
    "training_rows": len(df),
    "training_group_count": len(set(GROUPS)),
    "data_status": "synthetic_only_not_for_real_world_validation_or_production_training",
    "real_world_performance_claim": False,
    "note": "Synthetic-only pipeline demonstration; not valid for real-world validation or production.",
}, indent=2), encoding="utf-8")

print("Artifact written to:", artifact_dir.resolve())
print("Files:", sorted(p.name for p in artifact_dir.glob("*.joblib")))
print("NOTE: this artifact is NOT connected to the live application.")
""")

md("""
---
# Summary

| Rubric area | Delivered in this notebook |
|---|---|
| **Introduction & problem** (5) | Corruption reporting fails on fear, feedback and triage; ML assists triage only, and never sees reporter identity |
| **Dataset & preprocessing** (9) | 540-row, 9-category, incident-grouped synthetic corpus; audit gates; 4-panel EDA with five insights; learned in-pipeline TF-IDF features |
| **Methodology** (7) | Two pre-declared candidates with justification; nested 5×3 StratifiedGroupKFold; fixed hyperparameters with rationale; leakage assertions |
| **Evaluation** (8) | Accuracy, balanced accuracy, macro F1, per-category P/R/F1, confusion matrix, majority baseline comparison, candidate comparison, language subgroups, explicit limitations |
| **Deployment** (8) | Three-way integration strategy with an isolated hook point, governance-gated rollout plan, in-notebook demonstration of unseen predictions |

### Final honest statement

> The contribution here is a **rigorous, leakage-resistant, multilingual text-classification
> pipeline** with a documented evaluation and deployment plan, together with a live platform in
> which the ML layer is deliberately constrained to be assistive and auditable. The synthetic
> scores are a *pipeline sanity check* — not a claim about real-world accuracy.
""")

notebook = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {
        "colab": {"provenance": [], "toc_visible": True, "name": "Kenya_Watch_ML_Colab.ipynb"},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
        "language_info": {"name": "python"},
    },
    "cells": [{**c, "source": c["source"].splitlines(keepends=True)} for c in cells],
}

OUT.write_text(json.dumps(notebook, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"Wrote {OUT} ({len(cells)} cells, {OUT.stat().st_size // 1024} KB)")
