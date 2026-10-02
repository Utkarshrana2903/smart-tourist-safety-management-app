from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.jwt import create_access_token
from app.core.security import verify_password
from app.database.dependencies import get_db
from app.models.user import User
from app.schemas.auth import LoginResponse, UserLogin


router = APIRouter(
    prefix="/command-center",
    tags=["Command Center Authentication"],
)


@router.post(
    "/login",
    response_model=LoginResponse,
)
def command_center_login(
    login_data: UserLogin,
    db: Session = Depends(get_db),
):
    user = db.scalar(
        select(User).where(User.phone == login_data.phone)
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid command center credentials",
        )

    if user.role != "COMMAND_CENTER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is not authorized for command center access",
        )

    if not verify_password(
        login_data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid command center credentials",
        )

    access_token = create_access_token(user.id)

    return LoginResponse(
        access_token=access_token,
        user=user,
    )