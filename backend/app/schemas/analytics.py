from datetime import date, datetime

from pydantic import BaseModel


class AnalyticsKpis(BaseModel):
    incidents_in_period: int
    active_sos: int
    resolved_in_period: int
    hazards_in_period: int
    pending_hazards: int
    registered_tourists: int


class TrendPoint(BaseModel):
    bucket: str
    incidents: int
    hazards: int


class CountPoint(BaseModel):
    label: str
    count: int


class DurationMetric(BaseModel):
    average_seconds: float | None
    median_seconds: float | None
    samples: int


class AnalyticsSummary(BaseModel):
    period: str
    start_date: date | None
    end_date: date
    generated_at: datetime
    trend_interval: str

    kpis: AnalyticsKpis
    incident_trend: list[TrendPoint]
    incident_severity: list[CountPoint]
    incident_status: list[CountPoint]
    hazard_categories: list[CountPoint]
    hazard_status: list[CountPoint]
    transmission_methods: list[CountPoint]

    acknowledgement_time: DurationMetric
    resolution_time: DurationMetric