from fastapi import FastAPI
from sqlalchemy import text
from fastapi import Depends
from fastapi.middleware.cors import CORSMiddleware

from app.core.auth import get_current_user
from app.core.auth import get_current_user
from app.models.user import User
from app.api.auth import router as auth_router
from app.api.incidents import router as incidents_router
from app.api.incident_audio import router as incident_audio_router
from app.api.risk_zones import router as risk_zones_router
from app.api.hazards import router as hazards_router
from app.database.connection import engine
from app.api.command_center import router as command_center_router
from app.api.analytics import router as analytics_router


app = FastAPI(
    title="MoDoNER Tourist Safety Grid API",
    description="Backend API for the MoDoNER Tourist Safety Grid.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(incidents_router)
app.include_router(incident_audio_router)
app.include_router(command_center_router)
app.include_router(risk_zones_router)
app.include_router(hazards_router)
app.include_router(analytics_router)


@app.get("/")
def root():
    return {
        "project": "MoDoNER Tourist Safety Grid",
        "status": "running",
    }


@app.get("/health")
def health_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected",
        }

    except Exception as error:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(error),
        }

@app.get("/auth/me", response_model=dict)
def get_me(
    current_user: User = Depends(get_current_user),
):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "phone": current_user.phone,
        "email": current_user.email,
        "date_of_birth": current_user.date_of_birth,
        "kyc_status": current_user.kyc_status,
    }


