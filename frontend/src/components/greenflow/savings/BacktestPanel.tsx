import { AlertTriangle, FlaskConical, RefreshCw } from "lucide-react";

import type { BacktestResponse, BacktestStep } from "../../../api/backtest";
import {
  formatPercent,
  formatVolume,
  formatVolumeValue,
  volumeUnitShort,
} from "../../../lib/savingsFormat";
import { SIMULATED_HERO_BANNER } from "../../../lib/savingsHero";
import { formatMonthDay } from "../../../lib/weatherFormat";
import type { VolumeUnit } from "../../../types/savings";

import "./BacktestPanel.css";

export type BacktestView =
  | { kind: "loading" }
  | { kind: "ready"; data: BacktestResponse }
  | { kind: "error"; message: string };

const DAY_TITLES: Record<string, string> = {
  SKIP: "Simulated SKIP · no watering",
  REDUCE: "Simulated REDUCE · shorter run",
  WATER: "Simulated WATER · full baseline run",
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function DayStrip({
  steps,
  className,
}: {
  steps: BacktestStep[];
  className: string;
}) {
  return (
    <div className={className} role="img" aria-label="One square per day in the replayed window, coloured by the simulated decision.">
      {steps.map((step) => {
        const tone = !step.scheduled
          ? "dry"
          : step.state === "SKIP"
            ? "skip"
            : step.state === "REDUCE"
              ? "reduce"
              : "water";
        return (
          <span
            key={step.date}
            className={`gf-bt-day gf-bt-day--${tone}`}
            title={`${formatMonthDay(step.date)} · ${
              step.scheduled
                ? (DAY_TITLES[step.state ?? ""] ?? "Scheduled")
                : "Not a scheduled watering day"
            }`}
          />
        );
      })}
    </div>
  );
}

export function BacktestPanel({
  view,
  unit,
  onRun,
}: {
  view: BacktestView;
  unit: VolumeUnit;
  onRun: () => void;
}) {
  return (
    <section className="gf-card gf-bt" aria-labelledby="gf-bt-title">
      <div className="gf-card__header">
        <div>
          <p className="gf-eyebrow">
            <FlaskConical size={13} aria-hidden="true" /> Simulated replay
          </p>
          <h2 id="gf-bt-title">Last 30 days on your saved schedule</h2>
        </div>
        <span className="gf-soft-badge">
          {view.kind === "ready"
            ? `${formatMonthDay(view.data.start_date)} – ${formatMonthDay(view.data.end_date)}`
            : "Not loaded"}
        </span>
      </div>

      <p className="gf-bt-tag">
        <strong>{SIMULATED_HERO_BANNER}.</strong> The engine ran day by day over
        observed Open-Meteo weather for your coordinates. Nothing here is
        counted in the confirmed total above.
      </p>

      {view.kind === "loading" ? (
        <p className="gf-bt-status">
          <RefreshCw size={14} className="gf-sav-spin" aria-hidden="true" />
          Replaying the last 30 days of weather…
        </p>
      ) : null}

      {view.kind === "error" ? (
        <div className="gf-bt-error">
          <p>
            <AlertTriangle size={14} aria-hidden="true" /> {view.message}
          </p>
          <button type="button" className="gf-sav-link" onClick={onRun}>
            Try the backtest again
            <RefreshCw size={13} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {view.kind === "ready" ? (
        <>
          <div className="gf-bt-figure">
            <strong>
              {formatVolumeValue(view.data.estimated_water_avoided_litres, unit)}
            </strong>
            <span>
              {volumeUnitShort(unit)} estimated water avoided ·{" "}
              {formatPercent(view.data.estimated_avoided_percent)} of the
              simulated baseline
            </span>
          </div>

          <dl className="gf-bt-stats">
            <div>
              <dt>Baseline schedule</dt>
              <dd>{formatVolume(view.data.estimated_baseline_litres, unit)}</dd>
            </div>
            <div>
              <dt>Simulated advice</dt>
              <dd>
                {formatVolume(view.data.estimated_recommended_litres, unit)}
              </dd>
            </div>
            <div>
              <dt>Decisions</dt>
              <dd>
                {view.data.skip_events} skip · {view.data.reduce_events} reduce
                · {view.data.water_events} water
              </dd>
            </div>
          </dl>

          <DayStrip steps={view.data.steps} className="gf-bt-days" />

          <ul className="gf-bt-legend">
            <li>
              <span className="gf-bt-swatch gf-bt-swatch--skip" aria-hidden="true" />
              SKIP
            </li>
            <li>
              <span className="gf-bt-swatch gf-bt-swatch--reduce" aria-hidden="true" />
              REDUCE
            </li>
            <li>
              <span className="gf-bt-swatch gf-bt-swatch--water" aria-hidden="true" />
              WATER
            </li>
            <li>
              <span className="gf-bt-swatch gf-bt-swatch--dry" aria-hidden="true" />
              Not scheduled
            </li>
          </ul>

          <p className="gf-bt-footnote">
            {view.data.scheduled_events} scheduled watering days at{" "}
            {view.data.inputs.events_per_week} per week, each{" "}
            {round1(view.data.inputs.baseline_event_mm)} mm (
            {view.data.inputs.baseline_minutes_per_event} min at{" "}
            {view.data.inputs.precipitation_rate_mm_per_hour} mm/h) over{" "}
            {Math.round(view.data.inputs.lawn_area_m2)} m². Rain in the window:{" "}
            {round1(view.data.inputs.total_rainfall_mm)} mm · ET₀:{" "}
            {round1(view.data.inputs.total_et0_mm)} mm. Same engine, cited
            constants, skip threshold and efficiency as a live recommendation.
            Each day is decided from the shortage already in the root zone, never
            in advance, so this avoided volume is an upper bound — an estimate,
            not a metered saving.
          </p>
        </>
      ) : null}
    </section>
  );
}
