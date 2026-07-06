# Synthetic Users

AI synthetic users that test the developer experience of your software. Configure personas with different backgrounds and expertise levels, define evaluation journeys, and get evidence-backed findings about documentation gaps, setup friction, API issues, and deployment problems.

## How It Works

1. **Define personas** — each with an identity, perspective, and constraints (e.g., "backend developer who has never used AI" or "platform engineer evaluating for OpenShift deployment")
2. **Define a journey** — ordered phases like "Read the docs", "Set up locally", "Test the API", "Try deploying"
3. **Point at a target** — a code directory or running service
4. **Get a report** — each persona walks the journey using sandboxed tools (file reading, command execution, HTTP requests) and reports findings with evidence from actual tool outputs

Findings are scored GREEN / YELLOW / RED and stored in a database. A built-in UI shows run history, findings, and reports.

## Quick Start

### Prerequisites

- Docker and Docker Compose
- One of: `ANTHROPIC_API_KEY` or Vertex AI credentials (`ANTHROPIC_VERTEX_PROJECT_ID` + `CLOUD_ML_REGION`)

### Run with Docker Compose

```bash
git clone <repo-url> && cd synthetic-users

# Set your LLM credentials
export ANTHROPIC_VERTEX_PROJECT_ID=your-project-id
export CLOUD_ML_REGION=us-east5
# Or: export ANTHROPIC_API_KEY=sk-...

# Start everything
docker compose up
```

The app is at **http://localhost:8000** — API, UI, and health check all on one port.

### Run Your First Evaluation

**Via the UI:**
1. Open http://localhost:8000
2. The built-in "DX Pack" (4 personas + 5-phase journey) is pre-loaded
3. Click "New Run", enter a target directory path, select personas, and start

**Via the API:**

```bash
# List available personas
curl http://localhost:8000/api/personas

# List available journeys
curl http://localhost:8000/api/journeys

# Create a job (replace IDs from the responses above)
curl -X POST http://localhost:8000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Evaluate my-service",
    "target_dir": "/path/to/your/project",
    "persona_ids": ["<persona-uuid>"],
    "journey_id": "<journey-uuid>",
    "model": "claude-sonnet-4-6"
  }'

# Check the run status (get run_id from /api/jobs/{job_id}/runs)
curl http://localhost:8000/api/jobs/runs/<run-id>
```

## Local Development

For hot-reload during development, run the backend and frontend separately:

```bash
# Start Postgres
docker compose up db -d

# Backend (FastAPI with hot reload)
cd backend
uv sync
DATABASE_URL="postgresql+asyncpg://synthetic:synthetic@localhost:5432/synthetic_users" \
  uv run uvicorn app.main:app --port 8000 --reload

# Frontend (Vite dev server with API proxy)
cd frontend
npm install
npm run dev    # opens on :5173, proxies /api/* to :8000
```

## Creating Custom Personas

Personas are defined by structured fields, not raw prompts. The service generates the system prompt for you.

**Via the UI:**
1. Go to Personas → Create Persona
2. Fill in: Name, Identity, Perspective, Constraints, Expertise Level
3. Click "Preview Prompt" to see the generated system prompt
4. Adjust fields if needed, then create
5. Review the system prompt and click "Approve"

**Via the API:**

```bash
# Preview a prompt without saving
curl -X POST http://localhost:8000/api/prompts/generate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Principal Engineer",
    "identity": "Staff engineer with 15 years experience evaluating SDKs",
    "perspective": "API ergonomics, error handling, integration complexity",
    "constraints": "Knows distributed systems but has not used this product before"
  }'

# Create the persona
curl -X POST http://localhost:8000/api/personas \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Principal Engineer",
    "identity": "Staff engineer with 15 years experience evaluating SDKs",
    "perspective": "API ergonomics, error handling, integration complexity",
    "constraints": "Knows distributed systems but has not used this product before",
    "expertise_level": "expert"
  }'

# Approve the generated prompt
curl -X POST http://localhost:8000/api/personas/<id>/approve-prompt
```

## Built-in DX Pack

Ships with 4 personas designed for evaluating developer tools and templates:

| Persona | Role | Catches |
|---------|------|---------|
| **Priya** | Engineering Director | Unclear value props, jargon-heavy docs, missing business context |
| **Sam** | AI Novice (backend dev) | Unexplained AI terminology, missing setup guidance, assumed knowledge |
| **Dana** | Production Engineer | Poor error handling, tight coupling, production anti-patterns |
| **Kai** | Platform Engineer | Missing resource limits, deployment issues, operational gaps |

And a 5-phase journey: First Impressions → Setup → Running Locally → Using the Target → Deployment.

## Deploying to OpenShift / Kubernetes

### Build and Push the Image

```bash
docker build -t quay.io/your-org/synthetic-users:latest .
docker push quay.io/your-org/synthetic-users:latest
```

### Deploy with Helm

```bash
helm install synthetic-users ./chart \
  --set image.repository=quay.io/your-org/synthetic-users \
  --set image.tag=latest \
  --set secrets.vertexProjectId=your-gcp-project \
  --set secrets.vertexRegion=us-east5 \
  --set postgresql.auth.password=your-db-password
```

This creates:
- Deployment with health probes and resource limits
- Service (ClusterIP on port 8000)
- OpenShift Route with TLS edge termination
- Secret with database URL and LLM credentials

### Helm Configuration

Key values in `chart/values.yaml`:

```yaml
image:
  repository: quay.io/your-org/synthetic-users
  tag: latest

resources:
  requests: { memory: 256Mi, cpu: 100m }
  limits: { memory: 1Gi, cpu: "1" }

postgresql:
  auth:
    database: synthetic_users
    username: synthetic
    password: synthetic   # override in production

secrets:
  anthropicApiKey: ""       # direct API key
  vertexProjectId: ""       # or Vertex AI
  vertexRegion: ""
```

## GitHub Actions Integration

Trigger evaluations from CI:

```yaml
- name: Run synthetic users
  run: |
    # Create a job
    JOB=$(curl -s -X POST $SYNTHETIC_USERS_URL/api/jobs \
      -H "Content-Type: application/json" \
      -d '{
        "name": "PR check",
        "target_dir": "${{ github.workspace }}",
        "persona_ids": ["<sam-uuid>"],
        "journey_id": "<journey-uuid>"
      }')
    RUN_ID=$(echo $JOB | jq -r '.id')

    # Poll until complete
    while true; do
      STATUS=$(curl -s $SYNTHETIC_USERS_URL/api/jobs/$RUN_ID/runs \
        | jq -r '.[0].status')
      [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] && break
      sleep 10
    done

    # Check score
    SCORE=$(curl -s $SYNTHETIC_USERS_URL/api/jobs/$RUN_ID/runs \
      | jq -r '.[0].score')
    [ "$SCORE" = "RED" ] && exit 1
```

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/personas` | GET, POST | List / create personas |
| `/api/personas/{id}` | GET, PUT, DELETE | Get / update / delete persona |
| `/api/personas/{id}/generate-prompt` | POST | Regenerate system prompt from fields |
| `/api/personas/{id}/approve-prompt` | POST | Mark prompt as approved |
| `/api/journeys` | GET, POST | List / create journeys |
| `/api/journeys/{id}` | GET, PUT, DELETE | Get / update / delete journey |
| `/api/journeys/{id}/phases` | POST | Add phase to journey |
| `/api/journeys/{id}/phases/{pid}` | PUT, DELETE | Update / delete phase |
| `/api/packs` | GET, POST | List / create packs |
| `/api/packs/{id}` | GET | Get pack with personas |
| `/api/packs/{id}/clone` | POST | Clone a pack |
| `/api/jobs` | GET, POST | List / create+trigger jobs |
| `/api/jobs/{id}` | GET | Get job details |
| `/api/jobs/{id}/runs` | GET | List runs for a job |
| `/api/jobs/runs/{id}` | GET | Run detail with findings |
| `/api/jobs/runs/{id}/findings` | GET | All findings for a run |
| `/api/prompts/generate` | POST | Preview prompt from structured fields |

Full OpenAPI docs at http://localhost:8000/docs.
