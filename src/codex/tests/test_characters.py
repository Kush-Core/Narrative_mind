from fastapi.testclient import TestClient


def test_get_missing_returns_404(client:TestClient)->None:
    res = client.get("/characters/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"