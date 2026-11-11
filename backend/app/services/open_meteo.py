import math
from datetime import date
from http import HTTPStatus

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

# Open-Meteo forecast endpoint (https://open-meteo.com/en/docs).
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# Assumption for this MVP: a slow provider should fail fast instead of
# blocking a recommendation request.
REQUEST_TIMEOUT_SECONDS = 10.0

# The client requests the past 7 days and the next 7 days in one call.
PAST_DAYS = 7
FORECAST_DAYS = 7

# A backtest replays complete past days, so it asks for history plus the
# single current day that Open-Meteo always appends.
BACKTEST_PAST_DAYS = 30
BACKTEST_FORECAST_DAYS = 1

# Exact daily variable names from the Open-Meteo documentation.
DAILY_VARIABLES = (
    "precipitation_sum",
    "temperature_2m_max",
    "temperature_2m_min",
    "wind_speed_10m_max",
    "et0_fao_evapotranspiration",
)

EXPECTED_DAY_COUNT = PAST_DAYS + FORECAST_DAYS

_FIELD_LABELS = {
    "precipitation_sum": "precipitation",
    "temperature_2m_max": "the maximum temperature",
    "temperature_2m_min": "the minimum temperature",
    "wind_speed_10m_max": "the maximum wind speed",
    "et0_fao_evapotranspiration": "reference evapotranspiration",
}


class WeatherUnavailableError(RuntimeError):
    pass


class WeatherDay(BaseModel):
    date: date
    precipitation_mm: float
    temp_max_c: float
    temp_min_c: float
    wind_max_ms: float
    et0_mm: float
    is_forecast: bool


class _OpenMeteoDaily(BaseModel):
    model_config = ConfigDict(strict=True)

    time: list[date]
    precipitation_sum: list[float | None]
    temperature_2m_max: list[float | None]
    temperature_2m_min: list[float | None]
    wind_speed_10m_max: list[float | None]
    et0_fao_evapotranspiration: list[float | None]


class _OpenMeteoResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    daily: _OpenMeteoDaily


def fetch_daily_weather(latitude: float, longitude: float) -> list[WeatherDay]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": "auto",
        "wind_speed_unit": "ms",
        "past_days": PAST_DAYS,
        "forecast_days": FORECAST_DAYS,
    }

    try:
        response = httpx.get(
            OPEN_METEO_FORECAST_URL,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.TimeoutException as exc:
        raise WeatherUnavailableError(
            "Open-Meteo did not respond before the request timed out."
        ) from exc
    except httpx.RequestError as exc:
        raise WeatherUnavailableError("Open-Meteo could not be reached.") from exc

    if response.status_code != HTTPStatus.OK:
        raise WeatherUnavailableError(f"Open-Meteo returned HTTP status {response.status_code}.")

    try:
        payload = _OpenMeteoResponse.model_validate_json(response.content)
    except ValidationError as exc:
        raise WeatherUnavailableError(
            "Open-Meteo returned missing or malformed weather data."
        ) from exc

    return _normalize_daily(payload.daily)


def fetch_daily_history(
    latitude: float,
    longitude: float,
    past_days: int = BACKTEST_PAST_DAYS,
) -> list[WeatherDay]:
    """Return the last ``past_days`` complete days of observed weather.

    Open-Meteo appends the current day, so the request asks for one
    forecast day and the trailing day is dropped. Nothing here is a
    forecast: every returned day is observed history.
    """
    if past_days < 1:
        raise WeatherUnavailableError("The history window must cover at least one day.")

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": "auto",
        "wind_speed_unit": "ms",
        "past_days": past_days,
        "forecast_days": BACKTEST_FORECAST_DAYS,
    }

    try:
        response = httpx.get(
            OPEN_METEO_FORECAST_URL,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.TimeoutException as exc:
        raise WeatherUnavailableError(
            "Open-Meteo did not respond before the request timed out."
        ) from exc
    except httpx.RequestError as exc:
        raise WeatherUnavailableError("Open-Meteo could not be reached.") from exc

    if response.status_code != HTTPStatus.OK:
        raise WeatherUnavailableError(f"Open-Meteo returned HTTP status {response.status_code}.")

    try:
        payload = _OpenMeteoResponse.model_validate_json(response.content)
    except ValidationError as exc:
        raise WeatherUnavailableError(
            "Open-Meteo returned missing or malformed weather data."
        ) from exc

    daily = payload.daily
    expected = past_days + BACKTEST_FORECAST_DAYS
    lengths = {
        len(daily.time),
        len(daily.precipitation_sum),
        len(daily.temperature_2m_max),
        len(daily.temperature_2m_min),
        len(daily.wind_speed_10m_max),
        len(daily.et0_fao_evapotranspiration),
    }
    if lengths != {expected}:
        raise WeatherUnavailableError(
            f"Open-Meteo returned an unexpected number of daily values; "
            f"expected {expected} days."
        )

    precipitation_mm = _require_values("precipitation_sum", daily.precipitation_sum, daily.time)
    temp_max_c = _require_values("temperature_2m_max", daily.temperature_2m_max, daily.time)
    temp_min_c = _require_values("temperature_2m_min", daily.temperature_2m_min, daily.time)
    wind_max_ms = _require_values("wind_speed_10m_max", daily.wind_speed_10m_max, daily.time)
    et0_mm = _require_values("et0_fao_evapotranspiration", daily.et0_fao_evapotranspiration, daily.time)

    return [
        WeatherDay(
            date=daily.time[index],
            precipitation_mm=precipitation_mm[index],
            temp_max_c=temp_max_c[index],
            temp_min_c=temp_min_c[index],
            wind_max_ms=wind_max_ms[index],
            et0_mm=et0_mm[index],
            is_forecast=False,
        )
        for index in range(past_days)
    ]


def _normalize_daily(daily: _OpenMeteoDaily) -> list[WeatherDay]:
    _require_expected_lengths(daily)

    precipitation_mm = _require_values("precipitation_sum", daily.precipitation_sum, daily.time)
    temp_max_c = _require_values("temperature_2m_max", daily.temperature_2m_max, daily.time)
    temp_min_c = _require_values("temperature_2m_min", daily.temperature_2m_min, daily.time)
    wind_max_ms = _require_values("wind_speed_10m_max", daily.wind_speed_10m_max, daily.time)
    et0_mm = _require_values(
        "et0_fao_evapotranspiration", daily.et0_fao_evapotranspiration, daily.time
    )

    # Open-Meteo returns past_days first, then forecast_days (today and later).
    return [
        WeatherDay(
            date=daily.time[index],
            precipitation_mm=precipitation_mm[index],
            temp_max_c=temp_max_c[index],
            temp_min_c=temp_min_c[index],
            wind_max_ms=wind_max_ms[index],
            et0_mm=et0_mm[index],
            is_forecast=index >= PAST_DAYS,
        )
        for index in range(EXPECTED_DAY_COUNT)
    ]


def _require_expected_lengths(daily: _OpenMeteoDaily) -> None:
    lengths = {
        len(daily.time),
        len(daily.precipitation_sum),
        len(daily.temperature_2m_max),
        len(daily.temperature_2m_min),
        len(daily.wind_speed_10m_max),
        len(daily.et0_fao_evapotranspiration),
    }

    if lengths != {EXPECTED_DAY_COUNT}:
        raise WeatherUnavailableError(
            f"Open-Meteo returned an unexpected number of daily values; "
            f"expected {EXPECTED_DAY_COUNT} days."
        )


def _require_values(field: str, values: list[float | None], dates: list[date]) -> list[float]:
    label = _FIELD_LABELS[field]
    checked: list[float] = []

    for day, value in zip(dates, values, strict=True):
        if value is None:
            raise WeatherUnavailableError(
                f"Open-Meteo did not provide {label} for {day.isoformat()}."
            )
        if not math.isfinite(value):
            raise WeatherUnavailableError(
                f"Open-Meteo returned an invalid {label} value for {day.isoformat()}."
            )
        checked.append(value)

    return checked
