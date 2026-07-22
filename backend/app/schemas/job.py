from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    repo_url: str = Field(..., min_length=1)
    persona_ids: list[uuid.UUID]
    journey_id: uuid.UUID
    model: str = "claude-sonnet-4-6"
    config: dict = Field(default_factory=dict)


class RunResponse(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    score: str | None
    score_rationale: str | None
    error: str | None
    metadata_: dict = Field(alias="metadata_")
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class JobResponse(BaseModel):
    id: uuid.UUID
    name: str
    repo_url: str
    persona_ids: list[uuid.UUID]
    journey_id: uuid.UUID
    model: str
    config: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentStatusUpdate(BaseModel):
    persona_id: str
    current_phase: str


class AgentDonePayload(BaseModel):
    persona_id: str
    status: str  # completed or blocked
    phase_summaries: dict[str, str] = Field(default_factory=dict)
    findings: list[dict] = Field(default_factory=list)
    blocked_phase: str | None = None
    blocked_reason: str | None = None
