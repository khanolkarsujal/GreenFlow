import type { ReactNode } from "react";

import "./Card.css";

interface CardProps {
  title?: string;
  badges?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({
  title,
  badges,
  action,
  children,
  className = "",
}: CardProps) {
  const classes = ["card", className].filter(Boolean).join(" ");
  const hasHeader = Boolean(title || badges || action);

  return (
    <div className={classes}>
      {hasHeader && (
        <div className="card__header">
          {title && <h2 className="card__title">{title}</h2>}
          <div className="card__header-end">
            {badges && <div className="card__badges">{badges}</div>}
            {action && <div className="card__action">{action}</div>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
