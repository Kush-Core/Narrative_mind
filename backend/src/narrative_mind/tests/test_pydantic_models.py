import pytest
from pydantic import ValidationError

from narrative_mind.domain.character import Character, CharacterCreate, CharacterUpdate
from narrative_mind.domain.event import Event, EventUpdate
from narrative_mind.domain.faction import FactionUpdate
from narrative_mind.domain.location import Location, LocationUpdate


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


def test_location_empty_update_rejected() -> None:
    with pytest.raises(ValidationError):
        LocationUpdate()


def test_location_id_accepts_uuid_alias() -> None:
    location = Location.model_validate({"uuid": "loc-1", "name": "Dunhollow"})
    assert location.id == "loc-1"


def test_faction_empty_update_rejected() -> None:
    with pytest.raises(ValidationError):
        FactionUpdate()


def test_event_empty_update_rejected() -> None:
    with pytest.raises(ValidationError):
        EventUpdate()


def test_event_defaults_timeline_order() -> None:
    event = Event(name="The Sundering")
    assert event.timeline_order == 0
    assert "id" in event.model_dump()
