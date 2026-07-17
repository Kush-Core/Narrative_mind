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


class FactionBase(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        populate_by_name=True,
    )

    name: str = Field(..., min_length=1, max_length=120, examples=["Iron Pact"])
    ideology: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must not be blank")
        return v


class FactionCreate(FactionBase):
    pass


class FactionUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=120)
    ideology: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "FactionUpdate":
        if not self.model_fields_set:
            raise ValueError("update must contain at least one field")
        return self


class Faction(FactionBase):
    id: str = Field(
        default_factory=lambda: str(uuid4()),
        validation_alias=AliasChoices("id", "uuid"),
    )
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
