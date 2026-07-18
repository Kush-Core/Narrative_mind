from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query
from neo4j import AsyncSession

from narrative_mind.core.config import Settings, get_settings
from narrative_mind.db.neo4j import get_session
from narrative_mind.providers.deps import LLMDep
from narrative_mind.repositories.character_repo import CharacterRepository
from narrative_mind.repositories.event_repo import EventRepository
from narrative_mind.repositories.faction_repo import FactionRepository
from narrative_mind.repositories.graph_repo import GraphRepository
from narrative_mind.repositories.location_repo import LocationRepository
from narrative_mind.services.ai_service import AIService
from narrative_mind.services.character_service import CharacterService
from narrative_mind.services.event_service import EventService
from narrative_mind.services.faction_service import FactionService
from narrative_mind.services.graph_service import GraphService
from narrative_mind.services.location_service import LocationService

Settings_Dep = Annotated[Settings, Depends(get_settings)]

Session_Dep = Annotated[AsyncSession, Depends(get_session)]


def get_character_repository(session: Session_Dep) -> CharacterRepository:
    return CharacterRepository(session)


CharacterRepository_Dep = Annotated[CharacterRepository, Depends(get_character_repository)]


def get_location_repository(session: Session_Dep) -> LocationRepository:
    return LocationRepository(session)


LocationRepository_Dep = Annotated[LocationRepository, Depends(get_location_repository)]


def get_faction_repository(session: Session_Dep) -> FactionRepository:
    return FactionRepository(session)


FactionRepository_Dep = Annotated[FactionRepository, Depends(get_faction_repository)]


def get_event_repository(session: Session_Dep) -> EventRepository:
    return EventRepository(session)


EventRepository_Dep = Annotated[EventRepository, Depends(get_event_repository)]


def get_graph_repository(session: Session_Dep) -> GraphRepository:
    return GraphRepository(session)


GraphRepository_Dep = Annotated[GraphRepository, Depends(get_graph_repository)]


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


CharacterService_Dep = Annotated[CharacterService, Depends(get_character_service)]


def get_location_service(repo: LocationRepository_Dep) -> LocationService:
    return LocationService(repo)


LocationService_Dep = Annotated[LocationService, Depends(get_location_service)]


def get_faction_service(repo: FactionRepository_Dep) -> FactionService:
    return FactionService(repo)


FactionService_Dep = Annotated[FactionService, Depends(get_faction_service)]


def get_event_service(repo: EventRepository_Dep) -> EventService:
    return EventService(repo)


EventService_Dep = Annotated[EventService, Depends(get_event_service)]


def get_graph_service(repo: GraphRepository_Dep) -> GraphService:
    return GraphService(repo)


GraphService_Dep = Annotated[GraphService, Depends(get_graph_service)]


def get_ai_service(llm: LLMDep) -> AIService:
    return AIService(llm)


AIServiceDep = Annotated[AIService, Depends(get_ai_service)]
