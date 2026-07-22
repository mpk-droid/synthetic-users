from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class FindingResponse(BaseModel):
    id: uuid.UUID
    severity: str
    category: str
    title: str
    description: str
    evidence: str
    file_path: str | None
    line_range: list[int] | None
    suggestion: str | None
    phase: str
    verified: bool

    model_config = {"from_attributes": True}


class GlobalFindingResponse(BaseModel):
    id: uuid.UUID
    repo_url: str
    severity: str
    category: str
    title: str
    description: str
    evidence: str
    file_path: str | None
    suggestion: str | None
    first_seen_run_id: uuid.UUID
    last_seen_run_id: uuid.UUID
    seen_count: int
    persona_names: list[str]
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GlobalFindingUpdate(BaseModel):
    status: str
