from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import environments, findings, jobs, journeys, personas, prompts
from app.db.session import engine
from app.models.base import Base
from app.seed import run_seed

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await run_seed()
    yield


app = FastAPI(title="Synthetic Users", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(personas.router, prefix="/api/personas", tags=["personas"])
app.include_router(journeys.router, prefix="/api/journeys", tags=["journeys"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(prompts.router, prefix="/api/prompts", tags=["prompts"])
app.include_router(findings.router, prefix="/api/findings", tags=["findings"])
app.include_router(
    environments.router, prefix="/api/environments", tags=["environments"]
)


@app.get("/health")
async def health():
    return {"status": "ok"}


if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="static")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
