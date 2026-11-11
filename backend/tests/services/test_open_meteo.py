from datetime import date

import httpx
import pytest

from app.services import open_meteo
from app.services.open_meteo import (
    WeatherDay,
    WeatherUnavailableError,
    fetch_daily_history,
    fetch_daily_weather,
)

DAYS = [
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
    "2026-01-04",
    "2026-01-05",
    "2026-01-06",
    "2026-01-07",
    "2026-01-08",
    "2026-01-09",
    "2026-01-10",
    "2026-01-11",
    "2026-01-12",
    "2026-01-13",
    "2026-01-14",
]

PRECIPITATION_MM = [
    0.0,
    1.2,
    2.4,
    0.6,
    0.0,
    3.1,
    0.4,
    5.0,
    0.0,
    2.2,
    1.1,
    0.0,
    0.8,
    4.6,
]

TEMP_MAX_C = [
    10.0,
    11.5,
    9.8,
    12.1,
    13.4,
    8.7,
    14.2,
    15.0,
    16.3,
    14.8,
    12.9,
    11.0,
    10.5,
    9.9,
]

TEMP_MIN_C = [
    2.0,
    3.1,
    1.4,
    4.0,
    5.2,
    0.8,
    6.1,
    7.0,
    8.4,
    6.9,
    5.5,
    3.8,
    2.9,
    1.7,
]

WIND_MAX_MS = [
    3.5,
    4.1,
    2.8,
    5.0,
    6.2,
    1.9,
    7.3,
    8.0,
    9.1,
    7.7,
    6.4,
    5.2,
    4.6,
    3.0,
]

ET0_MM = [
    0.5,
    0.7,
    0.4,
    0.9,
    1.1,
    0.3,
    1.3,
    1.5,
    1.8,
    1.6,
    1.2,
    0.8,
    0.6,
    0.5,
]

EXPECTED_DAILY_VARIABLES = (
    "precipitation_sum",
    "temperature_2m_max",
    "temperature_2m_min",
    "wind_speed_10m_max",
    "et0_fao_evapotranspiration",
)


def _daily() -> dict[str, object]:
    return {
        "time": list(DAYS),
        "precipitation_sum": list(PRECIPITATION_MM),
        "temperature_2m_max": list(TEMP_MAX_C),
        "temperature_2m_min": list(TEMP_MIN_C),
        "wind_speed_10m_max": list(WIND_MAX_MS),
        "et0_fao_evapotranspiration": list(ET0_MM),
    }


def _mock_http(
    monkeypatch: pytest.MonkeyPatch,
    *,
    response: httpx.Response | None = None,
    error: httpx.HTTPError | None = None,
) -> dict[str, object]:
    captured: dict[str, object] = {}

    def fake_get(url: str, *, params: dict[str, object], timeout: float) -> httpx.Response:
        captured["url"] = url
        captured["params"] = params
        captured["timeout"] = timeout
        if error is not None:
            raise error
        assert response is not None
        return response

    monkeypatch.setattr(open_meteo.httpx, "get", fake_get)
    return captured


def _json_response(daily: dict[str, object]) -> httpx.Response:
    return httpx.Response(200, json={"daily": daily})


def test_fetch_daily_weather_normalizes_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured = _mock_http(monkeypatch, response=_json_response(_daily()))

    days = fetch_daily_weather(52.52, 13.41)

    assert captured["url"] == open_meteo.OPEN_METEO_FORECAST_URL
    assert captured["timeout"] == open_meteo.REQUEST_TIMEOUT_SECONDS

    params = captured["params"]
    assert isinstance(params, dict)
    assert params["latitude"] == 52.52
    assert params["longitude"] == 13.41
    assert params["timezone"] == "auto"
    assert params["wind_speed_unit"] == "ms"
    assert params["past_days"] == 7
    assert params["forecast_days"] == 7
    assert params["daily"] == ",".join(EXPECTED_DAILY_VARIABLES)

    assert [day.date for day in days] == [date(2026, 1, day_number) for day_number in range(1, 15)]
    assert [day.precipitation_mm for day in days] == PRECIPITATION_MM
    assert [day.temp_max_c for day in days] == TEMP_MAX_C
    assert [day.temp_min_c for day in days] == TEMP_MIN_C
    assert [day.wind_max_ms for day in days] == WIND_MAX_MS
    assert [day.et0_mm for day in days] == ET0_MM

    assert days[0] == WeatherDay(
        date=date(2026, 1, 1),
        precipitation_mm=0.0,
        temp_max_c=10.0,
        temp_min_c=2.0,
        wind_max_ms=3.5,
        et0_mm=0.5,
        is_forecast=False,
    )
    assert days[6] == WeatherDay(
        date=date(2026, 1, 7),
        precipitation_mm=0.4,
        temp_max_c=14.2,
        temp_min_c=6.1,
        wind_max_ms=7.3,
        et0_mm=1.3,
        is_forecast=False,
    )
    assert days[7] == WeatherDay(
        date=date(2026, 1, 8),
        precipitation_mm=5.0,
        temp_max_c=15.0,
        temp_min_c=7.0,
        wind_max_ms=8.0,
        et0_mm=1.5,
        is_forecast=True,
    )


def test_fetch_daily_weather_flags_past_and_forecast_days(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_http(monkeypatch, response=_json_response(_daily()))

    days = fetch_daily_weather(52.52, 13.41)

    assert [day.is_forecast for day in days] == [False] * 7 + [True] * 7


def test_missing_daily_variable_raises_weather_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    daily = _daily()
    del daily["et0_fao_evapotranspiration"]
    _mock_http(monkeypatch, response=_json_response(daily))

    with pytest.raises(WeatherUnavailableError, match="missing or malformed"):
        fetch_daily_weather(52.52, 13.41)


def test_null_daily_value_raises_weather_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    daily = _daily()
    precipitation = list[float | None](PRECIPITATION_MM)
    precipitation[3] = None
    daily["precipitation_sum"] = precipitation
    _mock_http(monkeypatch, response=_json_response(daily))

    with pytest.raises(WeatherUnavailableError, match=r"precipitation for 2026-01-04"):
        fetch_daily_weather(52.52, 13.41)


def test_non_200_response_raises_weather_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_http(
        monkeypatch,
        response=httpx.Response(503, json={"error": True, "reason": "Unavailable"}),
    )

    with pytest.raises(WeatherUnavailableError, match="HTTP status 503"):
        fetch_daily_weather(52.52, 13.41)


def test_timeout_raises_weather_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_http(monkeypatch, error=httpx.ReadTimeout("timed out"))

    with pytest.raises(WeatherUnavailableError, match="timed out"):
        fetch_daily_weather(52.52, 13.41)


def test_network_error_raises_weather_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_http(monkeypatch, error=httpx.ConnectError("connection refused"))

    with pytest.raises(WeatherUnavailableError, match="could not be reached"):
        fetch_daily_weather(52.52, 13.41)


def test_malformed_json_raises_weather_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_http(monkeypatch, response=httpx.Response(200, content=b"not json"))

    with pytest.raises(WeatherUnavailableError, match="missing or malformed"):
        fetch_daily_weather(52.52, 13.41)


def test_fetch_daily_history_requests_the_backtest_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert open_meteo.BACKTEST_PAST_DAYS == 30
    assert open_meteo.BACKTEST_FORECAST_DAYS == 1

    captured = _mock_http(monkeypatch, response=_json_response(_daily()))

    # 13 past days plus the appended current day matches the 14-day payload.
    fetch_daily_history(52.52, 13.41, past_days=13)

    params = captured["params"]
    assert isinstance(params, dict)
    assert params["past_days"] == 13
    assert params["forecast_days"] == 1
    assert params["daily"] == ",".join(EXPECTED_DAILY_VARIABLES)
    assert captured["timeout"] == open_meteo.REQUEST_TIMEOUT_SECONDS


def test_fetch_daily_history_returns_only_observed_days(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The provider appends the current day; 13 past days plus that day is
    # the 14-day payload, and only the 13 observed days come back.
    _mock_http(monkeypatch, response=_json_response(_daily()))

    days = fetch_daily_history(52.52, 13.41, past_days=13)

    assert [day.date for day in days] == [date(2026, 1, day_number) for day_number in range(1, 14)]
    assert [day.is_forecast for day in days] == [False] * 13
    assert days[0].et0_mm == ET0_MM[0]
    assert days[0].precipitation_mm == PRECIPITATION_MM[0]


def test_fetch_daily_history_rejects_an_unexpected_length(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_http(monkeypatch, response=_json_response(_daily()))

    with pytest.raises(WeatherUnavailableError, match="expected 31 days"):
        fetch_daily_history(52.52, 13.41)


def test_fetch_daily_history_maps_a_provider_status_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_http(monkeypatch, response=httpx.Response(503))

    with pytest.raises(WeatherUnavailableError, match="HTTP status 503"):
        fetch_daily_history(52.52, 13.41)


def test_fetch_daily_history_requires_at_least_one_day(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_http(monkeypatch, response=_json_response(_daily()))

    with pytest.raises(WeatherUnavailableError, match="at least one day"):
        fetch_daily_history(52.52, 13.41, past_days=0)
