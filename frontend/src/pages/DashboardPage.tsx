import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  CloudDrizzle,
  CloudRain,
  Info,
  MapPin,
  RotateCcw,
  Sparkles,
  SunMedium,
  Timer,
  Waves,
} from "lucide-react";

import { ApiError } from "../api/client";
import { loadDemoAccount, resetDemoAccount } from "../api/demo";
import { fetchStoredRecommendation } from "../api/recommendations";
import type { RecommendationResponse } from "../api/recommendations";
import { fetchSavings, type SavingsResponse } from "../api/savings";
import { DashboardSidebar } from "../components/greenflow/DashboardSidebar";
import { WeatherMetricCard } from "../components/greenflow/WeatherMetricCard";
import {
  FREQUENCY_OPTIONS,
  GRASS_OPTIONS,
} from "../data/lawnSetupOptions";
import {
  clearLastRecommendation,
  loadLastRecommendation,
  saveLastRecommendation,
} from "../lib/lastRecommendation";
import { demoProfileToLawnProfile } from "../lib/demoAccount";
import {
  loadLawnProfile,
  matchesRecommendationInputs,
  saveLawnProfile,
} from "../lib/lawnProfileStorage";
import { syncProfileFromServer } from "../lib/profileSync";
import type { LawnProfile } from "../types/lawnProfile";
import { formatVolume } from "../lib/savingsFormat";
import { factsFor, METRIC_LABELS } from "../lib/recommendationView";
import {
  formatDecimal,
  formatMonthDay,
  formatTimeOfDay,
  toIsoDate,
} from "../lib/weatherFormat";
import type { RecommendationState } from "../types/recommendation";

import "./DashboardPage.css";

const REASON_ICONS = [CloudRain, CloudDrizzle, SunMedium, Timer] as const;

const STATE_HEADLINES: Record<RecommendationState, string> = {
  SKIP: "Skip this watering",
  REDUCE: "Water less today",
  WATER: "Water today",
};

const METHOD_STEPS = [
  {
    title: "Live weather",
    detail:
      "Open-Meteo supplies observed rainfall and forecast ET₀ for your saved coordinates.",
  },
  {
    title: "Soil water balance",
    detail:
      "TAW and RAW come from cited FAO-56 constants for your soil and root depth.",
  },
  {
    title: "Forecast projection",
    detail:
      "The engine projects root-zone depletion across the decision horizon.",
  },
  {
    title: "Threshold decision",
    detail:
      "SKIP when projected depletion stays below 50% of RAW; otherwise REDUCE or WATER.",
  },
] as const;

const SAVINGS_WINDOW_DAYS = 30;

type SavingsPreview =
  | { kind: "loading" }
  | { kind: "ready"; data: SavingsResponse }
  | { kind: "error"; message: string };

const DEMO_ACCOUNT_NOTE =
  "Demo account: one fixed lawn — Austin, TX · 120 m² · fescue · loamy soil · " +
  "rotor sprinkler · 30 mm/h. Loading it replays the last 30 days of real " +
  "Open-Meteo weather for those coordinates and records one confirmed action " +
  "per replay decision, tagged as demo data. Estimates, not measured.";

interface DashboardPageProps {
  onOpenLawnSetup?: () => void;
  onOpenRecommendation?: () => void;
}

function parseTimestamp(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function DashboardPage({
  onOpenLawnSetup,
  onOpenRecommendation,
}: DashboardPageProps) {
  const [profile, setProfile] = useState<LawnProfile | null>(() =>
    loadLawnProfile(),
  );
  const cachedRecommendation = useMemo(() => loadLastRecommendation(), []);

  // The dashboard never re-derives a recommendation. It asks the server to
  // replay the stored one, so it cannot drift from the explanation page.
  const [live, setLive] = useState<RecommendationResponse | null>(
    cachedRecommendation &&
      profile &&
      cachedRecommendation.profile_id === profile.backendId
      ? cachedRecommendation
      : null,
  );
  const [isCheckingLive, setIsCheckingLive] = useState(
    cachedRecommendation !== null,
  );

  const [demoState, setDemoState] = useState<
    "idle" | "loading" | "resetting" | "error"
  >("idle");
  const [demoError, setDemoError] = useState("");

  const profileId = profile?.backendId ?? null;
  const [previewKey, setPreviewKey] = useState(0);
  const [savingsPreview, setSavingsPreview] = useState<SavingsPreview | null>(
    profileId ? { kind: "loading" } : null,
  );

  const [liveStatus, setLiveStatus] = useState<
    "verified" | "unverified" | "recalculate"
  >(cachedRecommendation ? "unverified" : "recalculate");

  useEffect(() => {
    const cached =
      profileId &&
      cachedRecommendation &&
      cachedRecommendation.profile_id === profileId
        ? cachedRecommendation
        : null;

    if (!cached) {
      setLive(null);
      setLiveStatus("recalculate");
      setIsCheckingLive(false);
      return;
    }

    let active = true;
    setIsCheckingLive(true);
    fetchStoredRecommendation(cached.id)
      .then((data) => {
        if (!active) return;
        setLive(data);
        setLiveStatus("verified");
        saveLastRecommendation(data);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
          clearLastRecommendation();
          setLive(null);
          setLiveStatus("recalculate");
          return;
        }
        setLiveStatus("unverified");
      })
      .finally(() => {
        if (active) setIsCheckingLive(false);
      });

    return () => {
      active = false;
    };
  }, [cachedRecommendation, profileId]);

  // The server's profile is the one the engine reads, so the browser copy
  // is refreshed from it instead of being trusted.
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

  useEffect(() => {
    if (!profileId) {
      setSavingsPreview(null);
      return;
    }
    let active = true;
    setSavingsPreview({ kind: "loading" });
    fetchSavings(profileId, SAVINGS_WINDOW_DAYS)
      .then((data) => {
        if (active) setSavingsPreview({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSavingsPreview({
          kind: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "The savings request failed for an unexpected reason.",
        });
      });
    return () => {
      active = false;
    };
  }, [profileId, previewKey]);

  const demoSavings =
    savingsPreview?.kind === "ready" && savingsPreview.data.is_demo
      ? savingsPreview.data
      : null;
  const isDemoAccount = demoSavings !== null;
  const demoHasRows =
    demoSavings !== null && demoSavings.confirmed_count > 0;

  async function handleLoadDemoAccount() {
    setDemoState("loading");
    setDemoError("");

    try {
      const account = await loadDemoAccount();

      if (
        !saveLawnProfile(
          demoProfileToLawnProfile(account.profile, new Date().toISOString()),
        )
      ) {
        setDemoState("error");
        setDemoError(
          "The demo account reached the server, but this browser could not keep a local copy. Allow local storage and try again.",
        );
        return;
      }

      setDemoState("idle");
      setPreviewKey((key) => key + 1);
      window.location.hash = "#water-savings";
    } catch (error) {
      setDemoState("error");
      setDemoError(
        error instanceof ApiError
          ? error.message
          : "The demo account could not be loaded. Check that the GreenFlow backend is running and try again.",
      );
    }
  }

  async function handleResetDemoAccount() {
    setDemoState("resetting");
    setDemoError("");

    try {
      await resetDemoAccount();
      setDemoState("idle");
      setPreviewKey((key) => key + 1);
    } catch (error) {
      setDemoState("error");
      setDemoError(
        error instanceof ApiError
          ? error.message
          : "The demo rows could not be removed. Check that the GreenFlow backend is running and try again.",
      );
    }
  }

  const grassLabel = profile
    ? (GRASS_OPTIONS.find((option) => option.id === profile.grassType)?.label ??
      null)
    : null;
  const frequencyLabel = profile
    ? (FREQUENCY_OPTIONS.find(
        (option) => option.id === profile.wateringFrequency,
      )?.label ?? `${profile.eventsPerWeek}× per week`)
    : null;

  const profileDetail = profile
    ? [`${Math.round(profile.lawnArea.areaM2)} m²`, grassLabel]
        .filter(Boolean)
        .join(" · ")
    : "No saved lawn profile";

  const facts = live ? factsFor(live) : null;

  const adviceMatchesProfile =
    live && facts && profile
      ? matchesRecommendationInputs(profile, {
          lawnAreaM2: facts.lawnAreaM2,
          precipitationRateMmPerHour: facts.precipitationRateMmPerHour,
          baselineMinutesPerEvent: facts.baselineMinutes,
        })
      : true;

  const createdAt = live ? parseTimestamp(live.created_at) : null;
  const createdLabel = createdAt
    ? `${formatMonthDay(toIsoDate(createdAt))} · ${formatTimeOfDay(createdAt)}`
    : null;

  const eventAvoidedLiters = facts ? facts.avoidedWaterLitres : null;

  const savingsData =
    savingsPreview?.kind === "ready" ? savingsPreview.data : null;

  const avoidedMinutes = live
    ? Math.max(0, live.baseline_minutes - live.recommended_minutes)
    : 0;
  const eventAvoidedSentence = live
    ? `Today’s ${live.state} advice alone is ${formatVolume(
        eventAvoidedLiters ?? 0,
        "liters",
      )} ${avoidedMinutes > 0 ? `(−${avoidedMinutes} min).` : "because it matches your normal run time."}`
    : "";

  const savingsCaption = (() => {
    if (savingsPreview?.kind === "loading") {
      return "Loading the recommendations you confirmed…";
    }
    if (savingsPreview?.kind === "error") {
      return savingsPreview.message;
    }
    if (!savingsData) {
      return "Save a lawn profile and confirm a recommendation to start counting avoided water.";
    }
    if (savingsData.confirmed_count === 0) {
      return `Nothing is counted yet — no recommendation has been confirmed in the last ${SAVINGS_WINDOW_DAYS} days. ${eventAvoidedSentence}`;
    }
    return `Estimated water avoided across the ${savingsData.confirmed_count} recommendation${
      savingsData.confirmed_count === 1 ? "" : "s"
    } you confirmed in the last ${SAVINGS_WINDOW_DAYS} days, compared with your reported baseline (${formatVolume(
      savingsData.estimated_baseline_litres,
      "liters",
    )}). Not measured. ${eventAvoidedSentence}`;
  })();

  const appliedFactors = live
    ? live.factors.filter((factor) => factor.role === "applied").slice(0, 4)
    : [];

  const liveWeather = live
    ? [
        {
          id: "observed-rain",
          icon: CloudRain,
          tone: "rain" as const,
          label: "Observed rainfall",
          value: formatDecimal(live.why.observed_rainfall_mm),
          unit: "mm",
          detail: `Last ${live.inputs.observed.length} observed ${
            live.inputs.observed.length === 1 ? "day" : "days"
          }`,
        },
        {
          id: "forecast-rain",
          icon: CloudDrizzle,
          tone: "forecast" as const,
          label: "Forecast rainfall",
          value: formatDecimal(live.why.forecast_rainfall_mm),
          unit: "mm",
          detail: `Next ${live.why.horizon_days} days`,
        },
        {
          id: "et0",
          icon: Waves,
          tone: "et0" as const,
          label: "Reference ET₀",
          value: formatDecimal(live.why.forecast_et0_mm),
          unit: "mm",
          detail: `Forecast total · next ${live.why.horizon_days} days`,
        },
      ]
    : [];

  return (
    <div className="gf-shell">
      <DashboardSidebar
        activeScreen="dashboard"
        onOpenLawnSetup={onOpenLawnSetup}
      />

      <div className="gf-main">
        <header className="gf-header">
          <div className="gf-header__intro">
            <p className="gf-eyebrow">GreenFlow overview</p>
            <h1>Your lawn at a glance</h1>
            <p className="gf-location">
              <MapPin size={14} aria-hidden="true" />
              <span>
                {profile ? profile.location.label : "No saved location"}
              </span>
              <span className="gf-location__separator" aria-hidden="true">
                ·
              </span>
              <span>{profileDetail}</span>
            </p>
          </div>

          <div className="gf-header__actions">
            <span className="gf-soft-badge">
              {live ? "Saved recommendation" : "Advisory only"}
            </span>
            <div className="gf-profile">
              <span className="gf-avatar" aria-hidden="true">
                GF
              </span>
              <span className="gf-profile__text">
                <strong>{profile ? "Saved profile" : "New user"}</strong>
                <small>{profile ? profile.location.label : "Home lawn"}</small>
              </span>
            </div>
          </div>
        </header>

        <main className="gf-content">
          <section
            className="gf-hero"
            id="dashboard"
            aria-labelledby="gf-recommendation-title"
          >
            <div className="gf-hero__top">
              <span className="gf-pill gf-pill--on-green">
                <span className="gf-pill__dot" aria-hidden="true" />
                {live ? "Latest recommendation" : "Get started"}
              </span>
              <span className="gf-pill gf-pill--outline">
                {live ? "Open-Meteo weather" : "No result generated yet"}
              </span>
            </div>

            <div className="gf-hero__body">
              <div className="gf-hero__main">
                <p className="gf-hero__kicker">
                  {live
                    ? `Generated ${createdLabel ?? "recently"} · Open-Meteo`
                    : profile
                      ? "Profile saved · recommendation not generated"
                      : "Step 1 · save your lawn profile"}
                </p>
                <h2
                  className="gf-hero__state"
                  id="gf-recommendation-title"
                >
                  {live ? live.state : "READY"}
                </h2>
                <p className="gf-hero__headline">
                  {live
                    ? STATE_HEADLINES[live.state]
                    : profile
                      ? "Generate your first live recommendation"
                      : "Start with your lawn profile"}
                </p>
                <p className="gf-hero__reason">
                  {live
                    ? live.reason
                    : profile
                      ? `GreenFlow will fetch Open-Meteo weather for ${profile.location.label} and run the irrigation engine using your saved soil, grass, and sprinkler details.`
                      : "Save your location, lawn size, grass, soil, sprinkler type, precipitation rate, and watering routine. The recommendation and savings screens use that profile."}
                </p>

                <div className="gf-hero__actions">
                  {live ? (
                    <a
                      className="gf-button gf-button--light"
                      href="#recommendation"
                      onClick={(event) => {
                        if (!onOpenRecommendation) return;
                        event.preventDefault();
                        onOpenRecommendation();
                      }}
                    >
                      See why
                      <ArrowDown size={16} aria-hidden="true" />
                    </a>
                  ) : profile ? (
                    <a
                      className="gf-button gf-button--light"
                      href="#recommendation"
                      onClick={(event) => {
                        if (!onOpenRecommendation) return;
                        event.preventDefault();
                        onOpenRecommendation();
                      }}
                    >
                      Get recommendation
                      <ArrowDown size={16} aria-hidden="true" />
                    </a>
                  ) : (
                    <>
                      <a
                        className="gf-button gf-button--light"
                        href="#lawn-profile"
                        onClick={(event) => {
                          if (!onOpenLawnSetup) return;
                          event.preventDefault();
                          onOpenLawnSetup();
                        }}
                      >
                        Set up lawn profile
                        <ArrowDown size={16} aria-hidden="true" />
                      </a>
                    </>
                  )}
                  {demoHasRows ? (
                    <button
                      type="button"
                      className="gf-button gf-button--ghost"
                      onClick={handleResetDemoAccount}
                      disabled={
                        demoState === "loading" || demoState === "resetting"
                      }
                    >
                      <RotateCcw size={16} aria-hidden="true" />
                      {demoState === "resetting"
                        ? "Resetting demo…"
                        : "Reset demo"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="gf-button gf-button--ghost"
                      onClick={handleLoadDemoAccount}
                      disabled={
                        demoState === "loading" || demoState === "resetting"
                      }
                    >
                      <Sparkles size={16} aria-hidden="true" />
                      {demoState === "loading"
                        ? "Loading demo account…"
                        : "Load demo account"}
                    </button>
                  )}
                </div>
                {!profile || isDemoAccount ? (
                  <>
                    <p className="gf-hero__demo-note">{DEMO_ACCOUNT_NOTE}</p>
                    {demoError ? (
                      <p className="gf-hero__demo-error" role="alert">
                        {demoError}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="gf-hero__aside">
                <div className="gf-hero__stat">
                  <span>Status</span>
                  <strong>
                    {live
                      ? isCheckingLive
                        ? "Checking this recommendation…"
                        : liveStatus === "verified"
                          ? "Latest recommendation"
                          : "Saved, not reconfirmed"
                      : profile
                        ? "Ready to calculate"
                        : "Profile not saved"}
                  </strong>
                  {live && !isCheckingLive && liveStatus === "unverified" ? (
                    <p>
                      The backend could not be reached to replay this
                      recommendation, so these figures are the ones it returned
                      when it was generated.
                    </p>
                  ) : null}
                </div>
                <div className="gf-hero__stat">
                  <span>Recommended action</span>
                  <strong>
                    {live
                      ? `${live.recommended_minutes} min`
                      : "Not calculated yet"}
                  </strong>
                  <p>
                    {live
                      ? `${live.suggested_change_minutes >= 0 ? "+" : ""}${
                          live.suggested_change_minutes
                        } min vs your reported baseline.`
                      : "No action is claimed until the engine runs."}
                  </p>
                </div>
                <div className="gf-hero__stat">
                  <span>{METRIC_LABELS.recommendedWaterLitres}</span>
                  <strong>
                    {facts
                      ? formatVolume(facts.recommendedWaterLitres, "liters")
                      : "Not calculated yet"}
                  </strong>
                  <p>
                    {facts
                      ? `${formatDecimal(facts.requiredDepthMm)} mm over ${Math.round(
                          facts.lawnAreaM2,
                        )} m², the depth behind the ${facts.recommendedMinutes}-minute run.`
                      : "Volume comes from the recommendation, not from rounded minutes."}
                  </p>
                </div>
                <div className="gf-hero__stat">
                  <span>{METRIC_LABELS.baselineWaterLitres}</span>
                  <strong>
                    {facts
                      ? formatVolume(facts.baselineWaterLitres, "liters")
                      : profile
                        ? "Not calculated yet"
                        : "Not set"}
                  </strong>
                  <p>
                    {facts
                      ? `${formatDecimal(facts.baselineDepthMm)} mm at ${Math.round(
                          facts.lawnAreaM2,
                        )} m² for your ${facts.baselineMinutes}-minute normal cycle.`
                      : "Your reported schedule."}
                  </p>
                </div>
                <div className="gf-hero__stat">
                  <span>Normal watering duration</span>
                  <strong>
                    {live
                      ? `${live.baseline_minutes} min`
                      : profile
                        ? `${profile.wateringDurationMinutes} min`
                        : "Not set"}
                  </strong>
                  <p>Your reported schedule.</p>
                </div>
              </div>
            </div>
          </section>

          <div className="gf-note">
            <Info size={16} aria-hidden="true" />
            <p>
              GreenFlow provides irrigation advice. It does not control or
              modify your irrigation timer.
            </p>
          </div>

          {live && facts && !adviceMatchesProfile ? (
            <div className="gf-note" role="note">
              <Info size={16} aria-hidden="true" />
              <p>
                These figures belong to recommendation{" "}
                {facts.recommendationId}, calculated for a{" "}
                {Math.round(facts.lawnAreaM2)} m² lawn at{" "}
                {formatDecimal(facts.precipitationRateMmPerHour)} mm/h with a{" "}
                {facts.baselineMinutes}-minute baseline. Your profile now says{" "}
                {Math.round(profile?.lawnArea.areaM2 ?? 0)} m² at{" "}
                {formatDecimal(profile?.precipitationRateMmPerHour ?? 0)} mm/h
                with a {profile?.wateringDurationMinutes ?? 0}-minute baseline,
                so the numbers above are not for the current profile. Open “Why
                this recommendation?” and recalculate to replace them.
              </p>
            </div>
          ) : null}

          {live ? (
            <section className="gf-section" aria-labelledby="gf-weather-title">
              <div className="gf-section__header">
                <div>
                  <p className="gf-eyebrow">Weather used</p>
                  <h2 id="gf-weather-title">
                    Conditions in this recommendation
                  </h2>
                </div>
                <span className="gf-soft-badge">Live Open-Meteo</span>
              </div>

              <div className="gf-weather-grid">
                {liveWeather.map(({ id, icon: Icon, ...metric }) => (
                  <WeatherMetricCard
                    key={id}
                    icon={Icon}
                    {...metric}
                  />
                ))}
              </div>

              <p className="gf-caption">
                Retrieved from Open-Meteo at{" "}
                {formatTimeOfDay(new Date(live.freshness.retrieved_at))} for{" "}
                {profile?.location.label ?? "your saved location"} and used by
                the engine for this result. No sample weather values are shown.
              </p>
            </section>
          ) : null}

          <div className="gf-detail-grid">
            <section
              className="gf-card gf-why"
              id="why"
              aria-labelledby="gf-why-title"
            >
              <div className="gf-card__header">
                <div>
                  <p className="gf-eyebrow">
                    {live ? "Engine factors" : "Method"}
                  </p>
                  <h2 id="gf-why-title">
                    {live
                      ? "What the engine used"
                      : "How GreenFlow decides"}
                  </h2>
                </div>
                {live ? (
                  <a
                    className="gf-card-link"
                    href="#recommendation"
                    onClick={(event) => {
                      if (!onOpenRecommendation) return;
                      event.preventDefault();
                      onOpenRecommendation();
                    }}
                  >
                    Full explanation
                    <ArrowDown
                      size={14}
                      aria-hidden="true"
                      style={{ transform: "rotate(-90deg)" }}
                    />
                  </a>
                ) : null}
              </div>

              <ul className="gf-reasons">
                {(live
                  ? appliedFactors.map((factor) => ({
                      title: `${factor.label} · ${factor.value}`,
                      detail: factor.detail,
                    }))
                  : METHOD_STEPS
                ).map((reason, index) => {
                  const Icon = REASON_ICONS[index] ?? Info;

                  return (
                    <li className="gf-reason" key={reason.title}>
                      <span className="gf-reason__icon">
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <div>
                        <strong>{reason.title}</strong>
                        <p>{reason.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="gf-note">
                <Info size={16} aria-hidden="true" />
                <p>
                  {live
                    ? "These are the applied factors returned by the recommendation engine for this result. Context factors are listed on the full explanation screen."
                    : "This describes the method only. No factor is claimed to have influenced a result until a live recommendation is generated."}
                </p>
              </div>
            </section>

            <div className="gf-side-stack">
              <section
                className="gf-card gf-schedule"
                id="schedule"
                aria-labelledby="gf-schedule-title"
              >
                <div className="gf-card__header">
                  <div>
                    <p className="gf-eyebrow">Normal schedule</p>
                    <h2 id="gf-schedule-title">Your watering routine</h2>
                  </div>
                  <span className="gf-status">
                    {profile ? "Reported" : "Not set"}
                  </span>
                </div>

                <div className="gf-schedule__hero">
                  <span className="gf-schedule__icon">
                    <Timer size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <span>Normal duration</span>
                    <strong>
                      {profile
                        ? `${profile.wateringDurationMinutes} min`
                        : "—"}
                    </strong>
                  </div>
                </div>

                <dl className="gf-schedule__rows">
                  <div className="gf-schedule__row">
                    <dt>Watering days</dt>
                    <dd>
                      {profile
                        ? `${frequencyLabel} · ${profile.eventsPerWeek}×/week`
                        : "—"}
                    </dd>
                  </div>
                  <div className="gf-schedule__row">
                    <dt>Last watering</dt>
                    <dd>
                      {profile
                        ? formatMonthDay(profile.lastWateredDate)
                        : "—"}
                    </dd>
                  </div>
                  <div className="gf-schedule__row">
                    <dt>Timer</dt>
                    <dd>Conventional timer</dd>
                  </div>
                  <div className="gf-schedule__row">
                    <dt>Control</dt>
                    <dd>Homeowner only</dd>
                  </div>
                </dl>
              </section>

              <section
                className="gf-card gf-savings"
                id="savings"
                aria-labelledby="gf-savings-title"
              >
                <div className="gf-card__header">
                  <div>
                    <p className="gf-eyebrow">Water savings preview</p>
                    <h2 id="gf-savings-title">Estimated water avoided</h2>
                  </div>
                  <span className="gf-pill gf-pill--amber">Estimate</span>
                </div>

                <p className="gf-savings__value">
                  <strong>
                    {savingsData
                      ? formatVolume(
                          savingsData.estimated_water_avoided_litres,
                          "liters",
                        ).replace(" L", "")
                      : "—"}
                  </strong>
                  <span>L</span>
                </p>
                <p className="gf-savings__caption">{savingsCaption}</p>

                <div className="gf-savings__meta">
                  <span className="gf-savings__chip">
                    {savingsData
                      ? `${savingsData.confirmed_count} confirmed · ${savingsData.pending_count} pending`
                      : "Confirmed only"}
                  </span>
                  <span className="gf-savings__chip">Not measured</span>
                </div>

                <p className="gf-savings__note">
                  Only recommendations you confirmed are counted; pending ones
                  are excluded. The estimate uses your reported baseline and
                  sprinkler rate, not a meter reading.
                </p>

                <a className="gf-card-link" href="#water-savings">
                  View water savings
                </a>
              </section>
            </div>
          </div>
        </main>

        <footer className="gf-footer">
          <p>
            Weather values are the live Open-Meteo inputs stored with your
            latest recommendation. No water use is measured.
          </p>
          <p>
            GreenFlow provides irrigation advice. It does not control or modify
            your irrigation timer.
          </p>
        </footer>
      </div>
    </div>
  );
}
