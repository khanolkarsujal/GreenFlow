import {
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudSun,
  Sun,
  type LucideIcon,
} from "lucide-react";

import type { WeatherConditionId } from "../../../types/weather";

import "./WeatherGlyph.css";

const CONDITION_ICONS: Record<WeatherConditionId, LucideIcon> = {
  sunny: Sun,
  "partly-cloudy": CloudSun,
  cloudy: Cloud,
  showers: CloudDrizzle,
  rain: CloudRain,
};

export const CONDITION_LABELS: Record<WeatherConditionId, string> = {
  sunny: "Sunny",
  "partly-cloudy": "Partly cloudy",
  cloudy: "Cloudy",
  showers: "Light showers",
  rain: "Rain",
};

interface WeatherGlyphProps {
  condition: WeatherConditionId;
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function WeatherGlyph({
  condition,
  size = "md",
  label,
}: WeatherGlyphProps) {
  const Icon = CONDITION_ICONS[condition];

  return (
    <span
      className={[
        "gf-wx-glyph",
        `gf-wx-glyph--${condition}`,
        `gf-wx-glyph--${size}`,
      ].join(" ")}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon strokeWidth={1.9} />
    </span>
  );
}
