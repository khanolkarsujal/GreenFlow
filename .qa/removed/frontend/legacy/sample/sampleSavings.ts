import { addDays, startOfDay, toIsoDate } from "../lib/weatherFormat";
import type {
  DailySavingsPoint,
  MonthlySavingsPoint,
  MonthlyWindow,
  SavingsRange,
  SavingsTotals,
  WateringDecision,
} from "../types/savings";

// Illustrative only: the saved Lawn Profile has no measured flow or
// precipitation rate, so the sample UI states this rate explicitly.
export const SAMPLE_FLOW_RATE_L_PER_MIN = 10;
export const SAMPLE_NORMAL_MINUTES = 30;
export const SAMPLE_HISTORY_DAYS = 90;
export const SAMPLE_AVAILABLE_MONTHS = 3;
export const SAMPLE_WATERING_CAN_LITERS = 15;

export const SAMPLE_TODAY = startOfDay(new Date());
export const SAMPLE_TODAY_ISO = toIsoDate(SAMPLE_TODAY);

export const sampleSnapshotTime = new Date(
  SAMPLE_TODAY.getFullYear(),
  SAMPLE_TODAY.getMonth(),
  SAMPLE_TODAY.getDate(),
  9,
  20,
);

function isoForOffset(offset: number): string {
  return toIsoDate(addDays(SAMPLE_TODAY, -offset));
}

type DecisionPattern = Pick<
  WateringDecision,
  "recommendation" | "recommendedMinutes" | "action"
>;

const RECENT_RECORDS: WateringDecision[] = [
  {
    id: "sample-recent-5",
    date: isoForOffset(5),
    recommendation: "skip",
    normalMinutes: SAMPLE_NORMAL_MINUTES,
    recommendedMinutes: 0,
    action: "not-recorded",
  },
  {
    id: "sample-recent-4",
    date: isoForOffset(4),
    recommendation: "reduce",
    normalMinutes: SAMPLE_NORMAL_MINUTES,
    recommendedMinutes: 15,
    action: "not-recorded",
  },
  {
    id: "sample-recent-2",
    date: isoForOffset(2),
    recommendation: "skip",
    normalMinutes: SAMPLE_NORMAL_MINUTES,
    recommendedMinutes: 0,
    action: "confirmed-skip",
  },
  {
    id: "sample-recent-1",
    date: isoForOffset(1),
    recommendation: "reduce",
    normalMinutes: SAMPLE_NORMAL_MINUTES,
    recommendedMinutes: 15,
    action: "followed",
  },
  {
    id: "sample-recent-0",
    date: isoForOffset(0),
    recommendation: "water",
    normalMinutes: SAMPLE_NORMAL_MINUTES,
    recommendedMinutes: SAMPLE_NORMAL_MINUTES,
    action: "followed",
  },
];

const OLDER_PATTERN: DecisionPattern[] = [
  { recommendation: "skip", recommendedMinutes: 0, action: "confirmed-skip" },
  { recommendation: "reduce", recommendedMinutes: 20, action: "followed" },
  { recommendation: "water", recommendedMinutes: 30, action: "followed" },
  { recommendation: "reduce", recommendedMinutes: 15, action: "not-recorded" },
  { recommendation: "skip", recommendedMinutes: 0, action: "confirmed-skip" },
  { recommendation: "water", recommendedMinutes: 30, action: "not-recorded" },
  { recommendation: "skip", recommendedMinutes: 0, action: "not-recorded" },
  { recommendation: "reduce", recommendedMinutes: 20, action: "followed" },
];

const olderRecords: WateringDecision[] = [];

let patternIndex = 0;
for (let offset = 7; offset < SAMPLE_HISTORY_DAYS; offset += 2) {
  const pattern = OLDER_PATTERN[patternIndex % OLDER_PATTERN.length];
  if (pattern) {
    olderRecords.push({
      id: `sample-history-${offset}`,
      date: isoForOffset(offset),
      normalMinutes: SAMPLE_NORMAL_MINUTES,
      ...pattern,
    });
  }
  patternIndex += 1;
}

export const sampleDecisions: WateringDecision[] = [
  ...RECENT_RECORDS,
  ...olderRecords,
].sort((a, b) => b.date.localeCompare(a.date));

export const SAMPLE_OLDEST_ISO =
  sampleDecisions[sampleDecisions.length - 1]?.date ?? SAMPLE_TODAY_ISO;

export function rangeStartIso(range: SavingsRange): string {
  if (range === "all") return SAMPLE_OLDEST_ISO;
  return isoForOffset(range - 1);
}

export function decisionsInRange(
  range: SavingsRange,
  records: WateringDecision[] = sampleDecisions,
): WateringDecision[] {
  const start = rangeStartIso(range);
  return records.filter((record) => record.date >= start);
}

export function summarizeDecisions(
  records: WateringDecision[],
  flowRateLPerMin: number = SAMPLE_FLOW_RATE_L_PER_MIN,
): SavingsTotals {
  let normalMinutes = 0;
  let confirmedAvoidedMinutes = 0;
  let pendingAvoidedMinutes = 0;
  let recommendedSkips = 0;
  let confirmedSkips = 0;
  let unconfirmedSkips = 0;
  let confirmedSkipMinutes = 0;

  for (const record of records) {
    normalMinutes += record.normalMinutes;

    const avoidedMinutes = Math.max(
      0,
      record.normalMinutes - record.recommendedMinutes,
    );
    const isConfirmed = record.action !== "not-recorded";

    if (isConfirmed) {
      confirmedAvoidedMinutes += avoidedMinutes;
    } else {
      pendingAvoidedMinutes += avoidedMinutes;
    }

    if (record.recommendation === "skip") {
      recommendedSkips += 1;

      if (record.action === "confirmed-skip") {
        confirmedSkips += 1;
        confirmedSkipMinutes += avoidedMinutes;
      } else if (record.action === "not-recorded") {
        unconfirmedSkips += 1;
      }
    }
  }

  const normalVolumeL = normalMinutes * flowRateLPerMin;
  const confirmedVolumeL = confirmedAvoidedMinutes * flowRateLPerMin;

  return {
    decisions: records.length,
    normalMinutes,
    confirmedAvoidedMinutes,
    pendingAvoidedMinutes,
    normalVolumeL,
    confirmedVolumeL,
    pendingVolumeL: pendingAvoidedMinutes * flowRateLPerMin,
    avoidedPercent:
      normalVolumeL > 0 ? (confirmedVolumeL / normalVolumeL) * 100 : 0,
    recommendedSkips,
    confirmedSkips,
    unconfirmedSkips,
    confirmedSkipVolumeL: confirmedSkipMinutes * flowRateLPerMin,
  };
}

export function dailySeries(
  days: number,
  records: WateringDecision[] = sampleDecisions,
  flowRateLPerMin: number = SAMPLE_FLOW_RATE_L_PER_MIN,
): DailySavingsPoint[] {
  const points: DailySavingsPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = isoForOffset(offset);
    const dayRecords = records.filter((record) => record.date === date);
    let confirmedL = 0;
    let pendingL = 0;
    let confirmedSkips = 0;

    for (const record of dayRecords) {
      const avoidedMinutes = Math.max(
        0,
        record.normalMinutes - record.recommendedMinutes,
      );

      if (record.action === "not-recorded") {
        pendingL += avoidedMinutes * flowRateLPerMin;
      } else {
        confirmedL += avoidedMinutes * flowRateLPerMin;
      }

      if (
        record.recommendation === "skip" &&
        record.action === "confirmed-skip"
      ) {
        confirmedSkips += 1;
      }
    }

    points.push({
      date,
      confirmedL,
      pendingL,
      decisions: dayRecords.length,
      confirmedSkips,
    });
  }

  return points;
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "short" });

export function monthlySeries(
  months: MonthlyWindow,
  records: WateringDecision[] = sampleDecisions,
  flowRateLPerMin: number = SAMPLE_FLOW_RATE_L_PER_MIN,
): MonthlySavingsPoint[] {
  const points: MonthlySavingsPoint[] = [];

  for (let index = months - 1; index >= 0; index -= 1) {
    const monthDate = new Date(
      SAMPLE_TODAY.getFullYear(),
      SAMPLE_TODAY.getMonth() - index,
      1,
    );
    const month = `${monthDate.getFullYear()}-${String(
      monthDate.getMonth() + 1,
    ).padStart(2, "0")}`;
    const monthRecords = records.filter((record) =>
      record.date.startsWith(month),
    );
    const totals = summarizeDecisions(monthRecords, flowRateLPerMin);

    points.push({
      month,
      label: MONTH_LABEL.format(monthDate),
      confirmedL: totals.confirmedVolumeL,
      decisions: totals.decisions,
      confirmedSkips: totals.confirmedSkips,
    });
  }

  return points;
}

export function previousWeekSummary(
  flowRateLPerMin: number = SAMPLE_FLOW_RATE_L_PER_MIN,
): SavingsTotals {
  const start = isoForOffset(13);
  const end = isoForOffset(7);
  return summarizeDecisions(
    sampleDecisions.filter(
      (record) => record.date >= start && record.date <= end,
    ),
    flowRateLPerMin,
  );
}
