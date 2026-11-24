# IELTS and PTE Writing Tutor Agent — Prompt Design

Research notes for specialist agents that return JSON scores, diagnoses, corrections, model answers, study plans, and a short chat reply. **No prompt can guarantee official-examiner accuracy**; treat outputs as formative practice, not certifying scores.

---

## How should system and user messages be split so the stable rubric stays cacheable and the student draft stays in the user turn?

### Takeaway

Put **role, rubric, output contract, anchor examples, and refusal rules** in a byte-stable **system/developer prefix**. Put **only per-request variables** (task type, prompt/stimulus, student draft, word count, target band, locale) in the **user turn**. Never embed the student essay in the system message if you want prompt-cache reuse and clean separation of “instrument” vs “evidence.”

### Cited Findings

- OpenAI prompt caching reuses an **unchanged prefix** (system/developer instructions, tool/schema definitions, earlier shared content); any change before a breakpoint invalidates reuse from that token onward. Repetitive content should sit at the **beginning** of the message list. — [OpenAI Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- OpenAI recommends an **append-only** integration: avoid rewriting the prefix across turns; append new instructions and the new draft instead. Prefix changes can drop reasoning cache and hurt quality/latency. — [Keep the prefix unchanged](https://developers.openai.com/api/docs/guides/keep-prefix-unchanged)
- Azure documents the same pattern: system messages and tool definitions are cache-eligible; **structured-output schema is appended as a prefix to the system message** on some stacks—keep that schema stable across requests. — [Azure OpenAI prompt caching](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/prompt-caching)
- ECD-based prompt design treats the **scoring rubric and evidence rules** as the stable “evidence model” and the **student work product** as variable input—analogous to keeping the rubric in system context and the response in the user message. — [ECD guide for AES prompt engineering (arXiv)](https://doi.org/10.48550/arxiv.2610.15231)

### Inferences

**Recommended split (pattern, not a full prompt):**

| Layer | System / developer (stable) | User (per submission) |
|--------|-----------------------------|------------------------|
| Identity | “You are a formative IELTS/PTE writing coach, not an official examiner.” | — |
| Rubric | Official criterion names + compressed band/trait descriptors for **one** task family per deployment (e.g. `ielts_task2_v1`). | `task_type`, `exam` (`ielts` \| `pte`) |
| Procedure | Ordered steps: count words → gatekeeping checks → quote evidence → score → feedback → JSON. | — |
| Calibration | 1–2 **anchor snippets** per band/trait (short, licensed or synthetic), plus “if evidence missing, lower band / set `insufficient_evidence`.” | Optional `target_band` |
| Output | JSON schema summary + field semantics; `chat_reply` max length. | — |
| Variable input | — | `question_prompt`, `source_passage` (SWT/Task 1), `student_text`, `word_count` (precomputed), `spelling_locale` |

- Use **one system block per task family** (four variants: IELTS T1, IELTS T2, PTE SWT, PTE Essay) rather than one mega-prompt with a task switch—smaller rubrics reduce contradiction and improve cache hit rate.
- Precompute **word count in the client** and pass it in the user message so the model does not miscount under pressure.
- For multi-turn chat, **append** follow-ups as new user messages; do not replace the system rubric with chat summaries.

**Mini pattern — system (stable tail):**

```text
Output: single JSON matching schema `writing_feedback_v3`. Steps: (1) word-limit gate (2) per-criterion quotes from STUDENT_TEXT only (3) scores (4) diagnoses (5) study_plan (6) chat_reply ≤80 words.
If STUDENT_TEXT is missing or <20 words, set scores to null and explain in chat_reply. Do not invent quotes.
```

**Mini pattern — user (variable):**

```text
task_type: pte_swt
source_passage: <<< ... >>>
student_text: <<< ... >>>
word_count: 42
```

### Gaps

- Provider docs describe **prefix** caching, not a universal rule for “system vs developer” role labels across all APIs; map roles to each SDK’s “cached prefix” semantics.
- Optimal rubric **compression length** for cache hits vs scoring fidelity is not published for IELTS/PTE specifically.

---

## How do strong exam prompts force evidence quotes, calibration, and refusal to invent scores?

### Takeaway

Strong prompts **separate evidence from judgment**: retrieve **verbatim or tightly anchored quotes** per trait, justify against **descriptor text or anchors**, then assign scores. They **forbid scoring without cited spans**, cap traits in separate passes, and state that scores are **practice estimates**, not official results.

### Cited Findings

- Multi-trait AES prompting uses **trait-specific** evaluation, then **quote retrieval** with verbal evaluation, then a **second turn for scoring** referring to quotes and criteria—reducing generic feedback. — [Multi-trait specialization (arXiv)](https://arxiv.org/html/2404.04941v1)
- ECD-guided prompts for AES outperform non-ECD baselines (e.g. ECD-few-shot QWK up to **0.886** at Grade 8 in one narrative study); ECD prompts embed explicit **student model, evidence model, task model** linkage. — [ECD AES illustration (arXiv)](https://doi.org/10.48550/arxiv.2610.15231)
- ECD scoring guidance: rubric score-point descriptors are **evidence rules**; the model should **identify matching features, quote evidence, then assign the score**. — [ECD AES illustration (arXiv)](https://doi.org/10.48550/arxiv.2610.15231)
- Anchor papers in prompts raised GPT-4o human agreement from QWK **0.40** (rubric only) to **0.72** (rubric + source + full anchors); rubric + source alone was **0.46**. — [Anchor is the Key (OSF)](https://doi.org/10.35542/osf.io/cbhgz_v1)
- IELTS: a script must **fully fit** the positive features of a band descriptor; **bolded text** marks negative features that **limit** a rating. — [IELTS Writing band descriptors (PDF)](https://ielts.org/cdn/ielts-downloadable-assets/ielts-guidance-and-support/ielts-guides/ielts-writing-band-descriptors.pdf)
- PTE: when **Content** or **Form** is 0, **no score points** are awarded for the response (essay & SWT examples in score guide). — [PTE Academic Test Taker Score Guide (PDF)](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/resources/PTE-Academic-Test-Taker-Score-Guide.pdf)

### Inferences

**Evidence-first pattern (per criterion/trait):**

```text
For each criterion C:
  quotes[] = up to 3 exact substrings from STUDENT_TEXT (or "NONE")
  descriptor_match = which rubric phrase each quote supports or violates
  if quotes[] is empty for C → score cannot exceed band_cap_for_missing_evidence (e.g. 5 for IELTS dimension)
  score_C = …
```

**Calibration patterns:**

- Ship **compressed anchors**: 2–3 sentences per band level per dimension, not full essays, to control tokens while copying the anchor-paper effect.
- For holistic tasks, anchors at **extremes (1 & 6)** helped more than mid-only anchors in one study (QWK **0.59** for scores 1&6 vs **0.39** for 1,3,6 only). — [Anchor is the Key (OSF)](https://doi.org/10.35542/osf.io/cbhgz_v1)
- **Temperature 0–0.2** for scoring passes; higher temperature did not consistently help anchors in the same study.

**Anti-invention rules (explicit refusals):**

```text
- Every diagnosis must cite quote_id or "NO_EVIDENCE".
- Do not quote from source_passage as if the student wrote it (SWT/T1).
- If off-topic or memorised-template detected, set content_trait=0 and stop upward scoring.
- If word_count violates hard gate, set form_failed=true before other traits.
- Scores are TUTOR_ESTIMATES; never claim "official IELTS/PTE band."
```

**Two-pass architecture (optional):** Pass A = quotes + diagnoses only (no numbers); Pass B = scores conditioned on Pass A JSON. Studies use similar separation (quote retrieval then scoring). — [Multi-trait specialization (arXiv)](https://arxiv.org/html/2404.04941v1)

### Gaps

- Anchor excerpts from **real** IELTS/PTE items may be copyright-restricted; production systems often use **synthetic anchors** calibrated by experts—little public validation for PTE trait scales.

---

## What JSON and `response_format` practices reduce malformed output without making the model ignore the rubric?

### Takeaway

Use **provider-native structured output** (`strict` JSON Schema / `output_config.format` / Gemini `responseSchema` + `application/json`). Keep the **rubric in natural language** in the system message; use the schema only for **shape**, not for embedding the whole rubric. Validate **business rules** (word limits, enum ranges) in the app because many schema constraints are not enforced at decode time.

### Cited Findings

- OpenAI Structured Outputs: schema adherence via `response_format: json_schema` with `strict: true`; reduces need to over-prompt for format; still handle **refusals** and incomplete responses. — [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- OpenAI: prefer `json_schema` over legacy `json_object`; `json_object` does not guarantee schema match. — [OpenAI API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- Anthropic: `output_config.format` with `type: json_schema`, `additionalProperties: false`, all fields `required`; grammar compile cache ~24h. — [Anthropic Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Gemini: **both** `responseMimeType: application/json` **and** `responseSchema` required for guaranteed valid JSON objects; JSON mode alone is only a hint. — [Gemini control generated output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output)
- Gemini: `minLength`, `maxLength`, and some array constraints are **not enforced** at decode—validate in application code. — [Gemini structured output (AI Studio)](https://aistudio.google.com/docs/structured-output)
- OpenAI structured-output / tool schema changes can **invalidate** prompt cache prefixes. — [OpenAI Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)

### Inferences

**Schema design principles for tutor agents:**

1. **Flat top-level object** with fixed keys: `meta`, `gates`, `scores`, `evidence`, `corrections`, `model_answer`, `study_plan`, `chat_reply`.
2. **Enums for task and exam**, not free-text criterion names in score keys (e.g. `scores.ielts.task_response.band: integer 0-9`).
3. **Evidence array** with `{ "criterion", "quote", "start", "end", "note" }` — `start`/`end` optional if client aligns quotes.
4. **Nullable scores** when `gates.form_ok === false` or `gates.content_ok === false`.
5. Put **rubric logic in system text**; put in schema only: types, `required`, `additionalProperties: false`, short `description` on fields (helps models without replacing rubric).
6. **Do not** stuff band descriptors inside schema `description` fields if it blows the prefix or duplicates unstable text—use a `rubric_version` string in JSON for traceability.
7. **`chat_reply` as string** with max length enforced client-side (schema `maxLength` may be ignored on Gemini).

**Mini schema fragment (illustrative):**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["meta", "gates", "scores", "evidence", "corrections", "model_answer", "study_plan", "chat_reply"],
  "properties": {
    "gates": {
      "type": "object",
      "additionalProperties": false,
      "required": ["word_count", "form_ok", "content_ok", "notes"],
      "properties": {
        "word_count": { "type": "integer" },
        "form_ok": { "type": "boolean" },
        "content_ok": { "type": "boolean" },
        "notes": { "type": "array", "items": { "type": "string" } }
      }
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["criterion", "quote", "polarity"],
        "properties": {
          "criterion": { "type": "string" },
          "quote": { "type": "string" },
          "polarity": { "type": "string", "enum": ["strength", "weakness", "neutral"] }
        }
      }
    }
  }
}
```

**Avoiding “schema eats rubric”:** instruct: “All scoring judgments must follow RUBRIC_v1 in system message; JSON fields are reporting only.” Structured output docs note that **simpler prompting** for format is possible when schema is strict. — [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)

### Gaps

- Cross-provider **one schema** may hit unsupported keywords (`oneOf`, deep `$ref`); maintain per-provider schema variants.
- Whether **nested** `model_answer` objects reduce pedagogical quality (over-templated rewrites) is not studied for IELTS/PTE specifically.

---

## What are the common failure modes of writing-tutor prompts?

### Takeaway

Documented LLM grading failures: **leniency / score inflation**, **mid-scale compression**, **generic feedback**, **fluency-over-depth bias**, **out-of-range scores**, **ignoring word-limit gates**, and **rewriting student meaning** in “model answers.” Mitigations: gates first, quote-tied feedback, anchor calibration, extreme-band reminders, and separating **edit suggestions** from **replacement essays**.

### Cited Findings

- LLM AES showed **leniency bias** (Cohen’s *d* 0.67–1.26); humans gave score 1 to **9.8%** of essays vs LLMs **≤1.3%**; scores **compressed toward the middle**. — [IRT-informed LLM AES (SCITEPRESS 2026)](https://www.scitepress.org/Papers/2026/149825/149825.pdf)
- Higher-ed marking: LLMs **inflated low essays** and **deflated high essays**; mark variability **compressed** toward the centre. — [GenAI mimic human markers (Taylor & Francis 2026)](https://www.tandfonline.com/doi/full/10.1080/02602938.2026.2710688)
- ChatGPT grading: high reliability but **systematic grade inflation**, rewards **structure/fluency** over analytical depth; best for **formative** use. — [Reliable but not rigorous (SSAH 2026)](https://doi.org/10.1016/j.ssaho.2026.102788)
- Minimal rubric → **volatile grades**; stability improved with **example-rich rubric, fixed output format, low temperature, normalization**. — [ChatGPT stable AES (Education Sciences 2025)](https://doi.org/10.3390/educsci15080946)
- IELTS band **1** for responses **≤20 words**; underlength responses linked to **inadequate resource** in descriptors. — [IELTS Writing band descriptors (PDF)](https://ielts.org/cdn/ielts-downloadable-assets/ielts-guidance-and-support/ielts-guides/ielts-writing-band-descriptors.pdf)
- PTE Write Essay: **<120 or >380 words** → **zero** on all traits; **200–300** words for full Form credit. — [PTE Score Guide (PDF)](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/resources/PTE-Academic-Test-Taker-Score-Guide.pdf)
- PTE SWT: Form **0** if not one sentence or **<5 or >75** words → **0 on all traits**. — [PTE Score Guide (PDF)](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/resources/PTE-Academic-Test-Taker-Score-Guide.pdf)

### Inferences

| Failure mode | Symptom | Prompt mitigations |
|--------------|---------|-------------------|
| Score inflation | Weak drafts get Band 6–7 | Require **negative evidence** quotes; anchors at low bands; explicit “default down if no proof for Band 7+ features” |
| Mid-scale compression | Everything lands 5–6 | Per-dimension scoring; ban single holistic number without sub-scores |
| Generic advice | “Use more linking words” | Each tip must link to `evidence[].quote` |
| Ignoring word limits | Scores LR/G&A despite short essay | **Hard gate** in `gates` before trait scores; mirror PTE Content/Form zero rules |
| Rewriting meaning | Model answer changes argument | `model_answer` must keep **student position**; label `rewrite_mode: preserve_thesis` |
| Source leakage (SWT/T1) | Praise for copied chunks | Compare student n-grams to `source_passage`; flag **template copying** |
| Over-editing corrections | Full paragraph replacements | `corrections[]` = **sentence-level** `{before, after, rule}` only |
| False examiner claim | “Your official band is 7” | System disclaimer + `meta.disclaimer` field required |

**Study plan anti-pattern:** avoid time estimates without diagnosing quoted errors; tie each study_plan item to `criterion + quote`.

### Gaps

- Few peer-reviewed studies on **PTE trait-specific** LLM scoring (Content 0–6 vs IELTS 0–9).
- **Multilingual** drafts (code-mixing) and fairness DIF are reported for school AES but not IELTS/PTE prep corpora.

---

## Which instructions should differ for IELTS Task 1, IELTS Task 2, PTE SWT, and PTE Write Essay?

### Takeaway

Use **four system variants**. Shared core: evidence quotes, JSON shape, refusal rules. Diverge on **construct name**, **gating rules**, **what “good” looks like**, and **model-answer genre**.

### Cited Findings

**IELTS (official)**

- Task 1 criteria: **Task Achievement** (not Task Response); min **150 words**; Academic = summarise **key features/trends/data**; GT = **letter purpose + three bullet functions**. — [IELTS key assessment criteria (PDF)](https://ielts.org/cdn/ielts-downloadable-assets/ielts-guidance-and-support/ielts-guides/ielts-writing-key-assessment-criteria.pdf)
- Task 2 criteria: **Task Response**; min **250 words**; position, extension, support, conclusions. — [IELTS key assessment criteria (PDF)](https://ielts.org/cdn/ielts-downloadable-assets/ielts-guidance-and-support/ielts-guides/ielts-writing-key-assessment-criteria.pdf)
- Task 2 carries **more weight** than Task 1 in the overall Writing score. — [IELTS scoring in detail](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail)
- Penalties: **plagiarism**, non-connected text (bullets in body), etc. — [IELTS key assessment criteria (PDF)](https://ielts.org/cdn/ielts-downloadable-assets/ielts-guidance-and-support/ielts-guides/ielts-writing-key-assessment-criteria.pdf)

**PTE (official)**

- **Summarize Written Text**: traits **Content (0–4), Form (0–1), Grammar (0–2), Vocabulary (0–2)**; Form = **one complete sentence**, **5–75 words**; Form fail → no points. — [PTE Score Guide (PDF)](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/resources/PTE-Academic-Test-Taker-Score-Guide.pdf); [PTE test format — SWT](https://www.pearsonpte.com/pte-academic/test-format/speaking-writing/)
- **Write Essay**: traits include **Content (0–6), Development/Structure/Coherence (0–6), Form (0–2), General Linguistic Range (0–2), Grammar, Vocabulary, Spelling**; **200–300 words** for full Form; **<120 or >380** → zero on all traits; off-topic Content → zero. — [PTE Score Guide (PDF)](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/resources/PTE-Academic-Test-Taker-Score-Guide.pdf); [PTE test format — Essay](https://www.pearsonpte.com/pte-academic/test-format/speaking-writing/)
- Enhanced PTE (2025) report: extended rubrics for some writing traits (0–6 scales on nuanced traits). — [Enhanced PTE Academic report (PDF)](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/research-report-pdfs/2025-07--enhanced-pte-a-report.pdf)

### Inferences

| Dimension | IELTS Task 1 | IELTS Task 2 | PTE SWT | PTE Write Essay |
|-----------|--------------|--------------|---------|-----------------|
| Primary construct | Task **Achievement** | Task **Response** | **Summary** of `source_passage` | Argumentative/persuasive **essay** |
| Word rule | ≥150 (penalise underlength in TA/LR) | ≥250 | **One sentence**, 5–75 | 200–300 (hard zero if <120 or >380) |
| Stimulus in user turn | Figure description / letter scenario | Essay question | Full **reading passage** | Essay prompt only |
| Evidence focus | Overview, selection of key features, data accuracy | Position, support, paragraphing | Main ideas, paraphrase, **no copied chunks** | Prompt coverage, DSC, examples |
| Model answer genre | 150–190 word report/letter | 4-para opinion essay | **Single sentence** model summary | 230–260 word essay |
| Corrections | Data/description accuracy | Thesis, topic sentences, cohesion | **Merge/split** into one sentence; clause combine | Paragraph structure, spelling consistency |
| Scores in JSON | 4 bands 0–9 + optional overall tutor estimate | Same | 4 trait integers on official scales | 7 trait integers on official scales |
| Special flags | `academic_vs_gt`, `diagram_data` | `partial_prompt_address` | `second_sentence_detected`, `copy_ratio` | `memorised_template`, `caps_no_punct` |

**Task-specific prompt snippets:**

- **IELTS T1:** “Penalise **irrelevant detail** and **no overview** per TA. Do not invent figures not in the stimulus.”
- **IELTS T2:** “TR: every body paragraph must map to a **quoted thesis element**. Penalise **memorised templates** without prompt engagement.”
- **PTE SWT:** “If `word_count` ∉ [5,75] or text has `.`/`?`/`!` mid-summary treating two sentences, set `form_ok=false` and skip Grammar/Vocab scoring.”
- **PTE Essay:** “Score **Content first**; if off-topic, set content=0 and null other traits per PTE rules. Check **one spelling convention** consistently.”

**Unified agent routing:** User message includes `task_type`; orchestrator selects **one of four cached system prompts**—do not branch inside a single long system message.

### Gaps

- IELTS does not publish a single numeric “penalty table” for 140 vs 150 words; tutor agents should describe underlength as **risk to TA/TR and LR**, not a fixed point deduction.
- Pearson does not publish exact weighting from SWT raw trait sums to communicative scores—report **trait-level** feedback, not faux PTE total.

---

## Cross-cutting: specialist agent JSON bundle (synthesis)

Suggested field purposes for the report writer / implementer:

- `scores` — dimension/trait-level **practice** values only.
- `diagnoses` — human-readable, each referencing `evidence`.
- `corrections` — minimal edits preserving meaning.
- `model_answer` — task-appropriate exemplar (genre differs per table above).
- `study_plan` — 3–5 items linked to weakest **quoted** criteria.
- `chat_reply` — empathetic, ≤80 words, no official-score claims.

**Ordering inside the model’s reasoning (system text):** gates → evidence → scores → pedagogy → JSON.

**Disclaimer (always):** “Automated feedback approximates public rubrics; it is not produced by IELTS or Pearson and does not certify exam results.”