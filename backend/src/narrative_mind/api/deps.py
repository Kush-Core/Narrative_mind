from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from neo4j import AsyncSession

from narrative_mind.core.config import Settings, get_settings
from narrative_mind.core.security import decode_access_token
from narrative_mind.db.neo4j import get_session
from narrative_mind.domain.user import User
from narrative_mind.providers.deps import LLMDep
from narrative_mind.repositories.character_repo import CharacterRepository
from narrative_mind.repositories.event_repo import EventRepository
from narrative_mind.repositories.faction_repo import FactionRepository
from narrative_mind.repositories.graph_repo import GraphRepository
from narrative_mind.repositories.location_repo import LocationRepository
from narrative_mind.repositories.user_repo import UserRepository
from narrative_mind.repositories.world_repo import WorldRepository
from narrative_mind.services.ai_service import AIService
from narrative_mind.services.character_service import CharacterService
from narrative_mind.services.event_service import EventService
from narrative_mind.services.faction_service import FactionService
from narrative_mind.services.graph_service import GraphService
from narrative_mind.services.location_service import LocationService
from narrative_mind.services.user_service import AuthService

Settings_Dep = Annotated[Settings, Depends(get_settings)]

Session_Dep = Annotated[AsyncSession, Depends(get_session)]

security = HTTPBearer()


def get_user_repository(session: Session_Dep) -> UserRepository:
    return UserRepository(session)


UserRepository_Dep = Annotated[
    UserRepository,
    Depends(get_user_repository),
]


def get_world_repository(session: Session_Dep) -> WorldRepository:
    return WorldRepository(session)


WorldRepository_Dep = Annotated[
    WorldRepository,
    Depends(get_world_repository),
]


# Defined here, above the owner-scoped repositories, because they depend on it.
async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials,
        Depends(security),
    ],
    repo: UserRepository_Dep,
) -> User:
    try:
        payload = decode_access_token(credentials.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await repo.get_by_id(user_id)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return User.model_validate(user)


CurrentUserDep = Annotated[User, Depends(get_current_user)]


# --------------------------------------------------------------------- worlds
#
# Every world is owned. The five repositories below are constructed with the
# authenticated user's id and filter every query by it, so one account cannot
# read, edit, delete, or traverse into another's entities.
#
# The owner is a *constructor* argument rather than a parameter on each method,
# which is what keeps the change contained: services and routers pass nothing
# and know nothing, and no future method can forget to scope itself because a
# repository cannot exist without an owner to be scoped to. Depending on
# `OwnerDep` here also makes authentication structural — these routes were
# already token-gated, but now a repository is simply unobtainable without a
# valid token, rather than gated by a decorator someone has to remember.
#
# UserRepository and WorldRepository are deliberately *not* scoped this way.
# UserRepository is what resolves the current user, so scoping it by the current
# user would be a dependency cycle; WorldRepository serves registration, where
# the owner is a user created moments ago and not yet authenticated.


async def get_owner_id(current_user: CurrentUserDep) -> str:
    return current_user.id


OwnerDep = Annotated[str, Depends(get_owner_id)]


def get_character_repository(session: Session_Dep, owner_id: OwnerDep) -> CharacterRepository:
    return CharacterRepository(session, owner_id)


CharacterRepository_Dep = Annotated[
    CharacterRepository,
    Depends(get_character_repository),
]


def get_location_repository(session: Session_Dep, owner_id: OwnerDep) -> LocationRepository:
    return LocationRepository(session, owner_id)


LocationRepository_Dep = Annotated[
    LocationRepository,
    Depends(get_location_repository),
]


def get_faction_repository(session: Session_Dep, owner_id: OwnerDep) -> FactionRepository:
    return FactionRepository(session, owner_id)


FactionRepository_Dep = Annotated[
    FactionRepository,
    Depends(get_faction_repository),
]


def get_event_repository(session: Session_Dep, owner_id: OwnerDep) -> EventRepository:
    return EventRepository(session, owner_id)


EventRepository_Dep = Annotated[
    EventRepository,
    Depends(get_event_repository),
]


def get_graph_repository(session: Session_Dep, owner_id: OwnerDep) -> GraphRepository:
    return GraphRepository(session, owner_id)


GraphRepository_Dep = Annotated[
    GraphRepository,
    Depends(get_graph_repository),
]


@dataclass
class Pagination:
    limit: int
    offset: int


def pagination_params(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Pagination:
    return Pagination(limit=limit, offset=offset)


PaginationDep = Annotated[Pagination, Depends(pagination_params)]


def get_character_service(repo: CharacterRepository_Dep) -> CharacterService:
    return CharacterService(repo)


CharacterService_Dep = Annotated[
    CharacterService,
    Depends(get_character_service),
]


def get_location_service(repo: LocationRepository_Dep) -> LocationService:
    return LocationService(repo)


LocationService_Dep = Annotated[
    LocationService,
    Depends(get_location_service),
]


def get_faction_service(repo: FactionRepository_Dep) -> FactionService:
    return FactionService(repo)


FactionService_Dep = Annotated[
    FactionService,
    Depends(get_faction_service),
]


def get_event_service(repo: EventRepository_Dep) -> EventService:
    return EventService(repo)


EventService_Dep = Annotated[
    EventService,
    Depends(get_event_service),
]


def get_graph_service(repo: GraphRepository_Dep) -> GraphService:
    return GraphService(repo)


GraphService_Dep = Annotated[
    GraphService,
    Depends(get_graph_service),
]


def get_ai_service(llm: LLMDep) -> AIService:
    return AIService(llm)


AIServiceDep = Annotated[AIService, Depends(get_ai_service)]


def get_auth_service(
    repo: UserRepository_Dep,
    world: WorldRepository_Dep,
    settings: Settings_Dep,
) -> AuthService:
    return AuthService(repo, world, seed_starter_world=settings.seed_new_user_world)


AuthService_Dep = Annotated[
    AuthService,
    Depends(get_auth_service),
]
