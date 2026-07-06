# Synthetic Users

Microservice that runs AI synthetic users against any software target to evaluate developer experience. Users configure personas and journeys via UI/REST API, the service generates system prompts from structured fields, and findings are stored in Postgres and viewable in the built-in UI.

## Structure

```
synthetic-users/
├── backend/                     # FastAPI + SQLAlchemy + Alembic
│   ├── app/
│   │   ├── main.py              # App entry, lifespan, static file serving
│   │   ├── api/                 # Route handlers (personas, journeys, packs, jobs, prompts)
│   │   ├── models/              # SQLAlchemy models (persona, journey, pack, job/run, finding)
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── engine/              # LLM agent loop, sandboxed tools, supervisor scoring, prompt generator
│   │   ├── db/                  # Async session factory
│   │   └── seed/                # Built-in DX pack (Priya, Sam, Dana, Kai + 5-phase journey)
│   ├── alembic/                 # DB migrations
│   └── pyproject.toml
├── frontend/                    # React + TypeScript + Vite
│   └── src/
│       ├── api/client.ts        # All API calls
│       ├── pages/               # Dashboard, Personas, Journeys, NewRun, RunDetail, etc.
│       └── components/          # Layout, ScoreBadge, SeverityBadge, StatusBadge
├── chart/                       # Helm chart for OpenShift/K8s
├── Dockerfile                   # Multi-stage: builds frontend + bundles into backend
└── docker-compose.yml           # Local dev: app + postgres
```

## Commands

```bash
# Full stack (one command)
docker compose up

# Dev mode (hot reload)
docker compose up db -d
cd backend && DATABASE_URL="postgresql+asyncpg://synthetic:synthetic@localhost:5432/synthetic_users" \
  uv run uvicorn app.main:app --port 8000 --reload
cd frontend && npm run dev       # Vite proxies /api to :8000

# Frontend build
cd frontend && npm run build     # Output in frontend/dist/

# Lint
cd backend && uv run ruff check app/ && uv run ruff format --check app/
cd frontend && npx tsc --noEmit
```

## Code Style

- Python 3.12+, ruff (line-length 88, double quotes, select E/F/I)
- `from __future__ import annotations` in all Python files
- Async everywhere (SQLAlchemy async, FastAPI async handlers)
- TypeScript strict mode for frontend
- No CSS framework — plain CSS with custom properties in App.css

## Architecture

- **Personas** are defined by structured fields (identity, perspective, constraints, expertise_level). The service generates a system prompt from these fields. Users review and approve the prompt before it's used in runs.
- **Journeys** are ordered sequences of phases. Each phase has instructions, available tools, and a flag for whether the target needs to be running.
- **Packs** bundle personas + a journey. The built-in "DX Pack" ships with 4 personas (Priya/Sam/Dana/Kai) and a 5-phase journey.
- **Jobs** trigger runs. A run executes all selected personas through all journey phases, storing findings to Postgres as they're discovered. Runs execute as FastAPI background tasks.
- **Engine** is the LLM agent loop: sends persona system prompt + phase instructions to Claude (Sonnet via Vertex AI), handles tool calls (read_file, list_directory, run_command, http_request, report_finding, complete_phase), validates evidence, and scores the run (GREEN/YELLOW/RED).

## Key Files

- `backend/app/engine/runner.py` — the LLM tool-use loop (core of the system)
- `backend/app/engine/tools.py` — sandboxed tool implementations + allowlist/blocklist
- `backend/app/engine/supervisor.py` — deterministic scoring logic
- `backend/app/engine/prompt_generator.py` — structured fields → system prompt
- `backend/app/seed/dx_pack.py` — built-in persona and journey definitions
- `backend/app/api/jobs.py` — job creation + background engine execution

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (asyncpg) |
| `ANTHROPIC_VERTEX_PROJECT_ID` | One of these | Vertex AI project ID |
| `CLOUD_ML_REGION` | | Vertex AI region |
| `ANTHROPIC_API_KEY` | | Direct Anthropic API key (if not using Vertex) |

## Boundaries

- Don't modify the engine's evidence verification logic without understanding the security implications
- Tool allowlists/blocklists in `engine/tools.py` are a security boundary — changes need review
- The prompt generator template in `engine/prompt_generator.py` includes mandatory instructions (evidence requirements, tool usage) — don't remove those sections
- The seed data in `seed/dx_pack.py` is idempotent — it checks before inserting
