// Server start-up hook (Next.js). Starts the periodic alert and escalation sweep in the Node.js
// server process. ALERT_SWEEP_INTERVAL_MINUTES=0 disables it (the automated tests do).
export async function register() {
  // The import must sit inside this check so it is left out of the edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const minutes = Number(process.env.ALERT_SWEEP_INTERVAL_MINUTES ?? 60);
    if (Number.isFinite(minutes) && minutes > 0) {
      const { startAlertScheduler } = await import("./server/alerts");
      startAlertScheduler(minutes);
    }
  }
}
