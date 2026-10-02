from fastapi import FastAPI
from sqlalchemy import text
from fastapi import Depends

from app.core.auth import get_current_user
from app.core.auth import get_current_user
from app.models.user import User
from app.api.auth import router as auth_router
from app.api.incidents import router as incidents_router
from app.database.connection import engine
from app.api.command_center import router as command_center_router


app = FastAPI(
    title="MoDoNER Tourist Safety Grid API",
    description="Backend API for the MoDoNER Tourist Safety Grid.",
    version="0.1.0",
)

app.include_router(auth_router)
app.include_router(incidents_router)
app.include_router(command_center_router)


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
        "kyc_status": current_user.kyc_status,
    }

