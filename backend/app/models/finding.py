from __future__ import annotations

import enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.run import RunPersona
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Severity(enum.Enum):
    critical = "critical"
    needs_attention = "needs_attention"
    nits = "nits"


SEVERITY_RANK = {
    Severity.critical: 2,
    Severity.needs_attention: 1,
    Severity.nits: 0,
}

_LEGACY_SEVERITY_MAP = {
    "high": Severity.needs_attention,
    "medium": Severity.needs_attention,
    "low": Severity.nits,
    "info": Severity.nits,
}


def normalize_severity(value: str) -> Severity:
    key = value.lower().strip().replace("-", "_").replace(" ", "_")
    if key in _LEGACY_SEVERITY_MAP:
        return _LEGACY_SEVERITY_MAP[key]
    return Severity(key)


class GlobalFindingStatus(enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    fixed = "fixed"


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_persona_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("run_personas.id", ondelete="CASCADE")
    )
    severity: Mapped[Severity] = mapped_column(Enum(Severity))
    category: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text)
    evidence: Mapped[str] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    line_range: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)
    suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)
    phase: Mapped[str] = mapped_column(String(255))
    run_persona: Mapped["RunPersona"] = relationship(
        "RunPersona", back_populates="findings"
    )


class GlobalFinding(TimestampMixin, Base):
    __tablename__ = "global_findings"
    __table_args__ = ({"sqlite_autoincrement": True},)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    repo_url: Mapped[str] = mapped_column(String(2048))
    fingerprint: Mapped[str] = mapped_column(String(512))
    severity: Mapped[Severity] = mapped_column(Enum(Severity))
    category: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text)
    evidence: Mapped[str] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_seen_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id")
    )
    last_seen_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id")
    )
    seen_count: Mapped[int] = mapped_column(Integer, default=1)
    persona_names: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    status: Mapped[GlobalFindingStatus] = mapped_column(
        Enum(GlobalFindingStatus), default=GlobalFindingStatus.open
    )
