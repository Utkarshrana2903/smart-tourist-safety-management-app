from collections import Counter
from datetime import date, datetime, timedelta
from statistics import mean, median
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import require_role
from app.database.dependencies import get_db
from app.models.hazard import Hazard
from app.models.incident import Incident
from app.models.incident_event import IncidentEvent
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsKpis,
    AnalyticsSummary,
    CountPoint,
    DurationMetric,
    TrendPoint,
)


router = APIRouter(
    prefix="/command-center/analytics",
    tags=["Analytics"],
)


def make_breakdown(
    counts: Counter,
    labels: list[str],
) -> list[CountPoint]:
    ordered = list(labels)
    ordered.extend(sorted(set(counts) - set(labels)))

    return [
        CountPoint(label=label, count=counts.get(label, 0))
        for label in ordered
    ]


def duration_metric(values: list[float]) -> DurationMetric:
    if not values:
        return DurationMetric(
            average_seconds=None,
            median_seconds=None,
            samples=0,
        )

    return DurationMetric(
        average_seconds=round(mean(values), 2),
        median_seconds=round(median(values), 2),
        samples=len(values),
    )


@router.get(
    "/summary",
    response_model=AnalyticsSummary,
)
def get_analytics_summary(
    period: Literal["7d", "30d", "90d", "all"] = Query(
        default="30d",
    ),
    current_user: User = Depends(require_role("COMMAND_CENTER")),
    db: Session = Depends(get_db),
):
    # Timestamps in the existing database are stored as naive UTC.
    now = datetime.utcnow()
    today = now.date()

    if period == "7d":
        start_date = today - timedelta(days=6)
    elif period == "30d":
        start_date = today - timedelta(days=29)
    elif period == "90d":
        start_date = today - timedelta(days=89)
    else:
        start_date = None

    start_datetime = (
        datetime.combine(start_date, datetime.min.time())
        if start_date is not None
        else None
    )

    # Use backend record-creation time for period inclusion.
    incident_statement = select(Incident).where(
        Incident.created_at <= now
    )
    hazard_statement = select(Hazard).where(
        Hazard.created_at <= now
    )

    if start_datetime is not None:
        incident_statement = incident_statement.where(
            Incident.created_at >= start_datetime
        )
        hazard_statement = hazard_statement.where(
            Hazard.created_at >= start_datetime
        )

    incidents = db.scalars(incident_statement).all()
    hazards = db.scalars(hazard_statement).all()
    resolved_statement = (
        select(Incident)
        .where(
            Incident.status == "RESOLVED",
            Incident.resolved_at.is_not(None),
            Incident.resolved_at <= now,
        )
    )

    if start_datetime is not None:
        resolved_statement = resolved_statement.where(
            Incident.resolved_at >= start_datetime
        )

    resolved_incidents = db.scalars(resolved_statement).all()

    active_sos = db.scalar(
        select(func.count())
        .select_from(Incident)
        .where(Incident.status.in_(["CREATED", "ACKNOWLEDGED"]))
    ) or 0

    pending_hazards = db.scalar(
        select(func.count())
        .select_from(Hazard)
        .where(Hazard.status == "PENDING_REVIEW")
    ) or 0

    registered_tourists = db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.role == "TOURIST")
    ) or 0

    # Stable breakdowns include zero-count categories.
    incident_severity = Counter(
        (incident.severity or "UNKNOWN").upper()
        for incident in incidents
    )
    incident_status = Counter(
        (incident.status or "UNKNOWN").upper()
        for incident in incidents
    )
    hazard_categories = Counter(
        (hazard.category or "UNKNOWN").upper()
        for hazard in hazards
    )
    hazard_status = Counter(
        (hazard.status or "UNKNOWN").upper()
        for hazard in hazards
    )

    transmission_methods = Counter()

    for incident in incidents:
        method = (incident.transmission_method or "").strip().upper()

        if method == "INTERNET":
            transmission_methods["INTERNET"] += 1
        elif "SMS" in method:
            transmission_methods["SMS"] += 1
        else:
            transmission_methods["OTHER/UNKNOWN"] += 1

    # Build a daily trend for bounded periods and a monthly trend
    # for all-time history.
    interval = "month" if period == "all" else "day"

    recorded_dates = [
        record.created_at.date()
        for record in [*incidents, *hazards]
        if record.created_at is not None
    ]

    trend_start = (
        start_date
        if start_date is not None
        else min(recorded_dates, default=today)
    )

    trend_counts: dict[str, dict[str, int]] = {}

    if interval == "day":
        cursor = trend_start

        while cursor <= today:
            key = cursor.isoformat()
            trend_counts[key] = {"incidents": 0, "hazards": 0}
            cursor += timedelta(days=1)
    else:
        cursor = trend_start.replace(day=1)

        while cursor <= today:
            key = cursor.strftime("%Y-%m")
            trend_counts[key] = {"incidents": 0, "hazards": 0}

            if cursor.month == 12:
                cursor = cursor.replace(
                    year=cursor.year + 1,
                    month=1,
                )
            else:
                cursor = cursor.replace(month=cursor.month + 1)

    def bucket_key(created_at: datetime) -> str:
        if interval == "month":
            return created_at.strftime("%Y-%m")
        return created_at.date().isoformat()

    for incident in incidents:
        if incident.created_at is None:
            continue

        key = bucket_key(incident.created_at)

        if key in trend_counts:
            trend_counts[key]["incidents"] += 1

    for hazard in hazards:
        if hazard.created_at is None:
            continue

        key = bucket_key(hazard.created_at)

        if key in trend_counts:
            trend_counts[key]["hazards"] += 1

    incident_trend = [
        TrendPoint(bucket=key, **counts)
        for key, counts in sorted(trend_counts.items())
    ]

    # Acknowledgement time measures backend receipt to the first
    # recorded operator acknowledgement. Missing events are excluded.
    acknowledgement_durations: list[float] = []
    incident_ids = [incident.id for incident in incidents]
    incidents_by_id = {incident.id: incident for incident in incidents}

    if incident_ids:
        acknowledgement_events = db.execute(
            select(
                IncidentEvent.incident_id,
                IncidentEvent.timestamp,
            )
            .where(
                IncidentEvent.incident_id.in_(incident_ids),
                IncidentEvent.event_type == "ACKNOWLEDGED",
            )
            .order_by(IncidentEvent.timestamp.asc())
        ).all()

        first_acknowledgement: dict[int, datetime] = {}

        for incident_id, event_timestamp in acknowledgement_events:
            first_acknowledgement.setdefault(
                incident_id,
                event_timestamp,
            )

        for incident_id, event_timestamp in first_acknowledgement.items():
            incident = incidents_by_id[incident_id]

            if incident.created_at is None:
                continue

            seconds = (
                event_timestamp - incident.created_at
            ).total_seconds()

            if seconds >= 0:
                acknowledgement_durations.append(seconds)

    # Count resolution duration only when the record identifies a
    # Command Center resolution and has usable timestamps.
    resolution_durations = []

    for incident in resolved_incidents:
        if (
            incident.status != "RESOLVED"
            or incident.resolution_source != "command_center"
            or incident.resolved_at is None
            or incident.created_at is None
        ):
            continue

        seconds = (
            incident.resolved_at - incident.created_at
        ).total_seconds()

        if seconds >= 0:
            resolution_durations.append(seconds)

    resolved_in_period = len(resolved_incidents)

    return AnalyticsSummary(
        period=period,
        start_date=(
            start_date
            if start_date is not None
            else min(recorded_dates, default=None)
        ),
        end_date=today,
        generated_at=now,
        trend_interval=interval,
        kpis=AnalyticsKpis(
            incidents_in_period=len(incidents),
            active_sos=int(active_sos),
            resolved_in_period=resolved_in_period,
            hazards_in_period=len(hazards),
            pending_hazards=int(pending_hazards),
            registered_tourists=int(registered_tourists),
        ),
        incident_trend=incident_trend,
        incident_severity=make_breakdown(
            incident_severity,
            ["HIGH", "MEDIUM", "LOW"],
        ),
        incident_status=make_breakdown(
            incident_status,
            ["CREATED", "ACKNOWLEDGED", "RESOLVED"],
        ),
        hazard_categories=make_breakdown(
            hazard_categories,
            [
                "ROAD_DAMAGE",
                "POOR_LIGHTING",
                "UNSAFE_AREA",
                "MEDICAL",
                "CROWDING",
                "OTHER",
            ],
        ),
        hazard_status=make_breakdown(
            hazard_status,
            ["PENDING_REVIEW", "VERIFIED", "RESOLVED", "REJECTED"],
        ),
        transmission_methods=make_breakdown(
            transmission_methods,
            ["INTERNET", "SMS", "OTHER/UNKNOWN"],
        ),
        acknowledgement_time=duration_metric(
            acknowledgement_durations,
        ),
        resolution_time=duration_metric(
            resolution_durations,
        ),
    )