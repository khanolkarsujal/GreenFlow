"""The only place a water volume is calculated.

Volumes come from an irrigation depth and a lawn area, never from a
rounded run time. ``recommended_minutes`` is advice for a sprinkler
dial and is deliberately lossy; deriving litres from it would make two
screens disagree by up to half a minute of flow.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

from .models import EngineInputError

# Structural conversion: 1 mm of water over 1 m² is 1 L.
LITRES_PER_MM_OVER_M2 = 1.0


def _require_finite_non_negative(name: str, value: float) -> None:
    if not isfinite(value) or value < 0:
        raise EngineInputError(f"{name} must be finite and non-negative; got {value!r}")


def litres_for_depth(*, depth_mm: float, lawn_area_m2: float) -> float:
    """Return the litres needed to apply ``depth_mm`` over ``lawn_area_m2``."""
    _require_finite_non_negative("depth_mm", depth_mm)
    if not isfinite(lawn_area_m2) or lawn_area_m2 <= 0:
        raise EngineInputError(
            f"lawn_area_m2 must be finite and greater than zero; got {lawn_area_m2!r}"
        )
    return depth_mm * lawn_area_m2 * LITRES_PER_MM_OVER_M2


@dataclass(frozen=True, slots=True)
class EventVolumes:
    baseline_water_litres: float
    recommended_water_litres: float
    avoided_water_litres: float


def event_volumes(
    *,
    baseline_depth_mm: float,
    recommended_depth_mm: float,
    lawn_area_m2: float,
) -> EventVolumes:
    """Return the three volumes one recommendation implies, in litres."""
    _require_finite_non_negative("recommended_depth_mm", recommended_depth_mm)

    baseline = litres_for_depth(depth_mm=baseline_depth_mm, lawn_area_m2=lawn_area_m2)
    recommended = litres_for_depth(depth_mm=recommended_depth_mm, lawn_area_m2=lawn_area_m2)
    return EventVolumes(
        baseline_water_litres=baseline,
        recommended_water_litres=recommended,
        avoided_water_litres=max(0.0, baseline - recommended),
    )
