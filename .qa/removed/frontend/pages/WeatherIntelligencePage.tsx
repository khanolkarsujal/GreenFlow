import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CloudDrizzle,
  CloudOff,
  CloudRain,
  Droplets,
  Info,
  MapPin,
  RefreshCw,
  Sprout,
  SunMedium,
  Thermometer,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { DashboardSidebar } from "../components/greenflow/DashboardSidebar";
import { WeatherMetricCard } from "../components/greenflow/WeatherMetricCard";
import {
  EnvironmentalTrendsChart,
  Et0TrendChart,
  RainfallHistoryChart,
  TemperatureTrendChart,
} from "../components/greenflow/weather/WeatherCharts";
import {
  CONDITION_LABELS,
  WeatherGlyph,
} from "../components/greenflow/weather/WeatherGlyph";
import { GRASS_OPTIONS, areaLabel } from "../data/lawnSetupOptions";
import { loadLawnProfile } from "../lib/lawnProfileStorage";
import {
  formatDecimal,
  formatLongDate,
  formatMonthDay,
  formatTimeOfDay,
  formatWeekdayShort,
} from "../lib/weatherFormat";
import {
  TODAY_ISO,
  YESTERDAY_ISO,
  averageRainfall,
  forecastAverageProbability,
  forecastEt0Average,
  forecastEt0Peak,
  forecastEt0Total,
  forecastRainTotal,
  forecastRainyDays,
  forecastTemperatureRange,
  observationsForRange,
  rainyDayCount,
  sampleSnapshotTime,
  sampleWeather,
  totalRainfall,
} from "../sample/sampleWeather";
import type { Screen } from "../types/screen";
import type { ObservationRangeDays, TrendMetric } from "../types/weather";

import "./WeatherIntelligencePage.css";

interface WeatherIntelligencePageProps {
  onNavigate: (screen: Screen) => void;
}

type PageStatus = "ready" | "loading" | "error" | "empty";

const RANGE_OPTIONS: ObservationRangeDays[] = [7, 14, 30];

const ET0_TOOLTIP =
  "ET₀ is a reference rate for a standard grass surface. It is useful for comparing days, but it is not the exact water requirement of every lawn — grass type, soil, shade, and sprinkler performance all change actual water use.";

// Lets the error and empty layouts be reviewed while this build has no network layer.
function initialStatus(): PageStatus {
  const forced = new URLSearchParams(window.location.search).get(
    "weatherState",
  );
  return forced === "error" || forced === "empty" ? forced : "ready";
}

function rainAmountText(value: number): string {
  return value > 0 ? formatDecimal(value) : "0";
}

function RangeControl({
  value,
  onChange,
  label,
}: {
  value: ObservationRangeDays;
  onChange: (value: ObservationRangeDays) => void;
  label: string;
}) {
  return (
    <div className="gf-wx-range" role="group" aria-label={label}>
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={[
            "gf-wx-range__button",
            option === value ? "gf-wx-range__button--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {option} days
        </button>
      ))}
    </div>
  );
}

function WeatherSkeleton() {
  return (
    <div className="gf-wx-skeleton" role="status">
      <span className="gf-visually-hidden">Loading sample weather data…</span>
      <div className="gf-wx-skeleton__hero" />
      <div className="gf-wx-skeleton__row">
        <div />
        <div />
        <div />
        <div />
      </div>
      <div className="gf-wx-skeleton__split">
        <div />
        <div />
      </div>
      <div className="gf-wx-skeleton__wide" />
    </div>
  );
}

function WeatherState({
  icon: Icon,
  title,
  body,
  onRetry,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  onRetry: () => void;
}) {
  return (
    <div className="gf-wx-state" role="alert">
      <span className="gf-wx-state__icon">
        <Icon size={26} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
      <button type="button" className="gf-wx-primary" onClick={onRetry}>
        <RefreshCw size={15} aria-hidden="true" />
        Retry sample data
      </button>
      <p className="gf-wx-state__note">
        No live weather request was made. Open-Meteo integration is not
        connected in this build.
      </p>
    </div>
  );
}

export function WeatherIntelligencePage({
  onNavigate,
}: WeatherIntelligencePageProps) {
  const [status, setStatus] = useState<PageStatus>(initialStatus);
  const [lastUpdated, setLastUpdated] = useState(sampleSnapshotTime);
  const [announcement, setAnnouncement] = useState("");
  const [rainRange, setRainRange] = useState<ObservationRangeDays>(7);
  const [trendRange, setTrendRange] = useState<ObservationRangeDays>(7);
  const [trendMetric, setTrendMetric] =
    useState<TrendMetric>("water-balance");
  const timerRef = useRef<number | null>(null);

  const today = useMemo(() => new Date(), []);
  const profileSummary = useMemo(() => {
    const profile = loadLawnProfile();
    if (!profile) return "No saved lawn profile";

    const grass = GRASS_OPTIONS.find(
      (option) => option.id === profile.grassType,
    );
    const area = areaLabel(profile.lawnArea.value, profile.lawnArea.unit);
    return grass ? `${area} · ${grass.label}` : area;
  }, []);

  const current = sampleWeather.current;
  const forecast = sampleWeather.forecast;
  const todayForecast = forecast[0];
  const rainDays = observationsForRange(rainRange);
  const trendDays = observationsForRange(trendRange);
  const recentWeek = observationsForRange(7);

  const rainTotal = totalRainfall(rainDays);
  const rainAverage = averageRainfall(rainDays);
  const rainDaysCount = rainyDayCount(rainDays);
  const recentWeekRain = totalRainfall(recentWeek);

  const forecastRain = forecastRainTotal();
  const forecastRainy = forecastRainyDays();
  const forecastProbability = forecastAverageProbability();
  const et0Total = forecastEt0Total();
  const et0Average = forecastEt0Average();
  const et0Peak = forecastEt0Peak();
  const temperatureRange = forecastTemperatureRange();

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function loadSampleData() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    setStatus("loading");
    setAnnouncement("");

    timerRef.current = window.setTimeout(() => {
      const refreshedAt = new Date();
      setLastUpdated(refreshedAt);
      setStatus("ready");
      setAnnouncement(
        `Sample weather data refreshed at ${formatTimeOfDay(refreshedAt)}.`,
      );
      timerRef.current = null;
    }, 700);
  }

  return (
    <div className="gf-shell">
      <DashboardSidebar
        activeScreen="weather"
        onOpenDashboard={() => onNavigate("dashboard")}
        onOpenLawnSetup={() => onNavigate("lawn-setup")}
      />

      <div className="gf-main">
        <header className="gf-header gf-wx-header">
          <div className="gf-header__intro">
            <p className="gf-eyebrow">Environmental intelligence</p>
            <h1>Weather Intelligence</h1>
            <p className="gf-wx-subtitle">
              Understand the environmental conditions affecting your lawn.
            </p>

            <div className="gf-wx-meta">
              <span className="gf-wx-meta__item">
                <MapPin size={14} aria-hidden="true" />
                {sampleWeather.locationLabel}
                <em>{sampleWeather.locationNote}</em>
              </span>
              <span className="gf-wx-meta__sep" aria-hidden="true">
                ·
              </span>
              <span className="gf-wx-meta__item">
                <Sprout size={14} aria-hidden="true" />
                {profileSummary}
              </span>
              <span className="gf-wx-meta__sep" aria-hidden="true">
                ·
              </span>
              <span className="gf-wx-meta__item">
                <CalendarDays size={14} aria-hidden="true" />
                {formatLongDate(today)}
              </span>
            </div>
          </div>

          <div className="gf-header__actions gf-wx-actions">
            <span className="gf-sample-badge">
              <Info size={14} aria-hidden="true" />
              Sample data — not live
            </span>
            <span className="gf-wx-updated">
              Last sample update
              <strong>{formatTimeOfDay(lastUpdated)}</strong>
            </span>
            <button
              type="button"
              className="gf-icon-button gf-wx-refresh"
              aria-label="Refresh sample weather data"
              title="Refresh sample weather data"
              onClick={loadSampleData}
              disabled={status === "loading"}
            >
              <RefreshCw
                size={17}
                aria-hidden="true"
                className={status === "loading" ? "gf-wx-spin" : undefined}
              />
            </button>
            <div className="gf-profile">
              <span className="gf-avatar" aria-hidden="true">
                MS
              </span>
              <span className="gf-profile__text">
                <strong>Sample user</strong>
                <small>Home lawn</small>
              </span>
            </div>
          </div>
        </header>

        <p className="gf-visually-hidden" role="status" aria-live="polite">
          {announcement}
        </p>

        <main
          className="gf-content gf-wx-content"
          aria-busy={status === "loading"}
        >
          <p className="gf-wx-datasource" role="note">
            <Info size={15} aria-hidden="true" />
            <span>
              <strong>Illustrative sample data.</strong> Open-Meteo is the
              intended weather provider, but no live weather connection is
              configured in this build. Your saved Lawn Profile does not
              include coordinates yet, so this screen uses a sample location
              and fixed values.
            </span>
          </p>

          {status === "loading" ? <WeatherSkeleton /> : null}

          {status === "error" ? (
            <WeatherState
              icon={AlertTriangle}
              title="Weather data is unavailable"
              body="The sample weather dataset could not be loaded. No live weather request was made."
              onRetry={loadSampleData}
            />
          ) : null}

          {status === "empty" ? (
            <WeatherState
              icon={CloudOff}
              title="No weather data for this location"
              body="There are no observations or forecast days to display yet. Reload the sample dataset to continue."
              onRetry={loadSampleData}
            />
          ) : null}

          {status === "ready" ? (
            <>
              <section
                className="gf-wx-hero"
                aria-labelledby="gf-wx-current-title"
              >
                <div className="gf-wx-hero__main">
                  <div className="gf-wx-hero__top">
                    <span className="gf-pill gf-pill--on-green">
                      <span className="gf-pill__dot" aria-hidden="true" />
                      Current conditions
                    </span>
                    <span className="gf-pill gf-pill--outline">
                      Sample snapshot
                    </span>
                  </div>

                  <h2
                    id="gf-wx-current-title"
                    className="gf-visually-hidden"
                  >
                    Current conditions
                  </h2>

                  <div className="gf-wx-hero__now">
                    <WeatherGlyph
                      condition={current.condition}
                      size="lg"
                    />
                    <div>
                      <p className="gf-wx-hero__temp">
                        <strong>{Math.round(current.tempC)}</strong>
                        <span>°C</span>
                      </p>
                      <p className="gf-wx-hero__condition">
                        {CONDITION_LABELS[current.condition]}
                      </p>
                    </div>
                  </div>

                  <p className="gf-wx-hero__range">
                    High {Math.round(current.highC)}°C · Low{" "}
                    {Math.round(current.lowC)}°C
                  </p>

                  <div className="gf-wx-hero__chips">
                    <span>
                      <Droplets size={15} aria-hidden="true" />
                      {Math.round(current.humidityPct)}% humidity
                    </span>
                    <span>
                      <Wind size={15} aria-hidden="true" />
                      {formatDecimal(current.windMs)} m/s wind
                    </span>
                    <span>
                      <CloudRain size={15} aria-hidden="true" />
                      {Math.round(current.rainChancePct)}% rain chance
                    </span>
                  </div>

                  <p className="gf-wx-hero__stamp">
                    {current.snapshotLabel}
                  </p>
                </div>

                <figure className="gf-wx-hero__media">
                  <img
                    src="/images/weather-current-lawn.jpg"
                    alt="A lush residential lawn under a partly cloudy sky."
                    width={1200}
                    height={800}
                  />
                  <figcaption>
                    {sampleWeather.locationLabel} · Sample photograph
                  </figcaption>
                </figure>
              </section>

              <section
                className="gf-section"
                aria-labelledby="gf-wx-metrics-title"
              >
                <div className="gf-section__header">
                  <div>
                    <p className="gf-eyebrow">Today at a glance</p>
                    <h2 id="gf-wx-metrics-title">
                      Current conditions in detail
                    </h2>
                  </div>
                  <span className="gf-soft-badge">Sample readings</span>
                </div>

                <div className="gf-weather-grid">
                  <WeatherMetricCard
                    icon={Thermometer}
                    tone="temperature"
                    label="High / low"
                    value={`${Math.round(current.highC)}°`}
                    unit={`/ ${Math.round(current.lowC)}°`}
                    detail="Today's temperature range"
                  />
                  <WeatherMetricCard
                    icon={Droplets}
                    tone="rain"
                    label="Humidity"
                    value={String(Math.round(current.humidityPct))}
                    unit="%"
                    detail="Relative humidity · sample reading"
                  />
                  <WeatherMetricCard
                    icon={Wind}
                    tone="forecast"
                    label="Wind speed"
                    value={formatDecimal(current.windMs)}
                    unit="m/s"
                    detail={`Gentle breeze · max ${formatDecimal(current.windMaxMs)} m/s today`}
                  />
                  <WeatherMetricCard
                    icon={CloudRain}
                    tone="rain"
                    label="Rain chance"
                    value={String(Math.round(current.rainChancePct))}
                    unit="%"
                    detail={`${formatDecimal(current.rainTodayMm)} mm expected today`}
                  />
                </div>
              </section>

              <div className="gf-wx-split">
                <section
                  className="gf-card gf-wx-rain"
                  aria-labelledby="gf-wx-rain-title"
                >
                  <div className="gf-card__header gf-wx-cardhead">
                    <div>
                      <p className="gf-eyebrow">Rainfall history</p>
                      <h2 id="gf-wx-rain-title">
                        Rain over the last {rainRange} days
                      </h2>
                    </div>
                    <RangeControl
                      value={rainRange}
                      onChange={setRainRange}
                      label="Rainfall history range"
                    />
                  </div>

                  <div className="gf-wx-stats">
                    <div>
                      <span>Total rainfall</span>
                      <strong>
                        {formatDecimal(rainTotal)}
                        <small>mm</small>
                      </strong>
                    </div>
                    <div>
                      <span>Daily average</span>
                      <strong>
                        {formatDecimal(rainAverage)}
                        <small>mm</small>
                      </strong>
                    </div>
                    <div>
                      <span>Rainy days</span>
                      <strong>
                        {rainDaysCount}
                        <small>of {rainRange}</small>
                      </strong>
                    </div>
                  </div>

                  <RainfallHistoryChart days={rainDays} range={rainRange} />

                  <div className="gf-wx-chart-foot">
                    <ul className="gf-wx-legend">
                      <li>
                        <i
                          className="gf-wx-swatch gf-wx-swatch--rain"
                          aria-hidden="true"
                        />
                        Rain recorded
                      </li>
                      <li>
                        <i
                          className="gf-wx-swatch gf-wx-swatch--dry"
                          aria-hidden="true"
                        />
                        No rain
                      </li>
                    </ul>
                    <span className="gf-wx-unit">Daily total · mm</span>
                  </div>

                  <p className="gf-wx-caption">
                    Observed totals for completed days through{" "}
                    {formatMonthDay(YESTERDAY_ISO)}. Today appears in the
                    forecast.
                  </p>
                </section>

                <section
                  className="gf-card gf-wx-upcoming"
                  aria-labelledby="gf-wx-upcoming-title"
                >
                  <div className="gf-card__header">
                    <div>
                      <p className="gf-eyebrow">Upcoming rainfall</p>
                      <h2 id="gf-wx-upcoming-title">Next 7 days</h2>
                    </div>
                    <span className="gf-soft-badge">Forecast</span>
                  </div>

                  <div className="gf-wx-forecast-summary">
                    <div>
                      <strong>{formatDecimal(forecastRain)}</strong>
                      <span>mm expected</span>
                    </div>
                    <div>
                      <strong>{forecastRainy}</strong>
                      <span>days with ≥1 mm</span>
                    </div>
                    <div>
                      <strong>{forecastProbability}%</strong>
                      <span>average chance</span>
                    </div>
                  </div>

                  <ul className="gf-wx-forecast-list">
                    {forecast.map((day, index) => (
                      <li
                        className={[
                          "gf-wx-fday",
                          index === 0 ? "gf-wx-fday--today" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={day.date}
                      >
                        <WeatherGlyph
                          condition={day.condition}
                          size="sm"
                          label={CONDITION_LABELS[day.condition]}
                        />
                        <span className="gf-wx-fday__day">
                          <strong>
                            {index === 0
                              ? "Today"
                              : formatWeekdayShort(day.date)}
                          </strong>
                          <small>{formatMonthDay(day.date)}</small>
                        </span>
                        <span className="gf-wx-fday__amount">
                          <strong>{rainAmountText(day.rainfallMm)}</strong>
                          mm
                        </span>
                        <span className="gf-wx-fday__prob">
                          {Math.round(day.precipitationProbabilityPct)}%
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="gf-wx-caption gf-wx-caption--icon">
                    <Info size={13} aria-hidden="true" />
                    Rain probability is not a guarantee. Amounts are expected
                    daily totals.
                  </p>
                </section>
              </div>

              <div className="gf-wx-split gf-wx-split--analytics">
                <section
                  className="gf-card gf-wx-et0"
                  aria-labelledby="gf-wx-et0-title"
                >
                  <div className="gf-card__header">
                    <div>
                      <p className="gf-eyebrow">Water loss indicator</p>
                      <div className="gf-wx-et0__title-row">
                        <h2 id="gf-wx-et0-title">
                          Reference Evapotranspiration (ET₀)
                        </h2>
                        <span className="gf-wx-info">
                          <button
                            type="button"
                            className="gf-wx-info__button"
                            aria-label="About reference evapotranspiration"
                            aria-describedby="gf-wx-et0-explainer"
                          >
                            <Info size={14} aria-hidden="true" />
                          </button>
                          <span
                            className="gf-wx-info__bubble"
                            aria-hidden="true"
                          >
                            {ET0_TOOLTIP}
                          </span>
                        </span>
                      </div>
                    </div>
                    <span className="gf-soft-badge">Reference</span>
                  </div>

                  <p
                    className="gf-visually-hidden"
                    id="gf-wx-et0-explainer"
                  >
                    {ET0_TOOLTIP}
                  </p>

                  <div className="gf-wx-et0__body">
                    <div className="gf-wx-et0__summary">
                      <p className="gf-wx-et0__value">
                        <strong>
                          {formatDecimal(todayForecast?.et0Mm ?? 0)}
                        </strong>
                        <span>mm/day</span>
                      </p>
                      <p className="gf-wx-et0__label">
                        Today's reference ET₀
                      </p>

                      <dl className="gf-wx-et0__stats">
                        <div>
                          <dt>Next 7 days</dt>
                          <dd>{formatDecimal(et0Total)} mm</dd>
                        </div>
                        <div>
                          <dt>Daily average</dt>
                          <dd>{formatDecimal(et0Average)} mm/day</dd>
                        </div>
                        <div>
                          <dt>Peak day</dt>
                          <dd>{formatDecimal(et0Peak)} mm/day</dd>
                        </div>
                      </dl>

                      <p className="gf-wx-et0__explain">
                        ET₀ estimates how much water could be lost through
                        evaporation and plant transpiration under reference
                        conditions.
                      </p>
                      <p className="gf-wx-et0__disclaimer">
                        It is not the exact water requirement of every lawn.
                        Grass type, soil, shade, and sprinkler performance all
                        change actual water use.
                      </p>
                    </div>

                    <div className="gf-wx-et0__chart">
                      <div className="gf-wx-minihead">
                        <span>Next 7 days</span>
                        <span>mm/day</span>
                      </div>
                      <Et0TrendChart
                        forecast={forecast}
                        todayIso={TODAY_ISO}
                      />
                      <div className="gf-wx-chart-foot">
                        <ul className="gf-wx-legend">
                          <li>
                            <i
                              className="gf-wx-swatch gf-wx-swatch--et0"
                              aria-hidden="true"
                            />
                            Reference ET₀
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </section>

                <section
                  className="gf-card gf-wx-temp"
                  aria-labelledby="gf-wx-temp-title"
                >
                  <div className="gf-card__header">
                    <div>
                      <p className="gf-eyebrow">Temperature trend</p>
                      <h2 id="gf-wx-temp-title">Next 7 days</h2>
                    </div>
                    <span className="gf-soft-badge">Forecast</span>
                  </div>

                  <div className="gf-wx-temp__stats">
                    <div>
                      <span>Warmest</span>
                      <strong>{Math.round(temperatureRange.high)}°C</strong>
                    </div>
                    <div>
                      <span>Coolest</span>
                      <strong>{Math.round(temperatureRange.low)}°C</strong>
                    </div>
                  </div>

                  <TemperatureTrendChart
                    forecast={forecast}
                    todayIso={TODAY_ISO}
                  />

                  <div className="gf-wx-chart-foot">
                    <ul className="gf-wx-legend">
                      <li>
                        <i
                          className="gf-wx-swatch gf-wx-swatch--high"
                          aria-hidden="true"
                        />
                        High
                      </li>
                      <li>
                        <i
                          className="gf-wx-swatch gf-wx-swatch--low"
                          aria-hidden="true"
                        />
                        Low
                      </li>
                    </ul>
                    <span className="gf-wx-unit">Daily · °C</span>
                  </div>

                  <p className="gf-wx-caption">
                    Forecast daily high and low temperatures.
                  </p>
                </section>
              </div>

              <section
                className="gf-card gf-wx-trends"
                aria-labelledby="gf-wx-trends-title"
              >
                <div className="gf-card__header gf-wx-cardhead">
                  <div>
                    <p className="gf-eyebrow">Environmental trends</p>
                    <h2 id="gf-wx-trends-title">
                      How conditions are trending
                    </h2>
                  </div>
                  <div className="gf-wx-trends__controls">
                    <div
                      className="gf-wx-tabs"
                      role="group"
                      aria-label="Trend metric"
                    >
                      <button
                        type="button"
                        className={[
                          "gf-wx-tabs__button",
                          trendMetric === "water-balance"
                            ? "gf-wx-tabs__button--active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-pressed={trendMetric === "water-balance"}
                        onClick={() => setTrendMetric("water-balance")}
                      >
                        Water balance
                      </button>
                      <button
                        type="button"
                        className={[
                          "gf-wx-tabs__button",
                          trendMetric === "temperature"
                            ? "gf-wx-tabs__button--active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-pressed={trendMetric === "temperature"}
                        onClick={() => setTrendMetric("temperature")}
                      >
                        Temperature
                      </button>
                    </div>
                    <RangeControl
                      value={trendRange}
                      onChange={setTrendRange}
                      label="Environmental trends range"
                    />
                  </div>
                </div>

                <p className="gf-wx-trends__intro">
                  {trendMetric === "water-balance"
                    ? "Rainfall reaching the lawn compared with the reference rate of water loss over the same completed days."
                    : "Observed daily high and low temperatures over the selected period."}
                </p>

                <EnvironmentalTrendsChart
                  days={trendDays}
                  range={trendRange}
                  metric={trendMetric}
                />

                <div className="gf-wx-chart-foot">
                  {trendMetric === "water-balance" ? (
                    <ul className="gf-wx-legend">
                      <li>
                        <i
                          className="gf-wx-swatch gf-wx-swatch--rain"
                          aria-hidden="true"
                        />
                        Rainfall (mm)
                      </li>
                      <li>
                        <i
                          className="gf-wx-swatch gf-wx-swatch--et0"
                          aria-hidden="true"
                        />
                        Reference ET₀ (mm/day)
                      </li>
                    </ul>
                  ) : (
                    <ul className="gf-wx-legend">
                      <li>
                        <i
                          className="gf-wx-swatch gf-wx-swatch--high"
                          aria-hidden="true"
                        />
                        Daily high (°C)
                      </li>
                      <li>
                        <i
                          className="gf-wx-swatch gf-wx-swatch--low"
                          aria-hidden="true"
                        />
                        Daily low (°C)
                      </li>
                    </ul>
                  )}
                  <span className="gf-wx-unit">
                    {trendMetric === "water-balance"
                      ? "Left: rain mm · Right: ET₀ mm/day"
                      : "Observed · °C"}
                  </span>
                </div>

                <p className="gf-wx-caption">
                  Observed values for completed days through{" "}
                  {formatMonthDay(YESTERDAY_ISO)}. Showing the last{" "}
                  {trendRange} days.
                </p>
              </section>

              <section
                className="gf-wx-impact"
                aria-labelledby="gf-wx-impact-title"
              >
                <div className="gf-section__header">
                  <div>
                    <p className="gf-eyebrow">Weather impact</p>
                    <h2 id="gf-wx-impact-title">
                      How is the weather affecting your lawn?
                    </h2>
                  </div>
                  <span className="gf-soft-badge">Conditions only</span>
                </div>

                <div className="gf-wx-impact__grid">
                  <article className="gf-wx-impactcard">
                    <div className="gf-wx-impactcard__top">
                      <span className="gf-wx-impactcard__icon gf-wx-impactcard__icon--rain">
                        <CloudRain size={18} aria-hidden="true" />
                      </span>
                      <span className="gf-wx-impactcard__tag">
                        Recent rainfall
                      </span>
                    </div>
                    <h3>{formatDecimal(recentWeekRain)} mm in the last 7 days</h3>
                    <p>
                      Recent rain may reduce how much irrigation your lawn
                      needs this week. Check soil moisture before extending a
                      cycle.
                    </p>
                  </article>

                  <article className="gf-wx-impactcard">
                    <div className="gf-wx-impactcard__top">
                      <span className="gf-wx-impactcard__icon gf-wx-impactcard__icon--forecast">
                        <CloudDrizzle size={18} aria-hidden="true" />
                      </span>
                      <span className="gf-wx-impactcard__tag">
                        Forecast rainfall
                      </span>
                    </div>
                    <h3>
                      {formatDecimal(forecastRain)} mm expected this week
                    </h3>
                    <p>
                      Rain is forecast on {forecastRainy}{" "}
                      {forecastRainy === 1 ? "day" : "days"}. It may soften
                      demand, but it may not replace a full watering cycle.
                    </p>
                  </article>

                  <article className="gf-wx-impactcard">
                    <div className="gf-wx-impactcard__top">
                      <span className="gf-wx-impactcard__icon gf-wx-impactcard__icon--et0">
                        <SunMedium size={18} aria-hidden="true" />
                      </span>
                      <span className="gf-wx-impactcard__tag">
                        Reference ET₀
                      </span>
                    </div>
                    <h3>{formatDecimal(et0Average)} mm/day reference loss</h3>
                    <p>
                      Warmer, sunnier days increase potential water loss. The
                      7-day reference total is {formatDecimal(et0Total)} mm;
                      actual lawn use may differ.
                    </p>
                  </article>
                </div>

                <div className="gf-wx-impact__note">
                  <div className="gf-wx-impact__note-text">
                    <Info size={16} aria-hidden="true" />
                    <p>
                      These summaries describe environmental conditions only.
                      They do not decide SKIP, REDUCE, or WATER — that decision
                      belongs to the irrigation recommendation engine.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="gf-wx-link"
                    onClick={() => onNavigate("dashboard")}
                  >
                    See today's recommendation
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </div>
              </section>
            </>
          ) : null}
        </main>

        <footer className="gf-footer">
          <p>
            Sample weather data for interface review. Values are illustrative,
            not live observations or forecasts. Open-Meteo is the intended
            provider; its free tier is non-commercial.
          </p>
          <p>Advisory only. GreenFlow does not control your sprinkler timer.</p>
        </footer>
      </div>
    </div>
  );
}
