import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.dependencies import get_db
from app.models import incident
from app.models.incident import Incident
from app.models.user import User
from app.schemas.incident import (
    IncidentCreate,
    IncidentEventResponse,
    IncidentResponse,
)
from app.models.incident_event import IncidentEvent
from app.services.risk_zone_service import record_sos_for_risk_zones
from app.core.auth import get_current_user, require_role


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/incidents",
    tags=["Incidents"],
)




@router.post(
    "",
    response_model=IncidentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_incident(
    incident_data: IncidentCreate,
    current_user: User = Depends(require_role("TOURIST")),
    db: Session = Depends(get_db),
):
    is_resolved = incident_data.emergency_status == "RESOLVED"

    reported_resolved_at = incident_data.resolved_at

    # Store timezone-aware timestamps as naive UTC for the database.
    if (
        reported_resolved_at is not None
        and reported_resolved_at.tzinfo is not None
    ):
        reported_resolved_at = reported_resolved_at.astimezone(
            timezone.utc
        ).replace(tzinfo=None)

    if is_resolved and reported_resolved_at is None:
        reported_resolved_at = datetime.utcnow()

    # Check whether this local SOS was already received.
    existing_incident = None

    if incident_data.local_incident_id:
        existing_incident = (
            db.query(Incident)
            .filter(
                Incident.user_id == current_user.id,
                Incident.local_incident_id
                == incident_data.local_incident_id,
            )
            .first()
        )

    if existing_incident is not None:
        # A later upload may carry a resolution made offline.
        # Apply it only if the server has not already resolved the incident.
        if is_resolved and existing_incident.status != "RESOLVED":
            existing_incident.status = "RESOLVED"
            existing_incident.resolved_at = (
                reported_resolved_at or datetime.utcnow()
            )
            existing_incident.resolution_source = "tourist"

            db.add(
                IncidentEvent(
                    incident_id=existing_incident.id,
                    event_type="RESOLVED",
                    metadata={
                        "source": "tourist",
                        "reported_offline": True,
                    },
                )
            )

            db.commit()
            db.refresh(existing_incident)

        # Never reset an existing incident to CREATED.
        return existing_incident

    # Preserve the local resolution even if this is the first upload.
    new_incident = Incident(
        user_id=current_user.id,
        local_incident_id=incident_data.local_incident_id,
        latitude=incident_data.latitude,
        longitude=incident_data.longitude,
        timestamp=incident_data.timestamp,
        severity=incident_data.severity,
        transmission_method=incident_data.transmission_method,
        audio_url=incident_data.audio_url,
        status="RESOLVED" if is_resolved else "CREATED",
        resolved_at=reported_resolved_at if is_resolved else None,
        resolution_source="tourist" if is_resolved else None,
    )

    db.add(new_incident)
    db.flush()

    db.add(
        IncidentEvent(
            incident_id=new_incident.id,
            event_type="SOS_CREATED",
            metadata={
                "transmission_method": new_incident.transmission_method,
                "emergency_status": incident_data.emergency_status,
            },
        )
    )

    if is_resolved:
        db.add(
            IncidentEvent(
                incident_id=new_incident.id,
                event_type="RESOLVED",
                metadata={
                    "source": "tourist",
                    "reported_offline": True,
                },
            )
        )

    db.commit()
    db.refresh(new_incident)

    # The SOS is committed first. Risk-zone failure must not undo SOS delivery.
    try:
        record_sos_for_risk_zones(db, new_incident)
    except Exception:
        db.rollback()
        logger.exception(
            "Risk-zone update failed for accepted incident %s",
            new_incident.id,
        )

    return new_incident




@router.get(
    "",
    response_model=list[IncidentResponse],
)
def get_incidents(
    current_user: User = Depends(require_role("COMMAND_CENTER")),
    db: Session = Depends(get_db),
):
    incidents = db.scalars(
        select(Incident).order_by(Incident.created_at.desc())
    ).all()

    return incidents

@router.get(
    "/my",
    response_model=list[IncidentResponse],
)
def get_my_incidents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incidents = db.scalars(
        select(Incident)
        .where(Incident.user_id == current_user.id)
        .order_by(Incident.created_at.desc())
    ).all()

    return incidents

@router.get(
    "/{incident_id}/events",
    response_model=list[IncidentEventResponse],
)
def get_incident_events(
    incident_id: int,
    current_user: User = Depends(require_role("COMMAND_CENTER")),
    db: Session = Depends(get_db),
):
    incident = db.scalar(
        select(Incident).where(Incident.id == incident_id)
    )

    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    events = db.scalars(
        select(IncidentEvent)
        .where(IncidentEvent.incident_id == incident_id)
        .order_by(IncidentEvent.timestamp.asc())
    ).all()

    return events

@router.post(
    "/{incident_id}/acknowledge",
    response_model=IncidentResponse,
)
def acknowledge_incident(
    incident_id: int,
    current_user: User = Depends(require_role("COMMAND_CENTER")),
    db: Session = Depends(get_db),
):
    incident = db.scalar(
        select(Incident).where(Incident.id == incident_id)
    )

    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    if incident.status == "RESOLVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resolved incident cannot be acknowledged",
        )

    incident.status = "ACKNOWLEDGED"

    event = IncidentEvent(
    incident_id=incident.id,
    event_type="ACKNOWLEDGED",
    metadata={
        "source": "command_center",
    },
)

    db.add(event)
    db.commit()
    db.refresh(incident)

    return incident

@router.post(
    "/{incident_id}/resolve",
    response_model=IncidentResponse,
)
def resolve_incident(
    incident_id: int,
    current_user: User = Depends(require_role("COMMAND_CENTER")),
    db: Session = Depends(get_db),
):
    incident = db.scalar(
        select(Incident).where(Incident.id == incident_id)
    )

    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    if incident.status == "RESOLVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incident is already resolved",
        )

    incident.status = "RESOLVED"
    incident.resolved_at = datetime.utcnow()
    incident.resolution_source = "command_center"

    event = IncidentEvent(
    incident_id=incident.id,
    event_type="RESOLVED",
    metadata={
        "source": "command_center",
    },
)

    db.add(event)
    db.commit()
    db.refresh(incident)

    return incident 

