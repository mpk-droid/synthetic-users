from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.environment import Environment
    from app.models.finding import Finding
    from app.models.journey import Journey
    from app.models.persona import Persona

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class RunStatus(enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class TrafficLight(enum.Enum):
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    RED = "RED"


class RunPersonaStatus(enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    blocked = "blocked"


class Run(TimestampMixin, Base):
    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255))
    repo_url: Mapped[str] = mapped_column(String(2048))
    persona_environments: Mapped[list[dict]] = mapped_column(JSONB)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journeys.id")
    )
    model: Mapped[str] = mapped_column(
        String(255), default="nvidia/nemotron-3-ultra-550b-a55b"
    )
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus), default=RunStatus.pending
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    score: Mapped[TrafficLight | None] = mapped_column(
        Enum(TrafficLight), nullable=True
    )
    score_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    journey: Mapped["Journey"] = relationship("Journey")
    run_personas: Mapped[list["RunPersona"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class RunPersona(Base):
    __tablename__ = "run_personas"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE")
    )
    persona_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("personas.id")
    )
    environment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("environments.id"), nullable=True
    )
    status: Mapped[RunPersonaStatus] = mapped_column(
        Enum(RunPersonaStatus), default=RunPersonaStatus.pending
    )
    current_phase: Mapped[str | None] = mapped_column(String(255), nullable=True)
    blocked_phase: Mapped[str | None] = mapped_column(String(255), nullable=True)
    blocked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    phase_summaries: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    run: Mapped[Run] = relationship(back_populates="run_personas")
    persona: Mapped["Persona"] = relationship("Persona")
    environment: Mapped["Environment"] = relationship("Environment")
    findings: Mapped[list["Finding"]] = relationship(
        "Finding", back_populates="run_persona", cascade="all, delete-orphan"
    )
