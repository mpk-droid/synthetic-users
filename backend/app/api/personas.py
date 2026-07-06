from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.engine.prompt_generator import generate_system_prompt
from app.models.persona import ExpertiseLevel, Persona
from app.schemas.persona import PersonaCreate, PersonaResponse, PersonaUpdate

router = APIRouter()


@router.get("", response_model=list[PersonaResponse])
async def list_personas(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Persona).order_by(Persona.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=PersonaResponse, status_code=201)
async def create_persona(data: PersonaCreate, db: AsyncSession = Depends(get_db)):
    system_prompt = generate_system_prompt(
        name=data.name,
        identity=data.identity,
        perspective=data.perspective,
        constraints=data.constraints,
    )
    persona = Persona(
        name=data.name,
        identity=data.identity,
        perspective=data.perspective,
        constraints=data.constraints,
        expertise_level=ExpertiseLevel(data.expertise_level),
        system_prompt=system_prompt,
        pack_id=data.pack_id,
    )
    db.add(persona)
    await db.commit()
    await db.refresh(persona)
    return persona


@router.get("/{persona_id}", response_model=PersonaResponse)
async def get_persona(persona_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    persona = await db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(404, "Persona not found")
    return persona


@router.put("/{persona_id}", response_model=PersonaResponse)
async def update_persona(
    persona_id: uuid.UUID,
    data: PersonaUpdate,
    db: AsyncSession = Depends(get_db),
):
    persona = await db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(404, "Persona not found")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "expertise_level" and value is not None:
            value = ExpertiseLevel(value)
        setattr(persona, key, value)
    if any(k in update_data for k in ("identity", "perspective", "constraints", "name")):
        persona.prompt_approved = False
    await db.commit()
    await db.refresh(persona)
    return persona


@router.delete("/{persona_id}", status_code=204)
async def delete_persona(persona_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    persona = await db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(404, "Persona not found")
    await db.delete(persona)
    await db.commit()


@router.post("/{persona_id}/generate-prompt", response_model=PersonaResponse)
async def regenerate_prompt(
    persona_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    persona = await db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(404, "Persona not found")
    persona.system_prompt = generate_system_prompt(
        name=persona.name,
        identity=persona.identity,
        perspective=persona.perspective,
        constraints=persona.constraints,
    )
    persona.prompt_approved = False
    await db.commit()
    await db.refresh(persona)
    return persona


@router.post("/{persona_id}/approve-prompt", response_model=PersonaResponse)
async def approve_prompt(
    persona_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    persona = await db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(404, "Persona not found")
    if not persona.system_prompt:
        raise HTTPException(400, "No system prompt to approve — generate one first")
    persona.prompt_approved = True
    await db.commit()
    await db.refresh(persona)
    return persona
