from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class PersonaCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    role_label: str = Field(..., min_length=1, max_length=255)
    identity: str = Field(..., min_length=1)
    perspective: str = Field(..., min_length=1)
    constraints: str = Field(..., min_length=1)


class PersonaUpdate(BaseModel):
    name: str | None = None
    role_label: str | None = None
    identity: str | None = None
    perspective: str | None = None
    constraints: str | None = None
    system_prompt: str | None = None


class PersonaResponse(BaseModel):
    id: uuid.UUID
    name: str
    role_label: str
    identity: str
    perspective: str
    constraints: str
    system_prompt: str | None
    prompt_approved: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
