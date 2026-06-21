import pytest
from pydantic import ValidationError

from codex.domain.character import Character, CharacterCreate, CharacterUpdate


def test_create_strips_and_dedupes() -> None:
    c = CharacterCreate(name="  Aria  ", aliases=["The Vane", "the vane", " "])
    assert c.name == "Aria"
    assert c.aliases == ["The Vane"]


def test_computed_display_name() -> None:
    c = Character(name="Aria", aliases=["The Vane"])
    assert c.display_name == "Aria (The Vane)"
    assert "display_name" in c.model_dump()


def test_empty_update_rejected() -> None:
    with pytest.raises(ValidationError):
        CharacterUpdate()


def test_id_accepts_uuid_alias() -> None:
    c = Character.model_validate({"uuid": "abc", "name": "Aria"})
    assert c.id == "abc"