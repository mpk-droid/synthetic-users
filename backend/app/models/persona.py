from __future__ import annotations

import uuid

from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Persona(TimestampMixin, Base):
    __tablename__ = "personas"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255))
    role_label: Mapped[str] = mapped_column(String(255))
    identity: Mapped[str] = mapped_column(Text)
    perspective: Mapped[str] = mapped_column(Text)
    constraints: Mapped[str] = mapped_column(Text)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_approved: Mapped[bool] = mapped_column(Boolean, default=False)
