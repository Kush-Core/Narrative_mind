"""Reset one account's world back to the starter world.

Usage (from backend/):
    uv run python scripts/seed_world.py someone@example.com

Worlds are owned per account, and every new registration already gets its own
copy of the starter world, so this script is no longer how a world first appears
— it is how one is put back after being edited or emptied. It therefore needs to
know *whose* world to reset, and takes the account's email to find out.

It deletes only that owner's Character, Location, Faction and Event nodes. Other
accounts' worlds and every `:User` node, including the target's own login, are
left untouched.

The data itself lives in narrative_mind.domain.starter_world and the Cypher in
narrative_mind.repositories.world_repo, both shared with the registration path,
so a world reset here is identical to the one a new account is given.
"""

import asyncio
import sys

from neo4j import AsyncGraphDatabase

from narrative_mind.core.config import get_settings
from narrative_mind.db.migrations import run_migrations
from narrative_mind.domain.starter_world_embeddings import load as load_starter_world_embeddings
from narrative_mind.providers.deps import get_embedder
from narrative_mind.repositories.user_repo import UserRepository
from narrative_mind.repositories.world_repo import WorldRepository


async def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        print("error: expected exactly one argument, the account's email address")
        return 2

    email = sys.argv[1].strip()
    settings = get_settings()
    driver = AsyncGraphDatabase.driver(
        settings.neo4j_uri, auth=(settings.neo4j_username, settings.neo4j_password)
    )
    try:
        await run_migrations(driver)
        async with driver.session() as session:
            user = await UserRepository(session).get_by_email(email)
            if user is None:
                print(f"error: no account registered with email {email!r}")
                print("register in the app first; a new account is seeded automatically.")
                return 1

            owner_id = user["id"]
            world = WorldRepository(session)
            embedder = get_embedder(settings)
            embeddings = load_starter_world_embeddings(embedder.model_name)

            removed = await world.wipe_world(owner_id)
            print(f"removed {sum(removed.values())} existing world nodes:", removed)

            await world.seed_starter_world(
                owner_id, embeddings=embeddings, embedding_model=embedder.model_name
            )
            stats = await world.counts(owner_id)

        print(f"reset the world for {email} ({owner_id})")
        print("nodes:", stats["nodes"])
        print("edges:", stats["edges"])
        return 0
    finally:
        await driver.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
