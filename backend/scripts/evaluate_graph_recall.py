"""Run the graph-recall benchmark against a real embedding provider.

Usage (from backend/):
    uv run python scripts/evaluate_graph_recall.py someone@example.com \\
        [--provider ollama|google] [--model NAME] [--dimensions N] \\
        [--top-k N] [--depth 1|2] [--max-entities N] [--json PATH]

Every flag defaults to the value already configured in `.env` / `Settings` —
pass one to override it for this run only, which is what a depth-1-vs-depth-2
or top-k sweep needs.

This is the *real* evaluation: it calls the configured embedding provider
(Ollama locally, Google in deployment) over the network, using the same
`providers.deps.get_embedder` builder every other code path uses. It never
substitutes `FakeEmbeddingProvider` and never fabricates a score — if the
provider is unreachable, this fails loudly rather than falling back to a
degraded or faked run. `uv run pytest -q` is the separate, offline,
deterministic suite; see backend/README.md's "Real Embedding Evaluation"
section for why the two are kept apart.

Exit codes: 0 success · 1 unknown account or a precondition failure
(empty world, stale embeddings — the error message names the fix) · 2 bad
arguments.
"""

import argparse
import asyncio
from pathlib import Path

from neo4j import AsyncGraphDatabase

from narrative_mind.core.config import Settings, get_settings
from narrative_mind.db.migrations import run_migrations
from narrative_mind.evaluation.report import render_text
from narrative_mind.evaluation.runner import PreconditionError, run_graph_recall
from narrative_mind.providers.deps import get_embedder
from narrative_mind.providers.embeddings import EmbeddingProvider
from narrative_mind.repositories.user_repo import UserRepository


def build_embedder(args: argparse.Namespace, settings: Settings) -> EmbeddingProvider:
    """Resolve the embedder for this run through the existing provider seam.

    Never instantiates `OllamaEmbeddingProvider`/`GoogleEmbeddingProvider`
    directly — every override is expressed as a `Settings` field and handed
    to `providers.deps.get_embedder`, the same builder every other code path
    uses, so a CLI-only embedding path can't drift from it.
    """
    provider = (args.provider or settings.embedding_provider).strip().lower()

    overrides: dict[str, object] = {}
    if args.provider is not None:
        overrides["embedding_provider"] = args.provider
    if provider == "google":
        if args.model is not None:
            overrides["google_embed_model"] = args.model
        if args.dimensions is not None:
            overrides["google_embed_dimensions"] = args.dimensions
    else:
        if args.model is not None:
            overrides["ollama_embed_model"] = args.model
        if args.dimensions is not None:
            overrides["ollama_embed_dimensions"] = args.dimensions

    if not overrides:
        return get_embedder(settings)
    return get_embedder(settings.model_copy(update=overrides))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("email", help="the account whose world to evaluate against")
    parser.add_argument(
        "--provider", choices=["ollama", "google"], help="overrides EMBEDDING_PROVIDER"
    )
    parser.add_argument(
        "--model", help="overrides the configured embed model for the resolved provider"
    )
    parser.add_argument("--dimensions", type=int, help="overrides the configured embed dimensions")
    parser.add_argument("--top-k", type=int, dest="top_k", help="overrides rag_seed_top_k")
    parser.add_argument("--depth", type=int, choices=[1, 2], help="overrides rag_expand_depth")
    parser.add_argument(
        "--max-entities", type=int, dest="max_entities", help="overrides rag_max_context_entities"
    )
    parser.add_argument(
        "--json", dest="json_path", help="also write the full report as JSON to this path"
    )
    return parser.parse_args()


async def main() -> int:
    args = _parse_args()
    settings = get_settings()
    embedder = build_embedder(args, settings)

    top_k = args.top_k if args.top_k is not None else settings.rag_seed_top_k
    depth = args.depth if args.depth is not None else settings.rag_expand_depth
    max_entities = (
        args.max_entities if args.max_entities is not None else settings.rag_max_context_entities
    )

    driver = AsyncGraphDatabase.driver(
        settings.neo4j_uri, auth=(settings.neo4j_username, settings.neo4j_password)
    )
    try:
        await run_migrations(driver)
        async with driver.session() as session:
            user = await UserRepository(session).get_by_email(args.email.strip())
            if user is None:
                print(f"error: no account registered with email {args.email!r}")
                return 1

            try:
                report = await run_graph_recall(
                    session,
                    owner_id=user["id"],
                    account_email=args.email,
                    embedder=embedder,
                    top_k=top_k,
                    depth=depth,
                    max_context_entities=max_entities,
                )
            except PreconditionError as exc:
                print(f"error: {exc}")
                return 1

        print(render_text(report))
        if args.json_path:
            Path(args.json_path).write_text(report.model_dump_json(indent=2))
            print(f"\nwrote {args.json_path}")
        return 0
    finally:
        await driver.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
