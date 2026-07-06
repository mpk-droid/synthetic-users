from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class JourneyPhaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    instructions: str = Field(..., min_length=1)
    available_tools: list[str] = Field(
        default_factory=lambda: [
            "read_file",
            "list_directory",
            "report_finding",
            "complete_phase",
        ]
    )
    requires_target_running: bool = False


class JourneyPhaseUpdate(BaseModel):
    name: str | None = None
    instructions: str | None = None
    available_tools: list[str] | None = None
    requires_target_running: bool | None = None
    order: int | None = None


class JourneyPhaseResponse(BaseModel):
    id: uuid.UUID
    order: int
    name: str
    instructions: str
    available_tools: list[str]
    requires_target_running: bool
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
