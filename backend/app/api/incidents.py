from datetime import datetime

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
from app.core.auth import get_current_user, require_role


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

    incident = Incident(
        user_id=current_user.id,
        latitude=incident_data.latitude,
        longitude=incident_data.longitude,
        timestamp=incident_data.timestamp,
        severity=incident_data.severity,
        transmission_method=incident_data.transmission_method,
        audio_url=incident_data.audio_url,
    )

    db.add(incident)
    db.flush()

    event = IncidentEvent(
    incident_id=incident.id,
    event_type="SOS_CREATED",
    metadata={
        "transmission_method": incident.transmission_method,
    },
)

    db.add(event)
    db.commit()
    db.refresh(incident)

    return incident


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

