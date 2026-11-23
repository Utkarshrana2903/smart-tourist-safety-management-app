import unittest
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.models.user import User
from app.models.incident import Incident
from app.models.incident_event import IncidentEvent
from app.models.risk_zone import RiskZone
from app.schemas.incident import IncidentCreate
from app.api.incidents import create_incident
from app.api.risk_zones import get_risk_zones


class IncidentRiskZoneApiIntegrationTests(unittest.TestCase):
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
            name="Integration Test Tourist",
            phone=f"api-test-{uuid4().hex[:14]}",
            email=None,
            password_hash="test-only-not-a-real-password",
            role="TOURIST",
            kyc_status="APPROVED",
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def create_sos(
        self,
        local_id=None,
        latitude=28.7065,
        longitude=77.4188,
        timestamp=None,
    ):
        payload = IncidentCreate(
            latitude=latitude,
            longitude=longitude,
            timestamp=timestamp or datetime.utcnow(),
            severity="HIGH",
            transmission_method="INTERNET",
            local_incident_id=local_id or f"api-test-{uuid4().hex}",
            emergency_status="ACTIVE",
        )

        return create_incident(
            payload,
            current_user=self.user,
            db=self.db,
        )

    def test_new_api_sos_persists_a_green_cluster(self):
        incident = self.create_sos(local_id="integration-first-sos")

        zones = self.db.scalars(select(RiskZone)).all()

        self.assertEqual(len(zones), 1)
        zone = zones[0]
        self.assertEqual(zone.risk_level, "LOW")
        self.assertEqual(zone.radius_meters, 350.0)
        self.assertTrue(zone.is_active)
        self.assertIsNotNone(zone.cluster_key)
        self.assertEqual(zone.last_sos_incident_id, incident.id)

    def test_duplicate_local_id_does_not_create_another_cluster(self):
        first = self.create_sos(local_id="integration-duplicate-sos")
        zones_before = self.db.scalars(select(RiskZone)).all()
        self.assertEqual(len(zones_before), 1)
        original_last_sos_at = zones_before[0].last_sos_at

        # The same idempotency key represents the same accepted incident.
        repeated = self.create_sos(
            local_id="integration-duplicate-sos",
            timestamp=datetime.utcnow() + timedelta(minutes=1),
        )

        zones_after = self.db.scalars(select(RiskZone)).all()

        self.assertEqual(first.id, repeated.id)
        self.assertEqual(len(zones_after), 1)
        self.assertEqual(zones_after[0].last_sos_at, original_last_sos_at)

    def test_fifth_nearby_sos_promotes_cluster_to_red(self):
        incidents = []

        for index in range(5):
            incident = self.create_sos(
                local_id=f"integration-threshold-{index}",
                timestamp=datetime.utcnow() + timedelta(milliseconds=index),
            )
            incidents.append(incident)

        zones = self.db.scalars(select(RiskZone)).all()

        self.assertEqual(len(zones), 1)
        zone = zones[0]
        self.assertEqual(zone.risk_level, "HIGH")
        self.assertEqual(zone.radius_meters, 150.0)
        self.assertEqual(zone.last_sos_incident_id, incidents[-1].id)
        self.assertEqual(zone.last_sos_risk_level, "HIGH")

    def test_distant_sos_creates_a_separate_cluster(self):
        first = self.create_sos(
            local_id="integration-jaipur",
            latitude=26.9124,
            longitude=75.7873,
        )
        second = self.create_sos(
            local_id="integration-other-location",
            latitude=28.7065,
            longitude=77.4188,
        )

        self.assertNotEqual(first.id, second.id)

        zones = self.db.scalars(
            select(RiskZone).order_by(RiskZone.id)
        ).all()

        self.assertEqual(len(zones), 2)
        self.assertNotEqual(zones[0].cluster_key, zones[1].cluster_key)

    def test_risk_zones_endpoint_advances_red_to_yellow(self):
        start = datetime.utcnow() - timedelta(hours=24, minutes=1)

        zone = RiskZone(
            name="Integration decay zone",
            latitude=28.7065,
            longitude=77.4188,
            radius_meters=150.0,
            risk_level="HIGH",
            score=0.90,
            is_active=True,
            expires_at=start + timedelta(hours=72),
            cluster_key=str(uuid4()),
            last_sos_at=start,
            stage_started_at=start,
            last_sos_incident_id=999,
            last_sos_risk_level="HIGH",
        )
        self.db.add(zone)
        self.db.commit()
        self.db.refresh(zone)

        result = get_risk_zones(db=self.db)
        self.db.refresh(zone)

        self.assertIn(zone.id, [item.id for item in result])
        self.assertEqual(zone.risk_level, "MEDIUM")
        self.assertEqual(zone.radius_meters, 250.0)
        self.assertTrue(zone.is_active)

    def test_risk_zones_endpoint_removes_expired_green_zone(self):
        start = datetime.utcnow() - timedelta(hours=25)

        zone = RiskZone(
            name="Integration expired green zone",
            latitude=28.7065,
            longitude=77.4188,
            radius_meters=350.0,
            risk_level="LOW",
            score=0.20,
            is_active=True,
            expires_at=start + timedelta(hours=24),
            cluster_key=str(uuid4()),
            last_sos_at=start,
            stage_started_at=start,
            last_sos_incident_id=998,
            last_sos_risk_level="LOW",
        )
        self.db.add(zone)
        self.db.commit()
        self.db.refresh(zone)

        result = get_risk_zones(db=self.db)
        self.db.refresh(zone)

        self.assertFalse(zone.is_active)
        self.assertNotIn(zone.id, [item.id for item in result])


if __name__ == "__main__":
    unittest.main()
