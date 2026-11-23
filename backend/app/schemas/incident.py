
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class IncidentCreate(BaseModel):
    latitude: float
    longitude: float
    timestamp: datetime
    severity: str = "HIGH"
    transmission_method: str = "INTERNET"
    audio_url: str | None = None
    local_incident_id: str | None = None

    # Local emergency lifecycle reported by the mobile app.
    emergency_status: Literal["ACTIVE", "RESOLVED"] = "ACTIVE"
    resolved_at: datetime | None = None


class IncidentResponse(BaseModel):
    id: int
    user_id: int
    local_incident_id: str | None = None
    latitude: float
    longitude: float
    timestamp: datetime
    severity: str
    status: str
    transmission_method: str
    audio_url: str | None
    created_at: datetime
    resolved_at: datetime | None
    resolution_source: str | None = None

    model_config = {
        "from_attributes": True
    }


class IncidentEventResponse(BaseModel):
    id: int
    incident_id: int
    event_type: str
    timestamp: datetime
    metadata: dict | None

    model_config = {
        "from_attributes": True
    }
