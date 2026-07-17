class CodexError(Exception):
    """Base for all domain errors."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class NotFoundError(CodexError):
    """A referenced entity does not exist."""


class ConflictError(CodexError):
    """An operation violates a uniqueness/state constraint."""


class ValidationError(CodexError):
    """A domain rule (beyond schema validation) was broken."""
