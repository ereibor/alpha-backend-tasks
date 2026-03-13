# NOTES — NestJS Service

## Design Decisions

### Queue / Worker Pattern

Summary generation is handled asynchronously using RabbitMQ as the message broker. When a recruiter requests a summary, the service creates a `pending` summary record, publishes a job message containing the `summaryId`, `candidateId`, and `workspaceId` to RabbitMQ, and returns `202 Accepted` immediately.

The `CandidateSummaryWorker` subscribes to the `summary_queue` via the `@RabbitSubscribe` decorator. RabbitMQ automatically delivers messages to the worker as they arrive — no polling required. The worker then fetches the candidate documents from the database, calls Gemini, and updates the summary status to `completed` or `failed`.

This approach ensures:

- The HTTP request returns immediately without waiting for Gemini
- Jobs are persisted in RabbitMQ and survive server restarts
- The worker can be scaled independently from the API

### Summarization Provider Abstraction

LLM logic is fully isolated behind the `SummarizationProvider` interface. The `LlmModule` uses a factory to select the correct provider at startup based on environment:

- `NODE_ENV=test` or missing `GEMINI_API_KEY` → `FakeSummarizationProvider`
- Otherwise → `GeminiSummarizationProvider`

This makes the provider swappable (e.g. switching to OpenAI) without touching any business logic.

### Access Control

Workspace isolation is enforced in the service layer via `ensureCandidateInWorkspace()`. Every operation first verifies the candidate exists within the requesting user's workspace before proceeding. This prevents cross-workspace data leakage without requiring complex middleware.

The auth system uses `FakeAuthGuard` which reads `x-user-id` and `x-workspace-id` headers. This is intentionally simple for the assessment — in production this would be replaced with JWT verification.

### Structured Output Handling

The Gemini provider requests JSON output using `responseMimeType: "application/json"` in the generation config. The response is validated before being saved — if the shape is malformed, the summary is marked `failed` with an error message rather than throwing and leaving the record in a broken state.

### Strengths and Concerns Storage

`strengths` and `concerns` are stored as JSON strings in `text` columns rather than separate tables. This keeps the schema simple given that these are always read and written together with the summary record. For a production system with querying requirements on individual items, a separate table or a `jsonb` column would be preferable.

---

## Schema Decisions

- `candidate_documents` and `candidate_summaries` both carry a `workspace_id` column for direct workspace filtering without always joining through `sample_candidates`.
- Composite indexes on `(candidate_id, workspace_id)` cover the most common query pattern.
- `status` uses a `varchar(16)` rather than a Postgres enum to keep migrations simpler and avoid enum alteration issues.
- `strengths` and `concerns` are `text` (JSON-serialised arrays) — simple and sufficient for this scope.

---

## What I Would Improve With More Time

- **Pagination**: Add cursor or offset pagination to `GET /candidates/:id/summaries`.
- **jsonb columns**: Use `jsonb` for `strengths` and `concerns` instead of serialised text for better queryability.
- **E2E tests**: Add supertest-based e2e tests covering the full HTTP layer including auth header validation.
- **Error codes**: Return structured error responses with machine-readable codes rather than plain messages.
- **Provider retry logic**: Add exponential backoff for transient Gemini failures (429, 503) rather than immediately marking the summary as failed.
- **Dead letter queue**: Configure a RabbitMQ dead letter queue to capture failed jobs for inspection and manual retry.
- **JWT auth**: Replace `FakeAuthGuard` with real JWT verification for production use.
