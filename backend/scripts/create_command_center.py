
import getpass
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.security import hash_password
from app.database.connection import SessionLocal
from app.models.user import User


def main():
    print("\n=== Create MoDoNER Command Center Account ===\n")

    name = input("Command center user's name: ").strip()
    phone = input("Login phone number: ").strip()
    email = input("Email (optional, press Enter to skip): ").strip()
    password = getpass.getpass("Password (hidden): ")
    confirm_password = getpass.getpass("Confirm password: ")

    if len(name) < 2:
        print("Error: Name must contain at least 2 characters.")
        return

    if not 10 <= len(phone) <= 20:
        print("Error: Phone number must contain 10–20 characters.")
        return

    if password != confirm_password:
        print("Error: Passwords do not match.")
        return

    if len(password) < 8:
        print("Error: Password must contain at least 8 characters.")
        return

    if email == "":
        email = None

    with SessionLocal() as db:
        existing_phone = db.scalar(
            select(User).where(User.phone == phone)
        )

        if existing_phone is not None:
            print("Error: This phone number is already registered.")
            return

        if email is not None:
            existing_email = db.scalar(
                select(User).where(User.email == email)
            )

            if existing_email is not None:
                print("Error: This email is already registered.")
                return

        command_center_user = User(
            name=name,
            phone=phone,
            email=email,
            password_hash=hash_password(password),
            role="COMMAND_CENTER",
        )

        try:
            db.add(command_center_user)
            db.commit()
            db.refresh(command_center_user)
        except Exception:
            db.rollback()
            raise

        print("\nCommand Center account created successfully.")
        print(f"User ID: {command_center_user.id}")
        print(f"Name: {command_center_user.name}")
        print(f"Role: {command_center_user.role}")
        print("Password stored as a secure hash, not plaintext.")


if __name__ == "__main__":
    main()