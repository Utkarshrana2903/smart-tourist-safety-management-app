from datetime import date, datetime

from pydantic import BaseModel


class TouristMonitoringResponse(BaseModel):
    id: int
    name: str
    phone: str
    email: str | None
    date_of_birth: date | None
    age: int | None
    kyc_status: str
    registered_at: datetime

    total_incidents: int
    active_incidents: int

    latest_incident_id: int | None
    latest_incident_status: str | None
    latest_incident_severity: str | None

    last_location_latitude: float | None
    last_location_longitude: float | None
    last_location_recorded_at: datetime | None
    last_transmission_method: str | None