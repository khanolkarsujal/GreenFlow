"""Data models for the pure irrigation recommendation engine.

All scientific values are supplied by the caller through
EngineConfig. Nothing in this module defines a product constant.
See context/calculation-spec.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from math import isfinite

MILLIMETRES_PER_METRE = 1000.0
DAYS_PER_WEEK = 7

# Comparison tolerance for caller-supplied depths near a computed limit.
_DEPTH_TOLERANCE_MM = 1e-9


class EngineInputError(ValueError):
    """Raised when engine input violates the calculation specification."""


def _require_finite(name: str, value: float) -> None:
    if not isfinite(value):
        raise EngineInputError(f"{name} must be a finite number; got {value!r}")


def _require_non_negative(name: str, value: float) -> None:
    _require_finite(name, value)
    if value < 0:
        raise EngineInputError(f"{name} must be non-negative; got {value!r}")


def _require_positive(name: str, value: float) -> None:
    _require_finite(name, value)
    if value <= 0:
        raise EngineInputError(f"{name} must be greater than zero; got {value!r}")


@dataclass(frozen=True, slots=True)
class EngineDay:
    """One day of weather and applied irrigation, in millimetres."""

    date: date
    et0_mm: float
    precipitation_mm: float
    irrigation_mm: float = 0.0
    is_forecast: bool = False

    def __post_init__(self) -> None:
        _require_non_negative("et0_mm", self.et0_mm)
        _require_non_negative("precipitation_mm", self.precipitation_mm)
        _require_non_negative("irrigation_mm", self.irrigation_mm)


@dataclass(frozen=True, slots=True)
class EngineConfig:
    """Explicit engine parameters. Every value comes from the caller."""

    crop_coefficient: float
    field_capacity: float
    wilting_point: float
    root_depth_m: float
    depletion_fraction: float
    skip_fraction: float
    baseline_events_per_week: float
    horizon_cap_days: int
    irrigation_efficiency: float
    max_application_mm: float
    baseline_event_mm: float
    initial_depletion_mm: float

    def __post_init__(self) -> None:
        _require_positive("crop_coefficient", self.crop_coefficient)
        _require_finite("field_capacity", self.field_capacity)
        _require_finite("wilting_point", self.wilting_point)
        _require_positive("root_depth_m", self.root_depth_m)
        _require_finite("depletion_fraction", self.depletion_fraction)
        _require_finite("skip_fraction", self.skip_fraction)
        _require_positive("baseline_events_per_week", self.baseline_events_per_week)
        _require_positive("horizon_cap_days", self.horizon_cap_days)
        _require_positive("irrigation_efficiency", self.irrigation_efficiency)
        _require_positive("max_application_mm", self.max_application_mm)
        _require_positive("baseline_event_mm", self.baseline_event_mm)
        _require_non_negative("initial_depletion_mm", self.initial_depletion_mm)

        if not 0 <= self.wilting_point < self.field_capacity <= 1:
            raise EngineInputError(
                "soil water contents must satisfy 0 <= wilting_point < field_capacity <= 1"
            )
        if not 0 < self.depletion_fraction <= 1:
            raise EngineInputError("depletion_fraction must be in (0, 1]")
        if not 0 <= self.skip_fraction <= 1:
            raise EngineInputError("skip_fraction must be in [0, 1]")
        if not 0 < self.irrigation_efficiency <= 1:
            raise EngineInputError("irrigation_efficiency must be in (0, 1]")

        taw_mm = (
            (self.field_capacity - self.wilting_point) * self.root_depth_m * MILLIMETRES_PER_METRE
        )
        if self.initial_depletion_mm > taw_mm + _DEPTH_TOLERANCE_MM:
            raise EngineInputError(
                f"initial_depletion_mm ({self.initial_depletion_mm}) exceeds TAW ({taw_mm})"
            )


@dataclass(frozen=True, slots=True)
class SourceRef:
    """A citation shown with a recommendation."""

    id: str
    label: str
    citation: str
    url: str | None = None


@dataclass(frozen=True, slots=True)
class IrrigationConstants:
    """Scientific constants used to build an EngineConfig.

    Values and citations are supplied by the caller; this type
    defines no defaults. See calculation-spec.md Section 7.
    """

    crop_coefficient: float
    field_capacity: float
    wilting_point: float
    root_depth_m: float
    depletion_fraction: float
    skip_fraction: float
    horizon_cap_days: int
    irrigation_efficiency: float
    max_application_mm: float
    source_notes: tuple[str, ...]
    sources: tuple[SourceRef, ...] = ()


class RecommendationState(StrEnum):
    SKIP = "SKIP"
    REDUCE = "REDUCE"
    WATER = "WATER"


@dataclass(frozen=True, slots=True)
class RecommendationResult:
    """A recommendation plus the numbers needed to explain it."""

    state: RecommendationState
    recommended_depth_mm: float
    taw_mm: float
    raw_mm: float
    skip_threshold_mm: float
    horizon_days: int
    projected_depletions_mm: tuple[float, ...]
    projected_max_depletion_mm: float


@dataclass(frozen=True, slots=True)
class SavingsBaseline:
    """The baseline schedule used to estimate avoided water."""

    event_depth_mm: float
    events_per_week: float
    events_in_window: float


@dataclass(frozen=True, slots=True)
class SavingsEstimate:
    """Estimated volumes and the context needed to show them."""

    baseline: SavingsBaseline
    window_days: int
    lawn_area_m2: float
    irrigation_efficiency: float
    baseline_volume_l: float
    recommended_volume_l: float
    estimated_water_avoided_l: float
    assumptions: tuple[str, ...]
