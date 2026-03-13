# NestJS Backend Service

A NestJS + TypeScript service for candidate document intake and AI-powered summary generation.

---

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

---

## Setup

### 1. Install dependencies

```bash
cd ts-service
npm install
```

### 2. Configure environment

Create a `.env` file in `ts-service/`:

```env
PORT=3000
DATABASE_URL=postgres://assessment_user:assessment_pass@localhost:5432/assessment_db
NODE_ENV=development
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Start the database

From the repo root:

```bash
docker compose up -d
```

### 4. Run migrations

```bash
npm run migration:run
```

### 5. Start the service

```bash
npm run start:dev
```

The service will be available at `http://localhost:3000`.

---

## Running Migrations

```bash
# Run all pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert

# Show migration status
npm run migration:show
```

---

## Running Tests

```bash
npm run test
```

Tests use the `FakeSummarizationProvider` automatically — no API key or database connection required.

---

## API Endpoints

All endpoints require these headers:

| Header           | Description              |
| ---------------- | ------------------------ |
| `x-user-id`      | The current user's ID    |
| `x-workspace-id` | The current workspace ID |

### Sample data setup

Before using candidate endpoints, create a candidate via the sample routes:

```
POST /sample/candidates
Body: { "fullName": "John Doe", "email": "john@example.com" }
```

### Candidate endpoints

| Method | Path                                            | Description                        |
| ------ | ----------------------------------------------- | ---------------------------------- |
| `POST` | `/candidates/:candidateId/documents`            | Upload a candidate document        |
| `POST` | `/candidates/:candidateId/summaries/generate`   | Request summary generation         |
| `GET`  | `/candidates/:candidateId/summaries`            | List all summaries for a candidate |
| `GET`  | `/candidates/:candidateId/summaries/:summaryId` | Get a single summary               |

### Example: Upload a document

```json
POST /candidates/:candidateId/documents
{
  "documentType": "resume",
  "fileName": "john-resume.pdf",
  "storageKey": "uploads/john-resume.pdf",
  "rawText": "John Doe - Senior Software Engineer..."
}
```

### Example: Generate a summary

```
POST /candidates/:candidateId/summaries/generate
```

Returns `202 Accepted` with `{ summaryId, status: "pending", jobId }`.
Then poll `GET /candidates/:candidateId/summaries` to see the completed result.

---

## LLM Provider Configuration

The service uses **Gemini** (`gemini-2.5-flash`) for summary generation.

- If `GEMINI_API_KEY` is set and `NODE_ENV` is not `test`, the real Gemini provider is used.
- If the key is missing or `NODE_ENV=test`, the fake provider is used automatically.

The provider is abstracted behind `SummarizationProvider` interface in `src/llm/summarization-provider.interface.ts`.

**Limitations:**

- Free tier Gemini keys have daily rate limits. If you hit a 429 error, wait a minute and retry or generate a new key.
- Gemini 1.5 models are retired — use `gemini-2.5-flash` or `gemini-2.0-flash`.

---

## Assumptions & Tradeoffs

See [NOTES.md](./NOTES.md) for full design decisions.
