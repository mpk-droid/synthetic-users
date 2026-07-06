# Architecture

## Overview

Synthetic Users is a microservice that runs AI personas against software targets to evaluate developer experience. Each persona is an LLM agent (Claude via Anthropic SDK) with sandboxed tools that walks a configurable journey and reports evidence-backed findings.

```
┌─────────────────────────────────────────────────┐
│              React SPA (port 8000)               │
│  Dashboard, Persona config, Journey builder,     │
│  Run status, Report viewer                       │
└──────────────────────┬──────────────────────────┘
                       │ /api/*
┌──────────────────────┴──────────────────────────┐
│              FastAPI Backend                      │
│                                                  │
│  ┌────────────────────────────────────────┐      │
│  │          REST API Layer                │      │
│  │  /api/personas  /api/journeys          │      │
│  │  /api/packs     /api/jobs              │      │
│  │  /api/prompts                          │      │
│  └────────────────────────────────────────┘      │
│                                                  │
│  ┌────────────────────────────────────────┐      │
│  │          Engine                        │      │
│  │  runner.py    — LLM tool-use loop      │      │
│  │  tools.py     — sandboxed tools        │      │
│  │  supervisor.py — scoring               │      │
│  │  prompt_generator.py — fields→prompt   │      │
│  └────────────────────────────────────────┘      │
└──────────────────────┬──────────────────────────┘
                       │
              ┌────────┴────────┐
              │   PostgreSQL    │
              └─────────────────┘
```

## Data Model

### Persona

A configurable AI synthetic user. Defined by structured fields, not raw prompts.

| Field | Purpose |
|-------|---------|
| name | Display name ("Sam", "Principal Engineer") |
| identity | Who they are, their background |
| perspective | What they focus on, what they evaluate |
| constraints | What they know vs don't know |
| expertise_level | novice / intermediate / expert |
| system_prompt | Generated from fields above, reviewed by user |
| prompt_approved | User has reviewed and approved the prompt |

### Journey

An ordered sequence of evaluation phases.

| Field | Purpose |
|-------|---------|
| name | Journey name ("DX Evaluation") |
| phases[] | Ordered list of JourneyPhase records |

Each **JourneyPhase** has: name, instructions (what the persona does), available_tools (which sandboxed tools), requires_target_running (skip if target isn't up).

### Persona Pack

A reusable bundle: a set of personas + a journey. The built-in "DX Pack" ships with Priya, Sam, Dana, Kai and a 5-phase journey.

### Job → Run → RunPersona → Finding

- **Job**: what to test (target_dir/url, which personas, which journey, model)
- **Run**: one execution of a job (status, score, timestamps)
- **RunPersona**: one persona's results within a run (status, phase_summaries, blocked info)
- **Finding**: a single issue discovered (severity, category, title, description, evidence, suggestion, verified)

## Engine

### LLM Agent Loop (`runner.py`)

For each persona, for each journey phase:

1. Build prompt = persona.system_prompt + phase.instructions
2. Call Claude with prompt + tool schemas
3. If Claude returns tool_use → execute tool → record output → send result back → loop
4. If Claude returns end_turn or complete_phase → record summary → next phase
5. Safety: max 50 iterations per phase

### Sandboxed Tools (`tools.py`)

| Tool | What it does | Restrictions |
|------|-------------|-------------|
| read_file | Read file from target directory | Path traversal blocked, symlink restricted, 10K char limit |
| list_directory | List directory contents | Same path restrictions |
| run_command | Execute shell command | Allowlist (make, grep, ls, find, etc.) + blocklist (rm -rf, sudo, etc.), timeout enforced |
| http_request | Make HTTP request | Localhost and cluster URLs only |
| report_finding | Record a finding | Evidence verified against prior tool outputs |
| complete_phase | Signal phase completion | Returns summary |

### Evidence Verification

Every finding must include `evidence` — verbatim text from a prior tool output. The system verifies this by:

1. Exact substring match (case-insensitive, whitespace-normalized)
2. Fuzzy match (SequenceMatcher ratio > 0.6)

Unverified findings are flagged, not silently included.

### Supervisor Scoring (`supervisor.py`)

Deterministic, no LLM. After all personas complete:

1. Collect all findings
2. Deduplicate by (category, file_path, similar title)
3. Score:
   - **RED**: any CRITICAL, or 3+ HIGH, or any persona blocked
   - **YELLOW**: any HIGH, or 5+ MEDIUM
   - **GREEN**: everything else
4. Generate action items (top 10 findings with cross-persona agreement)

## Prompt Generation Flow

1. User fills structured fields (identity, perspective, constraints)
2. `POST /api/prompts/generate` → preview the generated system prompt
3. Prompt template injects mandatory sections: evidence requirements, tool usage instructions, the "only use what the target tells you" constraint
4. User reviews, optionally edits, then approves
5. Approved prompt is stored and used for all future runs

## Deployment

### Local (Docker Compose)

`docker compose up` builds a multi-stage image (Node builds React, Python serves everything) and starts it with Postgres.

### Cluster (Helm)

`helm install synthetic-users ./chart` deploys to OpenShift/K8s with:

- Deployment with health probes and resource limits
- Service + OpenShift Route (TLS edge)
- Secret for DATABASE_URL and LLM credentials

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy (async), Alembic, Anthropic SDK |
| Database | PostgreSQL (asyncpg) |
| Frontend | React, TypeScript, Vite, React Router, TanStack Query |
| LLM | Claude Sonnet 4.6 via Vertex AI (or direct Anthropic API) |
| Container | Multi-stage Dockerfile (Node + Python) |
| Deployment | Docker Compose (local), Helm (cluster) |
