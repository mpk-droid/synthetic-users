from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class EnvironmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    image: str = Field(..., min_length=1)
    description: str | None = None


class EnvironmentUpdate(BaseModel):
    name: str | None = None
    image: str | None = None
    description: str | None = None


class EnvironmentResponse(BaseModel):
    id: uuid.UUID
    name: str
    image: str
    description: str | None
    is_builtin: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
