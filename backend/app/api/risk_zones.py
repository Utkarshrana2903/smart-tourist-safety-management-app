import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.dependencies import get_db
from app.models.risk_zone import RiskZone
from app.schemas.risk_zone import RiskZoneResponse
from app.services.risk_zone_service import bootstrap_recent_clusters_if_needed, refresh_risk_zone_decay

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/risk-zones",
    tags=["Risk Zones"],
)


@router.get(
    "",
    response_model=list[RiskZoneResponse],
)
def get_risk_zones(
    db: Session = Depends(get_db),
):
    # Apply overdue decay before returning active, managed risk zones.
    # If this fails, log the error and leave SOS delivery unaffected.
    try:
        bootstrap_recent_clusters_if_needed(db)
        refresh_risk_zone_decay(db)
    except Exception:
        db.rollback()
        logger.exception("Could not refresh risk-zone decay")

    statement = (
        select(RiskZone)
        .where(RiskZone.is_active.is_(True))
        .order_by(RiskZone.id)
    )

    return db.scalars(statement).all()