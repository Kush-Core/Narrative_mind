"""Paging through a list must visit every entity exactly once, even on ties.

`SKIP`/`LIMIT` pages are separate queries, and `ORDER BY` on the sort field
alone leaves tied rows in no particular order — so each page may order them
differently, and an entity can appear on two pages while another appears on
none. Ties are not hypothetical: the starter world is seeded with one shared
`created_at` for all 27 entities, and names, statuses and regions repeat.

Every entity here shares one name, so the sort field decides nothing and the
id tiebreaker decides everything. Asserting the exact id order in both
directions means the test fails on any query that drops the tiebreaker — the
natural order cannot match ascending and descending ids at once.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

ENTITY_COUNT = 5
PAGE_SIZE = 2


@pytest.mark.parametrize("order", ["asc", "desc"])
@pytest.mark.parametrize("collection", ["characters", "locations", "factions", "events"])
def test_paging_through_tied_names_visits_each_entity_once(
    client: TestClient, collection: str, order: str
) -> None:
    marker = uuid4().hex
    ids = []
    for _ in range(ENTITY_COUNT):
        created = client.post(f"/{collection}", json={"name": f"Tied {marker}"})
        assert created.status_code == 201, created.text
        ids.append(created.json()["id"])

    paged = []
    for offset in range(0, ENTITY_COUNT, PAGE_SIZE):
        res = client.get(
            f"/{collection}",
            params={
                "name_contains": marker,
                "sort_by": "name",
                "order": order,
                "limit": PAGE_SIZE,
                "offset": offset,
            },
        )
        assert res.status_code == 200, res.text
        paged.extend(item["id"] for item in res.json()["items"])

    assert paged == sorted(ids, reverse=order == "desc")
