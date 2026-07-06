from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
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


class Job(TimestampMixin, Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255))
    target_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    target_dir: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    persona_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)))
    journey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journeys.id")
    )
    model: Mapped[str] = mapped_column(String(255), default="claude-sonnet-4-6")
    config: Mapped[dict] = mapped_column(JSONB, default=dict)

    runs: Mapped[list[Run]] = relationship(
        back_populates="job", order_by="Run.created_at.desc()"
    )
    journey: Mapped["Journey"] = relationship("Journey")


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE")
    )
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    job: Mapped[Job] = relationship(back_populates="runs")
    run_personas: Mapped[list[RunPersona]] = relationship(
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
    status: Mapped[RunPersonaStatus] = mapped_column(
        Enum(RunPersonaStatus), default=RunPersonaStatus.pending
    )
    blocked_phase: Mapped[str | None] = mapped_column(String(255), nullable=True)
    blocked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    phase_summaries: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    run: Mapped[Run] = relationship(back_populates="run_personas")
    persona: Mapped["Persona"] = relationship("Persona")
    findings: Mapped[list["Finding"]] = relationship(
        "Finding", back_populates="run_persona", cascade="all, delete-orphan"
    )
