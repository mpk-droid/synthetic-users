"""Environment CRUD endpoints."""

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
    env = Environment(
        name=data.name,
        image=data.image,
        description=data.description,
    )
    db.add(env)
    await db.commit()
    await db.refresh(env)
    return env


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
    env = await db.get(Environment, env_id)
    if not env:
        raise HTTPException(404, "Environment not found")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(env, key, value)
    await db.commit()
    await db.refresh(env)
    return env


@router.delete("/{env_id}", status_code=204)
async def delete_environment(env_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    env = await db.get(Environment, env_id)
    if not env:
        raise HTTPException(404, "Environment not found")
    await db.delete(env)
    await db.commit()
