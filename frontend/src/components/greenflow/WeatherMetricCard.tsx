import type { LucideIcon } from "lucide-react";

import "./WeatherMetricCard.css";

type WeatherMetricTone = "rain" | "forecast" | "temperature" | "et0";

interface WeatherMetricCardProps {
  icon: LucideIcon;
  tone: WeatherMetricTone;
  label: string;
  value: string;
  unit: string;
  detail: string;
}

export function WeatherMetricCard({
  icon: Icon,
  tone,
  label,
  value,
  unit,
  detail,
}: WeatherMetricCardProps) {
  return (
    <article className="gf-metric">
      <span className={`gf-metric__icon gf-metric__icon--${tone}`}>
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <p className="gf-metric__label">{label}</p>
      <p className="gf-metric__value">
        <strong>{value}</strong>
        <span>{unit}</span>
      </p>
      <p className="gf-metric__detail">{detail}</p>
    </article>
  );
}
