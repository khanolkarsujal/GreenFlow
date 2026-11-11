import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

import {
  formatAxisDate,
  formatDecimal,
  formatForecastAxisDate,
  formatTooltipDate,
} from "../../../lib/weatherFormat";
import type {
  DailyForecast,
  DailyObservation,
  ObservationRangeDays,
  TrendMetric,
} from "../../../types/weather";

import "./WeatherCharts.css";

const PALETTE = {
  green: "#176b3a",
  sage: "#ddebdd",
  teal: "#2c7a6b",
  amber: "#9a6200",
  blue: "#2f6f8f",
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

type TooltipTone = "green" | "teal" | "amber" | "blue";

interface TooltipRow {
  label: string;
  value: string;
  tone?: TooltipTone;
}

function TooltipCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: TooltipRow[];
}) {
  return (
    <div className="gf-chart-tip">
      <p className="gf-chart-tip__title">{title}</p>
      <p className="gf-chart-tip__subtitle">{subtitle}</p>
      <ul className="gf-chart-tip__rows">
        {rows.map((row) => (
          <li className="gf-chart-tip__row" key={row.label}>
            <span
              className="gf-chart-tip__dot"
              data-tone={row.tone ?? "green"}
              aria-hidden="true"
            />
            <span className="gf-chart-tip__label">{row.label}</span>
            <span className="gf-chart-tip__value">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function axisInterval(range: ObservationRangeDays): number {
  if (range === 7) return 0;
  if (range === 14) return 1;
  return 4;
}

export function RainfallHistoryChart({
  days,
  range,
}: {
  days: DailyObservation[];
  range: ObservationRangeDays;
}) {
  const data = days.map((day) => ({
    ...day,
    label: formatAxisDate(day.date, range),
  }));

  const total = days.reduce((sum, day) => sum + day.rainfallMm, 0);
  const rainyDays = days.filter((day) => day.rainfallMm > 0).length;

  return (
    <figure className="gf-chart gf-chart--rainfall">
      <figcaption className="gf-visually-hidden">
        Bar chart of observed daily rainfall for the last {days.length}{" "}
        completed days. {formatDecimal(total)} millimetres in total across{" "}
        {rainyDays} rainy days.
      </figcaption>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 4, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          {GRID}
          <XAxis
            {...AXIS}
            dataKey="label"
            interval={axisInterval(range)}
            minTickGap={8}
          />
          <YAxis
            {...AXIS}
            width={38}
            allowDecimals={false}
            domain={[0, "auto"]}
            tickFormatter={(value: number) => String(value)}
          />
          <Tooltip
            cursor={{ fill: "rgba(23, 107, 58, 0.06)" }}
            content={(props) => <RainfallTooltip {...props} />}
          />
          <Bar
            dataKey="rainfallMm"
            name="Rainfall"
            radius={[5, 5, 0, 0]}
            maxBarSize={range === 30 ? 10 : 30}
            minPointSize={3}
            isAnimationActive={false}
          >
            {data.map((day) => (
              <Cell
                key={day.date}
                fill={day.rainfallMm > 0 ? PALETTE.green : PALETTE.sage}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

function RainfallTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  const day = payload[0]?.payload as DailyObservation | undefined;
  if (!day) return null;

  return (
    <TooltipCard
      title={formatTooltipDate(day.date)}
      subtitle="Observed"
      rows={[
        {
          label: "Rainfall",
          value:
            day.rainfallMm > 0
              ? `${formatDecimal(day.rainfallMm)} mm`
              : "No rain",
          tone: day.rainfallMm > 0 ? "green" : undefined,
        },
      ]}
    />
  );
}

interface TemperaturePoint {
  date: string;
  label: string;
  tempMaxC: number;
  tempMinC: number;
}

function TemperatureLines({
  data,
  subtitle,
  summary,
  className,
  xInterval = 0,
}: {
  data: TemperaturePoint[];
  subtitle: string;
  summary: string;
  className: string;
  xInterval?: number;
}) {
  return (
    <figure className={`gf-chart ${className}`}>
      <figcaption className="gf-visually-hidden">{summary}</figcaption>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          {GRID}
          <XAxis
            {...AXIS}
            dataKey="label"
            interval={xInterval}
            minTickGap={8}
          />
          <YAxis
            {...AXIS}
            width={38}
            domain={[8, 30]}
            ticks={[10, 15, 20, 25, 30]}
            tickFormatter={(value: number) => `${value}°`}
          />
          <Tooltip
            cursor={{ stroke: PALETTE.grid, strokeWidth: 1 }}
            content={(props) => (
              <TemperatureTooltip {...props} subtitle={subtitle} />
            )}
          />
          <Line
            type="monotone"
            dataKey="tempMaxC"
            name="High"
            stroke={PALETTE.amber}
            strokeWidth={2.4}
            dot={{
              r: 3,
              strokeWidth: 2,
              fill: "#ffffff",
              stroke: PALETTE.amber,
            }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="tempMinC"
            name="Low"
            stroke={PALETTE.blue}
            strokeWidth={2.4}
            dot={{
              r: 3,
              strokeWidth: 2,
              fill: "#ffffff",
              stroke: PALETTE.blue,
            }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

function TemperatureTooltip({
  active,
  payload,
  subtitle,
}: TooltipContentProps & { subtitle: string }) {
  if (!active || !payload || payload.length === 0) return null;

  const day = payload[0]?.payload as TemperaturePoint | undefined;
  if (!day) return null;

  return (
    <TooltipCard
      title={formatTooltipDate(day.date)}
      subtitle={subtitle}
      rows={[
        {
          label: "High",
          value: `${Math.round(day.tempMaxC)} °C`,
          tone: "amber",
        },
        {
          label: "Low",
          value: `${Math.round(day.tempMinC)} °C`,
          tone: "blue",
        },
      ]}
    />
  );
}

export function TemperatureTrendChart({
  forecast,
  todayIso,
}: {
  forecast: DailyForecast[];
  todayIso: string;
}) {
  const data: TemperaturePoint[] = forecast.map((day) => ({
    date: day.date,
    label: formatForecastAxisDate(day.date, todayIso),
    tempMaxC: day.tempMaxC,
    tempMinC: day.tempMinC,
  }));

  const highs = forecast.map((day) => day.tempMaxC);
  const lows = forecast.map((day) => day.tempMinC);
  const summary = `Forecast daily high and low temperatures for the next ${forecast.length} days. Highs range from ${Math.min(...highs)} to ${Math.max(...highs)} degrees Celsius, lows from ${Math.min(...lows)} to ${Math.max(...lows)} degrees Celsius.`;

  return (
    <TemperatureLines
      data={data}
      subtitle="Forecast"
      summary={summary}
      className="gf-chart--temperature"
    />
  );
}

export function Et0TrendChart({
  forecast,
  todayIso,
}: {
  forecast: DailyForecast[];
  todayIso: string;
}) {
  const data = forecast.map((day) => ({
    ...day,
    label: formatForecastAxisDate(day.date, todayIso),
  }));

  const total = forecast.reduce((sum, day) => sum + day.et0Mm, 0);
  const summary = `Forecast reference evapotranspiration for the next ${forecast.length} days, totalling ${formatDecimal(total)} millimetres per day across the period.`;

  return (
    <figure className="gf-chart gf-chart--et0">
      <figcaption className="gf-visually-hidden">{summary}</figcaption>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id="gf-et0-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE.teal} stopOpacity={0.24} />
              <stop offset="100%" stopColor={PALETTE.teal} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {GRID}
          <XAxis {...AXIS} dataKey="label" interval={0} minTickGap={4} />
          <YAxis
            {...AXIS}
            width={38}
            domain={[0, 6]}
            ticks={[0, 2, 4, 6]}
            tickFormatter={(value: number) => String(value)}
          />
          <Tooltip
            cursor={{ stroke: PALETTE.grid, strokeWidth: 1 }}
            content={(props) => <Et0Tooltip {...props} />}
          />
          <Area
            type="monotone"
            dataKey="et0Mm"
            stroke={PALETTE.teal}
            strokeWidth={2.4}
            fill="url(#gf-et0-fill)"
            dot={{
              r: 3,
              strokeWidth: 2,
              fill: "#ffffff",
              stroke: PALETTE.teal,
            }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}

function Et0Tooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  const day = payload[0]?.payload as DailyForecast | undefined;
  if (!day) return null;

  return (
    <TooltipCard
      title={formatTooltipDate(day.date)}
      subtitle="Forecast"
      rows={[
        {
          label: "Reference ET₀",
          value: `${formatDecimal(day.et0Mm)} mm/day`,
          tone: "teal",
        },
      ]}
    />
  );
}

export function EnvironmentalTrendsChart({
  days,
  range,
  metric,
}: {
  days: DailyObservation[];
  range: ObservationRangeDays;
  metric: TrendMetric;
}) {
  const data = days.map((day) => ({
    ...day,
    label: formatAxisDate(day.date, range),
  }));

  if (metric === "temperature") {
    const highs = days.map((day) => day.tempMaxC);
    const lows = days.map((day) => day.tempMinC);
    const summary = `Observed daily high and low temperatures for the last ${days.length} completed days. Highs range from ${Math.min(...highs)} to ${Math.max(...highs)} degrees Celsius, lows from ${Math.min(...lows)} to ${Math.max(...lows)} degrees Celsius.`;

    return (
      <TemperatureLines
        data={data}
        subtitle="Observed"
        summary={summary}
        className="gf-chart--trends"
        xInterval={axisInterval(range)}
      />
    );
  }

  const rainTotal = days.reduce((sum, day) => sum + day.rainfallMm, 0);
  const et0Total = days.reduce((sum, day) => sum + day.et0Mm, 0);
  const summary = `Observed water balance for the last ${days.length} completed days: ${formatDecimal(rainTotal)} millimetres of rainfall and ${formatDecimal(et0Total)} millimetres of cumulative reference evapotranspiration. Rainfall is shown as bars and reference ET₀ as a line.`;

  return (
    <figure className="gf-chart gf-chart--trends">
      <figcaption className="gf-visually-hidden">{summary}</figcaption>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 0, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          {GRID}
          <XAxis
            {...AXIS}
            dataKey="label"
            interval={axisInterval(range)}
            minTickGap={8}
          />
          <YAxis
            {...AXIS}
            yAxisId="rain"
            width={38}
            allowDecimals={false}
            domain={[0, "auto"]}
            tickFormatter={(value: number) => String(value)}
          />
          <YAxis
            {...AXIS}
            yAxisId="et0"
            orientation="right"
            width={38}
            domain={[0, 6]}
            ticks={[0, 2, 4, 6]}
            tickFormatter={(value: number) => String(value)}
          />
          <Tooltip
            cursor={{ fill: "rgba(23, 107, 58, 0.06)" }}
            content={(props) => <WaterBalanceTooltip {...props} />}
          />
          <Bar
            yAxisId="rain"
            dataKey="rainfallMm"
            name="Rainfall"
            radius={[4, 4, 0, 0]}
            maxBarSize={range === 30 ? 9 : 26}
            minPointSize={3}
            isAnimationActive={false}
          >
            {data.map((day) => (
              <Cell
                key={day.date}
                fill={day.rainfallMm > 0 ? PALETTE.green : PALETTE.sage}
              />
            ))}
          </Bar>
          <Line
            yAxisId="et0"
            type="monotone"
            dataKey="et0Mm"
            name="Reference ET₀"
            stroke={PALETTE.teal}
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}

function WaterBalanceTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  const day = payload[0]?.payload as DailyObservation | undefined;
  if (!day) return null;

  return (
    <TooltipCard
      title={formatTooltipDate(day.date)}
      subtitle="Observed"
      rows={[
        {
          label: "Rainfall",
          value:
            day.rainfallMm > 0
              ? `${formatDecimal(day.rainfallMm)} mm`
              : "No rain",
          tone: "green",
        },
        {
          label: "Reference ET₀",
          value: `${formatDecimal(day.et0Mm)} mm/day`,
          tone: "teal",
        },
      ]}
    />
  );
}
