from fastapi import APIRouter

from narrative_mind.api.routers import (
    ai,
    characters,
    events,
    factions,
    graph,
    locations,
    rag,
    systems,
    user,
)

api_router = APIRouter()
api_router.include_router(systems.router)
api_router.include_router(characters.router)
api_router.include_router(locations.router)
api_router.include_router(factions.router)
api_router.include_router(events.router)
api_router.include_router(graph.router)
api_router.include_router(ai.router)
api_router.include_router(rag.router)
api_router.include_router(user.router)
