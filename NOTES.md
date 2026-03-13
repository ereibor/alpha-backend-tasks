# Implementation Notes

## InsightOps Python service (briefing generator)

- **Schema**
  - `briefings` table stores core briefing data and generation status/HTML.
  - `briefing_key_points`, `briefing_risks`, and `briefing_metrics` tables normalize repeated content.
  - Per-briefing metric names are enforced as unique via a database constraint and schema-level validation.

- **Validation**
  - Required fields: `companyName`, `ticker`, `summary`, `recommendation`.
  - `ticker` is normalized to uppercase in the service layer.
  - At least 2 key points and at least 1 risk are required.
  - Metric names must be unique (case-insensitive) within a briefing.

- **HTML rendering**
  - Uses Jinja2 templates with auto-escaping enabled.
  - A dedicated `briefing_report.html` template renders a professional-looking internal report with:
    - Header, company details, executive summary, key points, risks, recommendation, optional metrics, and generated timestamp.
  - The `ReportFormatter` class provides a `render_briefing(view_model)` method that transforms ORM entities into a template-friendly view model (sorted lists, computed title metadata, and generated timestamp).

- **Assumptions / tradeoffs**
  - HTML is stored on the `briefings` row (`generated_html`) to keep the example simple; in a larger system this might move to separate storage.
  - A single “generate” operation is supported per briefing; re-generation could be added easily by re-running the same service method.

## TalentFlow TypeScript service (candidate documents + summaries)

- **Schema**
  - `candidate_documents` table:
    - Fields: `id`, `candidate_id`, `workspace_id`, `document_type`, `file_name`, `storage_key`, `raw_text`, `uploaded_at`.
    - Indexed by `(candidate_id, workspace_id)` to support workspace-scoped queries.
  - `candidate_summaries` table:
    - Fields closely match the suggested spec: `status`, `score`, `strengths`, `concerns`, `summary`, `recommended_decision`, `provider`, `prompt_version`, `error_message`, timestamps.
    - Also indexed by `(candidate_id, workspace_id)`.
  - Both tables reference `sample_candidates` via foreign keys and are deleted on candidate deletion.

- **Access control**
  - All candidate document and summary operations are scoped by the current workspace:
    - The `AuthUser` from the fake auth guard provides `workspaceId`.
    - Service methods first ensure the candidate belongs to the current workspace; otherwise a `NotFoundException` is thrown.

- **Queue / worker design**
  - The `QueueService` provides an in-memory list of jobs for this assessment.
  - When a summary is requested:
    - A `pending` `candidate_summaries` record is created.
    - A `candidate.summary.generate` job is enqueued containing the summary, candidate, and workspace identifiers.
  - The `CandidateSummaryWorker`:
    - Reads all queued jobs, filters for summary jobs, and processes each job at most once.
    - Loads candidate documents for the given candidate/workspace.
    - Calls the injected `SummarizationProvider` with the collected raw texts.
    - Validates the provider’s structured response and updates the summary to `completed` or `failed` with an error message.
    - In this implementation, the controller triggers the worker synchronously for simplicity, which keeps the example easy to run and test locally while still exercising a queue/worker pattern.

- **Summarization provider**
  - The service depends on the `SummarizationProvider` interface and token (`SUMMARIZATION_PROVIDER`).
  - `LlmModule` currently wires up `FakeSummarizationProvider` for local development and automated tests; no live LLM calls occur in tests.
  - To use a real Gemini provider:
    - Implement a provider class that calls the Gemini API and returns a `CandidateSummaryResult`.
    - Register it in `LlmModule` (or a separate module) under the `SUMMARIZATION_PROVIDER` token, using `process.env.GEMINI_API_KEY`.
    - Keep tests pointed at the fake provider to avoid external dependencies.

- **Assumptions / tradeoffs**
  - Documents are sent as raw text fields for practicality; file upload and text extraction are out of scope for this assessment.
  - Strengths and concerns are stored as JSON-encoded arrays in text columns for simplicity; in a production system these might be modeled as separate tables or JSONB.
  - The queue is in-memory and non-persistent; a real system would likely use a durable queue (e.g. Redis + BullMQ, SQS, etc.).

## Things to improve with more time

- Add pagination and filtering to listing endpoints (briefings, documents, summaries).
- Add stronger error handling and retry semantics around summary generation jobs.
- Expose a small health endpoint that reflects queue lag or worker status.
- Add more exhaustive tests around malformed provider responses and concurrent job processing.

