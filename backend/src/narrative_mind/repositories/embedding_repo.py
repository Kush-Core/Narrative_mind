from datetime import UTC, datetime
from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession

_EMBEDDABLE_LABELS = ("Character", "Location", "Faction", "Event")

# Union of the fields any canonical-text builder might need, across all four
# labels. A field a given label doesn't have (e.g. Character has no .region)
# is simply omitted from that record's map — Cypher map projection doesn't
# error on a missing property.
_CANONICAL_FIELDS = (
    ".id",
    ".name",
    ".aliases",
    ".status",
    ".region",
    ".ideology",
    ".description",
    ".summary",
    ".timeline_order",
)


class EmbeddingRepository:
    """Vector storage, scoped to one owner, generic across all embeddable labels.

    One repo for :Character, :Location, :Faction, :Event rather than a method
    on each sibling repo — the write and the staleness query are identical
    across labels, and duplicating them four times is how the copies drift.
    """

    def __init__(self, session: AsyncSession, owner_id: str) -> None:
        self._session = session
        self._owner_id = owner_id

    async def write_embedding(
        self, entity_id: str, embedding: list[float], model_name: str
    ) -> bool:
        return await self._session.execute_write(
            self._write_embedding_tx, entity_id, embedding, model_name, self._owner_id
        )

    @staticmethod
    async def _write_embedding_tx(
        tx: AsyncManagedTransaction,
        entity_id: str,
        embedding: list[float],
        model_name: str,
        owner_id: str,
    ) -> bool:
        result = await tx.run(
            """
            MATCH (n {id: $id, owner_id: $owner_id})
            SET n.embedding = $embedding,
                n.embedding_model = $model_name,
                n.embedded_at = $embedded_at
            RETURN n.id AS id
            """,
            id=entity_id,
            owner_id=owner_id,
            embedding=embedding,
            model_name=model_name,
            embedded_at=datetime.now(UTC).isoformat(),
        )
        record = await result.single()
        return record is not None

    async def find_stale(self, model_name: str) -> list[dict[str, Any]]:
        """Nodes owned by this account missing an embedding, or embedded under
        a different model than `model_name`."""
        return await self._session.execute_read(self._find_stale_tx, self._owner_id, model_name)

    @staticmethod
    async def _find_stale_tx(
        tx: AsyncManagedTransaction, owner_id: str, model_name: str
    ) -> list[dict[str, Any]]:
        # label_filter and the field list are both drawn from fixed constants
        # above, never from request input, so interpolating them is safe.
        label_filter = " OR ".join(f"n:{label}" for label in _EMBEDDABLE_LABELS)
        fields = ", ".join(_CANONICAL_FIELDS)
        query = f"""
        MATCH (n)
        WHERE n.owner_id = $owner_id
          AND ({label_filter})
          AND (n.embedding IS NULL OR n.embedding_model <> $model_name)
        RETURN labels(n) AS labels, n {{{fields}}} AS properties
        """
        result = await tx.run(query, owner_id=owner_id, model_name=model_name)
        return [{"label": record["labels"][0], **record["properties"]} async for record in result]

    async def find_similar(self, query_vector: list[float], top_k: int) -> list[dict[str, Any]]:
        """This owner's top-K entities by cosine similarity to `query_vector`.

        Exact, owner-scoped cosine — not `db.index.vector.queryNodes()`. That
        index returns the global top-K across the whole database with no
        pre-filter, so in a multi-tenant schema it can hand back another
        account's nodes and starve this owner after an owner_id post-filter
        (§2.3 of the RAG plan). Scoping has to be in the MATCH itself.
        """
        return await self._session.execute_read(
            self._find_similar_tx, self._owner_id, query_vector, top_k
        )

    @staticmethod
    async def _find_similar_tx(
        tx: AsyncManagedTransaction, owner_id: str, query_vector: list[float], top_k: int
    ) -> list[dict[str, Any]]:
        # Called on every retrieval, unlike find_stale's batch-only scan, so
        # this is one label-scoped MATCH per label (each using that label's
        # existing owner_id index) unioned together, rather than one
        # label-free scan across the whole database.
        branches = " UNION ALL ".join(
            f"MATCH (n:{label} {{owner_id: $owner_id}}) WHERE n.embedding IS NOT NULL RETURN n"
            for label in _EMBEDDABLE_LABELS
        )
        query = f"""
        CALL () {{
            {branches}
        }}
        WITH n, vector.similarity.cosine(n.embedding, $query_vector) AS score
        RETURN labels(n)[0] AS label, n.id AS id, n.name AS name, score
        ORDER BY score DESC
        LIMIT $top_k
        """
        result = await tx.run(query, owner_id=owner_id, query_vector=query_vector, top_k=top_k)
        return [dict(record) async for record in result]
