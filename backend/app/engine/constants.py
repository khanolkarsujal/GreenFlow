"""Cited irrigation constants for residential lawns.

Every value is traceable to a source. Where a source publishes a
range, the midpoint (soil water) or a documented point (root depth,
efficiency) is used and the choice is recorded in the source notes.

Sources:
- FAO Irrigation and Drainage Paper 56, Table 12, p. 112 (turfgrass
  crop coefficients, footnote 15).
- FAO-56, Table 19, p. 144 (soil water characteristics).
- FAO-56, Table 22, p. 165 (turfgrass rooting depth and depletion
  fraction p).
- Penn State Extension, "The Cool-Season Turfgrasses" (rooting depth
  2-6 inches).
- Colorado State University Extension, "Drip Irrigation for Home
  Gardens" (sprinkler systems 50-70 percent efficient).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.db.models import Profile
from app.engine.models import IrrigationConstants, SourceRef

FAO_56_DOCUMENT_URL = "https://www.fao.org/4/x0490e/x0490e00.htm"
FAO_56_TABLE_12 = "FAO-56 Table 12, p. 112 (turfgrass rows)"
FAO_56_TABLE_19 = "FAO-56 Table 19, p. 144"
FAO_56_TABLE_22 = "FAO-56 Table 22, p. 165 (turfgrass rows)"
PENN_STATE_ROOT_DEPTH_URL = (
    "https://extension.psu.edu/the-cool-season-turfgrasses-basic-structures-growth-and-development/"
)
PENN_STATE_ROOT_DEPTH = (
    "Penn State Extension, The Cool-Season Turfgrasses: rooting depth "
    "is usually between 2 and 6 inches"
)
CSU_EFFICIENCY_URL = "https://extension.colostate.edu/resource/drip-irrigation-for-home-gardens/"
CSU_EFFICIENCY = (
    "Colorado State University Extension, Drip Irrigation for Home Gardens: "
    "sprinkler systems are 50 to 70 percent efficient"
)

# Product policies, not scientific constants. They shape how often the
# adviser recommends skipping and how much it will ever recommend.
SKIP_FRACTION = 0.50
HORIZON_CAP_DAYS = 7

# Source range for lawns is 2-6 inches (0.05-0.15 m). The upper bound
# gives the largest root-zone reservoir, which recommends less water,
# so it is not conservative. The lower bound would recommend more water.
# 0.15 m is the range's upper bound and is used for every grass class
# until a species-specific measurement is available.
ROOT_DEPTH_M = 0.15

# Colorado State University Extension reports 50-70 percent for
# sprinkler systems. The midpoint is used because no catch-cup
# measurement exists in the profile. It is a cited default, not a
# measured value, and the recommendation confidence says so.
IRRIGATION_EFFICIENCY = 0.60


class ConstantsUnavailable(ValueError):
    """Raised when no cited constant set exists for this profile."""


# Only sources that feed the water balance are listed. Product
# policies (skip fraction, horizon cap) are labelled as policies in
# the recommendation assumptions instead of being presented as science.
CONSTANT_SOURCES: tuple[SourceRef, ...] = (
    SourceRef(
        id="fao56-table-12",
        label="Kc",
        citation=(
            "FAO-56 Table 12, p. 112: cool-season turfgrass Kc mid 0.95; "
            "warm-season turfgrass Kc mid 0.85 (footnote 15)."
        ),
        url="https://www.fao.org/4/x0490e/x0490e0b.htm",
    ),
    SourceRef(
        id="fao56-table-22",
        label="Depletion fraction",
        citation=(
            "FAO-56 Table 22, p. 165: turfgrass depletion fraction p = 0.40 "
            "(cool season) and p = 0.50 (warm season)."
        ),
        url="https://www.fao.org/4/x0490e/x0490e0e.htm",
    ),
    SourceRef(
        id="fao56-table-19",
        label="Soil water",
        citation=(
            "FAO-56 Table 19, p. 144: field capacity and wilting point ranges; "
            "midpoints are used for each supported soil texture."
        ),
        url=FAO_56_DOCUMENT_URL,
    ),
    SourceRef(
        id="penn-state-root-depth",
        label="Root depth",
        citation=PENN_STATE_ROOT_DEPTH,
        url=PENN_STATE_ROOT_DEPTH_URL,
    ),
    SourceRef(
        id="csu-efficiency",
        label="Irrigation efficiency",
        citation=CSU_EFFICIENCY,
        url=CSU_EFFICIENCY_URL,
    ),
)


@dataclass(frozen=True, slots=True)
class SoilRow:
    name: str
    field_capacity: float
    wilting_point: float
    note: str


@dataclass(frozen=True, slots=True)
class GrassClass:
    label: str
    crop_coefficient: float
    depletion_fraction: float
    note: str


# Midpoints of the FAO-56 Table 19 ranges. The original ranges are
# recorded so the choice can be audited.
SOIL_ROWS: dict[str, SoilRow] = {
    "sandy": SoilRow(
        name="Sand",
        field_capacity=0.12,
        wilting_point=0.045,
        note=(
            f"{FAO_56_TABLE_19}, Sand: FC 0.07-0.17, WP 0.02-0.07 m3/m3; "
            "midpoints 0.12 and 0.045 used."
        ),
    ),
    "loamy": SoilRow(
        name="Loam",
        field_capacity=0.25,
        wilting_point=0.12,
        note=(
            f"{FAO_56_TABLE_19}, Loam: FC 0.20-0.30, WP 0.07-0.17 m3/m3; "
            "midpoints 0.25 and 0.12 used."
        ),
    ),
    "silty": SoilRow(
        name="Silt loam",
        field_capacity=0.29,
        wilting_point=0.15,
        note=(
            f"{FAO_56_TABLE_19}, Silt loam: FC 0.22-0.36, WP 0.09-0.21 m3/m3; "
            "midpoints 0.29 and 0.15 used."
        ),
    ),
    "clay": SoilRow(
        name="Clay",
        field_capacity=0.36,
        wilting_point=0.22,
        note=(
            f"{FAO_56_TABLE_19}, Clay: FC 0.32-0.40, WP 0.20-0.24 m3/m3; "
            "midpoints 0.36 and 0.22 used."
        ),
    ),
}

SOIL_ALIASES = {
    "sandy": "sandy",
    "sand": "sandy",
    "sandy-loam": "sandy",
    "loamy": "loamy",
    "loam": "loamy",
    "silty": "silty",
    "silt": "silty",
    "silt-loam": "silty",
    "clay": "clay",
    "clay-loam": "clay",
}

# FAO-56 Table 12 Kc mid values, with the Table 22 depletion fraction p.
# Footnote 15: cool-season grasses include bluegrass, ryegrass and
# fescue; warm-season grasses include bermudagrass and St. Augustine.
GRASS_CLASSES: dict[str, GrassClass] = {
    "cool": GrassClass(
        label="Cool-season turfgrass",
        crop_coefficient=0.95,
        depletion_fraction=0.40,
        note=(
            f"{FAO_56_TABLE_12}, cool-season turfgrass Kc mid=0.95; "
            f"{FAO_56_TABLE_22}, cool-season turfgrass p=0.40."
        ),
    ),
    "warm": GrassClass(
        label="Warm-season turfgrass",
        crop_coefficient=0.85,
        depletion_fraction=0.50,
        note=(
            f"{FAO_56_TABLE_12}, warm-season turfgrass Kc mid=0.85; "
            f"{FAO_56_TABLE_22}, warm-season turfgrass p=0.50."
        ),
    ),
}

GRASS_ALIASES = {
    "kentucky-bluegrass": "cool",
    "kentucky bluegrass": "cool",
    "bluegrass": "cool",
    "fescue": "cool",
    "tall-fescue": "cool",
    "tall fescue": "cool",
    "ryegrass": "cool",
    "bermuda": "warm",
    "bermudagrass": "warm",
    "zoysia": "warm",
    "st-augustine": "warm",
    "st augustine": "warm",
    "saint-augustine": "warm",
}


def _normalize(value: str) -> str:
    return re.sub(r"\s+", "-", value.strip().lower())


def resolve_constants(profile: Profile) -> IrrigationConstants:
    """Build cited constants for a profile or raise ConstantsUnavailable."""
    soil_key = SOIL_ALIASES.get(_normalize(profile.soil_type))
    if soil_key is None:
        raise ConstantsUnavailable(
            f"No cited soil-water values are mapped to soil type "
            f"'{profile.soil_type}'. Choose a supported soil type."
        )

    grass_key = GRASS_ALIASES.get(_normalize(profile.grass_type))
    if grass_key is None:
        raise ConstantsUnavailable(
            f"No cited crop coefficient is mapped to grass type "
            f"'{profile.grass_type}'. Choose a cool- or warm-season grass."
        )

    baseline_event_mm = (
        profile.precipitation_rate_mm_per_hour * profile.baseline_minutes_per_event / 60.0
    )
    if baseline_event_mm <= 0:
        raise ConstantsUnavailable("The baseline watering event has no depth.")

    soil = SOIL_ROWS[soil_key]
    grass = GRASS_CLASSES[grass_key]

    return IrrigationConstants(
        crop_coefficient=grass.crop_coefficient,
        field_capacity=soil.field_capacity,
        wilting_point=soil.wilting_point,
        root_depth_m=ROOT_DEPTH_M,
        depletion_fraction=grass.depletion_fraction,
        skip_fraction=SKIP_FRACTION,
        horizon_cap_days=HORIZON_CAP_DAYS,
        irrigation_efficiency=IRRIGATION_EFFICIENCY,
        max_application_mm=baseline_event_mm,
        source_notes=(
            grass.note,
            soil.note,
            (f"{PENN_STATE_ROOT_DEPTH}; the 6-inch upper bound ({ROOT_DEPTH_M:.2f} m) is used."),
            (
                f"{CSU_EFFICIENCY}; the 60 percent midpoint is used as a "
                "default because no catch-cup measurement exists."
            ),
            (
                f"Skip threshold {SKIP_FRACTION:.0%} of RAW and a "
                f"{HORIZON_CAP_DAYS}-day horizon cap are product policies."
            ),
        ),
        sources=CONSTANT_SOURCES,
    )
