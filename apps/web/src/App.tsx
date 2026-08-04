import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { S, store, useApp } from "./app/state";
import { Shell } from "./shared/ui/Shell";
import { Sheet } from "./shared/ui/Sheet";
import { Toast } from "./shared/ui/Toast";

import { Start } from "./features/onboarding/Start";
import { Begin } from "./features/onboarding/Begin";
import { Home } from "./features/home/Home";
import { Explore } from "./features/explore/Explore";
import { Theme } from "./features/explore/Theme";
import { Planner } from "./features/planner/Planner";
import { RouteResult } from "./features/route/RouteResult";
import { Journey } from "./features/journey/Journey";
import { MapView } from "./features/map/MapView";
import { Saved } from "./features/saved/Saved";
import { Settings } from "./features/settings/Settings";
import { Credits } from "./features/settings/Credits";
import { Place } from "./features/place/Place";
import { Account } from "./features/account/Account";

export function App() {
  useApp(); // re-render on language / state changes
  const hasLang = !!S.lang;

  // Apply text-size body classes + html lang (was done in the demo's render()).
  useEffect(() => {
    document.documentElement.lang = S.lang;
    document.body.classList.toggle("big", store.ts === 1);
    document.body.classList.toggle("bigger", store.ts === 2);
  });

  return (
    <>
      <Routes>
        <Route path="/start" element={<Start />} />
        <Route path="/begin" element={hasLang ? <Begin /> : <Navigate to="/start" replace />} />
        <Route element={<Shell />}>
          <Route path="/home" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/theme/:id" element={<Theme />} />
          <Route path="/plan" element={<Planner />} />
          <Route path="/route" element={<RouteResult />} />
          <Route path="/go" element={<Journey />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/saved" element={<Saved />} />
          {/* Search was a second screen rendering the same list off the same
              data. Explore is that screen now — the box and the filters live
              there — and this keeps every existing link, bookmark and back
              button landing somewhere real. */}
          <Route path="/search" element={<Navigate to="/explore" replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/credits" element={<Credits />} />
          <Route path="/account" element={<Account />} />
          <Route path="/place/:id" element={<Place />} />
        </Route>
        <Route path="*" element={<Navigate to={hasLang ? "/home" : "/start"} replace />} />
      </Routes>
      <Sheet />
      <Toast />
    </>
  );
}
