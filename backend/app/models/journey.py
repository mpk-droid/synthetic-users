from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Journey(TimestampMixin, Base):
    __tablename__ = "journeys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    phases: Mapped[list[JourneyPhase]] = relationship(
        back_populates="journey",
        order_by="JourneyPhase.order",
        cascade="all, delete-orphan",
    )


class JourneyPhase(TimestampMixin, Base):
    __tablename__ = "journey_phases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    journey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journeys.id", ondelete="CASCADE")
    )
    order: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(255))
    instructions: Mapped[str] = mapped_column(Text)
    available_tools: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    requires_target_running: Mapped[bool] = mapped_column(Boolean, default=False)

    journey: Mapped[Journey] = relationship(back_populates="phases")
