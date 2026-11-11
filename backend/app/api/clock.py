"""Overridable clock for routes that need the current time."""

from __future__ import annotations

from datetime import UTC, datetime


def get_now() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes; restore the UTC label for responses."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
