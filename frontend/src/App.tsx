import { useEffect, useState } from "react";

import { DashboardPage } from "./pages/DashboardPage";
import { LawnSetupPage } from "./pages/LawnSetupPage";
import { RecommendationExplanationPage } from "./pages/RecommendationExplanationPage";
import { WaterSavingsPage } from "./pages/WaterSavingsPage";
import type { Screen } from "./types/screen";

import "./styles/greenflow.css";

const SCREEN_HASH: Record<Screen, string> = {
  dashboard: "#dashboard",
  "lawn-setup": "#lawn-profile",
  savings: "#water-savings",
  recommendation: "#recommendation",
};

const KNOWN_HASHES = new Set(Object.values(SCREEN_HASH));

function screenFromHash(): Screen {
  if (window.location.hash === "#lawn-profile") return "lawn-setup";
  if (window.location.hash === "#water-savings") return "savings";
  if (window.location.hash === "#recommendation") return "recommendation";
  return "dashboard";
}

export function App() {
  const [screen, setScreen] = useState<Screen>(screenFromHash);

  useEffect(() => {
    function syncScreenWithHash() {
      setScreen(screenFromHash());
    }

    if (!KNOWN_HASHES.has(window.location.hash)) {
      window.history.replaceState(null, "", SCREEN_HASH.dashboard);
    }

    window.addEventListener("hashchange", syncScreenWithHash);
    return () => window.removeEventListener("hashchange", syncScreenWithHash);
  }, []);

  function navigate(nextScreen: Screen) {
    setScreen(nextScreen);

    const hash = SCREEN_HASH[nextScreen];
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }

    window.scrollTo(0, 0);
  }

  if (screen === "lawn-setup") {
    return <LawnSetupPage onNavigate={navigate} />;
  }

  if (screen === "savings") {
    return <WaterSavingsPage onNavigate={navigate} />;
  }

  if (screen === "recommendation") {
    return <RecommendationExplanationPage onNavigate={navigate} />;
  }

  return (
    <DashboardPage
      onOpenLawnSetup={() => navigate("lawn-setup")}
      onOpenRecommendation={() => navigate("recommendation")}
    />
  );
}
