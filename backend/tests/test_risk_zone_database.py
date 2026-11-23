import unittest
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.models.user import User
from app.models.incident import Incident
from app.models.risk_zone import RiskZone
from app.services.risk_zone_service import (
    bootstrap_recent_clusters_if_needed,
    record_sos_for_risk_zones,
    refresh_risk_zone_decay,
)


class RiskZoneDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)

        self.Session = sessionmaker(
            bind=self.engine,
            expire_on_commit=False,
        )
        self.db = self.Session()

        self.user = User(
            name="Risk Zone Test Tourist",
            phone=f"test-{uuid4().hex[:14]}",
            email=None,
            password_hash="test-only-not-a-real-password",
            role="TOURIST",
            kyc_status="APPROVED",
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        self.base_time = datetime(2026, 10, 15, 12, 0, 0)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def add_incident(
        self,
        index,
        when,
        latitude=26.9124,
        longitude=75.7873,
    ):
        incident = Incident(
            user_id=self.user.id,
            local_incident_id=f"test-{uuid4().hex}",
            latitude=latitude,
            longitude=longitude,
            timestamp=when,
            created_at=when,
            severity="HIGH",
            status="CREATED",
            transmission_method="INTERNET",
        )
        self.db.add(incident)
        self.db.commit()
        self.db.refresh(incident)
        return incident

    def add_zone(
        self,
        *,
        key,
        level,
        started,
        last_incident_id=999,
        active=True,
    ):
        radii_scores = {
            "HIGH": (150.0, 0.90),
            "MEDIUM": (250.0, 0.55),
            "LOW": (350.0, 0.20),
        }
        radius, score = radii_scores[level]
        lifetime = {"HIGH": 72, "MEDIUM": 48, "LOW": 24}[level]

        zone = RiskZone(
            name=f"Test zone {key}",
            latitude=26.9124,
            longitude=75.7873,
            radius_meters=radius,
            risk_level=level,
            score=score,
            is_active=active,
            expires_at=started + timedelta(hours=lifetime),
            cluster_key=key,
            last_sos_at=started,
            stage_started_at=started,
            last_sos_incident_id=last_incident_id,
            last_sos_risk_level=level,
        )
        self.db.add(zone)
        self.db.commit()
        self.db.refresh(zone)
        return zone

    def test_counts_progress_through_all_three_tiers(self):
        expected = {
            1: ("LOW", 350.0),
            2: ("LOW", 350.0),
            3: ("MEDIUM", 250.0),
            4: ("MEDIUM", 250.0),
            5: ("HIGH", 150.0),
        }

        zone_id = None
        zone = None

        for count in range(1, 6):
            when = self.base_time + timedelta(minutes=count)
            incident = self.add_incident(count, when)
            zone = record_sos_for_risk_zones(
                self.db,
                incident,
                now=when,
            )

            with self.subTest(count=count):
                self.assertEqual(
                    (zone.risk_level, zone.radius_meters),
                    expected[count],
                )
                if zone_id is None:
                    zone_id = zone.id
                else:
                    self.assertEqual(zone.id, zone_id)

        self.assertEqual(zone.last_sos_incident_id, incident.id)
        self.assertEqual(zone.last_sos_risk_level, "HIGH")

    def test_reprocessing_latest_incident_does_not_increase_count(self):
        when = self.base_time
        incident = self.add_incident(1, when)

        first = record_sos_for_risk_zones(self.db, incident, now=when)
        original_last_sos = first.last_sos_at

        repeated = record_sos_for_risk_zones(
            self.db,
            incident,
            now=when + timedelta(minutes=1),
        )

        self.assertEqual(first.id, repeated.id)
        self.assertEqual(repeated.last_sos_at, original_last_sos)
        self.assertEqual(
            len(self.db.scalars(select(RiskZone)).all()),
            1,
        )

    def test_distant_incident_creates_separate_cluster(self):
        first_time = self.base_time
        first_incident = self.add_incident(1, first_time)
        first_zone = record_sos_for_risk_zones(
            self.db,
            first_incident,
            now=first_time,
        )

        second_time = first_time + timedelta(minutes=2)
        second_incident = self.add_incident(
            2,
            second_time,
            latitude=28.7065,
            longitude=77.4188,
        )
        second_zone = record_sos_for_risk_zones(
            self.db,
            second_incident,
            now=second_time,
        )

        self.assertNotEqual(first_zone.id, second_zone.id)
        self.assertNotEqual(first_zone.cluster_key, second_zone.cluster_key)
        self.assertEqual(
            len(self.db.scalars(select(RiskZone)).all()),
            2,
        )

    def test_incident_older_than_72_hours_is_not_counted(self):
        old_time = self.base_time - timedelta(hours=73)
        old_incident = self.add_incident(1, old_time)

        current_time = self.base_time
        current_incident = self.add_incident(2, current_time)

        zone = record_sos_for_risk_zones(
            self.db,
            current_incident,
            now=current_time,
        )

        self.assertEqual(zone.risk_level, "LOW")
        self.assertEqual(zone.radius_meters, 350.0)
        self.assertNotEqual(zone.last_sos_incident_id, old_incident.id)

    def test_expired_cluster_is_not_reused(self):
        now = self.base_time
        stale_time = now - timedelta(hours=73)
        stale = self.add_zone(
            key="stale-test-cluster",
            level="HIGH",
            started=stale_time,
            active=True,
        )

        incident = self.add_incident(1, now)
        new_zone = record_sos_for_risk_zones(
            self.db,
            incident,
            now=now,
        )

        self.db.refresh(stale)
        self.assertFalse(stale.is_active)
        self.assertNotEqual(new_zone.id, stale.id)
        self.assertTrue(new_zone.is_active)
        self.assertEqual(new_zone.risk_level, "LOW")

    def test_decay_is_persisted_to_database(self):
        start = self.base_time
        zone = self.add_zone(
            key="decay-test-cluster",
            level="HIGH",
            started=start,
        )

        refresh_risk_zone_decay(
            self.db,
            now=start + timedelta(hours=24),
        )
        self.db.refresh(zone)

        self.assertEqual(zone.risk_level, "MEDIUM")
        self.assertEqual(zone.radius_meters, 250.0)
        self.assertTrue(zone.is_active)

    def test_legacy_demo_zone_is_not_decayed(self):
        start = self.base_time
        zone = RiskZone(
            name="Legacy demo zone",
            latitude=26.9124,
            longitude=75.7873,
            radius_meters=180.0,
            risk_level="HIGH",
            score=0.9,
            is_active=True,
            expires_at=None,
            cluster_key=None,
            last_sos_at=None,
            stage_started_at=None,
            last_sos_incident_id=None,
            last_sos_risk_level=None,
        )
        self.db.add(zone)
        self.db.commit()
        self.db.refresh(zone)

        refresh_risk_zone_decay(
            self.db,
            now=start + timedelta(days=5),
        )
        self.db.refresh(zone)

        self.assertTrue(zone.is_active)
        self.assertEqual(zone.risk_level, "HIGH")


    def test_new_sos_resets_decay_clock_and_recalculates_tier(self):
        start = self.base_time

        # Four recent accepted reports, with the last one one hour before start.
        prior_incidents = [
            self.add_incident(i, start - timedelta(hours=5 - i))
            for i in range(1, 5)
        ]

        zone = self.add_zone(
            key="decaying-cluster",
            level="HIGH",
            started=start - timedelta(hours=1),
            last_incident_id=prior_incidents[-1].id,
        )

        now = start + timedelta(hours=24)
        new_incident = self.add_incident(5, now)

        refreshed = record_sos_for_risk_zones(
            self.db,
            new_incident,
            now=now,
        )

        self.assertEqual(refreshed.id, zone.id)
        self.assertEqual(refreshed.risk_level, "HIGH")
        self.assertEqual(refreshed.radius_meters, 150.0)
        self.assertEqual(refreshed.last_sos_at, now)
        self.assertEqual(refreshed.stage_started_at, now)
        self.assertEqual(refreshed.last_sos_incident_id, new_incident.id)
        self.assertEqual(
            refreshed.expires_at,
            now + timedelta(hours=72),
        )

    def test_future_dated_incidents_are_not_counted(self):
        now = self.base_time

        # A future record must not influence the present rolling count.
        self.add_incident(1, now + timedelta(hours=24))
        current_incident = self.add_incident(2, now)

        zone = record_sos_for_risk_zones(
            self.db,
            current_incident,
            now=now,
        )

        self.assertEqual(zone.risk_level, "LOW")
        self.assertEqual(zone.radius_meters, 350.0)
        self.assertEqual(zone.last_sos_incident_id, current_incident.id)
    def test_bootstrap_builds_recent_clusters_and_preserves_legacy_zone(self):
        now = self.base_time + timedelta(hours=2)

        # Legacy demo zone: it must remain untouched.
        legacy = RiskZone(
            name="Legacy demo zone",
            latitude=26.9124,
            longitude=75.7873,
            radius_meters=180.0,
            risk_level="HIGH",
            score=0.9,
            is_active=True,
            expires_at=None,
            cluster_key=None,
            last_sos_at=None,
            stage_started_at=None,
            last_sos_incident_id=None,
            last_sos_risk_level=None,
        )
        self.db.add(legacy)
        self.db.commit()
        self.db.refresh(legacy)

        # Five recent incidents in one area -> red, plus one distant -> green.
        near_incidents = []
        for index in range(5):
            near_incidents.append(
                self.add_incident(
                    index + 1,
                    self.base_time + timedelta(minutes=index + 1),
                    latitude=26.9124,
                    longitude=75.7873,
                )
            )

        self.add_incident(
            6,
            self.base_time + timedelta(minutes=6),
            latitude=28.7065,
            longitude=77.4188,
        )

        # Outside the 72-hour window: these must not raise either cluster's count.
        self.add_incident(
            7,
            now - timedelta(hours=73),
            latitude=26.9124,
            longitude=75.7873,
        )
        self.add_incident(
            8,
            now + timedelta(hours=1),
            latitude=26.9124,
            longitude=75.7873,
        )

        created = bootstrap_recent_clusters_if_needed(self.db, now=now)
        self.assertTrue(created)

        zones = self.db.scalars(
            select(RiskZone).order_by(RiskZone.id)
        ).all()
        managed = [zone for zone in zones if zone.cluster_key is not None]

        self.assertEqual(len(managed), 2)
        self.assertEqual(len(zones), 3)
        self.assertTrue(legacy.is_active)
        self.assertEqual(legacy.risk_level, "HIGH")
        self.assertIsNone(legacy.cluster_key)

        red_zones = [zone for zone in managed if zone.risk_level == "HIGH"]
        green_zones = [zone for zone in managed if zone.risk_level == "LOW"]

        self.assertEqual(len(red_zones), 1)
        self.assertEqual(red_zones[0].radius_meters, 150.0)
        self.assertEqual(red_zones[0].last_sos_risk_level, "HIGH")
        self.assertEqual(
            red_zones[0].last_sos_incident_id,
            near_incidents[-1].id,
        )

        self.assertEqual(len(green_zones), 1)
        self.assertEqual(green_zones[0].radius_meters, 350.0)

        # Bootstrap must be a one-time operation, not a refresh-time recreator.
        self.assertFalse(
            bootstrap_recent_clusters_if_needed(self.db, now=now)
        )
        self.assertEqual(
            len(self.db.scalars(select(RiskZone)).all()),
            3,
        )

    def test_inactive_managed_zone_prevents_bootstrap_recreation(self):
        now = self.base_time + timedelta(hours=1)
        self.add_incident(1, self.base_time)

        self.add_zone(
            key="already-expired-managed-zone",
            level="LOW",
            started=self.base_time - timedelta(days=3),
            active=False,
        )

        created = bootstrap_recent_clusters_if_needed(self.db, now=now)

        self.assertFalse(created)
        managed = self.db.scalars(
            select(RiskZone).where(RiskZone.cluster_key.is_not(None))
        ).all()
        self.assertEqual(len(managed), 1)
        self.assertEqual(
            managed[0].cluster_key,
            "already-expired-managed-zone",
        )
if __name__ == "__main__":
    unittest.main()
