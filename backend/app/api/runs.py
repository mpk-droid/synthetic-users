"""Run management endpoints."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.db.session import async_session, get_db
from app.engine.runner import execute_orchestrated_run
from app.models.finding import Finding as FindingModel
from app.models.finding import GlobalFinding, normalize_severity
from app.models.journey import Journey
from app.models.persona import Persona
from app.models.run import (
    Run,
    RunPersona,
    RunPersonaStatus,
    RunStatus,
)
from app.schemas.finding import FindingResponse
from app.schemas.run import (
    AgentDonePayload,
    AgentProgressUpdate,
    AgentStatusUpdate,
    RunCreate,
    RunResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_ACTIVITY_ENTRIES = 200


def _get_persona_activity(run: Run, persona_id: str) -> list[dict]:
    activity = run.metadata_.get("activity", {}) if run.metadata_ else {}
    return activity.get(str(persona_id), [])


def _phase_times_from_activity(activity: list[dict]) -> dict[str, dict]:
    """Derive per-phase started/completed timestamps from activity log."""
    times: dict[str, dict] = {}
    for entry in activity:
        msg = entry.get("message", "")
        at = entry.get("at")
        event_type = entry.get("type", "")
        if event_type == "phase" and msg.startswith("Started phase: "):
            phase = msg.removeprefix("Started phase: ")
            times.setdefault(phase, {})["started_at"] = at
        elif event_type == "phase_completed" and msg.startswith("Completed phase: "):
            phase = msg.removeprefix("Completed phase: ")
            times.setdefault(phase, {})["completed_at"] = at
    return times


def _get_metadata_phase_times(run: Run, persona_id: str) -> dict[str, dict]:
    metadata = run.metadata_ or {}
    phase_times = metadata.get("phase_times", {})
    return dict(phase_times.get(str(persona_id), {}))


def _set_phase_time(
    run: Run, persona_id: str, phase: str, field: str, value: str
) -> None:
    metadata = dict(run.metadata_ or {})
    phase_times = dict(metadata.get("phase_times", {}))
    persona_times = dict(phase_times.get(str(persona_id), {}))
    phase_entry = dict(persona_times.get(phase, {}))
    phase_entry[field] = value
    persona_times[phase] = phase_entry
    phase_times[str(persona_id)] = persona_times
    metadata["phase_times"] = phase_times
    run.metadata_ = metadata
    flag_modified(run, "metadata_")


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _fmt_ts(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _collect_phase_hints(run: Run, persona_id: str) -> dict[str, dict[str, str]]:
    """Metadata is authoritative; activity fills only missing fields."""
    hints = dict(_get_metadata_phase_times(run, persona_id))
    activity = _phase_times_from_activity(_get_persona_activity(run, persona_id))
    for phase, entry in activity.items():
        merged = dict(hints.get(phase, {}))
        for key, value in entry.items():
            if value and not merged.get(key):
                merged[key] = value
        hints[phase] = merged
    return hints


def _enforce_monotonic_phase_times(
    result: dict[str, dict], ordered_names: list[str]
) -> None:
    """Ensure phase N completes before phase N+1 starts."""
    for i in range(1, len(ordered_names)):
        prev_name, name = ordered_names[i - 1], ordered_names[i]
        prev_entry = result.setdefault(prev_name, {})
        entry = result.setdefault(name, {})
        prev_completed = _parse_ts(prev_entry.get("completed_at"))
        started = _parse_ts(entry.get("started_at"))
        if prev_completed and (started is None or started < prev_completed):
            entry["started_at"] = _fmt_ts(prev_completed)
            started = prev_completed
        elif started and prev_completed is None:
            prev_entry["completed_at"] = _fmt_ts(started)
        completed_at = _parse_ts(entry.get("completed_at"))
        if started and completed_at and completed_at < started:
            entry["completed_at"] = entry["started_at"]


def _build_persona_phase_times(
    run: Run,
    rp: RunPersona,
    journey_phases: list[dict],
) -> dict[str, dict]:
    """Build monotonic per-phase timestamps from recorded events, with gap-filling."""
    from datetime import timedelta

    sorted_phases = sorted(journey_phases, key=lambda p: p["order"])
    summaries = rp.phase_summaries or {}
    hints = _collect_phase_hints(run, str(rp.persona_id))

    run_end = _parse_ts(
        run.completed_at.isoformat() if run.completed_at else None
    ) or datetime.now(timezone.utc)
    run_start = (
        _parse_ts(run.started_at.isoformat() if run.started_at else None) or run_end
    )
    if run_end < run_start:
        run_end = run_start

    relevant: list[str] = []
    for phase in sorted_phases:
        name = phase["name"]
        if name in summaries or rp.current_phase == name:
            relevant.append(name)

    if not relevant:
        return {}

    result: dict[str, dict] = {}
    for name in relevant:
        hint = hints.get(name, {})
        entry: dict[str, str] = {}
        if hint.get("started_at"):
            entry["started_at"] = hint["started_at"]
        if hint.get("completed_at") and name in summaries:
            entry["completed_at"] = hint["completed_at"]
        if entry:
            result[name] = entry

    _enforce_monotonic_phase_times(result, relevant)

    if relevant[0] not in result:
        result[relevant[0]] = {}
    if not result[relevant[0]].get("started_at"):
        result[relevant[0]]["started_at"] = _fmt_ts(run_start)

    completed_names = [name for name in relevant if name in summaries]
    if completed_names and not result.get(completed_names[-1], {}).get("completed_at"):
        result.setdefault(completed_names[-1], {})["completed_at"] = _fmt_ts(run_end)

    _enforce_monotonic_phase_times(result, relevant)

    still_missing = []
    for name in completed_names:
        entry = result.get(name, {})
        started = _parse_ts(entry.get("started_at"))
        completed_at = _parse_ts(entry.get("completed_at"))
        if not started or not completed_at or completed_at <= started:
            still_missing.append(name)
    if still_missing:
        total_secs = max((run_end - run_start).total_seconds(), float(len(still_missing)))
        slot_secs = total_secs / len(still_missing)
        cursor = _parse_ts(result[relevant[0]].get("started_at")) or run_start
        for name in completed_names:
            entry = result.setdefault(name, {})
            started = _parse_ts(entry.get("started_at"))
            completed_at = _parse_ts(entry.get("completed_at"))
            if started and completed_at and completed_at > started:
                cursor = completed_at
                continue
            slot_start = cursor
            slot_end = min(slot_start + timedelta(seconds=slot_secs), run_end)
            if not entry.get("started_at"):
                entry["started_at"] = _fmt_ts(slot_start)
            if not entry.get("completed_at"):
                entry["completed_at"] = _fmt_ts(slot_end)
            cursor = _parse_ts(entry["completed_at"]) or slot_end

    for name in relevant:
        entry = result.get(name)
        if not entry:
            continue
        started = _parse_ts(entry.get("started_at"))
        completed_at = _parse_ts(entry.get("completed_at"))
        if started and started < run_start:
            entry["started_at"] = _fmt_ts(run_start)
        if completed_at and completed_at > run_end:
            entry["completed_at"] = _fmt_ts(run_end)

    _enforce_monotonic_phase_times(result, relevant)
    return {name: result[name] for name in relevant if name in result}


async def reconcile_run(run_id: uuid.UUID, db: AsyncSession) -> None:
    from app.engine.runner import finalize_run_if_complete

    result = await db.execute(
        select(Run).options(selectinload(Run.run_personas)).where(Run.id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run or run.status != RunStatus.running:
        return

    terminal = {RunPersonaStatus.completed, RunPersonaStatus.blocked}
    if run.run_personas and all(rp.status in terminal for rp in run.run_personas):
        await finalize_run_if_complete(str(run_id))
        await db.refresh(run)
        return

    if run.started_at:
        age = datetime.now(timezone.utc) - run.started_at
        if age.total_seconds() > 3600 and all(
            rp.status == RunPersonaStatus.pending for rp in run.run_personas
        ):
            run.status = RunStatus.failed
            run.error = "Run orchestration was interrupted (no agent started)"
            run.completed_at = datetime.now(timezone.utc)
            await db.commit()


def _append_persona_activity(run: Run, persona_id: str, entry: dict) -> None:
    metadata = dict(run.metadata_ or {})
    activity = dict(metadata.get("activity", {}))
    key = str(persona_id)
    entries = list(activity.get(key, []))
    entries.append(entry)
    activity[key] = entries[-MAX_ACTIVITY_ENTRIES:]
    metadata["activity"] = activity
    run.metadata_ = metadata
    flag_modified(run, "metadata_")


async def _run_engine(run_id: uuid.UUID) -> None:
    """Background task: load run config, spin up agents, wait, score."""
    async with async_session() as db:
        result = await db.execute(
            select(Run).options(selectinload(Run.run_personas)).where(Run.id == run_id)
        )
        run = result.scalar_one_or_none()
        if not run:
            logger.error("Run %s not found", run_id)
            return

        persona_ids = list({pe["persona_id"] for pe in run.persona_environments})
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
        for pe in run.persona_environments:
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
            .where(Journey.id == run.journey_id)
        )
        journey = journey_result.scalar_one_or_none()
        if not journey:
            run.status = RunStatus.failed
            run.error = f"Journey {run.journey_id} not found"
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
            model=run.model,
            config=run.config or {},
            repo_url=run.repo_url,
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


# ── Run CRUD ─────────────────────────────────────────────────────────


@router.get("", response_model=list[RunResponse])
async def list_runs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Run).order_by(Run.created_at.desc()))
    runs = result.scalars().all()
    for run in runs:
        if run.status == RunStatus.running:
            await reconcile_run(run.id, db)
    result = await db.execute(select(Run).order_by(Run.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=RunResponse, status_code=201)
async def create_run(
    data: RunCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    run = Run(
        name=data.name,
        repo_url=data.repo_url,
        persona_environments=[
            pe.model_dump(mode="json") for pe in data.persona_environments
        ],
        journey_id=data.journey_id,
        model=data.model,
        config=data.config,
        status=RunStatus.pending,
    )
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
    await db.refresh(run)

    background_tasks.add_task(_run_engine, run.id)

    return run


@router.delete("/{run_id}", status_code=204)
async def delete_run(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")

    await db.execute(
        delete(GlobalFinding).where(
            or_(
                GlobalFinding.first_seen_run_id == run_id,
                GlobalFinding.last_seen_run_id == run_id,
            )
        )
    )
    await db.delete(run)
    await db.commit()


@router.get("/{run_id}")
async def get_run(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await reconcile_run(run_id, db)
    result = await db.execute(
        select(Run)
        .options(
            selectinload(Run.journey).selectinload(Journey.phases),
            selectinload(Run.run_personas).selectinload(RunPersona.findings),
            selectinload(Run.run_personas).selectinload(RunPersona.environment),
        )
        .where(Run.id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")

    journey_phases = []
    if run.journey:
        journey_phases = [
            {"order": phase.order, "name": phase.name}
            for phase in sorted(run.journey.phases, key=lambda p: p.order)
        ]

    return {
        "id": str(run.id),
        "name": run.name,
        "repo_url": run.repo_url,
        "journey_id": str(run.journey_id),
        "journey_phases": journey_phases,
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
                "phase_times": _build_persona_phase_times(run, rp, journey_phases),
                "activity": _get_persona_activity(run, str(rp.persona_id)),
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


@router.get("/{run_id}/findings", response_model=list[FindingResponse])
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


@router.post("/{run_id}/progress")
async def agent_progress(
    run_id: uuid.UUID,
    data: AgentProgressUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Agent reports incremental progress (tools, findings, phase completion)."""
    rp = await _get_run_persona(run_id, data.persona_id, db)
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")

    entry = {
        "at": datetime.now(timezone.utc).isoformat(),
        "type": data.event_type,
        "message": data.message,
    }
    _append_persona_activity(run, data.persona_id, entry)

    if data.event_type == "phase_completed":
        phase_name = data.data.get("phase", "")
        summary = data.data.get("summary", "")
        if phase_name:
            _set_phase_time(
                run, data.persona_id, phase_name, "completed_at", entry["at"]
            )
            summaries = dict(rp.phase_summaries or {})
            summaries[phase_name] = summary
            rp.phase_summaries = summaries
            flag_modified(rp, "phase_summaries")

    elif data.event_type == "finding":
        f_data = data.data.get("finding")
        if f_data:
            existing = await db.execute(
                select(FindingModel).where(
                    FindingModel.run_persona_id == rp.id,
                    FindingModel.title == f_data.get("title", ""),
                    FindingModel.phase == f_data.get("phase", ""),
                )
            )
            if existing.scalar_one_or_none() is None:
                finding = FindingModel(
                    run_persona_id=rp.id,
                    severity=normalize_severity(f_data["severity"]),
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
    return {"status": "ok"}


# ── Agent endpoints (called by agent pods) ───────────────────────────


@router.post("/{run_id}/status")
async def agent_status(
    run_id: uuid.UUID,
    data: AgentStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Agent reports which phase it's currently on."""
    rp = await _get_run_persona(run_id, data.persona_id, db)
    previous_phase = rp.current_phase
    rp.status = RunPersonaStatus.running
    rp.current_phase = data.current_phase
    run = await db.get(Run, run_id)
    if run:
        now = datetime.now(timezone.utc).isoformat()
        if previous_phase and previous_phase != data.current_phase:
            _set_phase_time(run, data.persona_id, previous_phase, "completed_at", now)
        _set_phase_time(run, data.persona_id, data.current_phase, "started_at", now)
        _append_persona_activity(
            run,
            data.persona_id,
            {
                "at": now,
                "type": "phase",
                "message": f"Started phase: {data.current_phase}",
            },
        )
    await db.commit()
    return {"status": "ok"}


@router.post("/{run_id}/done")
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

    existing = await db.execute(
        select(FindingModel.title, FindingModel.phase).where(
            FindingModel.run_persona_id == rp.id
        )
    )
    existing_keys = {(row.title, row.phase) for row in existing.all()}

    for f_data in data.findings:
        key = (f_data["title"], f_data.get("phase", ""))
        if key in existing_keys:
            continue
        finding = FindingModel(
            run_persona_id=rp.id,
            severity=normalize_severity(f_data["severity"]),
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

    run_row = await db.get(Run, run_id)
    if run_row:
        journey_result = await db.execute(
            select(Journey)
            .options(selectinload(Journey.phases))
            .where(Journey.id == run_row.journey_id)
        )
        journey = journey_result.scalar_one_or_none()
        if journey:
            journey_phases = [
                {"order": p.order, "name": p.name}
                for p in sorted(journey.phases, key=lambda p: p.order)
            ]
            built = _build_persona_phase_times(run_row, rp, journey_phases)
            existing = _get_metadata_phase_times(run_row, data.persona_id)
            for phase_name, phase_entry in built.items():
                saved = existing.get(phase_name, {})
                if phase_entry.get("started_at") and not saved.get("started_at"):
                    _set_phase_time(
                        run_row,
                        data.persona_id,
                        phase_name,
                        "started_at",
                        phase_entry["started_at"],
                    )
                if phase_entry.get("completed_at") and not saved.get("completed_at"):
                    _set_phase_time(
                        run_row,
                        data.persona_id,
                        phase_name,
                        "completed_at",
                        phase_entry["completed_at"],
                    )

    await db.commit()

    from app.engine.orchestrator import notify_agent_done
    from app.engine.runner import finalize_run_if_complete

    await finalize_run_if_complete(str(run_id))
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
