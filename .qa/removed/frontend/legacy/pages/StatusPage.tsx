import { useEffect, useState } from "react";

import { fetchHealth } from "../api/health";
import type { HealthResponse } from "../types/health";

import "./StatusPage.css";

type HealthState =
  | { phase: "loading" }
  | { phase: "success"; health: HealthResponse }
  | { phase: "error"; message: string };

export function StatusPage() {
  const [state, setState] = useState<HealthState>({ phase: "loading" });

  useEffect(() => {
    let ignore = false;

    fetchHealth()
      .then((health) => {
        if (!ignore) {
          setState({ phase: "success", health });
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setState({
            phase: "error",
            message:
              error instanceof Error
                ? error.message
                : "The backend could not be reached.",
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="page">
      <header className="page__header">
        <p className="page__eyebrow">Lawn irrigation advisor</p>
        <h1 className="page__title">Service status</h1>
        <p className="page__intro">
          This page checks the connection between the web app and the backend
          API.
        </p>
      </header>

      <section className="status-card" aria-live="polite">
        {state.phase === "loading" && (
          <div className="status" role="status">
            <span className="status__spinner" aria-hidden="true" />
            <div>
              <h2 className="status__heading">Checking the backend…</h2>
              <p className="status__text">Waiting for a response from GET /health.</p>
            </div>
          </div>
        )}

        {state.phase === "error" && (
          <div className="status" role="alert">
            <div>
              <h2 className="status__heading status__heading--error">
                Backend unavailable
              </h2>
              <p className="status__text">{state.message}</p>
              <p className="status__hint">
                Start the backend, then reload this page.
              </p>
            </div>
          </div>
        )}

        {state.phase === "success" && (
          <div className="status">
            <div>
              <h2 className="status__heading status__heading--success">
                Backend online
              </h2>
              <p className="status__text">GET /health responded successfully.</p>
              <p className="status__value">
                status: <code>{state.health.status}</code>
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
