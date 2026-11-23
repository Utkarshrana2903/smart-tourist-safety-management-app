from sqlalchemy import select

from app.database.connection import SessionLocal
from app.models.risk_zone import RiskZone


DEMO_ZONES = [
    {
        "name": "Demo High Risk Zone",
        "latitude": 26.9124,
        "longitude": 75.7873,
        "radius_meters": 180,
        "risk_level": "HIGH",
        "score": 0.90,
    },
    {
        "name": "Demo Moderate Risk Zone",
        "latitude": 26.9095,
        "longitude": 75.7840,
        "radius_meters": 250,
        "risk_level": "MEDIUM",
        "score": 0.55,
    },
    {
        "name": "Demo Low Risk Zone",
        "latitude": 26.9174,
        "longitude": 75.7833,
        "radius_meters": 350,
        "risk_level": "LOW",
        "score": 0.20,
    },
]


def seed_risk_zones() -> None:
    db = SessionLocal()

    try:
        for zone_data in DEMO_ZONES:
            existing_zone = db.scalar(
                select(RiskZone).where(
                    RiskZone.name == zone_data["name"]
                )
            )

            if existing_zone is not None:
                print(
                    f"Already exists: {zone_data['name']}"
                )
                continue

            zone = RiskZone(
                **zone_data,
                is_active=True,
            )

            db.add(zone)

        db.commit()

        print("Risk zone seeding completed.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    seed_risk_zones()