# syntax=docker/dockerfile:1

# Both stages must share one base image: the venv built in `builder` symlinks its
# interpreter to /usr/local/bin/python3.12, which `runtime` has to provide.
ARG PYTHON_IMAGE=python:3.12.16-slim-trixie

# ---------- builder: resolve uv.lock into /app/.venv ----------
FROM ${PYTHON_IMAGE} AS builder

COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

# Dependencies only, so this layer is reused across source edits and rebuilds
# only when uv.lock or pyproject.toml change.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-dev --no-install-project --no-editable

# README.md is required: pyproject.toml names it as the package readme.
COPY pyproject.toml uv.lock README.md ./
COPY src ./src

# --no-editable installs narrative_mind as a wheel into site-packages (starter-world
# embeddings JSON included), so the runtime stage needs the venv and nothing else.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

# ---------- runtime ----------
FROM ${PYTHON_IMAGE} AS runtime

RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home \
      --home-dir /nonexistent --shell /usr/sbin/nologin app

# Left root-owned on purpose: the app user can execute the code but not modify it.
COPY --from=builder /app/.venv /app/.venv

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
# Numeric, so orchestrators enforcing runAsNonRoot can verify it without /etc/passwd.
USER 10001:10001
EXPOSE 8000

# /health only answers once the lifespan hook has connected to Neo4j and run
# migrations, so "healthy" means startup succeeded. No curl in slim; use Python.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

# Exec form: uvicorn is PID 1 and gets SIGTERM directly, so the lifespan hook
# closes the Neo4j driver on shutdown.
CMD ["uvicorn", "narrative_mind.main:app", "--host", "0.0.0.0", "--port", "8000"]
