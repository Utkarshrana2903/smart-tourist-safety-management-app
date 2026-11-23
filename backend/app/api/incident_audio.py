from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_role
from app.database.dependencies import get_db
from app.models.incident import Incident
from app.models.user import User


router = APIRouter(
    prefix="/incidents",
    tags=["Incident Audio"],
)

MAX_AUDIO_BYTES = 5 * 1024 * 1024
AUDIO_DIRECTORY = (
    Path(__file__).resolve().parents[2]
    / "private_storage"
    / "sos_audio"
)

ALLOWED_CONTENT_TYPES = {
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/aac",
    "application/octet-stream",
}


@router.post("/audio", status_code=status.HTTP_201_CREATED)
async def upload_sos_audio(
    local_incident_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("TOURIST")),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        await file.close()
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload an AAC/M4A audio recording.",
        )

    incident = db.scalar(
        select(Incident).where(
            Incident.user_id == current_user.id,
            Incident.local_incident_id == local_incident_id,
        )
    )

    if incident is None:
        await file.close()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The SOS has not reached the server yet. "
                "Keep the audio locally and retry the upload later."
            ),
        )

    AUDIO_DIRECTORY.mkdir(parents=True, exist_ok=True)

    if incident.audio_url:
        existing_name = incident.audio_url
        if Path(existing_name).name == existing_name:
            existing_path = AUDIO_DIRECTORY / existing_name
            if existing_path.is_file():
                await file.close()
                return {
                    "incident_id": incident.id,
                    "status": "already_uploaded",
                    "audio_available": True,
                }

    try:
        audio_bytes = await file.read(MAX_AUDIO_BYTES + 1)
    finally:
        await file.close()

    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The audio recording is empty.",
        )

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio recordings must be 5 MB or smaller.",
        )

    filename = f"{uuid4().hex}.m4a"
    destination = AUDIO_DIRECTORY / filename

    destination.write_bytes(audio_bytes)

    try:
        incident.audio_url = filename
        db.commit()
        db.refresh(incident)
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save the audio reference.",
        )

    return {
        "incident_id": incident.id,
        "status": "uploaded",
        "audio_available": True,
        "size_bytes": len(audio_bytes),
    }


@router.get("/{incident_id}/audio")
def get_sos_audio(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = db.get(Incident, incident_id)

    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found.",
        )

    is_owner = current_user.id == incident.user_id
    is_operator = current_user.role == "COMMAND_CENTER"

    if not is_owner and not is_operator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to access this recording.",
        )

    filename = incident.audio_url

    if not filename or Path(filename).name != filename:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No audio recording is available for this incident.",
        )

    audio_path = AUDIO_DIRECTORY / filename

    if not audio_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The audio recording could not be found.",
        )

    return FileResponse(
        path=audio_path,
        media_type="audio/mp4",
        filename=f"incident-{incident.id}.m4a",
        content_disposition_type="inline",
        headers={"Cache-Control": "private, no-store"},
    )
