from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class PersonaPack(TimestampMixin, Base):
    __tablename__ = "persona_packs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    journey_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journeys.id"), nullable=True
    )
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)

    personas: Mapped[list["Persona"]] = relationship(
        "Persona", backref="pack", foreign_keys="Persona.pack_id"
    )
    journey: Mapped["Journey"] = relationship("Journey")
