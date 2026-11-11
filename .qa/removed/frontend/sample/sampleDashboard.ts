export type WeatherMetricId =
  | "recent-rain"
  | "forecast-rain"
  | "temperature"
  | "et0";

export type WeatherMetricTone =
  | "rain"
  | "forecast"
  | "temperature"
  | "et0";

export interface WeatherMetric {
  id: WeatherMetricId;
  label: string;
  value: string;
  unit: string;
  detail: string;
}

export interface DashboardReason {
  title: string;
  detail: string;
}

export interface DashboardSchedule {
  duration: string;
  days: string;
  timer: string;
  control: string;
  status: string;
}

export interface DashboardSavings {
  amount: string;
  unit: string;
  caption: string;
  baseline: string;
  note: string;
}

export interface SampleDashboard {
  greeting: string;
  title: string;
  location: string;
  profileLabel: string;
  recommendation: {
    state: string;
    headline: string;
    reason: string;
    status: string;
    action: string;
    actionDetail: string;
    normalDuration: string;
  };
  weather: WeatherMetric[];
  reasons: DashboardReason[];
  schedule: DashboardSchedule;
  savings: DashboardSavings;
  disclaimer: string;
}

export const sampleDashboard: SampleDashboard = {
  greeting: "Good morning",
  title: "Your lawn, taken care of.",
  location: "Riverside Lawn",
  profileLabel: "Sample profile",
  recommendation: {
    state: "SKIP TODAY",
    headline: "Let nature do the watering.",
    reason:
      "Recent rainfall may have supplied enough water for your lawn.",
    status: "Rain-based skip",
    action: "Skip today's cycle",
    actionDetail: "Leave your existing timer off for this cycle.",
    normalDuration: "30 min",
  },
  weather: [
    {
      id: "recent-rain",
      label: "Recent rainfall",
      value: "12",
      unit: "mm",
      detail: "Last 72 hours",
    },
    {
      id: "forecast-rain",
      label: "Forecast rainfall",
      value: "3",
      unit: "mm",
      detail: "Next 3 days",
    },
    {
      id: "temperature",
      label: "Temperature",
      value: "24",
      unit: "°C",
      detail: "Afternoon high",
    },
    {
      id: "et0",
      label: "Reference ET₀",
      value: "3.8",
      unit: "mm",
      detail: "Today's reference ET₀",
    },
  ],
  reasons: [
    {
      title: "Recent rainfall may be enough.",
      detail:
        "12 mm of rain was recorded around your lawn over the last 72 hours.",
    },
    {
      title: "More rain is possible.",
      detail:
        "The forecast shows about 3 mm over the next three days, which may reduce demand further.",
    },
    {
      title: "Conditions are mild.",
      detail:
        "A 24°C high and a reference ET₀ of 3.8 mm suggest moderate water loss today.",
    },
    {
      title: "Your next cycle is scheduled.",
      detail:
        "Reassess on your next watering day, or sooner if the lawn shows signs of stress.",
    },
  ],
  schedule: {
    duration: "30 min",
    days: "Tue · Thu · Sun",
    timer: "Existing conventional timer",
    control: "Manual — GreenFlow only advises",
    status: "Active",
  },
  savings: {
    amount: "1,240",
    unit: "L",
    caption:
      "Estimated water avoided this month against your normal schedule.",
    baseline: "Based on 30-minute baseline cycles",
    note:
      "Illustrative estimate only. Not a measured or verified environmental result.",
  },
  disclaimer:
    "Illustrative dashboard. Weather values and the recommendation are mock data, not a validated irrigation calculation.",
};
