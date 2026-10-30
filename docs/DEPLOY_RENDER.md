# Deploying Pravah AI on Render

Render builds the repository's `Dockerfile` (the same image as Railway) and runs it as a web service. No code changes and no environment variables are required: the image sets `DATABASE_URL=file:/data/pravah.db`, `STORAGE_DIR=/data/storage`, `DEMO_MODE=true` and `COOKIE_SECURE=true`, and the start script listens on the `PORT` Render provides.

## Option A — Free (good for a demo)

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint** → choose `aniruthreddy18/pravahAI`. Render reads `render.yaml` and creates the `pravah-ai` web service on the free instance. (Or **New → Web Service** → the repository → Language **Docker** → Instance type **Free**, health check path `/login`.)
3. Wait for the first build (several minutes: dependencies, optional AI model, Next.js build). The log shows `Empty database: seeding the demo dataset…` and then `Ready`. Open the `onrender.com` URL.

What to expect on the free instance:

- **It sleeps after 15 minutes without visitors.** The next visit wakes it, which takes about a minute plus the time to re-seed the demo data. Open the site a few minutes before you present.
- **No persistent disk.** The database and uploads are re-created from the demo seed whenever the service restarts, redeploys or wakes up. For a judged demo this is convenient (every session starts clean); anything you uploaded earlier is gone.
- **Limited memory and CPU.** The optional local AI model is loaded only when it is used. If the service runs out of memory, add the environment variable `AI_EXTRACTION_ENABLED=false` (service → Environment) to switch the AI fallback off; everything else keeps working.

## Option B — Paid instance with a disk (data survives restarts, no sleep)

1. Open the service → **Settings → Instance type** → choose a paid instance (Starter or above).
2. **Disks → Add disk**: mount path **`/data`**, size 1 GB is plenty.
3. Redeploy. The first start seeds the demo; later starts and deploys keep the data (`Database already holds N user account(s); keeping existing data.`).

To start the demo over on a paid instance with a disk, open the service **Shell** and run `rm /data/pravah.db && rm -rf /data/storage`, then restart the service.

## Things to know

- **Who can sign in.** With `DEMO_MODE=true` the sign-in pages offer one-click *Evaluator quick access* to every demo account and show the shared password, so anyone with the link can sign in. Use synthetic data only. Set `DEMO_MODE=false` and change the passwords for anything beyond a demo.
- **One instance only.** SQLite and the in-memory rate limiter assume a single server; do not scale out.
- **Alerts.** The alert sweep runs inside the server every `ALERT_SWEEP_INTERVAL_MINUTES` (default 60). On the free instance it only runs while the service is awake; administrators can also run it from **Alerts**.
- **Pricing and limits change.** Check Render's current pricing page before choosing a plan.
