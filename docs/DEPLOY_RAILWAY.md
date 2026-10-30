# Deploying Pravah AI on Railway

Pravah AI runs as **one long-running Node server** with a **SQLite database and an upload folder on a persistent disk**. Railway fits that model: it builds the repository's `Dockerfile`, keeps the service running and mounts a volume that survives redeploys. (Serverless platforms such as Vercel or Netlify do not fit: their filesystem is temporary and the OCR/AI dependencies exceed their function limits.)

Everything Railway needs is in the repository:

| File | Purpose |
|---|---|
| `Dockerfile` | Production image: installs dependencies, downloads the optional local AI model (checksum-verified), builds Next.js. |
| `railway.json` | Tells Railway to use the Dockerfile, run one instance, and health-check `/login`. |
| `scripts/docker-start.sh` | On every start: applies database migrations, seeds the demo data **only if the database is empty**, then starts the server on Railway's `PORT`. |

## One-time setup

1. **Create the project.** Sign in at [railway.com](https://railway.com) with GitHub → **New Project** → **Deploy from GitHub repo** → choose `aniruthreddy18/pravahAI`. Railway detects `railway.json` and starts building the Dockerfile.
2. **Add a volume at `/data`.** In the project canvas, add a **Volume** to the Pravah AI service (right-click the canvas or use the command palette, ⌘K / Ctrl+K → "Volume") and set the **mount path to `/data`**. The database (`/data/pravah.db`) and uploaded documents (`/data/storage`) live there. Without a volume, every redeploy starts from a fresh demo database and uploads are lost.
3. **Create a public URL.** Service → **Settings → Networking → Generate Domain**. The app listens on the `PORT` that Railway provides; if Railway asks for a port, use the one it suggests.
4. **Deploy.** The first build takes several minutes (dependencies, AI model, Next.js build). On first start the log shows `Empty database: seeding the demo dataset…`, then `Ready`. Open the generated URL.

No environment variables are required: the image sets `DATABASE_URL=file:/data/pravah.db`, `STORAGE_DIR=/data/storage`, `DEMO_MODE=true` and `COOKIE_SECURE=true` (Railway serves HTTPS).

## Optional settings (service → Variables)

| Variable | Effect |
|---|---|
| `DEMO_MODE=false` | Hides the demo accounts on the sign-in pages. |
| `SESSION_TTL_HOURS`, `MAX_UPLOAD_MB` | Session lifetime and default upload limit (see `.env.example`). |
| `INSTALL_AI_MODEL=false` | Skips the ~119 MB AI model download at build time (smaller image; the AI fallback is then shown as unavailable in System Settings). |
| `OCR_ENABLED=false` | Disables OCR. |

## Things to know

- **Who can sign in.** With `DEMO_MODE=true` the sign-in pages list the demo accounts and their shared password, so anyone with the link can sign in, including as the administrator. That is intended for a judged demo with synthetic data. Do not upload real documents. For anything beyond a demo, set `DEMO_MODE=false` and change the demo passwords (User Management).
- **One instance only.** SQLite and the in-memory login rate limiter assume a single server. `railway.json` sets one replica; do not scale out.
- **Redeploys keep data.** Migrations are re-applied safely and the seed is skipped when data exists (`Database already holds N user account(s); keeping existing data.`).
- **Starting the demo over.** Wipe the volume's contents (volume settings) or remove and re-add the volume at `/data`, then redeploy: the next start seeds a fresh demo dataset.
- **Resources.** OCR and the local AI model run on the CPU inside the request. Give the service about 1 GB of memory or more.
- **Cost.** Railway bills by usage and plan; check its current pricing page.

## Test the image locally (optional)

```bash
docker build -t pravah-ai .
docker volume create pravah-data
docker run --rm -p 3000:3000 -e COOKIE_SECURE=false -v pravah-data:/data pravah-ai
# open http://localhost:3000  (COOKIE_SECURE=false only because localhost is plain HTTP)
```
