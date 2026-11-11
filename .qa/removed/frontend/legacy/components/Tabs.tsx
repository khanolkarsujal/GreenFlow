import "./Tabs.css";

export interface TabOption {
  value: string;
  label: string;
}

interface TabsProps {
  label: string;
  options: readonly TabOption[];
  value: string;
  onChange: (value: string) => void;
}

export function Tabs({ label, options, value, onChange }: TabsProps) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            className={`tabs__tab${isActive ? " tabs__tab--active" : ""}`}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
