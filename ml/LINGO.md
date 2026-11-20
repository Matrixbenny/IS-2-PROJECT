# Learning Kenyan language: what was built, what was refused, and why

Kenyan reports mix English, Kiswahili, Sheng and local dialects in one sentence ("walinidai hongo kwa ofisi ya lands"). A classifier trained on tidy English and Kiswahili fails on that. This document records how the project approaches the problem, with real measurements and clear limits.

## Plan in one line

**Grow the vocabulary from sources we are allowed to use, keep a human deciding what each word means, and measure honestly.** No model can "learn Kenyan lingo fully": Sheng changes by the month and differs by estate, county and age group. What can be built is a system that keeps learning with people in charge.

## What was refused, and what replaces it

| Suggested source | Decision | Reason |
|---|---|---|
| Twitter/X, Facebook, TikTok, WhatsApp and other social platforms | **Not scraped** | Breaches the platforms' terms and collects people's personal data without consent, which the Kenya Data Protection Act, 2019 restricts. Official, consented research access is the only route. |
| Kenyan films, TV, radio, music, books | **Not copied** | Copyrighted. Open-licence works or written permission from the rights-holder only. |
| Kenya Law judgments | **Not used** | Its terms forbid scraping and ML training without NCLR's written licence (see [DATA_SOURCES.md](DATA_SOURCES.md)). |
| AfriSenti Swahili tweets, CC-100 Swahili | **Not used** | Their metadata declares no licence / "unknown". |

Replacements that are legal and already working:

1. **Licence-verified open corpora** ([`lingo/sources.json`](lingo/sources.json), [`lingo/fetch_corpora.py`](lingo/fetch_corpora.py)). The fetcher asks the dataset's own metadata for its licence and refuses anything unlicensed or off the allowlist; every download is logged with source, licence, date, row count and SHA-256. Currently approved: MasakhaNEWS Swahili and English (AFL-3.0) and Swahili Wikipedia (CC BY-SA 3.0, chosen from its dual licence).
2. **Mined vocabulary for human review** ([`lingo/mine_lexicon.py`](lingo/mine_lexicon.py)). Finds words that keep company with corruption terms in the corpus (log-likelihood score) and are not yet in the glossary, then writes a review CSV. Nothing is added automatically.
3. **Reviewers teach the system from real use.** Reviewers suggest Sheng, Kiswahili or dialect terms in the Reviewer Queue; an Admin approves, edits or rejects each one; approved terms reach the normaliser immediately (triage, related-case matching and model input). Suggestions accept plain words only: no digits, links or names.
4. **Dictionaries used with written permission** ([`lingo/permissions.json`](lingo/permissions.json), [`lingo/ingest_dictionary.py`](lingo/ingest_dictionary.py)). Sheng, Kenyan-language and Digo dictionaries are copyrighted, so each is used only when its rights-holder's permission is recorded (date, scope, reference); an unregistered source is refused. The Digo-English-Swahili dictionary (BTL East Africa) yields a review CSV of crime and officialdom words for a Digo speaker to check; nothing reaches the glossary without Admin approval, and the extracted text is never committed or redistributed.
5. **Measured robustness** ([`lingo/evaluate_lingo.py`](lingo/evaluate_lingo.py)).
6. **Mined candidates from text the project may lawfully use** ([`lingo/mine_slang_candidates.py`](lingo/mine_slang_candidates.py)). Reads the synthetic seed and any licensed corpus, and writes two review files under `ml/data/processed/`: `lingo_slang_candidates.csv` (terms that keep company with a corruption canon, with the canon the sentence already produced) and `lingo_gap_candidates.csv` (sentences that name a corruption concept but contain words the glossary does not know). Nothing is added automatically; a Kenyan reviewer decides each row.

## Why more sources were refused (checked 2026-11-20)

Two further sources were offered for the language work and are recorded in [`lingo/sources.json`](lingo/sources.json) as refused, with the reason:

| Source | Decision | Reason |
|---|---|---|
| [shengdictionary.co.ke](https://shengdictionary.co.ke/) | **Not scraped** | User-submitted slang entries, marked "© 2026 Sheng Dictionary" with no reuse licence, and empty at the time of checking. Scraping breaches its terms and takes third parties' contributions without consent. |
| Githiora, *Sheng: Rise of a Kenyan Swahili Vernacular* (James Currey, 2018) | **Not used** | Copyrighted academic monograph ("All rights reserved. No part of this book may be reproduced in any form"). It is a linguistics study rather than a word list, and the supplied PDF has no usable text layer (about 237 extractable characters across 238 pages). |

These refusals do not block progress, because the measured limit is not corpus size. A Sheng report is mis-classified when a term is missing from the glossary or is mapped to a canon that carries no weight in `backend/utils/classifier.js`, and no amount of extra prose fixes that. Mining the project's own 1,440 documents (about 533,000 tokens) returns almost entirely English vocabulary, because the synthetic seed contains no real Sheng. Sheng coverage must come from **reviewers entering terms they actually see**, which the workflow already supports.

### The two gaps found in the Sheng probe

A test with plain Sheng reports showed two concrete failures, both about canon, not vocabulary:

- **Extortion scored as bribery.** `nikikataa` maps to `refused extort`, but the threat words in the same sentence (*kunichoma kisu*, *kutishia*) are not mapped, so the bribery canon dominates. The reviewer fix is to map the threat phrase, not the refusal.
- **Embezzlement scored as Other.** Sheng money terms (*mullah*, *doo*, *manze*, *mchanga*) are absent from the *corruption* sense in the glossary, so the sentence loses its only signal.

`mine_slang_candidates.py` writes exactly these rows (the unknown term plus the canon the sentence already carried) to `ml/data/processed/lingo_gap_candidates.csv` for a reviewer to confirm.

## Measured result (synthetic, 5 incident-grouped folds)

Macro-F1 of the category classifier. "Unseen" slang appears only in the test text; the glossary and augmentation never saw it.

| Pipeline | original | mixed, known slang | mixed, unseen slang | slang-only, known | slang-only, unseen |
|---|---|---|---|---|---|
| A. raw text | 0.834 | 0.650 | 0.598 | 0.174 | 0.219 |
| B. + glossary normaliser | 0.837 | 0.679 | 0.609 | 0.262 | 0.222 |
| C. + code-switch augmentation | 0.818 | 0.983 | 0.737 | 0.953 | 0.355 |

What this shows:

- Without help, accuracy **collapses on slang-heavy text** (about 0.2 on slang-only). The gap is real.
- Augmentation helps most, and generalises **partly** to slang it never saw (0.22 to 0.36), because character n-grams survive spelling variation. That is still weak.
- Pipeline C's "known" columns are inflated because augmentation and test share sentence templates. Read the **unseen** columns as the honest signal.
- Only about 30 of the glossary's 153 terms are single words that map cleanly to a crime type. **Vocabulary coverage, not the algorithm, is the main limit**, which is why the suggestion workflow matters.
- All variants are machine-generated from synthetic data. This says nothing about real-world accuracy, fairness or readiness for casework.

Reproduce:

```powershell
.\.venv\Scripts\python.exe -m ml.lingo.fetch_corpora --max-rows 300
.\.venv\Scripts\python.exe -m ml.lingo.mine_lexicon
.\.venv\Scripts\python.exe -m ml.lingo.mine_slang_candidates
.\.venv\Scripts\python.exe -m ml.lingo.evaluate_lingo
.\.venv\Scripts\python.exe -m ml.src.keyword_baseline
.\.venv\Scripts\python.exe -m unittest discover -s ml\tests
```

## Roadmap (not yet done, and why)

1. **Fine-tune an African-language encoder** (for example AfroXLMR or AfriBERTa) on the labelled, adjudicated reports once enough exist, with continued pre-training on the licensed Kiswahili corpus. Needs a GPU and real labels; neither is available here, so no transformer has been trained or claimed.
2. **Real code-switched data** from consented sources: reviewers' approved glossary, and, if a data-sharing agreement is ever signed, de-identified report text. Official X/Meta research programmes are the only acceptable route to social data.
3. **Larger licensed samples**: raise `--max-rows`, add further open-licence Kenyan corpora after checking each licence with the same gate.
4. **Language identification** (English / Kiswahili / mixed) as a reviewer hint and an evaluation slice.
5. **Native-speaker evaluation**: have Sheng and dialect speakers write fresh test sentences. A benchmark built by the glossary's own author cannot catch its own blind spots.
