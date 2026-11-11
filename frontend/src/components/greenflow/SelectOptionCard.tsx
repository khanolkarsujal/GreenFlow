import { Check } from "lucide-react";

import "./SelectOptionCard.css";

interface SelectOptionCardProps {
  name: string;
  id: string;
  value: string;
  checked: boolean;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  tag?: string;
  onChange: (value: string) => void;
}

export function SelectOptionCard({
  name,
  id,
  value,
  checked,
  title,
  description,
  image,
  imageAlt,
  tag,
  onChange,
}: SelectOptionCardProps) {
  return (
    <label
      className={[
        "gf-option",
        checked ? "gf-option--selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        className="gf-option__input"
        type="radio"
        name={name}
        id={id}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span className="gf-option__media">
        <img
          src={image}
          alt={imageAlt}
          width={800}
          height={600}
          loading="lazy"
        />
        {tag ? <span className="gf-option__tag">{tag}</span> : null}
        <span className="gf-option__check" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
      </span>
      <span className="gf-option__body">
        <span className="gf-option__title">{title}</span>
        <span className="gf-option__desc">{description}</span>
      </span>
    </label>
  );
}
