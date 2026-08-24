"""Embed every entity missing a vector, or embedded under a stale model.

Usage (from backend/):
    uv run python scripts/backfill_embeddings.py --all
    uv run python scripts/backfill_embeddings.py someone@example.com [another@example.com ...]

Every create and update writes its own embedding synchronously (see
services/embedding_service.py), so this script is the recovery path, not the
primary one. Run it:

  - once, against every existing account, the first time embeddings are
    turned on — accounts registered before that have no vectors at all;
  - again, against every account, whenever EMBEDDING_PROVIDER or the
    embedding model changes — vectors from two different models are not
    comparable (§2.2 of the RAG plan), so switching models means the whole
    corpus is stale until this runs;
  - ad hoc, for one account, if a synchronous write ever failed partway
    through (e.g. the provider was briefly unreachable).

"Stale" is judged against the EMBEDDING_PROVIDER/model configured right now —
the same provider every write path already uses.
"""

import asyncio
import sys

from neo4j import AsyncGraphDatabase

from narrative_mind.core.config import get_settings
from narrative_mind.db.migrations import run_migrations
from narrative_mind.providers.deps import get_embedder
from narrative_mind.providers.embeddings import EmbeddingProvider
from narrative_mind.repositories.embedding_repo import EmbeddingRepository
from narrative_mind.repositories.user_repo import UserRepository
from narrative_mind.services.embedding_service import EmbeddingService


async def _backfill_owner(session, embedder: EmbeddingProvider, user: dict) -> None:
    service = EmbeddingService(EmbeddingRepository(session, user["id"]), embedder)
    written = await service.backfill()
    print(f"{user['email']} ({user['id']}): embedded {written} entities")


async def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        print("error: expected --all or one or more account email addresses")
        return 2

    settings = get_settings()
    embedder = get_embedder(settings)
    driver = AsyncGraphDatabase.driver(
        settings.neo4j_uri, auth=(settings.neo4j_username, settings.neo4j_password)
    )
    try:
        await run_migrations(driver)
        async with driver.session() as session:
            user_repo = UserRepository(session)

            if sys.argv[1] == "--all":
                users = await user_repo.list_all()
            else:
                users = []
                for email in sys.argv[1:]:
                    user = await user_repo.get_by_email(email.strip())
                    if user is None:
                        print(f"error: no account registered with email {email!r}")
                        return 1
                    users.append(user)

            if not users:
                print("no accounts to backfill")
                return 0

            print(f"backfilling {len(users)} account(s) with model {embedder.model_name!r}")
            for user in users:
                await _backfill_owner(session, embedder, user)

        return 0
    finally:
        await driver.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
