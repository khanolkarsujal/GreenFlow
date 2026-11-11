import type { ObservationRangeDays } from "../types/weather";

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const TOOLTIP_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
});

const TIME_OF_DAY = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function formatLongDate(date: Date): string {
  return LONG_DATE.format(date);
}

export function formatTooltipDate(iso: string): string {
  return TOOLTIP_DATE.format(isoToDate(iso));
}

export function formatMonthDay(iso: string): string {
  return MONTH_DAY.format(isoToDate(iso));
}

export function formatWeekdayShort(iso: string): string {
  return WEEKDAY_SHORT.format(isoToDate(iso));
}

export function formatAxisDate(
  iso: string,
  range: ObservationRangeDays,
): string {
  return range === 7 ? formatWeekdayShort(iso) : formatMonthDay(iso);
}

export function formatForecastAxisDate(iso: string, todayIso: string): string {
  return iso === todayIso ? "Today" : formatWeekdayShort(iso);
}

export function formatTimeOfDay(date: Date): string {
  return TIME_OF_DAY.format(date);
}

export function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits);
}

export function formatTemperature(value: number): string {
  return `${Math.round(value)}°`;
}
