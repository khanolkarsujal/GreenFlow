export function LawnSizeIllustration() {
  return (
    <svg
      className="gf-lawn-illustration"
      viewBox="0 0 360 240"
      role="img"
      aria-labelledby="gf-lawn-illustration-title"
    >
      <title id="gf-lawn-illustration-title">
        Illustration of a house beside a measured lawn area
      </title>
      <defs>
        <pattern
          id="gf-lawn-grass"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M4 14 L7 7 M11 14 L9 6"
            fill="none"
            stroke="var(--gf-green)"
            strokeLinecap="round"
            strokeOpacity="0.28"
            strokeWidth="1.4"
          />
        </pattern>
        <clipPath id="gf-lawn-clip">
          <rect x="34" y="100" width="292" height="104" rx="20" />
        </clipPath>
      </defs>

      <circle
        cx="306"
        cy="46"
        r="17"
        fill="var(--gf-amber-soft)"
        stroke="var(--gf-amber)"
        strokeOpacity="0.3"
      />

      <path
        d="M62 66 L106 34 L150 66 Z"
        fill="var(--gf-green)"
        opacity="0.9"
      />
      <rect
        x="70"
        y="66"
        width="72"
        height="50"
        rx="6"
        fill="var(--gf-surface)"
        stroke="var(--gf-border)"
      />
      <rect
        x="80"
        y="80"
        width="16"
        height="14"
        rx="2"
        fill="var(--gf-blue-soft)"
        stroke="var(--gf-blue)"
        strokeOpacity="0.25"
      />
      <rect
        x="116"
        y="80"
        width="16"
        height="14"
        rx="2"
        fill="var(--gf-blue-soft)"
        stroke="var(--gf-blue)"
        strokeOpacity="0.25"
      />
      <rect
        x="98"
        y="90"
        width="16"
        height="26"
        rx="2"
        fill="var(--gf-green-100)"
      />

      <rect
        x="34"
        y="100"
        width="292"
        height="104"
        rx="20"
        fill="var(--gf-green-100)"
      />
      <rect
        x="34"
        y="100"
        width="292"
        height="104"
        rx="20"
        fill="url(#gf-lawn-grass)"
        clipPath="url(#gf-lawn-clip)"
      />
      <rect
        x="34"
        y="100"
        width="292"
        height="104"
        rx="20"
        fill="none"
        stroke="var(--gf-green)"
        strokeDasharray="6 7"
        strokeOpacity="0.45"
      />

      <path
        d="M180 183 C154 160 138 158 124 170"
        fill="none"
        stroke="var(--gf-blue)"
        strokeLinecap="round"
        strokeOpacity="0.55"
        strokeWidth="2"
      />
      <path
        d="M180 183 C206 160 222 158 236 170"
        fill="none"
        stroke="var(--gf-blue)"
        strokeLinecap="round"
        strokeOpacity="0.55"
        strokeWidth="2"
      />
      <circle cx="180" cy="183" r="5" fill="var(--gf-green-700)" />
      <circle cx="124" cy="170" r="2" fill="var(--gf-blue)" opacity="0.7" />
      <circle cx="236" cy="170" r="2" fill="var(--gf-blue)" opacity="0.7" />

      <path
        d="M34 92 L34 86 M34 92 L40 92"
        fill="none"
        stroke="var(--gf-green)"
        strokeLinecap="round"
        strokeOpacity="0.55"
        strokeWidth="1.6"
      />
      <path
        d="M326 92 L326 86 M326 92 L320 92"
        fill="none"
        stroke="var(--gf-green)"
        strokeLinecap="round"
        strokeOpacity="0.55"
        strokeWidth="1.6"
      />
      <line
        x1="34"
        y1="92"
        x2="326"
        y2="92"
        stroke="var(--gf-green)"
        strokeDasharray="3 5"
        strokeOpacity="0.35"
        strokeWidth="1.4"
      />
    </svg>
  );
}
