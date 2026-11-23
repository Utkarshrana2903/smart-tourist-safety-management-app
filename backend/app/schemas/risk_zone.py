from datetime import datetime

from pydantic import BaseModel


class RiskZoneResponse(BaseModel):
    id: int
    name: str
    latitude: float
    longitude: float
    radius_meters: float
    risk_level: str
    score: float
    is_active: bool
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}