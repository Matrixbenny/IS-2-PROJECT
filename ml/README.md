# Kenya Watch ML workspace

This folder contains dataset checks and experimental category-model training. The live service continues to use `backend/utils/classifier.js` for category and urgency triage. A separately generated runtime artifact can provide reviewers an experimental category suggestion only after they submit their own independent category assessment. The trained model never sets report category or urgency and is not approved for real-world casework.

The reviewer queue now has a separate, unsupervised TF-IDF/cosine-similarity feature in `backend/utils/relatedCaseMatcher.js`. It ranks possible textually similar reports within the same county after a reviewer submits an independent category assessment. It does not use a trained model or category labels, and its score is not a probability or a duplicate finding. Reviewers must decide whether to link cases. This bounded lexical baseline is suitable only as a review aid; language and phrasing limits and the 500-candidate scan are documented in the root README.

Kenyan-language work (code-switching, Sheng, vocabulary growth, and what data may and may not be used) is in [LINGO.md](LINGO.md).

See [DATA_SOURCES.md](DATA_SOURCES.md) for dataset provenance and collection guidance, and [LABELING_GUIDE.md](LABELING_GUIDE.md) for the pilot annotation rules.

## Dataset provenance and status

There is currently **no approved training dataset in this repository**. No external dataset was downloaded or used. The earlier database review counted a small number of local MongoDB reports in aggregate; those were not exported, their narratives were not used for training, and the reporter-selected category is not a ground-truth label.

The intended source is reports with a final `categoryReview.adjudicatedCategory` produced by the blinded staff review workflow. Agreement between two reviewers or an Admin-documented adjudication is required. The application does not yet provide a dataset-export endpoint, so do not assume that the MongoDB files under `backend/data/` are a training corpus.

## Private dataset layout

Keep all report data out of source control:

- `data/raw/`: source material under an approved data-handling plan; do not put raw exports here unless strictly necessary.
- `data/approved/`: reviewed, minimized CSV prepared for an approved experiment.
- `data/processed/`: temporary cleaned or split files, if needed.
- `artifacts/`: local model and evaluation outputs.

These paths are ignored by Git. Before creating a training CSV, obtain approval for the intended use, minimize the text, remove direct identifiers and unnecessary sensitive details, and use a pseudonymous `group_id` to keep reports about the same underlying incident in one validation fold. Do not commit narratives, identifiers, evidence, credentials, model artifacts, or evaluation outputs.

The input CSV must have UTF-8 headers `text,label,group_id`. Optional columns `language` and `county` are used only for aggregate evaluation, not as model features. `label` must be one of the canonical categories in `backend/utils/categories.js` and must be independently reviewed; do not use reporter-selected categories as labels. `group_id` is a stable pseudonym for the incident, not the reporter or an individual.

## Building the local candidate dataset

The exporter reads only report IDs listed in an explicit local allowlist and only accepts active reports with a finalized reviewed category. Two matching reviewer categories or a category chosen in documented Admin adjudication are eligible. Insufficient-information decisions, disagreements, unreviewed reports, and reporter-selected labels are rejected. Linked reports are assigned the same keyed pseudonymous incident group.

Before using the exporter, have the supervisor/institutional data-protection contact approve the intended research use and confirm each allowlisted report is eligible. The exporter cannot determine legal authority or reporter consent; the manifest is an operational allowlist, not a substitute for approvals.

1. Create `ml/data/approved/report_ids.txt` locally, one Mongo report ObjectId per line. Use only reports cleared under the agreed research/data-handling process. Lines beginning with `#` are ignored. This file and its parent folder are Git-ignored.
2. Set `ML_GROUP_HASH_KEY` in the local ignored `backend/.env` to a securely generated random secret of at least 32 characters. Do not reuse a password or commit/share the secret; keep it stable for repeatable group IDs.
3. Run a summary-only dry run; this checks that all selected reports are active and have finalized reviewed category labels without writing narrative text:

   ```powershell
   node ml\scripts\export-reviewed-dataset.js --approval-file ml\data\approved\report_ids.txt
   ```

4. Only after checking the aggregate summary and approval, explicitly write the sensitive staging export:

   ```powershell
   node ml\scripts\export-reviewed-dataset.js --approval-file ml\data\approved\report_ids.txt --write-raw --confirm-sensitive-export
   ```

The exporter writes title plus narrative into `ml/data/raw/` only. Treat this output as sensitive personal data: keep it local and access-restricted, review and manually de-identify each narrative, remove direct identifiers and unnecessary identifying details, and prepare a minimized CSV in `ml/data/approved/`. The exporter does not automatically anonymize text, and pseudonymous group IDs do not make narratives anonymous. Do not point the training command at the raw staging file.

Missing text or labels are not imputed. Empty/invalid labels, exact duplicate text, missing incident groups, or insufficient class/group counts block training. Review likely near-duplicates manually during dataset preparation; the audit does not automatically delete unusual or rare examples.

## Setup and commands

Use the repository's `.venv` (Python 3.10 or newer):

```powershell
.\.venv\Scripts\python.exe -m pip install -r ml\requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s ml\tests -v
.\.venv\Scripts\python.exe -m ml.src.generate_synthetic_dataset
.\.venv\Scripts\python.exe -m ml.src.audit_dataset ml\data\synthetic\kenya_watch_synthetic_seed.csv
.\.venv\Scripts\python.exe -m ml.src.train ml\data\synthetic\kenya_watch_synthetic_seed.csv
.\.venv\Scripts\python.exe -m ml.src.audit_dataset ml\data\approved\reports.csv
.\.venv\Scripts\python.exe -m ml.src.train ml\data\approved\reports.csv
node --test backend\tests\mlDatasetExport.test.js
node --test backend\tests\experimentalCategoryModel.test.js
```

## Synthetic pipeline demonstration

`data/synthetic/kenya_watch_synthetic_seed.csv` is a deterministic, hand-authored corpus of 540 fictional examples: 15 scenario groups for each of the nine categories, with two English and two draft Kiswahili variants per group. Its adjacent metadata file records its provenance and limitations. Run the generator command above to recreate both files. These examples are not observations of Kenyan reports, and the Kiswahili has not been reviewed by a native speaker.

The isolated benchmark was run with five-fold stratified group outer validation and three-fold grouped inner model selection; variants of each fictional incident remain together. It selected a word/character TF-IDF linear SVM and produced 0.8796 out-of-fold accuracy and 0.8784 macro F1 on this synthetic corpus. The English-only macro F1 was 0.9018 and draft-Kiswahili macro F1 was 0.8558. These scores only demonstrate how this pipeline behaves on its own designed examples. Templatic phrasing, simplified scenarios, and balanced classes can inflate scores; none of these numbers estimate accuracy on real Kenyan reports or establish fitness for use. The live reviewer queue can show the trained model's category as an explicitly experimental suggestion after the reviewer has committed their own category assessment. It does not show a probability or score, overwrite any label, change urgency, or trigger workflow actions. Runtime and metadata artifacts are written locally under ignored `ml/artifacts/`; the app reports an error if its runtime artifact is missing or invalid.

The synthetic-trained suggestion is connected to the local live application for demonstration only. It is not ready for deployment or real reports: synthetic results cannot establish operational usefulness, fairness, or safety. Before using a trained classifier in real casework, replace this demonstration with independently reviewed, lawfully approved and de-identified reports, and evaluate against a separately frozen incident-separated test set. Reviewers should validate every label, including ambiguous category boundaries; Kiswahili and other language coverage needs competent human review. Also require pre-agreed per-category acceptance criteria, subgroup error review, model/version provenance, a rollback path, and ongoing monitoring. Never treat an advisory output as a finding or automated decision.

Each training run writes `category_model.runtime.json` alongside the Python model, evaluation, and metadata. The Express service reads that local file (or the path set with `ML_CATEGORY_MODEL_PATH`) when a reviewer requests a suggestion. The artifact is ignored by Git and must be generated and transferred through the deployment process; do not commit it. Restart the backend after replacing the file so its cached model is refreshed.

The audit prints aggregate diagnostics only; it never prints report text. Training currently has a **minimum mechanical gate** of 50 examples and ten distinct incident groups per category. This gate is intended only to permit nested grouped validation to run; it is not a claim that this amount is statistically adequate. The pipeline compares two pre-declared sparse-text baselines—word n-gram TF-IDF with balanced logistic regression, and combined word/character n-gram TF-IDF with balanced linear SVM. The choice is made by macro F1 inside grouped inner folds; outer grouped folds estimate the complete selection process. Results include a fold-local majority-class baseline, per-class precision/recall/F1, balanced accuracy, a confusion matrix, and descriptive outer-fold macro-F1 spread (not a confidence interval). Language/county subgroup results are shown only when the sample is sufficiently large; these exploratory metrics are not proof of fairness. The final artifact is refit on the approved data after model selection and written under ignored `ml/artifacts/`.

The model comparisons are a small, pre-declared benchmark, not a broad hyperparameter search. Do not use the final full-data selection score as a performance claim. Before any model is considered successful, freeze a later-time, incident-separated holdout, define acceptable class-specific error rates with reviewers and affected stakeholders, gather enough independent incidents to estimate them with useful uncertainty, and assess reviewer usefulness. Do not connect an artifact to the live app or make consequential decisions from it. Review data quality, subgroup sample sizes, leakage, errors, and limitations with the project team before changing the workflow.

## Is the model over- or underfitting, and may we call it accurate?

Two commands answer those questions with numbers instead of opinions:

```powershell
.\.venv\Scripts\python.exe -m ml.src.diagnose_fit ml\data\synthetic\kenya_watch_synthetic_seed.csv
.\.venv\Scripts\python.exe -m ml.src.readiness
```

`diagnose_fit` compares training and validation scores with incident groups kept apart, draws a learning curve, runs a shuffled-label control (must fall to chance) and sweeps the regularisation strength. Result on the synthetic seed: training macro-F1 1.00 against validation 0.875, a gap of 0.12. That is **mild overfitting caused by too little data**: only 135 independent scenarios stand behind 540 rows, the learning curve is still rising at full size, and a stronger penalty does not close the gap. The shuffled-label control scores 0.09 (chance 0.11), so there is no leakage. More independent incidents are the cure; tuning is not.

`readiness` is the gate for the word "accurate". It passes only for data marked `adjudicated_real_reports` (the metadata JSON must also carry an `approval_reference`) with at least 450 reports, 30 per category, a held-out score whose lower bound is at least 0.70, no category with recall below 0.50, English and Kiswahili within 0.10 of each other, and a clean fit diagnosis. On synthetic data it fails by design, so the model stays labelled an experimental reviewer aid. To pass it: collect adjudicated reports through the blinded review workflow, export them with `ml/scripts/export-reviewed-dataset.js`, then train, diagnose and run the gate again.
