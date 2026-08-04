import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { onBump } from "./app/state";
import { bootPersistence, saveDraft } from "./features/planner/persist";
import { refreshContent } from "./content/live";
import { loadSession, loadConfig } from "./features/account/auth";
import "./styles/global.css";

// Dev-only: warn if any content is half-translated or UI keys drift (see docs/04).
if (import.meta.env.DEV) {
  import("./content/validate").then(({ validateContent }) => {
    const problems = validateContent();
    if (problems.length) console.warn("[content] " + problems.length + " issue(s):", problems);
  });
}

// The draft has to be back in S.plan *before* the first render, or the planner
// mounts with a fresh plan and immediately saves that over the stored one.
bootPersistence().finally(() => {
  onBump(saveDraft);
  // Deliberately NOT awaited. The bundled calendar is already correct enough to
  // render; a fresher one arrives when it arrives, and on a rural signal it may
  // never arrive at all. Nothing on the first paint waits for a network.
  refreshContent();
  // Same rule as the content: not awaited. Every screen works signed out, so
  // the session resolving late costs nothing, and blocking the first paint on
  // an auth round trip would be the one network dependency this app refuses
  // to have.
  loadSession();
  loadConfig();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  );
});
