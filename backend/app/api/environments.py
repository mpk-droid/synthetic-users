"""Environment CRUD endpoints (work in progress)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.environment import Environment
from app.schemas.environment import (
    EnvironmentCreate,
    EnvironmentResponse,
    EnvironmentUpdate,
)

ENVIRONMENTS_WIP_DETAIL = (
    "Environments are work in progress. "
    "Create, update, and delete are disabled; runs use the default agent image."
)

router = APIRouter()


@router.get("", response_model=list[EnvironmentResponse])
async def list_environments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Environment).order_by(Environment.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=EnvironmentResponse, status_code=201)
async def create_environment(
    data: EnvironmentCreate, db: AsyncSession = Depends(get_db)
):
    raise HTTPException(503, ENVIRONMENTS_WIP_DETAIL)


@router.get("/{env_id}", response_model=EnvironmentResponse)
async def get_environment(env_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    env = await db.get(Environment, env_id)
    if not env:
        raise HTTPException(404, "Environment not found")
    return env


@router.put("/{env_id}", response_model=EnvironmentResponse)
async def update_environment(
    env_id: uuid.UUID,
    data: EnvironmentUpdate,
    db: AsyncSession = Depends(get_db),
):
    raise HTTPException(503, ENVIRONMENTS_WIP_DETAIL)


@router.delete("/{env_id}", status_code=204)
async def delete_environment(env_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    raise HTTPException(503, ENVIRONMENTS_WIP_DETAIL)
