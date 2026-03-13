# NOTES — TalentFlow NestJS Service

## Design Decisions

### Queue / Worker Pattern

The `QueueService` is an in-memory queue. The worker (`CandidateSummaryWorker`) is triggered inline after the generate endpoint enqueues the job, by calling `processQueuedJobs()` within the same request cycle. This keeps the implementation simple and testable without requiring a real message broker like Redis/BullMQ.

In production, I would replace this with BullMQ or a similar durable queue to decouple the worker from the HTTP request lifecycle and support retries, concurrency, and persistence.

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

- **Durable queue**: Replace the in-memory queue with BullMQ + Redis for retry logic, job visibility, and true async processing.
- **Pagination**: Add cursor or offset pagination to `GET /candidates/:id/summaries`.
- **jsonb columns**: Use `jsonb` for `strengths` and `concerns` instead of serialised text for better queryability.
- **E2E tests**: Add supertest-based e2e tests covering the full HTTP layer including auth header validation.
- **Error codes**: Return structured error responses with machine-readable codes rather than plain messages.
- **Provider retry logic**: Add exponential backoff for transient Gemini failures (429, 503) rather than immediately marking the summary as failed.
