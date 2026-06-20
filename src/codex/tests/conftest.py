import pytest
from fastapi.testclient import TestClient

from codex.main import create_app


@pytest.fixture
def client()-> TestClient:
    return TestClient(create_app())