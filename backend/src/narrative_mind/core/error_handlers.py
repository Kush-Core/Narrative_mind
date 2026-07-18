from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from narrative_mind.core.exceptions import (
    NarrativeMindError,
    ConflictError,
    NotFoundError,
    ValidationError,
)


def _error_body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(NotFoundError)
    async def _not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content=_error_body("not_found", exc.message))

    @app.exception_handler(ConflictError)
    async def _conflict(_: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse(status_code=409, content=_error_body("conflict", exc.message))

    @app.exception_handler(ValidationError)
    async def _validation(_: Request, exc: ValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content=_error_body("domain_validation", exc.message))

    @app.exception_handler(NarrativeMindError)
    async def _fallback(_: Request, exc: NarrativeMindError) -> JSONResponse:
        return JSONResponse(status_code=400, content=_error_body("bad_request", exc.message))
