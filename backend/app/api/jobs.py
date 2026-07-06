"""Job and run management endpoints."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import async_session, get_db
from app.engine.runner import execute_run
from app.models.finding import Finding as FindingModel
from app.models.finding import Severity
from app.models.job import (
    Job,
    Run,
    RunPersona,
    RunPersonaStatus,
    RunStatus,
    TrafficLight,
)
from app.models.persona import Persona
from app.schemas.finding import FindingResponse
from app.schemas.job import JobCreate, JobResponse, RunResponse

logger = logging.getLogger(__name__)

router = APIRouter()


async def _run_engine(run_id: uuid.UUID, job_id: uuid.UUID) -> None:
    """Background task: load job config from DB, execute the engine, persist results."""
    async with async_session() as db:
        job = await db.get(Job, job_id)
        if not job:
            logger.error("Job %s not found for run %s", job_id, run_id)
            return

        result = await db.execute(
            select(Run)
            .options(selectinload(Run.run_personas))
            .where(Run.id == run_id)
        )
        run = result.scalar_one_or_none()
        if not run:
            logger.error("Run %s not found", run_id)
            return

        persona_ids = job.persona_ids
        personas_result = await db.execute(
            select(Persona).where(Persona.id.in_(persona_ids))
        )
        persona_rows = personas_result.scalars().all()
        persona_map = {p.id: p for p in persona_rows}

        from app.models.journey import Journey, JourneyPhase

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
        for pid in persona_ids:
            p = persona_map.get(pid)
            if not p:
                logger.warning("Persona %s not found, skipping", pid)
                continue
            if not p.system_prompt:
                logger.warning("Persona %s has no system prompt, skipping", p.name)
                continue
            personas.append(
                {
                    "id": str(p.id),
                    "name": p.name,
                    "system_prompt": p.system_prompt,
                }
            )

        phases = []
        for phase in journey.phases:
            phases.append(
                {
                    "name": phase.name,
                    "instructions": phase.instructions,
                    "available_tools": phase.available_tools or [],
                    "requires_target_running": phase.requires_target_running,
                    "order": phase.order,
                }
            )

        rp_map: dict[str, RunPersona] = {}
        for rp in run.run_personas:
            rp_map[str(rp.persona_id)] = rp

        async def update_callback(
            rid: uuid.UUID | str, updates: dict
        ) -> None:
            async with async_session() as cb_db:
                if "persona_id" in updates and "persona_status" in updates:
                    pid = updates["persona_id"]
                    rp = rp_map.get(str(pid) if not isinstance(pid, str) else pid)
                    if rp:
                        cb_result = await cb_db.execute(
                            select(RunPersona).where(RunPersona.id == rp.id)
                        )
                        cb_rp = cb_result.scalar_one_or_none()
                        if cb_rp:
                            cb_rp.status = RunPersonaStatus(
                                updates["persona_status"]
                            )
                            if updates.get("phase_summaries"):
                                cb_rp.phase_summaries = updates["phase_summaries"]
                            if updates.get("blocked_phase"):
                                cb_rp.blocked_phase = updates["blocked_phase"]
                            if updates.get("blocked_reason"):
                                cb_rp.blocked_reason = updates["blocked_reason"]

                            for f_data in updates.get("findings", []):
                                finding = FindingModel(
                                    run_persona_id=cb_rp.id,
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
                                cb_db.add(finding)

                            await cb_db.commit()

                if "status" in updates and "persona_id" not in updates:
                    cb_result = await cb_db.execute(
                        select(Run).where(Run.id == run_id)
                    )
                    cb_run = cb_result.scalar_one_or_none()
                    if cb_run:
                        cb_run.status = RunStatus(updates["status"])
                        if updates.get("started_at"):
                            cb_run.started_at = updates["started_at"]
                        if updates.get("completed_at"):
                            cb_run.completed_at = updates["completed_at"]
                        if updates.get("score"):
                            cb_run.score = TrafficLight(updates["score"])
                        if updates.get("score_rationale"):
                            cb_run.score_rationale = updates["score_rationale"]
                        await cb_db.commit()

        try:
            await execute_run(
                run_id=str(run_id),
                personas=personas,
                phases=phases,
                model=job.model,
                config=job.config or {},
                target_dir=job.target_dir,
                target_url=job.target_url,
                update_callback=update_callback,
            )
        except Exception as e:
            logger.exception("Run %s failed", run_id)
            async with async_session() as err_db:
                err_result = await err_db.execute(
                    select(Run).where(Run.id == run_id)
                )
                err_run = err_result.scalar_one_or_none()
                if err_run:
                    err_run.status = RunStatus.failed
                    err_run.error = str(e)
                    await err_db.commit()


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
        target_url=data.target_url,
        target_dir=data.target_dir,
        persona_ids=data.persona_ids,
        journey_id=data.journey_id,
        model=data.model,
        config=data.config,
    )
    db.add(job)
    await db.flush()

    run = Run(job_id=job.id, status=RunStatus.pending)
    db.add(run)
    await db.flush()

    for pid in data.persona_ids:
        rp = RunPersona(run_id=run.id, persona_id=pid)
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


@router.get("/runs/{run_id}")
async def get_run(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
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
                "blocked_phase": rp.blocked_phase,
                "blocked_reason": rp.blocked_reason,
                "phase_summaries": rp.phase_summaries,
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
