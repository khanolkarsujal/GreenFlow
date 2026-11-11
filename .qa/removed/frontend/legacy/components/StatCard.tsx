import type { ReactNode } from "react";

import "./StatCard.css";

interface StatCardProps {
  label: string;
  sublabel: string;
  value: string;
  unit: string;
  badges?: ReactNode;
  action?: ReactNode;
}

export function StatCard({
  label,
  sublabel,
  value,
  unit,
  badges,
  action,
}: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card__header">
        <div>
          <p className="stat-card__label">{label}</p>
          <p className="stat-card__sublabel">{sublabel}</p>
        </div>
        {badges && <div className="stat-card__badges">{badges}</div>}
      </div>
      <p className="stat-card__value">
        {value}
        <span className="stat-card__unit">{unit}</span>
      </p>
      {action && <div className="stat-card__action">{action}</div>}
    </div>
  );
}
