import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Droplet,
  Droplets,
  Info,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Waves,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

import { fetchBacktest } from "../api/backtest";
import { ApiError } from "../api/client";
import { fetchSavings, type SavingsResponse } from "../api/savings";
import { DashboardSidebar } from "../components/greenflow/DashboardSidebar";
import {
  BacktestPanel,
  type BacktestView,
} from "../components/greenflow/savings/BacktestPanel";
import "../components/greenflow/savings/SavingsCharts.css";
import { GRASS_OPTIONS } from "../data/lawnSetupOptions";
import { loadLawnProfile } from "../lib/lawnProfileStorage";
import { buildSavingsHero, DEMO_HERO_TAG } from "../lib/savingsHero";
import {
  formatAxisVolume,
  formatMinutes,
  formatPercent,
  formatVolume,
  formatVolumeValue,
  volumeUnitShort,
} from "../lib/savingsFormat";
import {
  formatMonthDay,
  formatTimeOfDay,
  formatTooltipDate,
  toIsoDate,
} from "../lib/weatherFormat";
import type { Screen } from "../types/screen";
import type { VolumeUnit } from "../types/savings";

import "./WaterSavingsPage.css";

interface WaterSavingsPageProps {
  onNavigate: (screen: Screen) => void;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; data: SavingsResponse }
  | { kind: "no-profile" }
  | { kind: "error"; error: ApiError; profileMissing: boolean };

const RANGE_OPTIONS = [7, 30, 90, 365] as const;

const STATE_LABELS: Record<string, string> = {
  SKIP: "SKIP",
  REDUCE: "REDUCE",
  WATER: "WATER",
};

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(
    0,
    "unknown_error",
    "The savings request failed for an unexpected reason.",
  );
}

function parseTimestamp(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stateTone(state: string): string {
  const normalized = state.toLowerCase();
  return normalized === "skip" ||
    normalized === "reduce" ||
    normalized === "water"
    ? normalized
    : "unknown";
}

function StatePill({ state }: { state: string }) {
  return (
    <span className={`gf-sav-rec gf-sav-rec--${stateTone(state)}`}>
      {STATE_LABELS[state] ?? state}
    </span>
  );
}

function RangeControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="gf-sav-range" role="group" aria-label="Savings window">
      {RANGE_OPTIONS.map((days) => (
        <button
          key={days}
          type="button"
          className={[
            "gf-sav-range__button",
            days === value ? "gf-sav-range__button--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={days === value}
          onClick={() => onChange(days)}
        >
          {days} days
        </button>
      ))}
    </div>
  );
}

function UnitToggle({
  value,
  onChange,
}: {
  value: VolumeUnit;
  onChange: (value: VolumeUnit) => void;
}) {
  return (
    <div className="gf-sav-unit" role="group" aria-label="Volume unit">
      <button
        type="button"
        className={[
          "gf-sav-unit__button",
          value === "liters" ? "gf-sav-unit__button--active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={value === "liters"}
        onClick={() => onChange("liters")}
      >
        Liters
      </button>
      <button
        type="button"
        className={[
          "gf-sav-unit__button",
          value === "gallons" ? "gf-sav-unit__button--active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={value === "gallons"}
        onClick={() => onChange("gallons")}
      >
        Gallons
      </button>
    </div>
  );
}

function SavingsGauge({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const circumference = 2 * Math.PI * 52;
  const dash = (clamped / 100) * circumference;

  return (
    <div
      className="gf-sav-gauge"
      role="img"
      aria-label={`${formatPercent(percent)} of the confirmed baseline volume is estimated as avoided.`}
    >
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <defs>
          <linearGradient id="gf-sav-gauge-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c9f0b4" />
            <stop offset="100%" stopColor="#7dd39b" />
          </linearGradient>
        </defs>
        <circle
          className="gf-sav-gauge__track"
          cx="64"
          cy="64"
          r="52"
          pathLength={circumference}
        />
        <circle
          className="gf-sav-gauge__value"
          cx="64"
          cy="64"
          r="52"
          stroke="url(#gf-sav-gauge-fill)"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 64 64)"
        />
      </svg>
      <div className="gf-sav-gauge__center">
        <Droplet size={20} aria-hidden="true" />
        <strong>{formatPercent(percent)}</strong>
        <span>of baseline</span>
      </div>
    </div>
  );
}

function SavingsSkeleton() {
  return (
    <div className="gf-sav-skeleton" role="status">
      <span className="gf-visually-hidden">Loading confirmed savings…</span>
      <div className="gf-sav-skeleton__hero" />
      <div className="gf-sav-skeleton__split">
        <div />
        <div />
      </div>
      <div className="gf-sav-skeleton__wide" />
    </div>
  );
}

interface StateAction {
  label: string;
  onClick: () => void;
}

function SavingsState({
  icon: Icon,
  title,
  body,
  primary,
  secondary,
  note,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  primary: StateAction;
  secondary?: StateAction;
  note: string;
}) {
  return (
    <div className="gf-sav-state" role="alert">
      <span className="gf-sav-state__icon">
        <Icon size={26} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="gf-sav-state__actions">
        <button
          type="button"
          className="gf-sav-primary"
          onClick={primary.onClick}
        >
          {primary.label}
        </button>
        {secondary ? (
          <button
            type="button"
            className="gf-sav-ghost"
            onClick={secondary.onClick}
          >
            {secondary.label}
          </button>
        ) : null}
      </div>
      <p className="gf-sav-state__note">{note}</p>
    </div>
  );
}

interface DailyAvoidedPoint {
  date: string;
  label: string;
  litres: number;
  events: number;
}

function DayTooltip({
  active,
  payload,
  unit,
}: TooltipContentProps & { unit: VolumeUnit }) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload as DailyAvoidedPoint | undefined;
  if (!point) return null;

  return (
    <div className="gf-sav-tip">
      <p className="gf-sav-tip__title">{formatTooltipDate(point.date)}</p>
      <p className="gf-sav-tip__subtitle">Confirmed estimate</p>
      <ul className="gf-sav-tip__rows">
        <li className="gf-sav-tip__row">
          <span
            className="gf-sav-tip__dot"
            data-tone="green"
            aria-hidden="true"
          />
          <span className="gf-sav-tip__label">Estimated avoided</span>
          <span className="gf-sav-tip__value">
            {formatVolume(point.litres, unit)}
          </span>
        </li>
        <li className="gf-sav-tip__row">
          <span
            className="gf-sav-tip__dot"
            data-tone="teal"
            aria-hidden="true"
          />
          <span className="gf-sav-tip__label">Confirmed decisions</span>
          <span className="gf-sav-tip__value">{point.events}</span>
        </li>
      </ul>
    </div>
  );
}

export function WaterSavingsPage({ onNavigate }: WaterSavingsPageProps) {
  const [profile] = useState(() => loadLawnProfile());
  const profileId = profile?.backendId ?? null;

  const [windowDays, setWindowDays] = useState<number>(30);
  const [unit, setUnit] = useState<VolumeUnit>("liters");
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [backtest, setBacktest] = useState<BacktestView | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const requestRef = useRef(0);
  const backtestRequestRef = useRef(0);

  const runBacktest = useCallback(async () => {
    if (!profileId) {
      setBacktest(null);
      return;
    }

    const requestId = backtestRequestRef.current + 1;
    backtestRequestRef.current = requestId;
    setBacktest({ kind: "loading" });

    try {
      const data = await fetchBacktest(profileId);
      if (backtestRequestRef.current !== requestId) return;
      setBacktest({ kind: "ready", data });
    } catch (error) {
      if (backtestRequestRef.current !== requestId) return;
      setBacktest({ kind: "error", message: toApiError(error).message });
    }
  }, [profileId]);

  const load = useCallback(async () => {
    if (!profileId) {
      setView({ kind: "no-profile" });
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setView({ kind: "loading" });
    setAnnouncement("");

    try {
      const data = await fetchSavings(profileId, windowDays);
      if (requestRef.current !== requestId) return;
      setView({ kind: "ready", data });
      const updated = parseTimestamp(data.generated_at);
      setLastUpdated(updated);
      setAnnouncement(
        `Savings loaded for the last ${windowDays} days${
          updated ? ` at ${formatTimeOfDay(updated)}` : ""
        }. ${data.confirmed_count} confirmed recommendations.`,
      );
    } catch (error) {
      if (requestRef.current !== requestId) return;
      const apiError = toApiError(error);
      setView({
        kind: "error",
        error: apiError,
        profileMissing: apiError.code === "profile_not_found",
      });
    }
  }, [profileId, windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profileId) {
      setBacktest(null);
      return;
    }
    void runBacktest();
  }, [profileId, runBacktest]);

  useEffect(() => {
    return () => {
      requestRef.current += 1;
      backtestRequestRef.current += 1;
    };
  }, []);

  const grassLabel = useMemo(() => {
    if (!profile) return null;
    return (
      GRASS_OPTIONS.find((option) => option.id === profile.grassType)?.label ??
      null
    );
  }, [profile]);

  const dailyPoints = useMemo<DailyAvoidedPoint[]>(() => {
    if (view.kind !== "ready") return [];

    const byDate = new Map<string, { litres: number; events: number }>();
    for (const event of view.data.events) {
      const confirmed = parseTimestamp(event.confirmed_at);
      if (!confirmed) continue;
      const iso = toIsoDate(confirmed);
      const current = byDate.get(iso) ?? { litres: 0, events: 0 };
      current.litres += event.estimated_water_avoided_litres;
      current.events += 1;
      byDate.set(iso, current);
    }

    return [...byDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, value]) => ({
        date,
        label: formatMonthDay(date),
        litres: value.litres,
        events: value.events,
      }));
  }, [view]);

  const sortedEvents = useMemo(() => {
    if (view.kind !== "ready") return [];
    return [...view.data.events].sort((left, right) => {
      const leftTime = parseTimestamp(left.confirmed_at)?.getTime() ?? 0;
      const rightTime = parseTimestamp(right.confirmed_at)?.getTime() ?? 0;
      return rightTime - leftTime;
    });
  }, [view]);

  const rangeLabel = `Last ${windowDays} days`;
  const locationLabel = profile?.location.label || "Home lawn";
  const profileDetail = profile
    ? [`${Math.round(profile.lawnArea.areaM2)} m²`, grassLabel]
        .filter(Boolean)
        .join(" · ")
    : "No saved lawn profile";

  return (
    <div className="gf-shell">
      <DashboardSidebar
        activeScreen="savings"
        onOpenDashboard={() => onNavigate("dashboard")}
        onOpenLawnSetup={() => onNavigate("lawn-setup")}
      />

      <div className="gf-main">
        <header className="gf-header gf-sav-header">
          <div className="gf-header__intro">
            <p className="gf-eyebrow">Water stewardship</p>
            <h1>Your Water Savings</h1>
            <p className="gf-sav-subtitle">
              Estimated water avoided through recommendations you confirmed —
              based on your reported baseline, not a measured reading.
            </p>

            <div className="gf-sav-meta">
              <span className="gf-sav-meta__item">
                <MapPin size={14} aria-hidden="true" />
                {locationLabel}
                <em>{profileId ? "Saved profile" : "Not saved"}</em>
              </span>
              <span className="gf-sav-meta__sep" aria-hidden="true">
                ·
              </span>
              <span className="gf-sav-meta__item">
                <Sprout size={14} aria-hidden="true" />
                {profileDetail}
              </span>
              <span className="gf-sav-meta__sep" aria-hidden="true">
                ·
              </span>
              <span className="gf-sav-meta__item">
                <CalendarDays size={14} aria-hidden="true" />
                {rangeLabel}
              </span>
              <span className="gf-sav-meta__sep" aria-hidden="true">
                ·
              </span>
              <span className="gf-sav-meta__item">
                <RefreshCw size={14} aria-hidden="true" />
                {lastUpdated
                  ? `Updated ${formatTimeOfDay(lastUpdated)}`
                  : "Not loaded yet"}
              </span>
            </div>

            <div className="gf-sav-header__controls">
              <RangeControl value={windowDays} onChange={setWindowDays} />
              <UnitToggle value={unit} onChange={setUnit} />
            </div>
          </div>

          <div className="gf-header__actions gf-sav-actions">
            <button
              type="button"
              className="gf-icon-button gf-sav-refresh"
              aria-label="Refresh savings and simulation"
              title="Refresh savings and simulation"
              onClick={() => {
                void load();
                void runBacktest();
              }}
              disabled={view.kind === "loading"}
            >
              <RefreshCw
                size={17}
                aria-hidden="true"
                className={view.kind === "loading" ? "gf-sav-spin" : undefined}
              />
            </button>
            <div className="gf-profile">
              <span className="gf-avatar" aria-hidden="true">
                GF
              </span>
              <span className="gf-profile__text">
                <strong>{profileId ? "Saved profile" : "Lawn profile"}</strong>
                <small>{profileId ? locationLabel : "No profile yet"}</small>
              </span>
            </div>
          </div>
        </header>

        <p className="gf-visually-hidden" role="status" aria-live="polite">
          {announcement}
        </p>

        <main
          className="gf-content gf-sav-content"
          aria-busy={view.kind === "loading"}
        >
          {view.kind === "loading" ? <SavingsSkeleton /> : null}

          {view.kind === "no-profile" ? (
            <SavingsState
              icon={Sprout}
              title="Save your lawn profile to see savings"
              body="Savings are calculated from recommendations tied to your saved Lawn Profile. Set up your lawn and sprinkler details, then confirm a recommendation."
              primary={{
                label: "Set up lawn profile",
                onClick: () => onNavigate("lawn-setup"),
              }}
              secondary={{
                label: "Back to dashboard",
                onClick: () => onNavigate("dashboard"),
              }}
              note="No sample savings are shown. This screen only reports confirmed recommendations stored by the GreenFlow backend."
            />
          ) : null}

          {view.kind === "error" ? (
            <SavingsState
              icon={AlertTriangle}
              title={
                view.profileMissing
                  ? "Saved profile not found"
                  : "Savings could not be loaded"
              }
              body={
                view.profileMissing
                  ? "The backend does not have the profile saved in this browser. Save your Lawn Profile again to reconnect savings."
                  : view.error.message
              }
              primary={
                view.profileMissing
                  ? {
                      label: "Open lawn profile",
                      onClick: () => onNavigate("lawn-setup"),
                    }
                  : { label: "Retry", onClick: () => void load() }
              }
              secondary={
                view.profileMissing
                  ? { label: "Retry", onClick: () => void load() }
                  : {
                      label: "Back to dashboard",
                      onClick: () => onNavigate("dashboard"),
                    }
              }
              note="Savings only include confirmed recommendations. Pending recommendations are listed separately and never counted as avoided water."
            />
          ) : null}

          {view.kind === "ready" ? (
            <ReadySavings
              data={view.data}
              profileId={profileId}
              rangeLabel={rangeLabel}
              unit={unit}
              backtest={backtest}
              onRunBacktest={() => void runBacktest()}
              dailyPoints={dailyPoints}
              sortedEvents={sortedEvents}
              precipitationRate={profile?.precipitationRateMmPerHour ?? null}
              lawnArea={profile?.lawnArea.areaM2 ?? null}
              onNavigate={onNavigate}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function ReadySavings({
  data,
  profileId,
  rangeLabel,
  unit,
  backtest,
  onRunBacktest,
  dailyPoints,
  sortedEvents,
  precipitationRate,
  lawnArea,
  onNavigate,
}: {
  data: SavingsResponse;
  profileId: string | null;
  rangeLabel: string;
  unit: VolumeUnit;
  backtest: BacktestView | null;
  onRunBacktest: () => void;
  dailyPoints: DailyAvoidedPoint[];
  sortedEvents: SavingsResponse["events"];
  precipitationRate: number | null;
  lawnArea: number | null;
  onNavigate: (screen: Screen) => void;
}) {
  const hasConfirmed = data.confirmed_count > 0;
  const hasAvoided = data.estimated_water_avoided_litres > 0;
  const backtestData = backtest?.kind === "ready" ? backtest.data : null;
  const hero = buildSavingsHero(data, backtestData);
  const isReplayHero = hero.source === "simulated_replay";
  const rateText =
    precipitationRate !== null
      ? `${precipitationRate} mm/h`
      : "your reported rate";
  const areaText =
    lawnArea !== null ? `${Math.round(lawnArea)} m²` : "your lawn area";

  return (
    <>
      <p className="gf-sav-datasource" role="note">
        <Info size={15} aria-hidden="true" />
        <span>
          <strong>Estimates, not measurements.</strong> Totals use only the
          recommendations you confirmed, your reported precipitation rate (
          {rateText}) and lawn area ({areaText}). No flow meter, water bill, or
          soil-moisture sensor is used. Pending recommendations are excluded.
        </span>
      </p>

      <section className="gf-sav-hero" aria-labelledby="gf-sav-hero-title">
        <div className="gf-sav-hero__main">
          <div className="gf-sav-hero__top">
            <span className="gf-pill gf-pill--on-green">
              <Waves size={14} aria-hidden="true" />
              {hero.tag}
            </span>
            <span className="gf-pill gf-pill--outline">Not measured</span>
          </div>

          <p
            className={`gf-sav-hero__kicker${
              isReplayHero ? " gf-sav-hero__kicker--replay" : ""
            }`}
            id="gf-sav-hero-title"
          >
            {hero.kicker}
          </p>

          <p className="gf-sav-hero__value">
            <strong>{formatVolumeValue(hero.valueLitres, unit)}</strong>
            <span>{volumeUnitShort(unit)}</span>
          </p>

          {hero.banner ? (
            <p className="gf-sav-hero__banner">
              <strong>{hero.banner}.</strong> The engine replayed your saved
              schedule day by day over observed Open-Meteo weather for these
              coordinates. Nothing in this figure counts as an action you
              confirmed.
            </p>
          ) : null}

          {hero.note ? (
            <p className="gf-sav-hero__demo-note">
              <strong>{DEMO_HERO_TAG}.</strong> {hero.note}
            </p>
          ) : null}

          <p className="gf-sav-hero__caption">
            {isReplayHero
              ? "Estimated water avoided the engine calculated for your stated schedule across the replay window, measured against the same baseline you reported."
              : "Estimated water avoided when you followed a GreenFlow recommendation to skip watering or run a shorter cycle, compared with your reported baseline schedule."}
          </p>

          <dl className="gf-sav-hero__compare">
            <div>
              <dt>{hero.baseline.label}</dt>
              <dd>{formatVolume(hero.baseline.litres, unit)}</dd>
            </div>
            {hero.planned ? (
              <div>
                <dt>{hero.planned.label}</dt>
                <dd>{formatVolume(hero.planned.litres, unit)}</dd>
              </div>
            ) : null}
            {hero.showShareAvoided ? (
              <div>
                <dt>Share avoided</dt>
                <dd>{formatPercent(hero.shareAvoidedPercent)}</dd>
              </div>
            ) : null}
          </dl>

          {hero.showConfirmedBar ? (
            <div
              className="gf-sav-hero__bar"
              role="img"
              aria-label={`${formatPercent(
                hero.shareAvoidedPercent,
              )} of the confirmed baseline volume is estimated as avoided.`}
            >
              <span
                className="gf-sav-hero__bar-confirmed"
                style={{
                  width: `${Math.min(100, hero.shareAvoidedPercent)}%`,
                }}
              />
            </div>
          ) : null}

          <ul className="gf-sav-hero__legend">
            <li>
              <span
                className={`gf-sav-swatch ${
                  isReplayHero
                    ? "gf-sav-swatch--pending"
                    : "gf-sav-swatch--confirmed"
                }`}
                aria-hidden="true"
              />
              {isReplayHero
                ? "Simulated avoided · never added to confirmed totals"
                : "Confirmed avoided · estimated"}
            </li>
            <li>
              <span
                className="gf-sav-swatch gf-sav-swatch--pending"
                aria-hidden="true"
              />
              {data.pending_count} pending · not counted
            </li>
          </ul>

          <p className="gf-sav-hero__note">
            <ShieldCheck size={13} aria-hidden="true" />
            GreenFlow provides irrigation advice. It does not control or modify
            your irrigation timer.
          </p>
        </div>

        <div className="gf-sav-hero__aside">
          {hero.showRing ? (
            <SavingsGauge percent={hero.shareAvoidedPercent} />
          ) : null}
          <div className="gf-sav-hero__aside-stats">
            <div>
              <span>Confirmed</span>
              <strong>
                {data.confirmed_count}
                <small>recommendations</small>
              </strong>
            </div>
            <div>
              <span>Followed</span>
              <strong>
                {data.followed_count}
                <small>counted toward savings</small>
              </strong>
            </div>
            <div>
              <span>Awaiting</span>
              <strong>
                {data.pending_count}
                <small>unconfirmed, excluded</small>
              </strong>
            </div>
          </div>
        </div>
      </section>

      {data.confirmed_count > 0 ? (
        <section
          className="gf-card gf-sav-averages"
          aria-labelledby="gf-sav-averages-title"
        >
          <div className="gf-card__header">
            <div>
              <p className="gf-eyebrow">From confirmed rows</p>
              <h2 id="gf-sav-averages-title">
                Average estimated water avoided
              </h2>
            </div>
            <span className="gf-soft-badge">Last {data.window_days} days</span>
          </div>

          <dl className="gf-sav-averages__grid">
            <div>
              <dt>Per day</dt>
              <dd>
                <strong>
                  {formatVolumeValue(
                    data.average_avoided_litres_per_day,
                    unit,
                  )}
                </strong>
                <span>{volumeUnitShort(unit)}</span>
              </dd>
            </div>
            <div>
              <dt>Per week</dt>
              <dd>
                <strong>
                  {formatVolumeValue(
                    data.average_avoided_litres_per_week,
                    unit,
                  )}
                </strong>
                <span>{volumeUnitShort(unit)}</span>
              </dd>
            </div>
          </dl>

          <p className="gf-sav-averages__note">
            Divided across the {data.window_days}-day window you selected, from
            the {data.confirmed_count} confirmed recommendation
            {data.confirmed_count === 1 ? "" : "s"} in it. Estimate, not
            measured.
          </p>
        </section>
      ) : null}

      {hero.showConfirmedSummary ? (
        <section
          className="gf-card gf-sav-confirmed-only"
          aria-labelledby="gf-sav-confirmed-only-title"
        >
          <div className="gf-card__header">
            <div>
              <p className="gf-eyebrow">Confirmed only</p>
              <h2 id="gf-sav-confirmed-only-title">Your confirmed savings</h2>
            </div>
            <span className="gf-soft-badge">{rangeLabel}</span>
          </div>

          <p className="gf-sav-confirmed-only__value">
            <strong>
              {formatVolumeValue(data.estimated_water_avoided_litres, unit)}
            </strong>
            <span>{volumeUnitShort(unit)}</span>
          </p>

          <p className="gf-sav-confirmed-only__caption">
            {hasConfirmed
              ? `Estimated water avoided from the ${data.confirmed_count} recommendation${
                  data.confirmed_count === 1 ? "" : "s"
                } you confirmed. `
              : "No recommendation has been confirmed in this window yet. "}
            This total is reported apart from the simulated replay above; the
            two are never added together.
          </p>

          <ul className="gf-sav-confirmed-only__chips">
            <li>{data.followed_count} followed</li>
            <li>{data.not_followed_count} kept the normal schedule</li>
            <li>{data.pending_count} pending · not counted</li>
          </ul>
        </section>
      ) : null}

      {backtest ? (
        <BacktestPanel view={backtest} unit={unit} onRun={onRunBacktest} />
      ) : null}

      <div className="gf-sav-split">
        <section
          className="gf-card gf-sav-history"
          aria-labelledby="gf-sav-confirmed-title"
        >
          <div className="gf-card__header">
            <div>
              <p className="gf-eyebrow">Recorded actions</p>
              <h2 id="gf-sav-confirmed-title">Confirmed recommendations</h2>
            </div>
            <span className="gf-soft-badge">
              {data.confirmed_count} confirmed
            </span>
          </div>

          {hasConfirmed ? (
            <>
              <div className="gf-sav-table gf-sav-table--live">
                <div className="gf-sav-table__head" aria-hidden="true">
                  <span>Confirmed</span>
                  <span>Decision</span>
                  <span>Baseline</span>
                  <span>Recommended</span>
                  <span>Avoided</span>
                </div>
                <ul className="gf-sav-table__body">
                  {sortedEvents.map((event) => {
                    const confirmed = parseTimestamp(event.confirmed_at);
                    return (
                      <li
                        className="gf-sav-row gf-sav-row--live"
                        key={event.recommendation_id}
                      >
                        <span className="gf-sav-row__date">
                          <strong>
                            {confirmed
                              ? formatMonthDay(toIsoDate(confirmed))
                              : "Unknown date"}
                          </strong>
                          <small>
                            {confirmed
                              ? formatTimeOfDay(confirmed)
                              : event.confirmed_at}
                          </small>
                        </span>
                        <span>
                          <StatePill state={event.state} />
                        </span>
                        <span className="gf-sav-row__stat">
                          <em>Baseline</em>
                          <strong>
                            {formatMinutes(event.baseline_minutes)}
                          </strong>
                        </span>
                        <span className="gf-sav-row__stat">
                          <em>Recommended</em>
                          <strong>
                            {formatMinutes(event.recommended_minutes)}
                          </strong>
                        </span>
                        <span className="gf-sav-avoided">
                          <strong>
                            {formatVolume(
                              event.estimated_water_avoided_litres,
                              unit,
                            )}
                          </strong>
                          <small>
                            {event.followed
                              ? "estimate, not measured"
                              : "not followed · not counted"}
                          </small>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <p className="gf-sav-caption">
                Each row is one recommendation you confirmed. Only followed
                recommendations contribute to the avoided estimate.
              </p>
            </>
          ) : (
            <div className="gf-sav-inline-empty">
              <CheckCircle2 size={22} aria-hidden="true" />
              <p>
                No confirmed recommendations in this window. Confirm one from
                the recommendation screen to start tracking savings.
              </p>
              <button
                type="button"
                className="gf-sav-link"
                onClick={() => onNavigate("recommendation")}
              >
                Review today’s recommendation
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            </div>
          )}
        </section>

        <div className="gf-side-stack">
          <section className="gf-card" aria-labelledby="gf-sav-pending-title">
            <div className="gf-card__header">
              <div>
                <p className="gf-eyebrow">Not yet counted</p>
                <h2 id="gf-sav-pending-title">Awaiting confirmation</h2>
              </div>
              <span className="gf-soft-badge">
                {data.pending_count} pending
              </span>
            </div>

            {data.pending.length > 0 ? (
              <ul className="gf-sav-pending">
                {data.pending.slice(0, 5).map((pending) => {
                  const created = parseTimestamp(pending.created_at);
                  return (
                    <li
                      className="gf-sav-pending__item"
                      key={pending.recommendation_id}
                    >
                      <div className="gf-sav-pending__row">
                        <StatePill state={pending.state} />
                        <span className="gf-sav-pending__meta">
                          {created
                            ? `Created ${formatMonthDay(
                                toIsoDate(created),
                              )} · ${formatTimeOfDay(created)}`
                            : "Creation time unavailable"}
                        </span>
                      </div>
                      <div className="gf-sav-pending__row">
                        <span className="gf-sav-pending__minutes">
                          Recommended{" "}
                          {formatMinutes(pending.recommended_minutes)} ·
                          baseline {formatMinutes(pending.baseline_minutes)}
                        </span>
                        <button
                          type="button"
                          className="gf-sav-link"
                          onClick={() => onNavigate("recommendation")}
                        >
                          Review
                          <ArrowRight size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="gf-sav-pending__empty">
                Every recommendation in this window has been confirmed.
              </p>
            )}

            {data.pending.length > 5 ? (
              <p className="gf-sav-footnote">
                Showing 5 of {data.pending.length} pending recommendations.
              </p>
            ) : null}

            <p className="gf-sav-footnote">
              Pending recommendations are excluded from avoided volume until
              you record what you actually did.
            </p>
          </section>

          <section className="gf-card" aria-labelledby="gf-sav-compare-title">
            <div className="gf-card__header">
              <div>
                <p className="gf-eyebrow">Honest accounting</p>
                <h2 id="gf-sav-compare-title">Estimated vs measured</h2>
              </div>
            </div>

            <div className="gf-sav-basis__grid gf-sav-basis__grid--two">
              <div className="gf-sav-basis__item">
                <h3>
                  <Droplets size={16} aria-hidden="true" />
                  On this screen
                </h3>
                <p>
                  Estimated from your confirmed decisions, reported baseline
                  schedule, precipitation rate, and lawn area.
                </p>
              </div>
              <div className="gf-sav-basis__item">
                <h3>
                  <ShieldCheck size={16} aria-hidden="true" />
                  Measured water use
                </h3>
                <p>
                  Not available. GreenFlow does not read a flow meter, water
                  bill, or soil-moisture sensor, so no reading is presented.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="gf-sav-split">
        <section className="gf-card" aria-labelledby="gf-sav-chart-title">
          <div className="gf-card__header">
            <div>
              <p className="gf-eyebrow">Confirmed only</p>
              <h2 id="gf-sav-chart-title">Estimated water avoided by day</h2>
            </div>
            <span className="gf-soft-badge">{volumeUnitShort(unit)}</span>
          </div>

          {hasAvoided && dailyPoints.length > 0 ? (
            <figure className="gf-sav-chart gf-sav-chart--live">
              <figcaption className="gf-visually-hidden">
                Bar chart of estimated water avoided on each day you confirmed
                a followed recommendation. Total{" "}
                {formatVolume(data.estimated_water_avoided_litres, unit)}.
              </figcaption>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailyPoints}
                  margin={{ top: 10, right: 4, bottom: 0, left: 0 }}
                  accessibilityLayer
                >
                  <defs>
                    <linearGradient
                      id="gf-sav-live-bars"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#2c8a52" />
                      <stop offset="100%" stopColor="#176b3a" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e9efe7" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#5f6f64", fontSize: 11 }}
                    tickMargin={9}
                    interval={0}
                    minTickGap={4}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#5f6f64", fontSize: 11 }}
                    tickMargin={9}
                    width={44}
                    allowDecimals={false}
                    domain={[0, "auto"]}
                    tickFormatter={(value: number) =>
                      formatAxisVolume(value, unit)
                    }
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(23, 107, 58, 0.06)" }}
                    content={(props) => <DayTooltip {...props} unit={unit} />}
                  />
                  <Bar
                    dataKey="litres"
                    name="Estimated avoided"
                    fill="url(#gf-sav-live-bars)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={54}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </figure>
          ) : (
            <div className="gf-sav-inline-empty">
              <Droplets size={22} aria-hidden="true" />
              <p>
                No avoided volume to chart yet. A confirmation only adds
                savings when you followed a skip or a shorter run time.
              </p>
            </div>
          )}
        </section>

        <section className="gf-card" aria-labelledby="gf-sav-basis-title">
          <div className="gf-card__header">
            <div>
              <p className="gf-eyebrow">Calculation basis</p>
              <h2 id="gf-sav-basis-title">How these numbers are made</h2>
            </div>
          </div>

          <div className="gf-sav-basis__formula">
            <p className="gf-sav-basis__formula-label">
              Estimated avoided volume
            </p>
            <code>
              avoided L = (baseline depth − recommended depth) (mm) × area (m²)
            </code>
            <p>
              Both depths, and the lawn area, are stored with each recommendation
              when the engine writes it. Volumes assume 1 mm of water over 1 m²
              equals 1 L. Run-time minutes are a separate figure: the volume is
              never rebuilt from a rounded minute count. Recommendations you did
              not follow, and recommendations you have not confirmed, add nothing.
            </p>
          </div>

          <details className="gf-sav-expander">
            <summary>Assumptions and basis</summary>
            <div className="gf-sav-expander__body">
              {backtestData ? (
                <>
                  <p className="gf-sav-basis__label">About the simulated replay</p>
                  <ul className="gf-sav-assumptions">
                    <li>
                      The replay baseline is your stated watering schedule —{" "}
                      {backtestData.inputs.events_per_week} event
                      {backtestData.inputs.events_per_week === 1 ? "" : "s"} per
                      week at {backtestData.inputs.baseline_minutes_per_event}{" "}
                      min — not a log of when the sprinkler actually ran.
                    </li>
                    <li>
                      The simulated replay is an upper bound. Each scheduled day
                      is decided from the shortage already in the root zone,
                      never in advance, so a live forecast-driven recommendation
                      would usually apply more water and avoid less.
                    </li>
                  </ul>
                </>
              ) : null}

              <p className="gf-sav-basis__label">Backend assumptions</p>
              <ul className="gf-sav-assumptions">
                {data.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>
          </details>

          <p className="gf-sav-footnote">
            GreenFlow provides irrigation advice. It does not control or modify
            your irrigation timer.
          </p>
        </section>
      </div>

      <p className="gf-sav-footnote">
        Showing confirmed savings for profile{" "}
        <code>{profileId ?? "unknown"}</code> over the{" "}
        {rangeLabel.toLowerCase()}. Figures are estimates from reported inputs
        and are not guaranteed water savings.
      </p>
    </>
  );
}
