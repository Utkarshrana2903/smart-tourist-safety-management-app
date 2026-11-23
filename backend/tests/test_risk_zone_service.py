import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.services.risk_zone_service import (
    advance_zone_decay,
    distance_meters,
    risk_profile_for_count,
    refresh_risk_zone_decay,
)


class RiskProfileTests(unittest.TestCase):
    def test_one_and_two_incidents_are_green(self):
        for count in (1, 2):
            with self.subTest(count=count):
                self.assertEqual(
                    risk_profile_for_count(count),
                    ("LOW", 350.0, 0.20),
                )

    def test_three_and_four_incidents_are_yellow(self):
        for count in (3, 4):
            with self.subTest(count=count):
                self.assertEqual(
                    risk_profile_for_count(count),
                    ("MEDIUM", 250.0, 0.55),
                )

    def test_five_or_more_incidents_are_red(self):
        for count in (5, 6, 20):
            with self.subTest(count=count):
                self.assertEqual(
                    risk_profile_for_count(count),
                    ("HIGH", 150.0, 0.90),
                )


class GeographicDistanceTests(unittest.TestCase):
    def test_same_point_is_zero_distance(self):
        self.assertAlmostEqual(
            distance_meters(26.9124, 75.7873, 26.9124, 75.7873),
            0.0,
            places=6,
        )

    def test_nearby_points_are_close(self):
        distance = distance_meters(
            28.7065, 77.4188,
            28.7064, 77.4188,
        )
        self.assertGreater(distance, 0)
        self.assertLess(distance, 20)


class DecayTests(unittest.TestCase):
    def make_zone(self, level="HIGH", start=None):
        start = start or datetime(2026, 10, 1, 12, 0, 0)
        radii_scores = {
            "HIGH": (150.0, 0.90),
            "MEDIUM": (250.0, 0.55),
            "LOW": (350.0, 0.20),
        }
        radius, score = radii_scores[level]

        return SimpleNamespace(
            cluster_key="test-cluster",
            is_active=True,
            last_sos_at=start,
            stage_started_at=start,
            last_sos_risk_level=level,
            risk_level=level,
            radius_meters=radius,
            score=score,
            expires_at=None,
        )

    def test_red_changes_to_yellow_after_24_hours(self):
        start = datetime(2026, 10, 1, 12, 0, 0)
        zone = self.make_zone("HIGH", start)

        changed = advance_zone_decay(zone, start + timedelta(hours=24))

        self.assertTrue(changed)
        self.assertEqual(zone.risk_level, "MEDIUM")
        self.assertEqual(zone.radius_meters, 250.0)
        self.assertTrue(zone.is_active)

    def test_red_changes_to_green_after_48_hours(self):
        start = datetime(2026, 10, 1, 12, 0, 0)
        zone = self.make_zone("HIGH", start)

        advance_zone_decay(zone, start + timedelta(hours=48))

        self.assertEqual(zone.risk_level, "LOW")
        self.assertEqual(zone.radius_meters, 350.0)
        self.assertTrue(zone.is_active)

    def test_red_expires_after_72_hours(self):
        start = datetime(2026, 10, 1, 12, 0, 0)
        zone = self.make_zone("HIGH", start)

        advance_zone_decay(zone, start + timedelta(hours=72))

        self.assertEqual(zone.risk_level, "LOW")
        self.assertFalse(zone.is_active)
        self.assertEqual(zone.expires_at, start + timedelta(hours=72))

    def test_green_expires_after_24_hours(self):
        start = datetime(2026, 10, 1, 12, 0, 0)
        zone = self.make_zone("LOW", start)

        advance_zone_decay(zone, start + timedelta(hours=24))

        self.assertFalse(zone.is_active)
        self.assertEqual(zone.expires_at, start + timedelta(hours=24))

    def test_yellow_expires_after_48_hours(self):
        start = datetime(2026, 10, 1, 12, 0, 0)
        zone = self.make_zone("MEDIUM", start)

        advance_zone_decay(zone, start + timedelta(hours=48))

        self.assertEqual(zone.risk_level, "LOW")
        self.assertFalse(zone.is_active)
        self.assertEqual(zone.expires_at, start + timedelta(hours=48))

    def test_legacy_zone_is_not_decayed(self):
        start = datetime(2026, 10, 1, 12, 0, 0)
        zone = self.make_zone("HIGH", start)
        zone.cluster_key = None

        changed = advance_zone_decay(zone, start + timedelta(days=5))

        self.assertFalse(changed)
        self.assertEqual(zone.risk_level, "HIGH")
        self.assertTrue(zone.is_active)


    def test_refresh_processes_every_zone_when_first_zone_changes(self):
        start = datetime(2026, 10, 1, 12, 0, 0)
        first = self.make_zone("HIGH", start)
        second = self.make_zone("HIGH", start)

        class FakeResult:
            def __init__(self, zones):
                self.zones = zones

            def all(self):
                return self.zones

        class FakeSession:
            def __init__(self, zones):
                self.zones = zones
                self.commits = 0

            def scalars(self, statement):
                return FakeResult(self.zones)

            def commit(self):
                self.commits += 1

        db = FakeSession([first, second])

        refresh_risk_zone_decay(db, start + timedelta(hours=24))

        self.assertEqual(first.risk_level, "MEDIUM")
        self.assertEqual(second.risk_level, "MEDIUM")
        self.assertEqual(db.commits, 1)
if __name__ == "__main__":
    unittest.main()
