# Backend Engineering Assessment

This repository contains two independent services in a shared mono-repo:

- `python-service/` (InsightOps): FastAPI + SQLAlchemy + manual SQL migrations
- `ts-service/` (TalentFlow): NestJS + TypeORM + in-memory queue + LLM abstraction

Both services implement the features described in the assessment PDF: a briefing report generator (Python) and a candidate document + summary workflow (TypeScript).

## Prerequisites

- Docker
- Python 3.12
- Node.js 22+
- npm

## Start Postgres

From the repository root:

```bash
docker compose up -d postgres
```

This starts PostgreSQL on `localhost:5432` with:

- database: `assessment_db`
- user: `assessment_user`
- password: `assessment_pass`

## Python service (InsightOps)

See `python-service/README.md` for details. In short:

- **Setup**
  ```bash
  cd python-service
  python -m venv .venv
  # Windows PowerShell:
  .\.venv\Scripts\Activate.ps1
  # macOS/Linux:
  # source .venv/bin/activate

  python -m pip install -r requirements.txt
  cp .env.example .env
  ```

- **Run migrations**
  ```bash
  cd python-service
  python -m app.db.run_migrations up
  ```

- **Run service**
  ```bash
  cd python-service
  python -m uvicorn app.main:app --reload --port 8000
  ```

- **Run tests**
  ```bash
  cd python-service
  python -m pytest
  ```

Key endpoints:

- `POST /briefings` – create a briefing from structured JSON.
- `GET /briefings/{id}` – fetch stored briefing data.
- `POST /briefings/{id}/generate` – generate and store HTML report.
- `GET /briefings/{id}/html` – return generated HTML (`text/html`).

## TypeScript service (TalentFlow)

See `ts-service/README.md` for details. In short:

- **Setup**
  ```bash
  cd ts-service
  npm install
  cp .env.example .env
  ```

- **Run migrations**
  ```bash
  cd ts-service
  npm run migration:run
  ```

- **Run service**
  ```bash
  cd ts-service
  npm run start:dev
  ```

- **Run tests**
  ```bash
  cd ts-service
  npm test
  npm run test:e2e
  ```

All protected endpoints expect fake auth headers:

- `x-user-id`: any non-empty string (e.g. `user-1`)
- `x-workspace-id`: workspace identifier (e.g. `workspace-1`)

Key endpoints:

- `POST /sample/candidates` – starter endpoint to create a candidate in a workspace.
- `GET /sample/candidates` – list candidates for the current workspace.
- `POST /candidates/:candidateId/documents` – upload a candidate document (type, file name, storage key, raw text).
- `POST /candidates/:candidateId/summaries/generate` – enqueue summary generation (asynchronous, via queue).
- `GET /candidates/:candidateId/summaries` – list summaries for a candidate.
- `GET /candidates/:candidateId/summaries/:summaryId` – fetch a single summary.

The LLM integration uses a `SummarizationProvider` abstraction. By default the `FakeSummarizationProvider` is used for local development and tests. See `ts-service/README.md` and `NOTES.md` for notes on plugging in a real Gemini-based provider via `GEMINI_API_KEY`.