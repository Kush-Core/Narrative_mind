from datetime import UTC, datetime
from uuid import uuid4

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class EventBase(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        populate_by_name=True,
    )

    name: str = Field(..., min_length=1, max_length=120, examples=["The Sundering"])
    summary: str | None = Field(default=None, max_length=2000)
    timeline_order: int = Field(
        default=0, description="Relative ordering of the event on the world timeline."
    )

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must not be blank")
        return v


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=120)
    summary: str | None = Field(default=None, max_length=2000)
    timeline_order: int | None = Field(default=None)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "EventUpdate":
        if not self.model_fields_set:
            raise ValueError("update must contain at least one field")
        return self


class Event(EventBase):
    id: str = Field(
        default_factory=lambda: str(uuid4()),
        validation_alias=AliasChoices("id", "uuid"),
    )
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
