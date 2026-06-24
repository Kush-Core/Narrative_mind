from typing import Annotated

from fastapi import Depends
from neo4j import AsyncSession

from codex.core.config import Settings, get_settings
from codex.db.neo4j import get_session
from codex.repositories.character_repo import CharacterRepository

Settings_Dep = Annotated[Settings, Depends(get_settings)]

Session_Dep = Annotated[AsyncSession, Depends(get_session)]

def get_character_repository(session: Session_Dep) -> CharacterRepository:
    return CharacterRepository(session)

CharacterRepository_Dep = Annotated[CharacterRepository, Depends(get_character_repository)]