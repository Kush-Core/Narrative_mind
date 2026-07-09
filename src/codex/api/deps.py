from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query
from neo4j import AsyncSession

from codex.core.config import Settings, get_settings
from codex.db.neo4j import get_session
from codex.repositories.character_repo import CharacterRepository
from codex.services.character_service import CharacterService

Settings_Dep = Annotated[Settings, Depends(get_settings)]

Session_Dep = Annotated[AsyncSession, Depends(get_session)]

def get_character_repository(session: Session_Dep) -> CharacterRepository:
    return CharacterRepository(session)

CharacterRepository_Dep = Annotated[CharacterRepository, Depends(get_character_repository)]

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