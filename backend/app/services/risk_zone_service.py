from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.incident import Incident
from app.models.risk_zone import RiskZone


CLUSTER_RADIUS_METERS = 350.0
ROLLING_WINDOW = timedelta(hours=72)
DECAY_STAGE_DURATION = timedelta(hours=24)

# Values match the severity tiers already consumed by the Command Center.
# HIGH = red, MEDIUM = yellow/amber, LOW = green.
RISK_PROFILES: dict[str, tuple[float, float]] = {
    "HIGH": (150.0, 0.90),
    "MEDIUM": (250.0, 0.55),
    "LOW": (350.0, 0.20),
}

# Total time until expiry when a new SOS starts at this tier.
EXPIRY_DURATION: dict[str, timedelta] = {
    "HIGH": timedelta(hours=72),
    "MEDIUM": timedelta(hours=48),
    "LOW": timedelta(hours=24),
}


def utc_naive(value: datetime) -> datetime:
    """Normalize datetimes to the backend's naive-UTC database convention."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def risk_profile_for_count(count: int) -> tuple[str, float, float]:
    """Return (risk level, radius in metres, display score) for a rolling count."""
    if count >= 5:
        level = "HIGH"
    elif count >= 3:
        level = "MEDIUM"
    else:
        level = "LOW"

    radius, score = RISK_PROFILES[level]
    return level, radius, score


def distance_meters(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    """Haversine distance between two latitude/longitude points."""
    earth_radius_m = 6_371_000.0

    lat_a = radians(latitude_a)
    lat_b = radians(latitude_b)
    delta_lat = radians(latitude_b - latitude_a)
    delta_lon = radians(longitude_b - longitude_a)

    haversine = (
        sin(delta_lat / 2) ** 2
        + cos(lat_a) * cos(lat_b) * sin(delta_lon / 2) ** 2
    )
    return 2 * earth_radius_m * asin(sqrt(min(1.0, haversine)))


def advance_zone_decay(zone: RiskZone, now: datetime) -> bool:
    """
    Advance one or more overdue decay stages.

    A managed HIGH zone becomes MEDIUM at +24h, LOW at +48h, and
    inactive at +72h. A zone starting at MEDIUM expires at +48h;
    one starting at LOW expires at +24h.

    Stage timestamps advance from their scheduled transition time rather
    than from the current request time, so backend downtime does not pause
    the lifecycle.
    """
    if not zone.cluster_key or not zone.is_active or zone.last_sos_at is None:
        return False

    now = utc_naive(now)
    last_sos_at = utc_naive(zone.last_sos_at)
    stage_started_at = utc_naive(zone.stage_started_at or last_sos_at)
    baseline_level = zone.last_sos_risk_level or zone.risk_level
    changed = False

    expected_expiry = last_sos_at + EXPIRY_DURATION.get(
        baseline_level, EXPIRY_DURATION["LOW"]
    )
    if zone.expires_at is None:
        zone.expires_at = expected_expiry
        changed = True

    while zone.is_active and now >= stage_started_at + DECAY_STAGE_DURATION:
        transition_at = stage_started_at + DECAY_STAGE_DURATION

        if zone.risk_level == "HIGH":
            zone.risk_level = "MEDIUM"
            zone.radius_meters, zone.score = RISK_PROFILES["MEDIUM"]
            zone.stage_started_at = transition_at
            stage_started_at = transition_at
            changed = True
        elif zone.risk_level == "MEDIUM":
            zone.risk_level = "LOW"
            zone.radius_meters, zone.score = RISK_PROFILES["LOW"]
            zone.stage_started_at = transition_at
            stage_started_at = transition_at
            changed = True
        else:
            zone.is_active = False
            zone.stage_started_at = transition_at
            zone.expires_at = transition_at
            changed = True

    return changed


def refresh_risk_zone_decay(
    db: Session,
    now: datetime | None = None,
) -> None:
    """Persist decay transitions for automatically managed zones."""
    now = utc_naive(now or datetime.utcnow())

    zones = db.scalars(
        select(RiskZone).where(
            RiskZone.cluster_key.is_not(None),
            RiskZone.is_active.is_(True),
        )
    ).all()

    changed = False
    for zone in zones:
        zone_changed = advance_zone_decay(zone, now)
        changed = zone_changed or changed

    if changed:
        db.commit()


def bootstrap_recent_clusters_if_needed(
    db: Session,
    now: datetime | None = None,
) -> bool:
    """
    Create managed clusters from the current rolling window only when no
    managed cluster has ever been stored. Legacy zones have a NULL key and
    are never altered. Inactive managed rows prevent expired zones from
    being recreated by later dashboard refreshes.
    """
    now = utc_naive(now or datetime.utcnow())

    existing_managed_id = db.scalar(
        select(RiskZone.id)
        .where(RiskZone.cluster_key.is_not(None))
        .limit(1)
    )
    if existing_managed_id is not None:
        return False

    window_start = now - ROLLING_WINDOW
    incidents = db.scalars(
        select(Incident)
        .where(
            Incident.created_at >= window_start,
            Incident.created_at <= now,
        )
        .order_by(Incident.created_at, Incident.id)
    ).all()

    if not incidents:
        return False

    clusters: list[list[Incident]] = []
    centers: list[tuple[float, float]] = []

    # Deterministic greedy clustering: process oldest to newest and attach
    # each incident to the nearest current centroid within 350 metres.
    for incident in incidents:
        candidates: list[tuple[float, int]] = []

        for index, (center_lat, center_lon) in enumerate(centers):
            distance = distance_meters(
                incident.latitude,
                incident.longitude,
                center_lat,
                center_lon,
            )
            if distance <= CLUSTER_RADIUS_METERS:
                candidates.append((distance, index))

        if not candidates:
            clusters.append([incident])
            centers.append((incident.latitude, incident.longitude))
            continue

        candidates.sort(key=lambda item: (item[0], item[1]))
        chosen_index = candidates[0][1]
        clusters[chosen_index].append(incident)

        members = clusters[chosen_index]
        centers[chosen_index] = (
            sum(item.latitude for item in members) / len(members),
            sum(item.longitude for item in members) / len(members),
        )

    for members in clusters:
        distinct_members = {item.id: item for item in members}
        members = list(distinct_members.values())
        count = len(members)

        latest = max(
            members,
            key=lambda item: (
                utc_naive(item.created_at),
                item.id,
            ),
        )
        last_sos_at = utc_naive(latest.created_at)
        level, radius, score = risk_profile_for_count(count)

        zone = RiskZone(
            name="Pending SOS cluster",
            latitude=sum(item.latitude for item in members) / count,
            longitude=sum(item.longitude for item in members) / count,
            radius_meters=radius,
            risk_level=level,
            score=score,
            is_active=True,
            expires_at=last_sos_at + EXPIRY_DURATION[level],
            cluster_key=str(uuid4()),
            last_sos_at=last_sos_at,
            stage_started_at=last_sos_at,
            last_sos_incident_id=latest.id,
            last_sos_risk_level=level,
        )
        db.add(zone)
        db.flush()
        zone.name = f"SOS Cluster {zone.id}"

    db.commit()
    return True

def record_sos_for_risk_zones(
    db: Session,
    incident: Incident,
    now: datetime | None = None,
) -> RiskZone:
    """
    Recalculate the nearest managed cluster after a newly accepted SOS.

    Call only for a newly inserted, committed Incident. The incident API's
    existing idempotency branch must return duplicates without calling this.

    Cluster membership is evaluated against the existing zone centre and
    the 72-hour server-receipt window. The representative location becomes
    the arithmetic mean of included incident coordinates.
    """
    now = utc_naive(now or datetime.utcnow())

    # If this is the first managed cluster, include existing recent SOS history.
    bootstrap_recent_clusters_if_needed(db, now)

    # Expire overdue managed clusters before looking for a cluster to reuse.
    refresh_risk_zone_decay(db, now)

    window_start = now - ROLLING_WINDOW

    # Protect against accidental duplicate invocation for the most recently
    # incorporated incident. Normal duplicate retries are handled by the
    # incident endpoint before this service is called.
    already_processed = db.scalar(
        select(RiskZone).where(
            RiskZone.last_sos_incident_id == incident.id
        )
    )
    if already_processed is not None:
        return already_processed

    recent_incidents = db.scalars(
        select(Incident)
        .where(
            Incident.created_at >= window_start,
            Incident.created_at <= now,
        )
        .order_by(Incident.created_at, Incident.id)
    ).all()

    managed_zones = db.scalars(
        select(RiskZone).where(
            RiskZone.cluster_key.is_not(None),
            RiskZone.is_active.is_(True),
        )
    ).all()

    candidates: list[tuple[float, RiskZone]] = []
    for zone in managed_zones:
        distance = distance_meters(
            incident.latitude,
            incident.longitude,
            zone.latitude,
            zone.longitude,
        )
        if distance <= CLUSTER_RADIUS_METERS:
            candidates.append((distance, zone))

    if candidates:
        candidates.sort(key=lambda item: (item[0], item[1].id))
        zone = candidates[0][1]
        reference_latitude = zone.latitude
        reference_longitude = zone.longitude
    else:
        zone = RiskZone(
            name="Pending SOS cluster",
            latitude=incident.latitude,
            longitude=incident.longitude,
            radius_meters=RISK_PROFILES["LOW"][0],
            risk_level="LOW",
            score=RISK_PROFILES["LOW"][1],
            is_active=True,
            expires_at=None,
            cluster_key=str(uuid4()),
            last_sos_at=now,
            stage_started_at=now,
            last_sos_incident_id=incident.id,
            last_sos_risk_level="LOW",
        )
        db.add(zone)
        db.flush()
        reference_latitude = incident.latitude
        reference_longitude = incident.longitude

    members = [
        item for item in recent_incidents
        if distance_meters(
            reference_latitude,
            reference_longitude,
            item.latitude,
            item.longitude,
        ) <= CLUSTER_RADIUS_METERS
    ]

    # Ensure this newly accepted incident is counted even if its database
    # timestamp and the supplied test clock fall exactly on a window edge.
    if all(item.id != incident.id for item in members):
        members.append(incident)

    count = len({item.id for item in members})
    level, radius, score = risk_profile_for_count(count)

    zone.latitude = sum(item.latitude for item in members) / count
    zone.longitude = sum(item.longitude for item in members) / count
    zone.name = f"SOS Cluster {zone.id}"
    zone.risk_level = level
    zone.radius_meters = radius
    zone.score = score
    zone.is_active = True
    zone.last_sos_at = now
    zone.stage_started_at = now
    zone.last_sos_incident_id = incident.id
    zone.last_sos_risk_level = level
    zone.expires_at = now + EXPIRY_DURATION[level]

    db.commit()
    db.refresh(zone)
    return zone
