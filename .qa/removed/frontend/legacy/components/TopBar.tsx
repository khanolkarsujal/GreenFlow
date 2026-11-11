import "./TopBar.css";

const LINKS = [
  { label: "Today", href: "#today", isCurrent: true },
  { label: "History", href: "#history", isCurrent: false },
  { label: "My lawn", href: "#my-lawn", isCurrent: false },
];

export function TopBar() {
  return (
    <header className="top-bar">
      <div className="top-bar__inner">
        <a className="top-bar__name" href="#today">
          Lawn irrigation advisor
        </a>
        <nav aria-label="Primary">
          <ul className="top-bar__links">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  aria-current={link.isCurrent ? "page" : undefined}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
