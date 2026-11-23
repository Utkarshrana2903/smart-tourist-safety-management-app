from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from datetime import date

from app.core.auth import require_role
from app.models.incident import Incident
from app.schemas.tourist import TouristMonitoringResponse

from app.core.jwt import create_access_token
from app.core.security import verify_password
from app.database.dependencies import get_db
from app.models.user import User
from app.schemas.auth import LoginResponse, UserLogin


router = APIRouter(
    prefix="/command-center",
    tags=["Command Center Authentication"],
)


@router.post(
    "/login",
    response_model=LoginResponse,
)
def command_center_login(
    login_data: UserLogin,
    db: Session = Depends(get_db),
):
    user = db.scalar(
        select(User).where(User.phone == login_data.phone)
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid command center credentials",
        )

    if user.role != "COMMAND_CENTER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is not authorized for command center access",
        )

    if not verify_password(
        login_data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid command center credentials",
        )

    access_token = create_access_token(user.id)

    return LoginResponse(
        access_token=access_token,
        user=user,
    )
def calculate_age(date_of_birth: date | None) -> int | None:
    if date_of_birth is None:
        return None

    today = date.today()

    return (
        today.year
        - date_of_birth.year
        - (
            (today.month, today.day)
            < (date_of_birth.month, date_of_birth.day)
        )
    )


@router.get(
    "/tourists",
    response_model=list[TouristMonitoringResponse],
)
def get_tourist_monitoring(
    current_user: User = Depends(require_role("COMMAND_CENTER")),
    db: Session = Depends(get_db),
):
    tourists = db.scalars(
        select(User)
        .where(User.role == "TOURIST")
        .order_by(User.created_at.desc(), User.id.desc())
    ).all()

    if not tourists:
        return []

    tourist_ids = [tourist.id for tourist in tourists]

    incidents = db.scalars(
        select(Incident)
        .where(Incident.user_id.in_(tourist_ids))
        .order_by(
            Incident.timestamp.desc(),
            Incident.created_at.desc(),
            Incident.id.desc(),
        )
    ).all()

    summaries = {
        tourist_id: {
            "total": 0,
            "active": 0,
        }
        for tourist_id in tourist_ids
    }

    latest_incidents: dict[int, Incident] = {}

    for incident in incidents:
        summary = summaries[incident.user_id]
        summary["total"] += 1

        if incident.status in {"CREATED", "ACKNOWLEDGED"}:
            summary["active"] += 1

        # Incidents are ordered newest first.
        # Preserve the first one found for each tourist.
        if incident.user_id not in latest_incidents:
            latest_incidents[incident.user_id] = incident

    response = []

    for tourist in tourists:
        latest = latest_incidents.get(tourist.id)
        summary = summaries[tourist.id]

        response.append(
            TouristMonitoringResponse(
                id=tourist.id,
                name=tourist.name,
                phone=tourist.phone,
                email=tourist.email,
                date_of_birth=tourist.date_of_birth,
                age=calculate_age(tourist.date_of_birth),
                kyc_status=tourist.kyc_status,
                registered_at=tourist.created_at,
                total_incidents=summary["total"],
                active_incidents=summary["active"],
                latest_incident_id=latest.id if latest else None,
                latest_incident_status=latest.status if latest else None,
                latest_incident_severity=latest.severity if latest else None,
                last_location_latitude=latest.latitude if latest else None,
                last_location_longitude=latest.longitude if latest else None,
                last_location_recorded_at=latest.timestamp if latest else None,
                last_transmission_method=(
                    latest.transmission_method if latest else None
                ),
            )
        )

    return response