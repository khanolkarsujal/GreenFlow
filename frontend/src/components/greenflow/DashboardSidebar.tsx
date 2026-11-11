import {
  LayoutDashboard,
  Leaf,
  PiggyBank,
  ShieldCheck,
  Sprout,
  type LucideIcon,
} from "lucide-react";

import "./DashboardSidebar.css";

type NavScreen = "dashboard" | "lawn-setup" | "savings";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  screen?: NavScreen;
  available?: boolean;
}

interface DashboardSidebarProps {
  activeScreen: "dashboard" | "savings";
  onOpenDashboard?: () => void;
  onOpenLawnSetup?: () => void;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "#dashboard",
    icon: LayoutDashboard,
    screen: "dashboard",
  },
  { label: "Lawn Profile", href: "#lawn-profile", icon: Sprout, screen: "lawn-setup" },
  {
    label: "Water Savings",
    href: "#water-savings",
    icon: PiggyBank,
    screen: "savings",
    available: true,
  },
];

export function DashboardSidebar({
  activeScreen,
  onOpenDashboard,
  onOpenLawnSetup,
}: DashboardSidebarProps) {
  return (
    <aside className="gf-sidebar">
      <a className="gf-brand" href="#dashboard" aria-label="GreenFlow dashboard">
        <span className="gf-brand__mark">
          <Leaf size={22} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <span className="gf-brand__text">
          <strong>GreenFlow</strong>
          <small>Smart irrigation</small>
        </span>
      </a>

      <nav className="gf-nav-wrap" aria-label="Primary">
        <p className="gf-nav__label">Workspace</p>
        <ul className="gf-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.screen === activeScreen;
            const navigate =
              item.screen === "dashboard"
                ? onOpenDashboard
                : item.screen === "lawn-setup"
                  ? onOpenLawnSetup
                  : undefined;
            const interactive =
              isActive || navigate !== undefined || item.available === true;

            return (
              <li key={item.label}>
                <a
                  className={[
                    "gf-nav__link",
                    isActive ? "gf-nav__link--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  aria-disabled={interactive ? undefined : "true"}
                  title={
                    isActive
                      ? undefined
                      : navigate || item.available
                        ? `Open ${item.label}`
                        : "Planned screen"
                  }
                  onClick={(event) => {
                    if (!interactive) {
                      event.preventDefault();
                      return;
                    }

                    if (navigate && !isActive) {
                      event.preventDefault();
                      navigate();
                    }
                  }}
                >
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  <span>{item.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="gf-advisory">
        <ShieldCheck size={19} aria-hidden="true" />
        <div>
          <strong>Advisory only</strong>
          <p>GreenFlow never controls your sprinkler timer.</p>
        </div>
      </div>
    </aside>
  );
}
