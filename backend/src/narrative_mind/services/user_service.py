import uuid
from datetime import UTC, datetime

from narrative_mind.core.exceptions import AuthenticationError, ConflictError
from narrative_mind.core.security import create_access_token, hash_password, verify_password
from narrative_mind.domain.user import Token, User, UserCreate, UserLogin
from narrative_mind.repositories.user_repo import UserRepository


class AuthService:
    def __init__(self, repo: UserRepository) -> None:
        self._repo = repo

    async def register(self, payload: UserCreate) -> User:
        existing_user = await self._repo.get_by_email(payload.email)

        if existing_user is not None:
            raise ConflictError("A user with this email already exists")

        user_data = {
            "id": str(uuid.uuid4()),
            "email": payload.email,
            "password_hash": hash_password(payload.password),
            "created_at": datetime.now(UTC).isoformat(),
        }

        row = await self._repo.create(user_data)

        return User.model_validate(row)

    async def login(self, payload: UserLogin) -> Token:
        row = await self._repo.get_by_email(payload.email)

        if row is None:
            raise AuthenticationError("Invalid email or password")

        if not verify_password(payload.password, row["password_hash"]):
            raise AuthenticationError("Invalid email or password")

        access_token = create_access_token(row["id"])

        return Token(access_token=access_token)