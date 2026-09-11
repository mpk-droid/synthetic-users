from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PersonaEnvironmentSpec(BaseModel):
    persona_id: uuid.UUID
    environment_ids: list[uuid.UUID] = Field(default_factory=list)


class RunCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    repo_url: str
    persona_environments: list[PersonaEnvironmentSpec]
    journey_id: uuid.UUID
    model: str = "nvidia/nemotron-3-super-120b-a12b"
    config: dict = Field(default_factory=dict)


class RunResponse(BaseModel):
    id: uuid.UUID
    name: str
    repo_url: str
    persona_environments: list[PersonaEnvironmentSpec]
    journey_id: uuid.UUID
    model: str
    config: dict
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    score: str | None
    score_rationale: str | None
    error: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


class AgentStatusUpdate(BaseModel):
    persona_id: str
    current_phase: str


class AgentProgressUpdate(BaseModel):
    persona_id: str
    event_type: str
    message: str
    data: dict = Field(default_factory=dict)


class AgentDonePayload(BaseModel):
    persona_id: str
    status: str
    phase_summaries: dict = Field(default_factory=dict)
    findings: list[dict] = Field(default_factory=list)
    blocked_phase: str | None = None
    blocked_reason: str | None = None
