from datetime import UTC, datetime
from uuid import uuid4

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from codex.domain.common import CharacterStatus


class CharacterBase(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        populate_by_name=True,
        use_enum_values=True,
    )

    name: str = Field(..., min_length=1, max_length=120, examples=["Aria Vane"])
    aliases: list[str] = Field(default_factory=list, max_length=10)
    status: CharacterStatus = CharacterStatus.alive
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must not be blank")
        return v

    @field_validator("aliases")
    @classmethod
    def dedupe_aliases(cls, v: list[str]) -> list[str]:
        seen, out = set(), []
        for a in v:
            a = a.strip()
            if a and a.lower() not in seen:
                seen.add(a.lower())
                out.append(a)
        return out


class CharacterCreate(CharacterBase):
    pass


class CharacterUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, use_enum_values=True)

    name: str | None = Field(default=None, min_length=1, max_length=120)
    aliases: list[str] | None = Field(default=None, max_length=10)
    status: CharacterStatus | None = None
    description: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "CharacterUpdate":
        if not self.model_dump(exclude_none=True):
            raise ValueError("update must contain at least one field")
        return self


class Character(CharacterBase):
    id: str = Field(
        default_factory=lambda: str(uuid4()),
        validation_alias=AliasChoices("id", "uuid"),
    )
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())

    @computed_field
    @property
    def display_name(self) -> str:
        primary = self.aliases[0] if self.aliases else None
        return f"{self.name} ({primary})" if primary else self.name


class CharacterRelationshipCreate(BaseModel):
    rel_type: str = Field(..., examples=["MEMBER_OF", "KNOWS", "LOCATED_IN"])
    target_id: str
    sentiment: str | None = Field(default=None, description="Only meaningful for KNOWS edges.")
