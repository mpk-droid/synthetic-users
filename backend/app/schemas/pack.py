from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.persona import PersonaResponse


class PackCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    journey_id: uuid.UUID | None = None


class PackResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    journey_id: uuid.UUID | None
    is_builtin: bool
    personas: list[PersonaResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
