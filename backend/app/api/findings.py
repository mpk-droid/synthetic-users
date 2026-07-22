"""Global findings endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.finding import GlobalFinding, GlobalFindingStatus
from app.schemas.finding import GlobalFindingResponse, GlobalFindingUpdate

router = APIRouter()


@router.get("", response_model=list[GlobalFindingResponse])
async def list_global_findings(
    repo_url: str | None = Query(None),
    severity: str | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(GlobalFinding).order_by(GlobalFinding.created_at.desc())

    if repo_url:
        query = query.where(GlobalFinding.repo_url == repo_url)
    if severity:
        query = query.where(GlobalFinding.severity == severity)
    if status:
        query = query.where(GlobalFinding.status == status)

    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/{finding_id}", response_model=GlobalFindingResponse)
async def update_global_finding(
    finding_id: uuid.UUID,
    data: GlobalFindingUpdate,
    db: AsyncSession = Depends(get_db),
):
    finding = await db.get(GlobalFinding, finding_id)
    if not finding:
        raise HTTPException(404, "Global finding not found")

    finding.status = GlobalFindingStatus(data.status)
    await db.commit()
    await db.refresh(finding)
    return finding
