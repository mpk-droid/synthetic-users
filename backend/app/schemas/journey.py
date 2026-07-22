from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class JourneyPhaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    instructions: str = Field(..., min_length=1)


class JourneyPhaseUpdate(BaseModel):
    name: str | None = None
    instructions: str | None = None
    order: int | None = None


class JourneyPhaseResponse(BaseModel):
    id: uuid.UUID
    order: int
    name: str
    instructions: str
    created_at: datetime

    model_config = {"from_attributes": True}


class JourneyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class JourneyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class JourneyResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    phases: list[JourneyPhaseResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
