
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


HazardCategory = Literal[
    "ROAD_DAMAGE",
    "POOR_LIGHTING",
    "UNSAFE_AREA",
    "MEDICAL",
    "CROWDING",
    "OTHER",
]

HazardSeverity = Literal["LOW", "MEDIUM", "HIGH"]

HazardStatus = Literal[
    "PENDING_REVIEW",
    "VERIFIED",
    "RESOLVED",
    "REJECTED",
]


class HazardCreate(BaseModel):
    category: HazardCategory
    description: str = Field(min_length=5, max_length=1000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    severity: HazardSeverity = "MEDIUM"


class HazardStatusUpdate(BaseModel):
    status: Literal["VERIFIED", "RESOLVED", "REJECTED"]
    resolution_note: str | None = Field(default=None, max_length=1000)


class HazardResponse(BaseModel):
    id: int
    reporter_user_id: int
    category: str
    description: str
    latitude: float
    longitude: float
    severity: str
    status: str
    reviewed_by_user_id: int | None
    reviewed_at: datetime | None
    resolution_note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
