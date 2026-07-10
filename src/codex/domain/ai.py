from pydantic import BaseModel, Field


class DescribeRequest(BaseModel):
    name: str
    traits: list[str] = Field(default_factory=list)
    tone: str = Field(default="neutral", examples=["heroic", "ominous", "neutral"])


class DescribeResponse(BaseModel):
    description: str


class ExtractRequest(BaseModel):
    passage: str = Field(..., min_length=10, max_length=5000)


class ExtractedEntity(BaseModel):
    name: str
    type: str = Field(..., description="Character | Location | Faction | Event")


class ExtractedRelationship(BaseModel):
    source: str
    rel_type: str
    target: str


class ExtractResponse(BaseModel):
    entities: list[ExtractedEntity] = Field(default_factory=list)
    relationships: list[ExtractedRelationship] = Field(default_factory=list)