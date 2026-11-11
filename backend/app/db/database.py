"""SQLite engine, session factory, and FastAPI dependency."""

from __future__ import annotations

import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./lawn_advisor.db")

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


_ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "recommendations": {
        "recommended_minutes": "FLOAT",
        "baseline_minutes": "INTEGER",
        "retrieved_at": "DATETIME",
        "weather_mode": "VARCHAR(16)",
        "limitations": "JSON",
        "sources": "JSON",
        "response_snapshot": "JSON",
        "is_demo": "BOOLEAN NOT NULL DEFAULT 0",
    },
    "profiles": {
        "is_demo": "BOOLEAN NOT NULL DEFAULT 0",
    },
    "recommendation_feedback": {
        "is_demo": "BOOLEAN NOT NULL DEFAULT 0",
    },
}


def _add_missing_columns() -> None:
    """Add columns to an existing SQLite database in place.

    create_all does not alter existing tables. Every column below is
    additive, so no stored row is rewritten.
    """
    if not DATABASE_URL.startswith("sqlite"):
        return

    with engine.begin() as connection:
        for table, columns in _ADDED_COLUMNS.items():
            rows = connection.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
            existing = {row[1] for row in rows}
            for name, sql_type in columns.items():
                if name not in existing:
                    connection.exec_driver_sql(
                        f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"
                    )


def init_db() -> None:
    from app.db import models  # noqa: F401  (registers the tables on Base)

    Base.metadata.create_all(bind=engine)
    _add_missing_columns()


def get_db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
