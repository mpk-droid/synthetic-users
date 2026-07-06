from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.engine.prompt_generator import generate_system_prompt
from app.models.journey import Journey, JourneyPhase
from app.models.pack import PersonaPack
from app.models.persona import Persona
from app.schemas.pack import PackCreate, PackResponse

router = APIRouter()


@router.get("", response_model=list[PackResponse])
async def list_packs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PersonaPack)
        .options(selectinload(PersonaPack.personas))
        .order_by(PersonaPack.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=PackResponse, status_code=201)
async def create_pack(data: PackCreate, db: AsyncSession = Depends(get_db)):
    pack = PersonaPack(
        name=data.name,
        description=data.description,
        journey_id=data.journey_id,
    )
    db.add(pack)
    await db.commit()
    result = await db.execute(
        select(PersonaPack)
        .options(selectinload(PersonaPack.personas))
        .where(PersonaPack.id == pack.id)
    )
    return result.scalar_one()


@router.get("/{pack_id}", response_model=PackResponse)
async def get_pack(pack_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PersonaPack)
        .options(selectinload(PersonaPack.personas))
        .where(PersonaPack.id == pack_id)
    )
    pack = result.scalar_one_or_none()
    if not pack:
        raise HTTPException(404, "Pack not found")
    return pack


@router.post("/{pack_id}/clone", response_model=PackResponse, status_code=201)
async def clone_pack(pack_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Clone a pack: copies the pack, all its personas, and its journey."""
    result = await db.execute(
        select(PersonaPack)
        .options(selectinload(PersonaPack.personas))
        .where(PersonaPack.id == pack_id)
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(404, "Pack not found")

    # Clone the journey if one exists
    new_journey_id = None
    if original.journey_id:
        original_journey = await db.get(Journey, original.journey_id)
        if original_journey:
            new_journey = Journey(
                name=f"{original_journey.name} (copy)",
                description=original_journey.description,
            )
            db.add(new_journey)
            await db.flush()
            new_journey_id = new_journey.id

            # Clone phases
            result = await db.execute(
                select(JourneyPhase)
                .where(JourneyPhase.journey_id == original.journey_id)
                .order_by(JourneyPhase.order)
            )
            for phase in result.scalars().all():
                new_phase = JourneyPhase(
                    journey_id=new_journey.id,
                    order=phase.order,
                    name=phase.name,
                    instructions=phase.instructions,
                    available_tools=phase.available_tools,
                    requires_target_running=phase.requires_target_running,
                )
                db.add(new_phase)

    # Clone the pack
    new_pack = PersonaPack(
        name=f"{original.name} (copy)",
        description=original.description,
        journey_id=new_journey_id,
        is_builtin=False,
    )
    db.add(new_pack)
    await db.flush()

    # Clone personas
    for persona in original.personas:
        new_persona = Persona(
            name=persona.name,
            identity=persona.identity,
            perspective=persona.perspective,
            constraints=persona.constraints,
            expertise_level=persona.expertise_level,
            system_prompt=generate_system_prompt(
                name=persona.name,
                identity=persona.identity,
                perspective=persona.perspective,
                constraints=persona.constraints,
            ),
            prompt_approved=False,
            pack_id=new_pack.id,
        )
        db.add(new_persona)

    await db.commit()

    # Re-fetch with relationships loaded
    result = await db.execute(
        select(PersonaPack)
        .options(selectinload(PersonaPack.personas))
        .where(PersonaPack.id == new_pack.id)
    )
    return result.scalar_one()
