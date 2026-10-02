from datetime import datetime

from pydantic import BaseModel


class IncidentCreate(BaseModel):
    latitude: float
    longitude: float
    timestamp: datetime
    severity: str = "HIGH"
    transmission_method: str = "INTERNET"
    audio_url: str | None = None


class IncidentResponse(BaseModel):
    id: int
    user_id: int
    latitude: float
    longitude: float
    timestamp: datetime
    severity: str
    status: str
    transmission_method: str
    audio_url: str | None
    created_at: datetime
    resolved_at: datetime | None

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