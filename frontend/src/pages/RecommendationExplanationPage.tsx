import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CalendarDays,
  Check,
  CheckCircle2,
  CloudOff,
  CloudRain,
  Droplets,
  ExternalLink,
  Info,
  Layers,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Timer,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";

import { ApiError } from "../api/client";
import {
  confirmRecommendation,
  type FeedbackResponse,
} from "../api/feedback";
import {
  fetchRecommendation,
  fetchStoredRecommendation,
  type RecommendationFactor,
  type RecommendationResponse,
} from "../api/recommendations";
import { DashboardSidebar } from "../components/greenflow/DashboardSidebar";
import { areaLabel } from "../data/lawnSetupOptions";
import {
  loadLawnProfile,
  matchesRecommendationInputs,
} from "../lib/lawnProfileStorage";
import {
  clearLastRecommendation,
  loadLastRecommendation,
  saveLastRecommendation,
} from "../lib/lastRecommendation";
import { syncProfileFromServer } from "../lib/profileSync";
import { factsFor, METRIC_LABELS } from "../lib/recommendationView";
import {
  formatVolume,
} from "../lib/savingsFormat";
import {
  formatDecimal,
  formatLongDate,
  formatMonthDay,
  formatTimeOfDay,
} from "../lib/weatherFormat";
import type { RecommendationState } from "../types/recommendation";
import type { LawnProfile } from "../types/lawnProfile";
import type { Screen } from "../types/screen";

import "./RecommendationExplanationPage.css";

interface RecommendationExplanationPageProps {
  onNavigate: (screen: Screen) => void;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; data: RecommendationResponse }
  | { kind: "no-profile" }
  | { kind: "error"; error: ApiError };

const STATE_TITLES: Record<RecommendationState, string> = {
  SKIP: "Skip this watering",
  REDUCE: "Water less today",
  WATER: "Water today",
};

const STATE_LABELS: Record<RecommendationState, string> = {
  SKIP: "Skip",
  REDUCE: "Reduce",
  WATER: "Water",
};

const FAILURE_COPY: Record<
  string,
  { title: string; icon: LucideIcon; hint: string }
> = {
  constants_unavailable: {
    title: "This profile cannot be calculated",
    icon: Layers,
    hint: "GreenFlow has no cited soil or grass constants for one of your saved selections. Update the profile with a supported soil and grass class.",
  },
  weather_unavailable: {
    title: "Live weather is unavailable",
    icon: CloudOff,
    hint: "Open-Meteo did not return usable weather for this location. Nothing was invented to fill the gap. Retry in a moment or check the saved coordinates.",
  },
  stale_weather_data: {
    title: "Weather data is not current",
    icon: CloudRain,
    hint: "The newest weather data is not current enough to support a recommendation. Retry when Open-Meteo returns today's data.",
  },
  last_watering_out_of_range: {
    title: "Last watering date is outside the weather history",
    icon: CalendarDays,
    hint: "Open-Meteo history covers the last 7 days. Update the last watering date in your profile to a date within that window.",
  },
  insufficient_forecast: {
    title: "Not enough forecast days",
    icon: CloudRain,
    hint: "The forecast is shorter than the decision horizon. Retry later; no partial forecast is used.",
  },
  profile_not_found: {
    title: "Saved profile not found",
    icon: AlertTriangle,
    hint: "The backend no longer has this profile. Re-save your lawn profile to create it again.",
  },
  network_error: {
    title: "GreenFlow backend is unreachable",
    icon: AlertTriangle,
    hint: "Start the backend and retry. No recommendation is calculated in the browser.",
  },
};

function errorCopy(error: ApiError) {
  return (
    FAILURE_COPY[error.code] ?? {
      title: "Recommendation unavailable",
      icon: AlertTriangle,
      hint: error.message,
    }
  );
}

function RecommendationSkeleton() {
  return (
    <div className="gf-rec-skeleton" role="status">
      <span className="gf-visually-hidden">
        Requesting live weather and calculating your recommendation…
      </span>
      <div className="gf-rec-skeleton__hero" />
      <div className="gf-rec-skeleton__row">
        <div />
        <div />
        <div />
      </div>
      <div className="gf-rec-skeleton__split">
        <div />
        <div />
      </div>
    </div>
  );
}

function RecommendationStateCard({
  icon: Icon,
  title,
  body,
  note,
  primaryLabel,
  onPrimary,
  onSecondary,
  secondaryLabel,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  note: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="gf-rec-statecard" role="alert">
      <span className="gf-rec-statecard__icon">
        <Icon size={26} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
      <p className="gf-rec-statecard__note">{note}</p>
      <div className="gf-rec-statecard__actions">
        <button type="button" className="gf-rec-primary" onClick={onPrimary}>
          <RefreshCw size={15} aria-hidden="true" />
          {primaryLabel}
        </button>
        {onSecondary && secondaryLabel ? (
          <button
            type="button"
            className="gf-rec-ghost"
            onClick={onSecondary}
          >
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function sourceLabelFor(
  sources: RecommendationResponse["sources"],
  sourceId: string | null,
): string {
  if (!sourceId) return "Product policy";
  const source = sources.find((item) => item.id === sourceId);
  return source ? source.label : "Calculated";
}

function FactorCard({
  factor,
  sources,
}: {
  factor: RecommendationFactor;
  sources: RecommendationResponse["sources"];
}) {
  return (
    <article className="gf-rec-factor">
      <div className="gf-rec-factor__top">
        <span className="gf-rec-factor__icon">
          {factor.id.includes("rain") ? (
            <CloudRain size={17} aria-hidden="true" />
          ) : factor.id.includes("et0") || factor.id.includes("crop") ? (
            <Waves size={17} aria-hidden="true" />
          ) : factor.id.includes("soil") || factor.id.includes("depth") ? (
            <Layers size={17} aria-hidden="true" />
          ) : factor.id.includes("grass") ? (
            <Sprout size={17} aria-hidden="true" />
          ) : (
            <Info size={17} aria-hidden="true" />
          )}
        </span>
        <div>
          <h3>{factor.label}</h3>
          <p className="gf-rec-factor__meta">
            {factor.role === "applied"
              ? "Applied in the calculation"
              : "Context only — not used in the depth decision"}
          </p>
        </div>
      </div>
      <p className="gf-rec-factor__value">{factor.value}</p>
      <p className="gf-rec-factor__body">{factor.detail}</p>
      <div className="gf-rec-factor__foot">
        <span
          className={`gf-rec-direction gf-rec-direction--${factor.role}`}
        >
          {factor.role === "applied" ? "Applied" : "Context"}
        </span>
        <span className="gf-rec-factor__source">
          {sourceLabelFor(sources, factor.source_id)}
        </span>
      </div>
    </article>
  );
}

interface ProjectionPoint {
  date: string;
  label: string;
  depletion: number;
}

function ProjectionTooltip({
  active,
  payload,
  thresholdMm,
}: TooltipContentProps & { thresholdMm: number | null }) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload as ProjectionPoint | undefined;
  if (!point) return null;

  const aboveThreshold =
    thresholdMm !== null && Number.isFinite(point.depletion)
      ? point.depletion > thresholdMm
      : null;

  return (
    <div className="gf-math-tip">
      <p className="gf-math-tip__title">{point.label}</p>
      <p className="gf-math-tip__row">
        <span>Projected depletion</span>
        <strong>{formatDecimal(point.depletion)} mm</strong>
      </p>
      {thresholdMm !== null ? (
        <p className="gf-math-tip__row">
          <span>Skip threshold</span>
          <strong>{formatDecimal(thresholdMm)} mm</strong>
        </p>
      ) : null}
      {aboveThreshold !== null ? (
        <p className="gf-math-tip__status">
          {aboveThreshold
            ? "Above the skip threshold"
            : "At or below the skip threshold"}
        </p>
      ) : null}
    </div>
  );
}

function ProjectionChart({
  points,
  thresholdMm,
  state,
}: {
  points: ProjectionPoint[];
  thresholdMm: number | null;
  state: RecommendationState;
}) {
  if (points.length === 0) {
    return (
      <div className="gf-math-chart__empty" role="note">
        The stored projection could not be plotted. The exact engine values
        remain available in the table below.
      </div>
    );
  }

  return (
    <figure className="gf-math-chart">
      <figcaption className="gf-visually-hidden">
        Line chart of projected soil-water depletion over the{" "}
        {points.length}-day decision horizon. The highest projected value
        determines the {state} recommendation against the skip threshold.
      </figcaption>

      <div className="gf-math-chart__legend" aria-hidden="true">
        <span>
          <i className="gf-math-chart__swatch" />
          Projected depletion (mm)
        </span>
        {thresholdMm !== null ? (
          <span>
            <i className="gf-math-chart__swatch gf-math-chart__swatch--threshold" />
            Skip threshold · {formatDecimal(thresholdMm)} mm
          </span>
        ) : (
          <span className="gf-math-chart__legend-note">
            Skip threshold unavailable
          </span>
        )}
      </div>

      <div className="gf-math-chart__plot">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 12, right: 18, bottom: 28, left: 10 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="#e9efe7" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#5f6f64", fontSize: 11 }}
              tickMargin={9}
              label={{
                value: "Forecast date",
                position: "insideBottom",
                offset: -18,
                fill: "#5f6f64",
                fontSize: 11,
              }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#5f6f64", fontSize: 11 }}
              tickMargin={9}
              width={62}
              domain={[0, "auto"]}
              tickFormatter={(value: number) => `${formatDecimal(value)} mm`}
              label={{
                value: "Depletion (mm)",
                angle: -90,
                position: "insideLeft",
                fill: "#5f6f64",
                fontSize: 11,
              }}
            />
            <Tooltip
              cursor={{ stroke: "#c9d7c8", strokeDasharray: "4 4" }}
              content={(props) => (
                <ProjectionTooltip {...props} thresholdMm={thresholdMm} />
              )}
            />
            {thresholdMm !== null ? (
              <ReferenceLine
                y={thresholdMm}
                stroke="#b07a2a"
                strokeDasharray="6 4"
                ifOverflow="extendDomain"
                label={{
                  value: `Skip ${formatDecimal(thresholdMm)} mm`,
                  position: "insideTopRight",
                  fill: "#8a5a16",
                  fontSize: 11,
                }}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="depletion"
              name="Projected depletion"
              stroke="#176b3a"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#176b3a", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#176b3a", strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="gf-math-chart__note">
        The highest projected point is compared with the dashed skip threshold.
        At or below the threshold the engine returns SKIP; above it, the depth
        is converted into the recommended run time.
      </p>
    </figure>
  );
}

export function RecommendationExplanationPage({
  onNavigate,
}: RecommendationExplanationPageProps) {
  const [profile, setProfile] = useState<LawnProfile | null>(() =>
    loadLawnProfile(),
  );
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [announcement, setAnnouncement] = useState("");
  const [confirmation, setConfirmation] =
    useState<FeedbackResponse | null>(null);
  const [confirming, setConfirming] = useState<boolean | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const startedRef = useRef(false);

  const profileId = profile?.backendId ?? null;

  // The recommendation's area, rate and baseline come from the server, so the
  // local profile copy is refreshed from the same source before it is compared
  // against them.
  useEffect(() => {
    if (!profileId) return;

    let active = true;
    void syncProfileFromServer(profileId).then((refreshed) => {
      if (active && refreshed) setProfile(refreshed);
    });

    return () => {
      active = false;
    };
  }, [profileId]);

  const resetForLoad = () => {
    setView({ kind: "loading" });
    setConfirmation(null);
    setConfirmError("");
    setAnnouncement("");
  };

  const toError = (error: unknown) => {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(0, "unknown_error", "The recommendation failed.");
    setView({ kind: "error", error: apiError });
    setAnnouncement(apiError.message);
  };

  const show = (data: RecommendationResponse, note: string) => {
    saveLastRecommendation(data);
    setView({ kind: "ready", data });
    setAnnouncement(
      `${data.state} recommendation loaded. ${note} Recommended duration ${data.recommended_minutes} minutes.`,
    );
  };

  /** Calculate a new recommendation: a new id, a new timestamp, every screen updates. */
  const regenerate = useCallback(async () => {
    if (!profileId) {
      setView({ kind: "no-profile" });
      return;
    }

    resetForLoad();

    try {
      show(await fetchRecommendation(profileId), "Calculated from live weather.");
    } catch (error) {
      toError(error);
    }
  }, [profileId]);

  /**
   * Open the recommendation the user was last shown. The server replays its
   * stored response, so this page cannot disagree with the dashboard.
   */
  const load = useCallback(async () => {
    if (!profile || !profileId) {
      setView({ kind: "no-profile" });
      return;
    }

    resetForLoad();

    const stored = loadLastRecommendation();
    if (!stored || stored.profile_id !== profileId) {
      await regenerate();
      return;
    }

    try {
      show(
        await fetchStoredRecommendation(stored.id),
        "Replayed from the recommendation you were shown.",
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 409)
      ) {
        clearLastRecommendation();
        await regenerate();
        return;
      }
      toError(error);
    }
  }, [profile, profileId, regenerate]);
  useEffect(() => {
    // StrictMode re-runs mount effects twice in dev; each run creates a
    // recommendation row, so only the first visit should trigger a fetch.
    if (startedRef.current) return;
    startedRef.current = true;
    void load();
  }, [load]);

  async function recordConfirmation(
    data: RecommendationResponse,
    followed: boolean,
  ) {
    setConfirming(followed);
    setConfirmError("");

    try {
      const result = await confirmRecommendation(data.id, followed);
      setConfirmation(result);
      setAnnouncement(
        result.already_confirmed
          ? "This recommendation was already confirmed. No duplicate was created."
          : followed
            ? "Confirmed: you followed the recommendation. Water Savings has been updated."
            : "Confirmed: you kept your normal schedule. The recommendation is recorded as not followed.",
      );
    } catch (error) {
      setConfirmError(
        error instanceof ApiError
          ? error.message
          : "The confirmation could not be saved. Retry when the backend is reachable.",
      );
    } finally {
      setConfirming(null);
    }
  }

  const ready = view.kind === "ready" ? view.data : null;
  const facts = ready ? factsFor(ready) : null;
  const adviceMatchesProfile =
    ready && facts && profile
      ? matchesRecommendationInputs(profile, {
          lawnAreaM2: facts.lawnAreaM2,
          precipitationRateMmPerHour: facts.precipitationRateMmPerHour,
          baselineMinutesPerEvent: facts.baselineMinutes,
        })
      : true;
  const error = view.kind === "error" ? view.error : null;
  const copy = error ? errorCopy(error) : null;

  const projectionPoints = useMemo<ProjectionPoint[]>(() => {
    if (!ready) return [];

    return ready.why.projected_depletions_mm.flatMap((value, index) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return [];

      const date = ready.inputs.forecast[index]?.date ?? "";
      return [
        {
          date,
          label: date ? formatMonthDay(date) : `Day ${index + 1}`,
          depletion: value,
        },
      ];
    });
  }, [ready]);

  const skipThresholdMm =
    ready &&
    Number.isFinite(ready.why.skip_threshold_mm) &&
    ready.why.skip_threshold_mm >= 0
      ? ready.why.skip_threshold_mm
      : null;

  const avoidedMinutes = ready
    ? Math.max(0, ready.baseline_minutes - ready.recommended_minutes)
    : 0;
  const recommendedShare = ready
    ? ready.baseline_minutes > 0
      ? Math.round(
          (ready.recommended_minutes / ready.baseline_minutes) * 100,
        )
      : 0
    : 0;

  return (
    <div className="gf-shell">
      <DashboardSidebar
        activeScreen="dashboard"
        onOpenDashboard={() => onNavigate("dashboard")}
        onOpenLawnSetup={() => onNavigate("lawn-setup")}
      />

      <div className="gf-main">
        <header className="gf-header gf-rec-header">
          <div className="gf-header__intro">
            <p className="gf-eyebrow">Recommendation details</p>
            <h1>Why This Recommendation?</h1>
            <p className="gf-rec-subtitle">
              Every number below traces to your saved profile, live weather, or
              a cited constant.
            </p>

            <div className="gf-rec-meta">
              <span className="gf-rec-meta__item">
                <MapPin size={14} aria-hidden="true" />
                {profile ? profile.location.label : "No saved location"}
                <em>{profile ? "Saved location" : "Profile required"}</em>
              </span>
              <span className="gf-rec-meta__sep" aria-hidden="true">
                ·
              </span>
              <span className="gf-rec-meta__item">
                <Sprout size={14} aria-hidden="true" />
                {profile
                  ? areaLabel(profile.lawnArea.value, profile.lawnArea.unit)
                  : "Lawn profile not saved"}
                {profile ? <em>{profile.grassType}</em> : null}
              </span>
              {ready ? (
                <>
                  <span className="gf-rec-meta__sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="gf-rec-meta__item">
                    <CalendarDays size={14} aria-hidden="true" />
                    Calculated{" "}
                    {formatTimeOfDay(new Date(ready.created_at))} ·{" "}
                    {formatLongDate(new Date(ready.created_at))}
                  </span>
                  <span className="gf-rec-meta__sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="gf-rec-meta__item">
                    <RefreshCw size={14} aria-hidden="true" />
                    Weather retrieved{" "}
                    {formatTimeOfDay(
                      new Date(ready.freshness.retrieved_at),
                    )}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="gf-header__actions gf-rec-actions">
            {ready ? (
              <span className="gf-sample-badge gf-live-badge">
                <span className="gf-live-dot" aria-hidden="true" />
                Live calculation
              </span>
            ) : null}
            <button
              type="button"
              className="gf-icon-button gf-rec-refresh"
              aria-label="Recalculate with the latest weather"
              title="Fetch live weather and calculate a new recommendation"
              onClick={() => void regenerate()}
              disabled={view.kind === "loading" || !profileId}
            >
              <RefreshCw
                size={17}
                aria-hidden="true"
                className={
                  view.kind === "loading" ? "gf-rec-spin" : undefined
                }
              />
            </button>
            <div className="gf-profile">
              <span className="gf-avatar" aria-hidden="true">
                GF
              </span>
              <span className="gf-profile__text">
                <strong>{profile ? profile.location.label : "Home lawn"}</strong>
                <small>Advisory only</small>
              </span>
            </div>
          </div>
        </header>

        <p className="gf-visually-hidden" role="status" aria-live="polite">
          {announcement}
        </p>

        <main
          className="gf-content gf-rec-content"
          aria-busy={view.kind === "loading"}
        >
          {ready ? (
            <p className="gf-rec-datasource" role="note">
              <Info size={15} aria-hidden="true" />
              <span>
                <strong>Live calculation.</strong> Weather and ET₀ were
                retrieved from Open-Meteo at{" "}
                {formatTimeOfDay(
                  new Date(ready.freshness.retrieved_at),
                )}{" "}
                for {profile?.location.label ?? "your saved location"}. The
                water balance uses your saved soil, grass, precipitation rate,
                and last watering. No soil-moisture sensor, flow meter, or
                timer connection is used.
              </span>
            </p>
          ) : null}

          {view.kind === "loading" ? <RecommendationSkeleton /> : null}

          {view.kind === "no-profile" ? (
            <RecommendationStateCard
              icon={Sprout}
              title="Complete your lawn profile first"
              body="A live recommendation needs your location, lawn area, grass, soil, sprinkler precipitation rate, normal runtime, frequency, and last watering date."
              note="Nothing is estimated from a sample profile in the live flow."
              primaryLabel="Open lawn profile"
              onPrimary={() => onNavigate("lawn-setup")}
              secondaryLabel="Back to dashboard"
              onSecondary={() => onNavigate("dashboard")}
            />
          ) : null}

          {error && copy ? (
            <RecommendationStateCard
              icon={copy.icon}
              title={copy.title}
              body={error.message}
              note={copy.hint}
              primaryLabel={
                error.code === "profile_not_found" ||
                error.code === "constants_unavailable" ||
                error.code === "last_watering_out_of_range"
                  ? "Update lawn profile"
                  : "Retry"
              }
              onPrimary={() => {
                if (
                  error.code === "profile_not_found" ||
                  error.code === "constants_unavailable" ||
                  error.code === "last_watering_out_of_range"
                ) {
                  onNavigate("lawn-setup");
                } else {
                  void load();
                }
              }}
              secondaryLabel={
                error.code === "network_error"
                  ? "Back to dashboard"
                  : error.code === "constants_unavailable" ||
                      error.code === "last_watering_out_of_range"
                    ? "Retry"
                    : "Review profile"
              }
              onSecondary={() => {
                if (error.code === "network_error") {
                  onNavigate("dashboard");
                } else if (
                  error.code === "constants_unavailable" ||
                  error.code === "last_watering_out_of_range"
                ) {
                  void load();
                } else {
                  onNavigate("lawn-setup");
                }
              }}
            />
          ) : null}

          {ready && facts ? (
            <>
              <section
                className={`gf-rec-hero gf-rec-hero--${ready.state.toLowerCase()}`}
                aria-labelledby="gf-rec-summary-title"
              >
                <div className="gf-rec-hero__main">
                  <div className="gf-rec-hero__top">
                    <span className="gf-pill gf-pill--on-green">
                      <span className="gf-pill__dot" aria-hidden="true" />
                      {STATE_LABELS[ready.state]} recommendation
                    </span>
                    <span className="gf-pill gf-pill--outline">
                      {ready.why.horizon_days}-day decision horizon
                    </span>
                  </div>

                  <p className="gf-rec-hero__kicker">
                    {formatLongDate(new Date(ready.created_at))}
                    <span aria-hidden="true"> · </span>
                    Recommended run time
                  </p>

                  <h2
                    id="gf-rec-summary-title"
                    className="gf-rec-hero__state"
                  >
                    {STATE_TITLES[ready.state]}
                  </h2>
                  <p className="gf-rec-hero__explain">{ready.reason}</p>

                  <div className="gf-rec-durations">
                    <div>
                      <span>Normal schedule</span>
                      <strong>{ready.baseline_minutes} min</strong>
                    </div>
                    <div>
                      <span>Recommended</span>
                      <strong>{ready.recommended_minutes} min</strong>
                    </div>
                    <div>
                      <span>Difference</span>
                      <strong>
                        {avoidedMinutes > 0
                          ? `−${avoidedMinutes} min`
                          : ready.suggested_change_minutes > 0
                            ? `+${ready.suggested_change_minutes} min`
                            : "No change"}
                      </strong>
                    </div>
                  </div>

                  <div
                    className="gf-rec-durationbar"
                    role="img"
                    aria-label={`Recommended duration is ${ready.recommended_minutes} of ${ready.baseline_minutes} normal minutes, ${recommendedShare} percent.`}
                  >
                    <span style={{ width: `${recommendedShare}%` }} />
                  </div>

                  <dl className="gf-rec-durations gf-rec-volumes">
                    <div>
                      <dt>{METRIC_LABELS.baselineWaterLitres}</dt>
                      <dd>
                        {formatVolume(facts.baselineWaterLitres, "liters")}
                      </dd>
                    </div>
                    <div>
                      <dt>{METRIC_LABELS.recommendedWaterLitres}</dt>
                      <dd>
                        {formatVolume(facts.recommendedWaterLitres, "liters")}
                      </dd>
                    </div>
                    <div>
                      <dt>{METRIC_LABELS.avoidedWaterLitres}</dt>
                      <dd>
                        {formatVolume(facts.avoidedWaterLitres, "liters")}
                      </dd>
                    </div>
                  </dl>
                  <p className="gf-rec-volumes__note">
                    Volumes are calculated by the engine from each event&apos;s
                    depth and your {Math.round(facts.lawnAreaM2)} m² lawn, then
                    stored with recommendation {facts.recommendationId}. The same
                    figures appear on the dashboard and in Water Savings.
                  </p>

                  <p className="gf-rec-hero__note">
                    <ShieldCheck size={15} aria-hidden="true" />
                    GreenFlow provides irrigation advice. It does not control
                    or modify your irrigation timer.
                  </p>
                </div>

                <aside
                  className="gf-rec-step"
                  aria-labelledby="gf-rec-step-title"
                >
                  <div className="gf-rec-step__head">
                    <p className="gf-eyebrow">Your next step</p>
                    <span
                      className={`gf-rec-level gf-rec-level--${ready.state.toLowerCase()}`}
                    >
                      {STATE_LABELS[ready.state]}
                    </span>
                  </div>
                  <h3 id="gf-rec-step-title">
                    {ready.state === "SKIP"
                      ? "Leave the timer off for this cycle"
                      : ready.state === "REDUCE"
                        ? `Set the timer to ${ready.recommended_minutes} minutes`
                        : `Run the normal ${ready.recommended_minutes}-minute cycle`}
                  </h3>
                  <ul className="gf-rec-step__list">
                    {ready.state === "SKIP" ? (
                      <>
                        <li>
                          Skip the normal {ready.baseline_minutes}-minute cycle;
                          the recommendation is 0 minutes.
                        </li>
                        <li>
                          Check again after the {ready.why.horizon_days}-day
                          forecast window.
                        </li>
                      </>
                    ) : (
                      <>
                        <li>
                          Run {ready.recommended_minutes} minutes instead of{" "}
                          {ready.baseline_minutes} minutes.
                        </li>
                        <li>
                          Set this manually on your own timer — GreenFlow has no
                          timer connection.
                        </li>
                      </>
                    )}
                    <li>
                      Confirm what you did below so Water Savings can count only
                      confirmed actions.
                    </li>
                  </ul>

                  <div className="gf-rec-feedback">
                    <p
                      className="gf-rec-feedback__label"
                      id="gf-rec-feedback-label"
                    >
                      Did you follow this recommendation?
                    </p>

                    {confirmation ? (
                      <div className="gf-rec-confirm" role="status">
                        <p className="gf-rec-confirm__state">
                          <CheckCircle2 size={16} aria-hidden="true" />
                          {confirmation.already_confirmed
                            ? "Already confirmed — no duplicate was created"
                            : "Confirmation saved"}
                        </p>
                        <dl className="gf-rec-confirm__rows">
                          <div>
                            <dt>Decision</dt>
                            <dd>
                              {confirmation.followed
                                ? "Followed the recommendation"
                                : "Kept the normal schedule"}
                            </dd>
                          </div>
                          <div>
                            <dt>Recommended / baseline</dt>
                            <dd>
                              {confirmation.recommended_minutes} min /{" "}
                              {confirmation.baseline_minutes} min
                            </dd>
                          </div>
                          <div>
                            <dt>Runtime difference</dt>
                            <dd>
                              {confirmation.avoided_minutes > 0
                                ? `−${confirmation.avoided_minutes} min`
                                : "No runtime avoided"}
                            </dd>
                          </div>
                          <div>
                            <dt>Estimated water avoided</dt>
                            <dd>
                              {formatVolume(
                                confirmation.estimated_water_avoided_litres,
                                "liters",
                              )}{" "}
                              <small>(estimate, not measured)</small>
                            </dd>
                          </div>
                          <div>
                            <dt>Confirmed at</dt>
                            <dd>
                              {formatTimeOfDay(
                                new Date(confirmation.confirmed_at),
                              )}{" "}
                              ·{" "}
                              {formatMonthDay(
                                confirmation.confirmed_at.slice(0, 10),
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>Recommendation ID</dt>
                            <dd className="gf-rec-confirm__id">
                              {confirmation.recommendation_id}
                            </dd>
                          </div>
                        </dl>
                        <button
                          type="button"
                          className="gf-rec-link"
                          onClick={() => onNavigate("savings")}
                        >
                          Open Water Savings
                          <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          className="gf-rec-feedback__options"
                          role="group"
                          aria-labelledby="gf-rec-feedback-label"
                        >
                          <button
                            type="button"
                            className={`gf-rec-feedback__button${
                              confirming === true
                                ? " gf-rec-feedback__button--active"
                                : ""
                            }`}
                            disabled={confirming !== null}
                            onClick={() =>
                              void recordConfirmation(ready, true)
                            }
                          >
                            <Check size={15} aria-hidden="true" />
                            Yes, I followed it
                          </button>
                          <button
                            type="button"
                            className={`gf-rec-feedback__button${
                              confirming === false
                                ? " gf-rec-feedback__button--active"
                                : ""
                            }`}
                            disabled={confirming !== null}
                            onClick={() =>
                              void recordConfirmation(ready, false)
                            }
                          >
                            <X size={15} aria-hidden="true" />
                            No, I kept my normal schedule
                          </button>
                        </div>

                        {confirming !== null ? (
                          <p className="gf-rec-feedback__empty">
                            Saving confirmation…
                          </p>
                        ) : (
                          <p className="gf-rec-feedback__empty">
                            No action recorded yet. Leaving this unconfirmed
                            keeps the recommendation pending.
                          </p>
                        )}
                      </>
                    )}

                    {confirmError ? (
                      <p className="gf-rec-confirm__error" role="alert">
                        <AlertTriangle size={15} aria-hidden="true" />
                        {confirmError}
                      </p>
                    ) : null}

                    <p className="gf-rec-feedback__note">
                      Only confirmed actions count toward estimated savings. A
                      confirmation is not proof that the cycle ran, and no water
                      flow is measured.
                    </p>
                  </div>
                </aside>
              </section>

              {ready && facts && !adviceMatchesProfile ? (
                <div className="gf-rec-drift" role="note">
                  <Info size={16} aria-hidden="true" />
                  <p>
                    These figures belong to recommendation{" "}
                    {facts.recommendationId}, calculated for a{" "}
                    {Math.round(facts.lawnAreaM2)} m² lawn at{" "}
                    {formatDecimal(facts.precipitationRateMmPerHour)} mm/h with
                    a {facts.baselineMinutes}-minute baseline. Your saved
                    profile now says{" "}
                    {Math.round(profile?.lawnArea.areaM2 ?? 0)} m² at{" "}
                    {formatDecimal(profile?.precipitationRateMmPerHour ?? 0)}{" "}
                    mm/h with a {profile?.wateringDurationMinutes ?? 0}-minute
                    baseline, so the numbers above are not for the current
                    profile. Use “Recalculate with the latest weather” to
                    replace them.
                  </p>
                </div>
              ) : null}

              <section
                className="gf-rec-section gf-rec-math"
                aria-labelledby="gf-rec-math-title"
              >
                <div className="gf-rec-section__header">
                  <div>
                    <p className="gf-eyebrow">Transparent arithmetic</p>
                    <h2 id="gf-rec-math-title">Show the math</h2>
                  </div>
                  <span className="gf-rec-tag gf-rec-tag--observed">
                    <Calculator size={13} aria-hidden="true" />
                    Calculated
                  </span>
                </div>

                <p className="gf-rec-section__intro">
                  These are the stored engine values for this recommendation.
                  The panel distinguishes values that changed the decision from
                  profile context that did not.
                </p>

                <div className="gf-math-grid">
                  <article className="gf-math-card">
                    <h3>1 · Soil reservoir after the last watering</h3>
                    <dl className="gf-math-rows">
                      <div>
                        <dt>Total available water (TAW)</dt>
                        <dd>{formatDecimal(ready.why.taw_mm)} mm</dd>
                      </div>
                      <div>
                        <dt>Readily available water (RAW)</dt>
                        <dd>{formatDecimal(ready.why.raw_mm)} mm</dd>
                      </div>
                      <div>
                        <dt>Depletion after last watering</dt>
                        <dd>
                          {formatDecimal(ready.why.initial_depletion_mm)} mm
                        </dd>
                      </div>
                      <div>
                        <dt>Skip threshold (50% of RAW)</dt>
                        <dd>
                          {formatDecimal(ready.why.skip_threshold_mm)} mm
                        </dd>
                      </div>
                    </dl>
                    <p className="gf-math-note">
                      Assumption: the root zone was at the refill point before
                      the last watering you recorded.
                    </p>
                  </article>

                  <article className="gf-math-card">
                    <h3>2 · Decision</h3>
                    <dl className="gf-math-rows">
                      <div>
                        <dt>Projected maximum depletion</dt>
                        <dd>
                          {formatDecimal(
                            ready.why.projected_max_depletion_mm,
                          )}{" "}
                          mm
                        </dd>
                      </div>
                      <div>
                        <dt>Skip threshold</dt>
                        <dd>
                          {formatDecimal(ready.why.skip_threshold_mm)} mm
                        </dd>
                      </div>
                      <div>
                        <dt>Baseline event depth</dt>
                        <dd>
                          {formatDecimal(ready.why.baseline_event_mm)} mm
                        </dd>
                      </div>
                      <div>
                        <dt>Irrigation efficiency</dt>
                        <dd>
                          {formatDecimal(
                            ready.why.irrigation_efficiency * 100,
                            0,
                          )}
                          %
                        </dd>
                      </div>
                      <div>
                        <dt>Recommended depth</dt>
                        <dd>
                          {formatDecimal(ready.recommended_depth_mm)} mm
                        </dd>
                      </div>
                    </dl>
                    <p className="gf-math-note">
                      If the maximum projected depletion is at or below the
                      skip threshold, the result is SKIP. Otherwise recommended
                      depth = min(projected maximum ÷ efficiency, baseline
                      event depth).
                    </p>
                  </article>

                  <article className="gf-math-card gf-math-card--wide">
                    <h3>3 · Runtime</h3>
                    <p className="gf-math-formula">
                      {ready.duration.formula}
                    </p>
                    <p className="gf-math-work">
                      {formatDecimal(ready.duration.depth_mm)} mm ÷{" "}
                      {formatDecimal(
                        ready.duration.precipitation_rate_mm_per_hour,
                      )}{" "}
                      mm/h × 60 ={" "}
                      <strong>{ready.recommended_minutes} min</strong>
                    </p>
                    <p className="gf-math-note">
                      {ready.duration.efficiency_note}
                    </p>
                  </article>
                </div>

                <div className="gf-math-walk">
                  <div className="gf-rec-chart-card__head">
                    <div>
                      <p className="gf-eyebrow">Day by day</p>
                      <h3>Projected depletion over the decision horizon</h3>
                    </div>
                    <span className="gf-rec-tag gf-rec-tag--forecast">
                      Forecast days
                    </span>
                  </div>
                  <ProjectionChart
                    points={projectionPoints}
                    thresholdMm={skipThresholdMm}
                    state={ready.state}
                  />
                  <div className="gf-math-table-wrap">
                    <table className="gf-math-table">
                      <thead>
                        <tr>
                          <th scope="col">Date</th>
                          <th scope="col">ET₀ (mm)</th>
                          <th scope="col">Rain (mm)</th>
                          <th scope="col">Projected depletion (mm)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ready.inputs.forecast.map((day, index) => (
                          <tr key={day.date}>
                            <th scope="row">{formatMonthDay(day.date)}</th>
                            <td>{formatDecimal(day.et0_mm)}</td>
                            <td>{formatDecimal(day.precipitation_mm)}</td>
                            <td>
                              {ready.why.projected_depletions_mm[index] !==
                              undefined
                                ? formatDecimal(
                                    ready.why.projected_depletions_mm[index],
                                  )
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="gf-math-note">
                    Each row is the model&apos;s depletion after that day&apos;s
                    crop demand and effective rainfall. Rain beyond what the
                    root zone can hold is not credited again.
                  </p>
                </div>
              </section>

              <section
                className="gf-rec-section"
                aria-labelledby="gf-rec-factors-title"
              >
                <div className="gf-rec-section__header">
                  <div>
                    <p className="gf-eyebrow">Explainability</p>
                    <h2 id="gf-rec-factors-title">
                      What changed the decision
                    </h2>
                  </div>
                  <span className="gf-soft-badge">
                    Applied vs. context
                  </span>
                </div>

                <p className="gf-rec-section__intro">
                  Applied factors are inputs to the water balance or the
                  runtime conversion. Context factors describe your lawn but do
                  not change the depth decision.
                </p>

                <div className="gf-rec-factors">
                  {ready.factors.map((factor) => (
                    <FactorCard
                      key={factor.id}
                      factor={factor}
                      sources={ready.sources}
                    />
                  ))}
                </div>
              </section>

              <section
                className="gf-rec-section"
                aria-labelledby="gf-rec-env-title"
              >
                <div className="gf-rec-section__header">
                  <div>
                    <p className="gf-eyebrow">Data breakdown</p>
                    <h2 id="gf-rec-env-title">
                      Weather inputs and freshness
                    </h2>
                  </div>
                  <div className="gf-rec-legend">
                    <span>
                      <i className="gf-rec-swatch gf-rec-swatch--observed" />
                      Observed
                    </span>
                    <span>
                      <i className="gf-rec-swatch gf-rec-swatch--forecast" />
                      Forecast
                    </span>
                  </div>
                </div>

                <div className="gf-rec-fresh">
                  <div>
                    <span>Provider</span>
                    <strong>{ready.freshness.provider}</strong>
                  </div>
                  <div>
                    <span>Mode</span>
                    <strong>
                      {ready.freshness.mode === "live"
                        ? "Live — retrieved for this request"
                        : "Cached"}
                    </strong>
                  </div>
                  <div>
                    <span>Retrieved</span>
                    <strong>
                      {formatTimeOfDay(
                        new Date(ready.freshness.retrieved_at),
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Observation coverage</span>
                    <strong>
                      {formatMonthDay(ready.freshness.observed_start)} –{" "}
                      {formatMonthDay(ready.freshness.observed_end)}
                    </strong>
                  </div>
                  <div>
                    <span>Forecast coverage</span>
                    <strong>
                      {formatMonthDay(ready.freshness.forecast_start)} –{" "}
                      {formatMonthDay(ready.freshness.forecast_end)}
                    </strong>
                  </div>
                  <div>
                    <span>Horizon used</span>
                    <strong>
                      {ready.freshness.horizon_days} of{" "}
                      {ready.freshness.forecast_days_available} days
                    </strong>
                  </div>
                </div>
                <p className="gf-rec-fresh__note">
                  <Info size={14} aria-hidden="true" />
                  {ready.freshness.note}
                </p>

                <div className="gf-rec-env__metrics gf-rec-env__metrics--live">
                  <div className="gf-live-metric">
                    <span className="gf-live-metric__icon">
                      <CloudRain size={18} aria-hidden="true" />
                    </span>
                    <span>Rain since last watering</span>
                    <strong>
                      {formatDecimal(ready.why.observed_rainfall_mm)} mm
                    </strong>
                    <small>Observed</small>
                  </div>
                  <div className="gf-live-metric">
                    <span className="gf-live-metric__icon">
                      <CloudRain size={18} aria-hidden="true" />
                    </span>
                    <span>Forecast rainfall</span>
                    <strong>
                      {formatDecimal(ready.why.forecast_rainfall_mm)} mm
                    </strong>
                    <small>Forecast in horizon</small>
                  </div>
                  <div className="gf-live-metric">
                    <span className="gf-live-metric__icon">
                      <Waves size={18} aria-hidden="true" />
                    </span>
                    <span>Forecast reference ET₀</span>
                    <strong>
                      {formatDecimal(ready.why.forecast_et0_mm)} mm
                    </strong>
                    <small>Forecast in horizon</small>
                  </div>
                  <div className="gf-live-metric">
                    <span className="gf-live-metric__icon">
                      <Sprout size={18} aria-hidden="true" />
                    </span>
                    <span>Estimated crop demand</span>
                    <strong>
                      {formatDecimal(ready.why.estimated_crop_demand_mm)} mm
                    </strong>
                    <small>Calculated with Kc</small>
                  </div>
                  <div className="gf-live-metric">
                    <span className="gf-live-metric__icon">
                      <Timer size={18} aria-hidden="true" />
                    </span>
                    <span>Decision horizon</span>
                    <strong>{ready.why.horizon_days} days</strong>
                    <small>Until next scheduled watering</small>
                  </div>
                  <div className="gf-live-metric">
                    <span className="gf-live-metric__icon">
                      <Droplets size={18} aria-hidden="true" />
                    </span>
                    <span>Recommended depth</span>
                    <strong>
                      {formatDecimal(ready.recommended_depth_mm)} mm
                    </strong>
                    <small>
                      = {ready.recommended_minutes} min at{" "}
                      {formatDecimal(
                        ready.duration.precipitation_rate_mm_per_hour,
                      )}{" "}
                      mm/h
                    </small>
                  </div>
                </div>

                <div className="gf-rec-panel gf-rec-observed-panel">
                  <div className="gf-rec-chart-card__head">
                    <div>
                      <p className="gf-eyebrow">Observed days</p>
                      <h3>Days used from the last watering</h3>
                    </div>
                    <span className="gf-rec-tag gf-rec-tag--observed">
                      Observed
                    </span>
                  </div>
                  <ul className="gf-rec-forecast">
                    {ready.inputs.observed.map((day) => (
                      <li key={`${day.date}-${day.basis}`}>
                        <span className="gf-rec-forecast__day">
                          {formatMonthDay(day.date)}
                        </span>
                        <span className="gf-rec-forecast__rain">
                          {formatDecimal(day.precipitation_mm)} mm rain
                        </span>
                        <span className="gf-rec-forecast__prob">
                          ET₀ {formatDecimal(day.et0_mm)} mm
                        </span>
                        <span className="gf-rec-tag gf-rec-tag--observed">
                          {day.basis === "today_forecast"
                            ? "Today · forecast"
                            : "Observed"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {ready.inputs.observed.length === 0 ? (
                    <p className="gf-rec-panel__note">
                      No observed day was required beyond the last watering
                      date.
                    </p>
                  ) : null}
                </div>
              </section>

              <section
                className="gf-rec-section"
                aria-labelledby="gf-rec-sources-title"
              >
                <div className="gf-rec-section__header">
                  <div>
                    <p className="gf-eyebrow">Scientific basis</p>
                    <h2 id="gf-rec-sources-title">
                      Sources used in this calculation
                    </h2>
                  </div>
                  <span className="gf-soft-badge">
                    {ready.sources.length} sources
                  </span>
                </div>

                <ul className="gf-rec-sources">
                  {ready.sources.map((source) => (
                    <li key={source.id}>
                      <div>
                        <strong>{source.label}</strong>
                        <p>{source.citation}</p>
                      </div>
                      {source.url ? (
                        <a
                          className="gf-rec-source-link"
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open source
                          <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="gf-rec-section__intro">
                  The Open-Meteo non-commercial API supplies the forecast and
                  FAO-56 reference ET₀. Open-Meteo data is not a measurement
                  from a station in your yard.
                </p>
              </section>

              <section
                className="gf-rec-section"
                aria-labelledby="gf-rec-assumptions-title"
              >
                <div className="gf-rec-section__header">
                  <div>
                    <p className="gf-eyebrow">Calculation inputs</p>
                    <h2 id="gf-rec-assumptions-title">
                      Assumptions and stated basis
                    </h2>
                  </div>
                </div>
                <ul className="gf-rec-notes">
                  {ready.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section
                className="gf-rec-section gf-rec-limits"
                aria-labelledby="gf-rec-limits-title"
              >
                <div className="gf-rec-section__header">
                  <div>
                    <p className="gf-eyebrow">Important notes</p>
                    <h2 id="gf-rec-limits-title">Know the limitations</h2>
                  </div>
                  <span className="gf-rec-tag gf-rec-tag--caution">
                    Read before changing your plan
                  </span>
                </div>

                <ul className="gf-rec-limits__list">
                  {ready.limitations.map((limitation) => (
                    <li key={limitation}>
                      <span className="gf-rec-limits__icon">
                        <Info size={16} aria-hidden="true" />
                      </span>
                      {limitation}
                    </li>
                  ))}
                </ul>

                <p className="gf-rec-limits__footer">
                  GreenFlow provides guidance, not guaranteed results. The
                  homeowner makes the final watering decision.
                </p>
              </section>
            </>
          ) : null}
        </main>

        <footer className="gf-footer gf-rec-footer">
          <p>
            GreenFlow provides irrigation advice. It does not control or modify
            your irrigation timer.
          </p>
          <p>
            Estimated volumes are not measured water use. Weather data ©
            Open-Meteo.
          </p>
        </footer>
      </div>
    </div>
  );
}
