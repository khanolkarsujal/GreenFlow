import { useState } from "react";
import { Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  RECOMMENDATION_STATE_META,
  RecommendationCard,
  WhyDetails,
} from "../components/RecommendationCard";
import { Card } from "../components/Card";
import { ProgressBar } from "../components/ProgressBar";
import { StatCard } from "../components/StatCard";
import { Tabs } from "../components/Tabs";
import { Tag } from "../components/Tag";
import { TopBar } from "../components/TopBar";
import { sampleToday, type SavingsNote } from "../sample/sampleToday";

import "./TodayPage.css";

const RANGE_OPTIONS = [
  { value: "7D", label: "7D" },
  { value: "14D", label: "14D" },
] as const;

type ChartRange = "7D" | "14D";

function SavingsNoteDetails({ note }: { note: SavingsNote }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="savings-note">
      <button
        type="button"
        className="savings-note__toggle"
        aria-expanded={isOpen}
        aria-controls="savings-note-details"
        onClick={() => setIsOpen((open) => !open)}
      >
        <Info size={16} aria-hidden="true" />
        {isOpen ? "Hide estimate details" : "How is this estimated?"}
      </button>
      {isOpen && (
        <dl id="savings-note-details" className="savings-note__details">
          <div className="savings-note__row">
            <dt className="savings-note__term">Baseline</dt>
            <dd className="savings-note__description">{note.baseline}</dd>
          </div>
          <div className="savings-note__row">
            <dt className="savings-note__term">Assumptions</dt>
            <dd className="savings-note__description">{note.assumptions}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

export function TodayPage() {
  const [range, setRange] = useState<ChartRange>("7D");

  const sampleTag = <Tag tone="neutral">Sample data</Tag>;
  const estimatedTag = (
    <Tag tone="estimate" icon={<Info size={16} aria-hidden="true" />}>
      Estimated
    </Tag>
  );

  const chartDays =
    range === "7D" ? sampleToday.chart.days.slice(-7) : sampleToday.chart.days;
  const followedCount = sampleToday.decisions.filter(
    (decision) => decision.followed,
  ).length;

  const handleRangeChange = (value: string) => {
    if (value === "7D" || value === "14D") {
      setRange(value);
    }
  };

  return (
    <>
      <TopBar />
      <main className="today" id="today">
        <header className="today__header">
          <h1 className="today__title">Today</h1>
          <p className="today__subtitle">
            A sample of today&apos;s watering advice for your lawn.
          </p>
        </header>

        <div className="today__layout">
          <div className="today__recommendation">
            <RecommendationCard
              state={sampleToday.recommendation.state}
              reason={sampleToday.recommendation.reason}
              why={sampleToday.recommendation.why}
              badge={sampleTag}
            />
          </div>

          <div className="today__stats">
            {sampleToday.stats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                sublabel={stat.sublabel}
                value={stat.value}
                unit={stat.unit}
                badges={
                  stat.isEstimate ? (
                    <>
                      {sampleTag}
                      {estimatedTag}
                    </>
                  ) : (
                    sampleTag
                  )
                }
                action={
                  stat.note ? <SavingsNoteDetails note={stat.note} /> : undefined
                }
              />
            ))}
          </div>

          <div className="today__chart">
            <Card
              title="Rainfall and demand"
              badges={sampleTag}
              action={
                <Tabs
                  label="Chart range"
                  options={RANGE_OPTIONS}
                  value={range}
                  onChange={handleRangeChange}
                />
              }
            >
              <div className="chart">
                <div className="chart__canvas">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={chartDays}
                      margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
                      barGap={2}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="var(--border-default)"
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        minTickGap={16}
                        tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                      />
                      <YAxis
                        width={52}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: number) => `${value} mm`}
                        tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--bg-subtle)" }}
                        contentStyle={{
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-primary)",
                          fontSize: "0.875rem",
                        }}
                        labelStyle={{ color: "var(--text-muted)" }}
                        formatter={(value) => `${String(value)} mm`}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={10}
                        wrapperStyle={{ fontSize: "0.875rem" }}
                      />
                      <ReferenceLine
                        y={sampleToday.chart.baselineMm}
                        stroke="var(--chart-baseline)"
                        strokeDasharray="6 4"
                        label={{
                          value: `Baseline ${sampleToday.chart.baselineMm.toFixed(1)} mm`,
                          position: "insideTopLeft",
                          fill: "var(--text-muted)",
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="rainfallMm"
                        name="Rainfall (mm)"
                        fill="var(--chart-rain)"
                      />
                      <Bar
                        dataKey="demandMm"
                        name="Estimated demand (mm)"
                        fill="var(--chart-demand)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart__note">
                  {estimatedTag}
                  <p>
                    Demand is an estimate based on local weather, not a
                    measured value.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="today__why">
            <Card title="Why this recommendation" badges={sampleTag}>
              <WhyDetails why={sampleToday.recommendation.why} />
            </Card>
          </div>

          <div className="today__recent">
            <Card title="Recent decisions" badges={sampleTag}>
              <ul className="decisions">
                {sampleToday.decisions.map((decision) => {
                  const meta = RECOMMENDATION_STATE_META[decision.state];
                  const Icon = meta.icon;

                  return (
                    <li
                      key={`${decision.dateLabel}-${decision.state}`}
                      className="decisions__row"
                    >
                      <span className="decisions__date">
                        {decision.dateLabel}
                      </span>
                      <Tag
                        tone={meta.tone}
                        icon={<Icon size={16} aria-hidden="true" />}
                      >
                        {decision.state}
                      </Tag>
                      <Tag tone={decision.followed ? "success" : "neutral"}>
                        {decision.followed ? "Followed" : "Not followed"}
                      </Tag>
                    </li>
                  );
                })}
              </ul>
              <div className="decisions__summary">
                <ProgressBar
                  label="Followed in the last 7 days"
                  value={followedCount}
                  max={sampleToday.decisions.length}
                  valueLabel={`${followedCount} of ${sampleToday.decisions.length} decisions`}
                />
              </div>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
