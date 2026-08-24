import uuid
from datetime import UTC, datetime

from narrative_mind.core.exceptions import AuthenticationError, ConflictError
from narrative_mind.core.security import create_access_token, hash_password, verify_password
from narrative_mind.domain.starter_world_embeddings import load as load_starter_world_embeddings
from narrative_mind.domain.user import Token, User, UserCreate, UserLogin
from narrative_mind.providers.embeddings import EmbeddingProvider
from narrative_mind.repositories.user_repo import UserRepository
from narrative_mind.repositories.world_repo import WorldRepository


class AuthService:
    def __init__(
        self,
        repo: UserRepository,
        world_repo: WorldRepository,
        embedder: EmbeddingProvider,
        *,
        seed_starter_world: bool = True,
    ) -> None:
        self._repo = repo
        self._world_repo = world_repo
        self._embedder = embedder
        self._seed_starter_world = seed_starter_world

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
        user = User.model_validate(row)

        # After the account exists, not before: a world with no owner to read it
        # is unreachable, and seeding first would leave one behind if the account
        # then failed to be created. The seed is its own transaction, so a failure
        # here leaves a usable account with an empty world rather than no account.
        if self._seed_starter_world:
            embeddings = load_starter_world_embeddings(self._embedder.model_name)
            await self._world_repo.seed_starter_world(
                user.id, embeddings=embeddings, embedding_model=self._embedder.model_name
            )

        return user

    async def login(self, payload: UserLogin) -> Token:
        row = await self._repo.get_by_email(payload.email)

        if row is None:
            raise AuthenticationError("Invalid email or password")

        if not verify_password(payload.password, row["password_hash"]):
            raise AuthenticationError("Invalid email or password")

        access_token = create_access_token(row["id"])

        return Token(access_token=access_token)
