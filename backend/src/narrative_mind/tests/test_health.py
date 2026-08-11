from fastapi.testclient import TestClient

from narrative_mind.main import create_app


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_root_redirects_to_docs() -> None:
    """The bare domain must not answer with a 404.

    Deployed, `/` is what someone opens when they follow a link naming the API
    rather than calling an endpoint. No context manager, so lifespan is skipped:
    this route touches neither Neo4j nor auth, and the test should not need them.
    """
    client = TestClient(create_app())
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/docs"
