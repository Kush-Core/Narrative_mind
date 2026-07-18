class NarrativeMindError(Exception):
    """Base for all domain errors."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class NotFoundError(NarrativeMindError):
    """A referenced entity does not exist."""


class ConflictError(NarrativeMindError):
    """An operation violates a uniqueness/state constraint."""


class ValidationError(NarrativeMindError):
    """A domain rule (beyond schema validation) was broken."""
