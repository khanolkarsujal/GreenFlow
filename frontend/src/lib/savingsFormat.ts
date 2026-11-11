import { isoToDate } from "./weatherFormat";
import type { VolumeUnit } from "../types/savings";

export const LITERS_PER_US_GALLON = 3.785411784;

const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const RANGE_PART = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const RANGE_PART_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function convertVolume(liters: number, unit: VolumeUnit): number {
  return unit === "liters" ? liters : liters / LITERS_PER_US_GALLON;
}

export function volumeUnitShort(unit: VolumeUnit): string {
  return unit === "liters" ? "L" : "US gal";
}

export function volumeUnitLong(unit: VolumeUnit): string {
  return unit === "liters" ? "Liters" : "US gallons";
}

export function formatVolumeValue(liters: number, unit: VolumeUnit): string {
  const value = Math.max(0, convertVolume(liters, unit));
  return value > 0 && value < 10 ? ONE_DECIMAL.format(value) : WHOLE.format(value);
}

export function formatVolume(liters: number, unit: VolumeUnit): string {
  return `${formatVolumeValue(liters, unit)} ${volumeUnitShort(unit)}`;
}

export function formatAxisVolume(liters: number, unit: VolumeUnit): string {
  return COMPACT.format(Math.max(0, convertVolume(liters, unit)));
}

export function formatCompactNumber(value: number): string {
  return COMPACT.format(Math.max(0, value));
}

export function formatPercent(value: number): string {
  const clamped = Math.max(0, Math.min(100, value));
  const rounded = clamped >= 10 ? Math.round(clamped) : Math.round(clamped * 10) / 10;
  return `${rounded}%`;
}

export function formatRangeLabel(startIso: string, endIso: string): string {
  const start = isoToDate(startIso);
  const end = isoToDate(endIso);

  if (start.getFullYear() !== end.getFullYear()) {
    return `${RANGE_PART_YEAR.format(start)} – ${RANGE_PART_YEAR.format(end)}`;
  }

  return `${RANGE_PART.format(start)} – ${RANGE_PART.format(end)}, ${end.getFullYear()}`;
}

export function formatMinutes(minutes: number): string {
  return `${WHOLE.format(minutes)} min`;
}
