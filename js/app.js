import { renderHome } from "./views/home.js";
import { renderLog } from "./views/log.js";
import { renderCalendar } from "./views/calendar.js";
import { applyTheme } from "./theme.js";
import { hasPassphrase } from "./crypto.js";
import { renderOnboarding } from "./onboarding.js";

applyTheme();

const root = document.getElementById("app");

const nav = {
  toHome: () => {
    location.hash = "#/home";
  },
  toLog: () => {
    location.hash = "#/log";
  },
  toCalendar: () => {
    location.hash = "#/calendar";
  },
};

function routeToView() {
  const hash = location.hash || "#/home";
  const view = hash.replace(/^#\//, "").split("/")[0];

  switch (view) {
    case "log":
      renderLog(root, nav);
      break;
    case "calendar":
      renderCalendar(root, nav);
      break;
    default:
      renderHome(root, nav);
  }
}

// Onboarding (choosing the four-word phrase) is the only thing gating the
// app -- once that's done, Home/Log/Calendar are always reachable straight
// away. Writing today's page never needs the vault unlocked (see editor.js
// and crypto.js's device key); only opening or saving a page that's part of
// the permanent log does, and that's asked for inline, right when it's
// needed -- see unlock.js's promptUnlock.
function boot() {
  if (!hasPassphrase()) {
    renderOnboarding(root, boot);
    return;
  }
  window.addEventListener("hashchange", routeToView);
  routeToView();
}

boot();

// A new service worker activates in the background (it already takes over
// immediately via skipWaiting/clients.claim) but an already-open tab keeps
// running the JS it loaded at open time regardless -- so it needs a reload
// to actually pick up the new code. Reloading the instant that happens
// would yank away whatever's on screen at a moment the update has nothing
// to do with, so instead it waits until it's safe: right away if the tab
// is already backgrounded, or the next time it gets backgrounded if it's
// in front of you right now.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("service-worker.js")
      .then((reg) => reg.update())
      .catch(() => {});
  });

  let updatePending = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updatePending) return;
    updatePending = true;
    if (document.hidden) {
      window.location.reload();
    } else {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) window.location.reload();
      });
    }
  });
}
