import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  CloudRain,
  Droplet,
  Droplets,
  Info,
  type LucideIcon,
} from "lucide-react";

import type {
  RecommendationState,
  RecommendationWhy,
} from "../types/recommendation";

import { Button } from "./Button";
import { Card } from "./Card";
import { Tag, type TagTone } from "./Tag";

import "./RecommendationCard.css";

export const RECOMMENDATION_STATE_META: Record<
  RecommendationState,
  { icon: LucideIcon; tone: TagTone }
> = {
  SKIP: { icon: CloudRain, tone: "skip" },
  REDUCE: { icon: Droplet, tone: "reduce" },
  WATER: { icon: Droplets, tone: "water" },
};

interface RecommendationCardProps {
  state: RecommendationState;
  reason: string;
  why: RecommendationWhy;
  badge?: ReactNode;
  onLogFollowed?: () => void;
}

export function RecommendationCard({
  state,
  reason,
  why,
  badge,
  onLogFollowed,
}: RecommendationCardProps) {
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const meta = RECOMMENDATION_STATE_META[state];
  const Icon = meta.icon;

  return (
    <Card badges={badge} className="recommendation-card">
      <span
        className={`recommendation-card__state recommendation-card__state--${meta.tone}`}
      >
        <Icon size={16} aria-hidden="true" />
        {state}
      </span>

      <h2 className="recommendation-card__reason">{reason}</h2>

      <button
        type="button"
        className="recommendation-card__toggle"
        aria-expanded={isWhyOpen}
        aria-controls="recommendation-why"
        onClick={() => setIsWhyOpen((isOpen) => !isOpen)}
      >
        <Info size={16} aria-hidden="true" />
        {isWhyOpen ? "Hide why" : "Why?"}
      </button>

      {isWhyOpen && (
        <div id="recommendation-why" className="recommendation-card__why">
          <WhyDetails why={why} />
        </div>
      )}

      <div className="recommendation-card__action">
        <Button onClick={onLogFollowed}>
          Log that I followed this
          <ArrowRight size={20} aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}

export function WhyDetails({ why }: { why: RecommendationWhy }) {
  return (
    <div className="why-details">
      <ul className="why-details__list">
        <li className="why-details__row">
          <div className="why-details__top">
            <span className="why-details__label">Rainfall received</span>
            <span className="why-details__value">
              {why.rainfallReceivedMm.toFixed(1)} mm
            </span>
          </div>
          <p className="why-details__description">
            Rain recorded at your lawn in the last 24 hours.
          </p>
        </li>
        <li className="why-details__row">
          <div className="why-details__top">
            <span className="why-details__label">Rainfall expected</span>
            <span className="why-details__value">
              {why.rainfallExpectedMm.toFixed(1)} mm
            </span>
          </div>
          <p className="why-details__description">
            Rain forecast for today.
          </p>
        </li>
        <li className="why-details__row">
          <div className="why-details__top">
            <span className="why-details__label">Estimated demand</span>
            <span className="why-details__value">
              {why.estimatedDemandMm.toFixed(1)} mm
            </span>
          </div>
          <p className="why-details__description">
            How much water your lawn is expected to need today.
          </p>
        </li>
        <li className="why-details__row">
          <div className="why-details__top">
            <span className="why-details__label">Uncertainty</span>
          </div>
          <p className="why-details__description">{why.uncertainty}</p>
        </li>
      </ul>

      <p className="why-details__note">
        <Tag tone="estimate" icon={<Info size={16} aria-hidden="true" />}>
          Estimated
        </Tag>
        Demand is an estimate, not a measured value.
      </p>
    </div>
  );
}
