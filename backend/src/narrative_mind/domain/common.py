from enum import StrEnum

from pydantic import BaseModel, Field


class CharacterStatus(StrEnum):
    alive = "alive"
    dead = "dead"
    unknown = "unknown"


class SortOrder(StrEnum):
    asc = "asc"
    desc = "desc"


class Page[T](BaseModel):
    items: list[T]
    total: int = Field(..., description="Total rows matching the query, ignoring paging.")
    limit: int
    offset: int

    @property
    def has_more(self) -> bool:
        return self.offset + len(self.items) < self.total
