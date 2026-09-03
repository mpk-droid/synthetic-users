"""Job and run management endpoints."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import async_session, get_db
from app.engine.runner import execute_orchestrated_run
from app.models.finding import Finding as FindingModel
from app.models.finding import Severity
from app.models.job import (
    Job,
    Run,
    RunPersona,
    RunPersonaStatus,
    RunStatus,
)
from app.models.persona import Persona
from app.schemas.finding import FindingResponse
from app.schemas.job import (
    AgentDonePayload,
    AgentStatusUpdate,
    JobCreate,
    JobResponse,
    RunResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def _run_engine(run_id: uuid.UUID, job_id: uuid.UUID) -> None:
    """Background task: load job config, spin up agents, wait, score."""
    async with async_session() as db:
        job = await db.get(Job, job_id)
        if not job:
            logger.error("Job %s not found for run %s", job_id, run_id)
            return

        result = await db.execute(
            select(Run).options(selectinload(Run.run_personas)).where(Run.id == run_id)
        )
        run = result.scalar_one_or_none()
        if not run:
            logger.error("Run %s not found", run_id)
            return

        persona_ids = list({pe["persona_id"] for pe in job.persona_environments})
        personas_result = await db.execute(
            select(Persona).where(
                Persona.id.in_([uuid.UUID(pid) for pid in persona_ids])
            )
        )
        persona_rows = personas_result.scalars().all()
        persona_map = {str(p.id): p for p in persona_rows}

        from app.models.environment import Environment
        from app.models.journey import Journey

        env_ids = []
        for pe in job.persona_environments:
            env_ids.extend(pe.get("environment_ids", []))
        env_map: dict[str, Environment] = {}
        if env_ids:
            env_result = await db.execute(
                select(Environment).where(
                    Environment.id.in_([uuid.UUID(eid) for eid in env_ids])
                )
            )
            env_map = {str(e.id): e for e in env_result.scalars().all()}

        journey_result = await db.execute(
            select(Journey)
            .options(selectinload(Journey.phases))
            .where(Journey.id == job.journey_id)
        )
        journey = journey_result.scalar_one_or_none()
        if not journey:
            run.status = RunStatus.failed
            run.error = f"Journey {job.journey_id} not found"
            await db.commit()
            return

        personas = []
        for rp in run.run_personas:
            p = persona_map.get(str(rp.persona_id))
            if not p:
                logger.warning("Persona %s not found, skipping", rp.persona_id)
                continue
            if not p.system_prompt:
                logger.warning("Persona %s has no system prompt, skipping", p.name)
                continue
            env = env_map.get(str(rp.environment_id)) if rp.environment_id else None
            env_suffix = f" ({env.name})" if env else ""
            personas.append(
                {
                    "id": str(rp.id),
                    "persona_id": str(p.id),
                    "name": f"{p.name}{env_suffix}",
                    "system_prompt": p.system_prompt,
                    "environment_image": env.image if env else None,
                    "environment_description": env.description if env else None,
                }
            )

        phases = []
        for phase in journey.phases:
            phases.append(
                {
                    "name": phase.name,
                    "instructions": phase.instructions,
                    "order": phase.order,
                }
            )

        run_persona_map = {}
        for rp in run.run_personas:
            run_persona_map[str(rp.id)] = str(rp.id)

        run.status = RunStatus.running
        run.started_at = datetime.now(timezone.utc)
        await db.commit()

    try:
        await execute_orchestrated_run(
            run_id=str(run_id),
            personas=personas,
            phases=phases,
            model=job.model,
            config=job.config or {},
            repo_url=job.repo_url,
            run_persona_map=run_persona_map,
        )
    except Exception as e:
        logger.exception("Run %s failed", run_id)
        async with async_session() as err_db:
            err_result = await err_db.execute(select(Run).where(Run.id == run_id))
            err_run = err_result.scalar_one_or_none()
            if err_run:
                err_run.status = RunStatus.failed
                err_run.error = str(e)
                await err_db.commit()


# ── Job CRUD ─────────────────────────────────────────────────────────


@router.get("", response_model=list[JobResponse])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).order_by(Job.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=JobResponse, status_code=201)
async def create_job(
    data: JobCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    job = Job(
        name=data.name,
        repo_url=data.repo_url,
        persona_environments=[
            pe.model_dump(mode="json") for pe in data.persona_environments
        ],
        journey_id=data.journey_id,
        model=data.model,
        config=data.config,
    )
    db.add(job)
    await db.flush()

    run = Run(job_id=job.id, status=RunStatus.pending)
    db.add(run)
    await db.flush()

    for pe_spec in data.persona_environments:
        env_ids = pe_spec.environment_ids or [None]
        for env_id in env_ids:
            rp = RunPersona(
                run_id=run.id,
                persona_id=pe_spec.persona_id,
                environment_id=env_id,
            )
            db.add(rp)

    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(_run_engine, run.id, job.id)

    return job


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/{job_id}/runs", response_model=list[RunResponse])
async def list_runs(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Run).where(Run.job_id == job_id).order_by(Run.created_at.desc())
    )
    return result.scalars().all()


# ── Run detail ───────────────────────────────────────────────────────


@router.get("/runs/{run_id}")
async def get_run(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Run)
        .options(
            selectinload(Run.run_personas).selectinload(RunPersona.findings),
            selectinload(Run.run_personas).selectinload(RunPersona.environment),
        )
        .where(Run.id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")

    return {
        "id": str(run.id),
        "job_id": str(run.job_id),
        "status": run.status.value,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "score": run.score.value if run.score else None,
        "score_rationale": run.score_rationale,
        "error": run.error,
        "created_at": run.created_at.isoformat(),
        "personas": [
            {
                "id": str(rp.id),
                "persona_id": str(rp.persona_id),
                "status": rp.status.value,
                "current_phase": rp.current_phase,
                "blocked_phase": rp.blocked_phase,
                "blocked_reason": rp.blocked_reason,
                "phase_summaries": rp.phase_summaries,
                "environment": {
                    "id": str(rp.environment.id),
                    "name": rp.environment.name,
                    "image": rp.environment.image,
                }
                if rp.environment
                else None,
                "findings": [
                    {
                        "id": str(f.id),
                        "severity": f.severity.value,
                        "category": f.category,
                        "title": f.title,
                        "description": f.description,
                        "evidence": f.evidence,
                        "file_path": f.file_path,
                        "suggestion": f.suggestion,
                        "phase": f.phase,
                        "verified": f.verified,
                    }
                    for f in rp.findings
                ],
            }
            for rp in run.run_personas
        ],
    }


@router.get("/runs/{run_id}/findings", response_model=list[FindingResponse])
async def list_findings(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Run)
        .options(
            selectinload(Run.run_personas).selectinload(RunPersona.findings),
        )
        .where(Run.id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")

    findings = []
    for rp in run.run_personas:
        findings.extend(rp.findings)
    return findings


# ── Agent endpoints (called by agent pods) ───────────────────────────


@router.post("/runs/{run_id}/status")
async def agent_status(
    run_id: uuid.UUID,
    data: AgentStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Agent reports which phase it's currently on."""
    rp = await _get_run_persona(run_id, data.persona_id, db)
    rp.status = RunPersonaStatus.running
    rp.current_phase = data.current_phase
    await db.commit()
    return {"status": "ok"}


@router.post("/runs/{run_id}/done")
async def agent_done(
    run_id: uuid.UUID,
    data: AgentDonePayload,
    db: AsyncSession = Depends(get_db),
):
    """Agent reports it finished — saves findings and final status."""
    rp = await _get_run_persona(run_id, data.persona_id, db)

    rp.status = RunPersonaStatus(data.status)
    rp.phase_summaries = data.phase_summaries
    rp.current_phase = None
    if data.blocked_phase:
        rp.blocked_phase = data.blocked_phase
    if data.blocked_reason:
        rp.blocked_reason = data.blocked_reason

    for f_data in data.findings:
        finding = FindingModel(
            run_persona_id=rp.id,
            severity=Severity(f_data["severity"]),
            category=f_data["category"],
            title=f_data["title"],
            description=f_data["description"],
            evidence=f_data["evidence"],
            file_path=f_data.get("file_path"),
            line_range=f_data.get("line_range"),
            suggestion=f_data.get("suggestion"),
            phase=f_data.get("phase", ""),
            verified=f_data.get("verified", True),
        )
        db.add(finding)

    await db.commit()

    from app.engine.orchestrator import notify_agent_done

    notify_agent_done(str(run_id))

    return {"status": "ok"}


async def _get_run_persona(
    run_id: uuid.UUID, persona_id: str, db: AsyncSession
) -> RunPersona:
    result = await db.execute(
        select(RunPersona).where(
            RunPersona.run_id == run_id,
            RunPersona.persona_id == persona_id,
        )
    )
    rp = result.scalar_one_or_none()
    if not rp:
        raise HTTPException(404, "RunPersona not found")
    return rp
