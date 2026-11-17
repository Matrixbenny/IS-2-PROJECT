# External case-data access and approval requests

This document prepares requests for permission and review. It does **not** grant permission, constitute legal advice, or mean that any source has approved access. No external case records have been collected or added to the project.

## Before sending

The student/project lead should fill in the placeholders truthfully and have the project supervisor or institutional research office review the requests. Do not include real report narratives, credentials, or personal case information in an inquiry.

Prepare a short protocol covering:

- Project title, purpose, institution, supervisor, researchers, and contact details.
- Intended sources, exact document types, date range, and a conservative requested sample or authorized access method.
- Whether the tool is a non-commercial academic prototype, who can access it, and whether it will be publicly deployed or commercialized.
- The exact planned processing: manual review, de-identification, human category labeling, storage, model training/evaluation, derived features, and retention/deletion.
- Security, access controls, incident-group separation, source attribution, and how allegations and outcomes will be distinguished.
- Whether the material contains personal or sensitive information and the steps to reduce re-identification risk.
- Institutional ethics/research approval status, any required NACOSTI research licence, and the data-protection contact's assessment.

If the project may be deployed commercially or used operationally, disclose that from the outset. Do not characterize it as non-commercial if that is not true.

## Request to Kenya Law

Send through the official [Kenya Law contact page](https://new.kenyalaw.org/about/) or the contact method listed in its current [terms of use](https://new.kenyalaw.org/terms-of-use/). The terms state that scraping and bulk downloads are prohibited and direct bulk-access requests to Kenya Law. Do not automate collection or download a corpus while awaiting a response.

**Subject:** Request for authorized research access and ML-training terms for selected Kenya Law materials

Dear Kenya Law team,

I am [name], a [student/researcher/project role] at [institution], working under [supervisor/project lead] on [project title]. The project is developing an academic prototype to help human reviewers categorize alleged corruption-related conduct in public reports. It does not determine guilt or replace investigation.

We are considering a limited, separately stored research corpus of [specified collection/document type and date range]. Before accessing or retaining any documents, we request written guidance on:

1. Whether this proposed use is permitted and whether the collection has additional rights-holder or privacy conditions.
2. The authorized way to obtain the proposed subset (for example, a research dataset, API, or other approved access route), since we will not scrape or bulk-download the service.
3. Whether the permission/licence allows storing the selected text, manual de-identification, human annotation, machine-learning training and evaluation, and retention of derived model artifacts.
4. Required attribution, notices, access limits, retention/deletion terms, and whether text or trained artifacts may be shared or deployed.
5. Whether particular judgments should be excluded because of personal information, additional restrictions, or other concerns.

The intended access and safeguards are [brief description]. The project's status is [non-commercial academic prototype / other truthful description]. We will not infer guilt from a charge or allegation, and will not merge court outcomes automatically into our category labels. We can provide the protocol and institutional approvals for your review.

Please let us know whether this request is within your access and licensing process and what additional information is required. No documents have been copied or used for this project.

Kind regards,  
[Name]  
[Institution and role]  
[Supervisor/project lead]  
[Institutional email and phone]

## Request to EACC

Use the current [EACC contact page](https://eacc.go.ke/default/contact-us/) to confirm the proper department and contact channel. The page currently exposes `eacc@integrity.go.ke` in its contact metadata; verify the address on the live official page before sending. Do not treat publication of a press release as permission to collect or train on its contents.

**Subject:** Request for permission and data-handling terms for a limited de-identified research dataset

Dear Ethics and Anti-Corruption Commission,

I am [name], a [student/researcher/project role] at [institution], working under [supervisor/project lead] on [project title]. We are studying whether a human-reviewed text-classification prototype can help organize reports of alleged corruption-related conduct. The prototype would not determine whether allegations are true or make enforcement decisions.

We request advice on whether EACC can authorize or provide a limited, de-identified case-level research dataset concerning [specified case/document types and date range], or another approved form of access. We will not scrape the EACC website or assume that public-facing material is reusable for machine-learning training.

Before any records are obtained, please confirm in writing:

1. Whether the proposed documents/data may be accessed, copied, retained, manually annotated, and used for machine-learning training and evaluation.
2. The permitted access method, data fields, sample size, and any exclusions or embargoes.
3. Required de-identification, confidentiality, attribution, security, retention/deletion, publication, and artifact-sharing conditions.
4. Whether EACC requires a data-sharing agreement, research protocol, ethics approval, or other institutional authorization.
5. Whether outcomes such as investigation, recovery, charge, or prosecution may be mentioned as metadata, and any restrictions on how they may be interpreted or reported.

The project status and intended use are [truthful description]. Proposed safeguards are [brief description]. We can provide the research protocol and relevant institutional approvals. We will keep any approved external-source material separate from Kenya Watch citizen reports and the live application's database, and will not treat allegations, charges, or agency assessments as ground truth labels without qualified human review.

No EACC case text has been collected or added to the project. Please advise whether this request can be considered and identify the appropriate office/contact.

Kind regards,  
[Name]  
[Institution and role]  
[Supervisor/project lead]  
[Institutional email and phone]

## Requests to ODPP and other agencies

For each additional source, contact the institution via its current official contact page, describe only the specific records requested, and ask the same written questions about authorized access, ML training, derived artifacts, privacy, attribution, security, retention, and publication. Do not assume EACC or Kenya Law permission covers ODPP, PPRA, audit institutions, courts, or another agency.

- [Office of the Director of Public Prosecutions contact page](https://odpp.go.ke/contact-us/) currently lists `info@odpp.go.ke` for general inquiries; confirm before sending.
- [Public Procurement Regulatory Authority](https://ppra.go.ke/) — use its current official contact route and request confirmation from the appropriate data/publications office.
- Other agency contact details should be obtained from that agency's own official website.

Use the EACC letter above as a template, substituting the exact institution, data, and source-specific questions. An audit finding, procurement irregularity, charge, or prosecution is not automatically proof of corruption and must not automatically become a model label.

## Institutional, research-licence, and privacy review

1. **Supervisor/institution:** Submit the protocol and data-flow plan to the supervisor and institutional research office. Ask whether ethics review is required for this project and obtain the required written determination or approval before requesting/processing case-level personal data.
2. **NACOSTI:** Ask the institution's research office and NACOSTI whether the proposed activity requires a research licence and what application applies. Check the current [NACOSTI research-licensing information](https://www.nacosti.go.ke/research-licensing/); do not assume a licence is or is not required based only on this document.
3. **Data protection:** Ask the institution's Data Protection Officer/privacy lead to assess the purpose, lawful basis, controller/processor roles, data minimization, security, data-subject impacts, retention, and whether a Data Protection Impact Assessment or ODPC engagement is required. The [ODPC contact page](https://www.odpc.go.ke/contact-us/) provides current official contact routes. This request is not a legal determination.
4. **Written source authorization:** Obtain an explicit written response/agreement from each source specifying documents, access method, allowed copying/storage, ML training/evaluation, derivatives/artifacts, attribution, retention/deletion, and any restrictions. A general acknowledgment or permission to read documents is not enough.
5. **Permission gate:** Until steps 1–4 are resolved, do not scrape, download, transcribe, ingest, or add case-level material to either the research corpus or the application database.

## After approvals

Use a dedicated, access-controlled research corpus, never the operational MongoDB database. Create a source register with only necessary provenance metadata (source, exact document reference, access date, authorization/terms version, allowed uses, retention deadline, and incident grouping). Apply the approved de-identification plan before annotation. Have two reviewers independently apply the versioned [labeling guide](LABELING_GUIDE.md) without seeing institutional outcome labels; adjudicate disagreements. Keep all documents from the same incident/case in one validation group. Evaluate external-source and Kenya Watch reports separately before any combined experiment, and retain a clear path to delete source material and derived artifacts if permission is withdrawn.
