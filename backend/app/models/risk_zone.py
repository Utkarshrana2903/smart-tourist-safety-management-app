from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class RiskZone(Base):
    __tablename__ = "risk_zones"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    radius_meters: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    risk_level: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    score: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        default=True,
        nullable=False,
    )

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    # Stable identity for a backend-managed SOS cluster.
    # NULL remains available for legacy or manually created zones.
    cluster_key: Mapped[str | None] = mapped_column(
        String(36),
        unique=True,
        nullable=True,
    )

    # Most recent server-accepted SOS timestamp for this cluster.
    last_sos_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    # When the zone entered its current risk tier.
    # Used to apply staged decay even after prolonged backend downtime.
    stage_started_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    # Highest incident ID incorporated into this cluster's current state.
    last_sos_incident_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    # Tier assigned from the rolling SOS count when the latest SOS arrived.
    # Kept separate from risk_level, which may weaken through decay.
    last_sos_risk_level: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )