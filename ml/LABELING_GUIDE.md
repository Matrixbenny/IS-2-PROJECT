# Reviewer category-labeling guide (pilot draft)

Use this guide to record the **type of alleged conduct described**, not whether it happened, whether the reporter is credible, or whether anyone is guilty. A label is a research annotation, not an investigative or legal finding.

## Before assigning a category

1. Read the report narrative without using the reporter's selected category or the existing keyword-classifier suggestion. The application hides those fields until you submit your independent assessment.
2. Choose the category that best describes the alleged mechanism, not the person's job title, location, political affiliation, or the apparent seriousness of the allegation.
3. If the account is too brief, unclear, contradictory, or does not describe conduct that can be mapped reliably, select **Insufficient information to classify**. Do not guess and do not use `Other` as a substitute for uncertainty.
4. Use `Other` only when the described alleged conduct is sufficiently clear but does not fit any listed category.
5. Add a concise rationale if useful. For an insufficient-information decision, briefly state what is missing or unclear. Never repeat names, contact details, tracking references, or other identifying facts in the rationale.
6. Do not infer facts that are absent. A report may be incomplete and still be useful for investigation; this label only says whether its text supports a stable category for this particular research task.

## Category guide

| Category | Use when the narrative alleges | Distinguish from |
| --- | --- | --- |
| **Bribery** | An offer, request, promise, or receipt of an improper benefit connected to an action or omission | **Extortion** focuses on a coerced demand or threat; a bribe may be offered or requested without a stated threat. |
| **Embezzlement** | Entrusted public money or property was allegedly misappropriated, diverted, or used without authorization | **Fraud/Forgery of Documents** is the alleged deception or document falsification mechanism; select the primary conduct described, not every possible offence. |
| **Procurement Fraud** | A procurement or tender process was allegedly manipulated, rigged, or made unfair for a supplier or participant | A general payment allegation without a procurement link may fit **Bribery** instead. |
| **Abuse of Office** | Official authority or position was allegedly used improperly to obtain a benefit or cause an improper outcome | If the narrative specifically describes an undisclosed personal interest affecting an official decision, consider **Conflict of Interest**. |
| **Nepotism/Favoritism** | A person allegedly received an appointment, contract, or benefit because of a personal relationship or preferential treatment rather than fair criteria | A clear tender manipulation may be **Procurement Fraud**; an undisclosed financial stake may be **Conflict of Interest**. |
| **Extortion** | A benefit or payment was allegedly demanded through coercion, intimidation, or a threat | A non-coercive improper exchange may be **Bribery**. If the threat or demand is not clear, use insufficient information. |
| **Fraud/Forgery of Documents** | A document or representation was allegedly falsified or used deceptively in connection with the reported conduct | Do not assume a document is false merely because the reporter disputes its contents. |
| **Conflict of Interest** | A personal, family, or financial interest allegedly conflicted with an official duty or influenced a decision | Mere acquaintance or a perceived relationship without an alleged affected decision may be insufficient. |
| **Other** | The alleged conduct is clear enough to classify but does not fit any category above | Do not use for vague, incomplete, or contradictory narratives; choose insufficient information in those cases. |
| **Insufficient information to classify** | The available narrative does not support a reliable category choice | This is an annotation outcome, **not a model category**. It must never be encoded as `Other` or used as a supervised target. |

These descriptions are operational guidance for consistent research annotation, not legal advice or authoritative definitions of offences. Where a narrative appears to involve multiple mechanisms, label the clearest primary alleged mechanism and note the ambiguity without adding a second label. If no primary mechanism is supportable, choose insufficient information.

## Review and training-label rules

- Two different reviewers label independently; neither can see the other's answer before submitting.
- Two matching category labels become an agreed candidate label.
- Two insufficient-information decisions result in an insufficient-information outcome and no category target.
- Any disagreement, including category versus insufficient information, goes to documented Admin adjudication.
- An Admin may choose a supported category or conclude that the report is insufficient. If the text still does not support a stable category, choose insufficient rather than forcing agreement.
- Only reports whose final outcome is a category (`agreed` or category-valued `adjudicated`) can be eligible for a future category training dataset. Insufficient-information records may be counted in aggregate to monitor data sufficiency, but their narrative must not be trained as a category example.
- This guide is a pilot draft. Discuss ambiguous examples without exposing reporter identities, revise the definitions, and version the guide before treating pilot annotations as training data.
