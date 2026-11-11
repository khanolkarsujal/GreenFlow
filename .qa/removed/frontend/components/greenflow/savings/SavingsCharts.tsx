import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

import {
  convertVolume,
  formatCompactNumber,
  formatVolume,
  volumeUnitShort,
} from "../../../lib/savingsFormat";
import { formatTooltipDate, formatWeekdayShort } from "../../../lib/weatherFormat";
import type {
  DailySavingsPoint,
  MonthlySavingsPoint,
  VolumeUnit,
} from "../../../types/savings";

import "./SavingsCharts.css";

const PALETTE = {
  green: "#176b3a",
  greenLight: "#2c8a52",
  pending: "#b9d8ae",
  pendingStroke: "#8fbd85",
  teal: "#2c7a6b",
  grid: "#e9efe7",
  tick: "#5f6f64",
} as const;

const TICK = { fill: PALETTE.tick, fontSize: 11 };

const AXIS = {
  axisLine: false,
  tickLine: false,
  tick: TICK,
  tickMargin: 9,
} as const;

const GRID = <CartesianGrid stroke={PALETTE.grid} vertical={false} />;

interface TipRow {
  label: string;
  value: string;
  tone?: "green" | "pending" | "teal";
}

function TooltipCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: TipRow[];
}) {
  return (
    <div className="gf-sav-tip">
      <p className="gf-sav-tip__title">{title}</p>
      <p className="gf-sav-tip__subtitle">{subtitle}</p>
      <ul className="gf-sav-tip__rows">
        {rows.map((row) => (
          <li className="gf-sav-tip__row" key={row.label}>
            <span
              className="gf-sav-tip__dot"
              data-tone={row.tone ?? "green"}
              aria-hidden="true"
            />
            <span className="gf-sav-tip__label">{row.label}</span>
            <span className="gf-sav-tip__value">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface WeeklyPoint extends DailySavingsPoint {
  label: string;
  confirmed: number;
  pending: number;
}

function WeeklyTooltip({
  active,
  payload,
  unit,
}: TooltipContentProps & { unit: VolumeUnit }) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload as WeeklyPoint | undefined;
  if (!point) return null;

  return (
    <TooltipCard
      title={formatTooltipDate(point.date)}
      subtitle="Daily estimate"
      rows={[
        {
          label: "Confirmed savings",
          value: formatVolume(point.confirmedL, unit),
          tone: "green",
        },
        {
          label: "Awaiting confirmation",
          value: formatVolume(point.pendingL, unit),
          tone: "pending",
        },
        {
          label: "Decisions",
          value: String(point.decisions),
          tone: "teal",
        },
        {
          label: "Confirmed skips",
          value: String(point.confirmedSkips),
          tone: "teal",
        },
      ]}
    />
  );
}

export function WeeklySavingsChart({
  points,
  unit,
}: {
  points: DailySavingsPoint[];
  unit: VolumeUnit;
}) {
  const data: WeeklyPoint[] = points.map((point) => ({
    ...point,
    label: formatWeekdayShort(point.date),
    confirmed: convertVolume(point.confirmedL, unit),
    pending: convertVolume(point.pendingL, unit),
  }));

  const confirmedTotal = points.reduce(
    (sum, point) => sum + point.confirmedL,
    0,
  );
  const pendingTotal = points.reduce((sum, point) => sum + point.pendingL, 0);

  return (
    <figure className="gf-sav-chart gf-sav-chart--weekly">
      <figcaption className="gf-visually-hidden">
        Stacked bar chart of estimated water avoided for the last{" "}
        {points.length} days. Confirmed actions total{" "}
        {formatVolume(confirmedTotal, unit)}; another{" "}
        {formatVolume(pendingTotal, unit)} awaits confirmation and is not
        counted in savings.
      </figcaption>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 4, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id="gf-sav-confirmed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE.greenLight} />
              <stop offset="100%" stopColor={PALETTE.green} />
            </linearGradient>
          </defs>
          {GRID}
          <XAxis {...AXIS} dataKey="label" interval={0} minTickGap={4} />
          <YAxis
            {...AXIS}
            width={40}
            allowDecimals={false}
            domain={[0, "auto"]}
            tickFormatter={(value: number) => formatCompactNumber(value)}
          />
          <Tooltip
            cursor={{ fill: "rgba(23, 107, 58, 0.06)" }}
            content={(props) => <WeeklyTooltip {...props} unit={unit} />}
          />
          <Bar
            dataKey="confirmed"
            name="Confirmed savings"
            stackId="avoided"
            fill="url(#gf-sav-confirmed)"
            maxBarSize={42}
            isAnimationActive={false}
          />
          <Bar
            dataKey="pending"
            name="Awaiting confirmation"
            stackId="avoided"
            fill={PALETTE.pending}
            stroke={PALETTE.pendingStroke}
            strokeWidth={1}
            radius={[5, 5, 0, 0]}
            maxBarSize={42}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

interface MonthlyPoint extends MonthlySavingsPoint {
  savings: number;
}

function MonthlyTooltip({
  active,
  payload,
  unit,
}: TooltipContentProps & { unit: VolumeUnit }) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload as MonthlyPoint | undefined;
  if (!point) return null;

  return (
    <TooltipCard
      title={`${point.label} · sampled month`}
      subtitle="Monthly estimate"
      rows={[
        {
          label: "Confirmed savings",
          value: formatVolume(point.confirmedL, unit),
          tone: "green",
        },
        {
          label: "Decisions",
          value: String(point.decisions),
          tone: "teal",
        },
        {
          label: "Confirmed skips",
          value: String(point.confirmedSkips),
          tone: "teal",
        },
      ]}
    />
  );
}

export function MonthlySavingsChart({
  points,
  unit,
}: {
  points: MonthlySavingsPoint[];
  unit: VolumeUnit;
}) {
  const data: MonthlyPoint[] = points.map((point) => ({
    ...point,
    savings: convertVolume(point.confirmedL, unit),
  }));

  const total = points.reduce((sum, point) => sum + point.confirmedL, 0);
  const skips = points.reduce((sum, point) => sum + point.confirmedSkips, 0);

  return (
    <figure className="gf-sav-chart gf-sav-chart--monthly">
      <figcaption className="gf-visually-hidden">
        Monthly estimated water avoided over the last {points.length} months,
        totalling {formatVolume(total, unit)} across {skips} confirmed skips.
        Bars show confirmed savings and the line shows the number of confirmed
        skips.
      </figcaption>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 0, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id="gf-sav-monthly" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE.greenLight} />
              <stop offset="100%" stopColor={PALETTE.green} />
            </linearGradient>
          </defs>
          {GRID}
          <XAxis {...AXIS} dataKey="label" interval={0} minTickGap={4} />
          <YAxis
            {...AXIS}
            yAxisId="volume"
            width={40}
            allowDecimals={false}
            domain={[0, "auto"]}
            tickFormatter={(value: number) => formatCompactNumber(value)}
          />
          <YAxis
            {...AXIS}
            yAxisId="skips"
            orientation="right"
            width={30}
            allowDecimals={false}
            domain={[0, "auto"]}
            tickFormatter={(value: number) => String(value)}
          />
          <Tooltip
            cursor={{ fill: "rgba(23, 107, 58, 0.06)" }}
            content={(props) => <MonthlyTooltip {...props} unit={unit} />}
          />
          <Bar
            yAxisId="volume"
            dataKey="savings"
            name="Confirmed savings"
            fill="url(#gf-sav-monthly)"
            radius={[6, 6, 0, 0]}
            maxBarSize={54}
            isAnimationActive={false}
          />
          <Line
            yAxisId="skips"
            type="monotone"
            dataKey="confirmedSkips"
            name="Confirmed skips"
            stroke={PALETTE.teal}
            strokeWidth={2.4}
            dot={{
              r: 3.5,
              strokeWidth: 2,
              fill: "#ffffff",
              stroke: PALETTE.teal,
            }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}

export function chartUnitLabel(unit: VolumeUnit): string {
  return `${volumeUnitShort(unit)} per day`;
}
