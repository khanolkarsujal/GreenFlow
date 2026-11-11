import "./ProgressBar.css";

interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
}

export function ProgressBar({
  label,
  value,
  max,
  valueLabel,
}: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className="progress">
      <div className="progress__labels">
        <span>{label}</span>
        <span>{valueLabel}</span>
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="progress__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
