"""Precomputed starter-world embeddings, one file per embedding model.

`entity_id(owner_id, slug)` varies the *id* of each account's copy of the
starter world, but the text is byte-identical for every account — so the
embeddings are identical too. Rather than call the embedding provider at
every registration, `scripts/precompute_starter_world_embeddings.py`
computes them once per model and saves them here; `WorldRepository`'s seed
transaction writes them straight onto the nodes it creates.

The file is named for the model it was generated under, and `load` refuses
to hand back vectors from any other model. A registration that finds no
matching file simply creates unembedded nodes — picked up later by
`find_stale` and `scripts/backfill_embeddings.py` — rather than silently
supplying stale vectors, which is the failure mode the whole per-model
naming scheme exists to prevent (see §2.2 of the RAG plan: two embedding
models' vectors are never interchangeable, even at the same width).
"""

import json
import re
from pathlib import Path

_DIR = Path(__file__).parent


def _safe_filename(model_name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", model_name)


def _path(model_name: str) -> Path:
    return _DIR / f"starter_world_embeddings.{_safe_filename(model_name)}.json"


def load(model_name: str) -> dict[str, list[float]] | None:
    """Vectors by slug for `model_name`, or None if no current file exists."""
    path = _path(model_name)
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    if data.get("model") != model_name:
        return None
    return data["embeddings"]


def save(model_name: str, embeddings: dict[str, list[float]]) -> None:
    path = _path(model_name)
    path.write_text(json.dumps({"model": model_name, "embeddings": embeddings}, indent=2))
