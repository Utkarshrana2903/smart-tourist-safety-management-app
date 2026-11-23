from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_role
from app.database.dependencies import get_db
from app.models.hazard import Hazard
from app.models.user import User
from app.schemas.hazard import (
    HazardCreate,
    HazardResponse,
    HazardStatusUpdate,
)

router = APIRouter(
    prefix="/hazards",
    tags=["Hazards"],
)


@router.post(
    "",
    response_model=HazardResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_hazard(
    payload: HazardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("TOURIST")),
):
    hazard = Hazard(
        reporter_user_id=current_user.id,
        category=payload.category,
        description=payload.description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        severity=payload.severity,
        status="PENDING_REVIEW",
    )

    db.add(hazard)
    db.commit()
    db.refresh(hazard)

    return hazard


@router.get(
    "/my",
    response_model=list[HazardResponse],
)
def get_my_hazards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = (
        select(Hazard)
        .where(Hazard.reporter_user_id == current_user.id)
        .order_by(Hazard.created_at.desc())
    )

    return db.scalars(statement).all()


@router.get(
    "",
    response_model=list[HazardResponse],
)
def get_hazards(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("COMMAND_CENTER")),
):
    statement = (
        select(Hazard)
        .order_by(Hazard.created_at.desc())
        .limit(limit)
    )

    return db.scalars(statement).all()


@router.patch(
    "/{hazard_id}/status",
    response_model=HazardResponse,
)
def update_hazard_status(
    hazard_id: int,
    payload: HazardStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("COMMAND_CENTER")),
):
    hazard = db.get(Hazard, hazard_id)

    if hazard is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hazard report not found",
        )

    terminal_statuses = {"RESOLVED", "REJECTED"}

    if (
        hazard.status in terminal_statuses
        and payload.status != hazard.status
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Resolved or rejected reports cannot be reopened",
        )

    hazard.status = payload.status
    hazard.reviewed_by_user_id = current_user.id
    hazard.reviewed_at = datetime.utcnow()

    if payload.resolution_note is not None:
        hazard.resolution_note = payload.resolution_note

    db.commit()
    db.refresh(hazard)

    return hazard