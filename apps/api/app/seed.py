import argparse
import asyncio

from sqlalchemy import select

from app.core.config import Environment, get_settings
from app.core.security import hash_password
from app.db.base import utcnow
from app.db.session import Database
from app.models.user import User
from app.services.auth import check_password_strength, normalize_email


async def seed(email: str, password: str, display_name: str, admin: bool) -> str:
    settings = get_settings()
    if settings.environment is Environment.PRODUCTION:
        raise SystemExit("Seeding is disabled in production.")
    address = normalize_email(email)
    check_password_strength(password, address)
    database = Database(settings)
    try:
        async with database.sessionmaker() as session:
            existing = await session.scalar(select(User).where(User.email == address))
            if existing is not None:
                existing.is_admin = admin or existing.is_admin
                await session.commit()
                return f"User {address} already exists"
            session.add(
                User(
                    email=address,
                    display_name=display_name,
                    password_hash=hash_password(password),
                    email_verified_at=utcnow(),
                    is_admin=admin,
                )
            )
            await session.commit()
            return f"Created {'admin' if admin else 'user'} {address}"
    finally:
        await database.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a local development account")
    parser.add_argument("--email", default="demo@pdfnova.local")
    parser.add_argument("--password", default="Sample-Passphrase-2026!")
    parser.add_argument("--name", default="Demo")
    parser.add_argument("--admin", action="store_true")
    arguments = parser.parse_args()
    print(asyncio.run(seed(arguments.email, arguments.password, arguments.name, arguments.admin)))


if __name__ == "__main__":
    main()
