import type { ReactNode } from "react";

import "./Tag.css";

export type TagTone =
  | "neutral"
  | "success"
  | "estimate"
  | "skip"
  | "reduce"
  | "water";

interface TagProps {
  tone?: TagTone;
  icon?: ReactNode;
  children: ReactNode;
}

export function Tag({ tone = "neutral", icon, children }: TagProps) {
  return (
    <span className={`tag tag--${tone}`}>
      {icon}
      {children}
    </span>
  );
}
