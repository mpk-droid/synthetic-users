from __future__ import annotations

import uuid

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
