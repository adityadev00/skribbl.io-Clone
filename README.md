
# Doodle Dash — a skribbl.io clone

Real-time multiplayer drawing & guessing game[cite: 7]. One player draws a secret word, everyone else races to guess it; faster guesses score more, and the highest score after all rounds wins[cite: 7].

> 🌐 **[Live Demo](https://skribbl-io-clone-ecru.vercel.app)** &nbsp;·&nbsp; 🩺 **[API Health](https://skribbl-io-backend.onrender.com/health)**
> Free-tier backend sleeps when idle: the first load can take ~30–60 s[cite: 7].

## Features

- Private & public rooms, invite links (`/room/ABCDE`) or 5-character codes, plus **🎲 Join Random Room** (jumps into any open public lobby, or tells you none exist), host-configurable settings (players 2–20, rounds 2–10, draw time 15–240 s, 1–5 word choices, 0–5 hints)[cite: 7]
- Lobby with live player list, host controls, host migration when the host leaves[cite: 7]
- Real-time canvas: smooth pen strokes (mouse / touch / stylus), 16 colours, 4 brush sizes, eraser, **fill bucket**, undo (Ctrl+Z), clear[cite: 7]
- Turn-based rounds: word choice (auto-pick on timeout), blank-letter hints that reveal over time, countdown timer[cite: 7]
- Chat + guessing: case/whitespace-insensitive matching, "is close!" hint, correct guesses are masked, guessers-only chat channel so the word can't leak[cite: 7]
- Time-weighted scoring, live scoreboard with +points animation, round summary, game-over podium, play again[cite: 7]
- Sound effects synthesised in the browser (Web Audio — no audio files): correct-guess chime, last-5-seconds ticking, turn-start / word-chosen pops, game-over fanfare, with a mute toggle[cite: 7]
- Smooth drawing under load: local ink paints instantly, network traffic is batched to ~60 packets/s[cite: 7]
- Resilient: 30 s reconnection grace period, late-joiner canvas snapshot, drawer/guesser dropout handling[cite: 7]

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19 · TypeScript · Vite 7 · Tailwind CSS v4 · react-router-dom[cite: 7] |
| Canvas | HTML5 Canvas API, custom smoothing + flood fill (no libraries)[cite: 7] |
| Backend | Node.js · Express · Socket.IO · TypeScript (OOP: `Room`, `Game`, `Player`, `RoomManager`)[cite: 7] |
| Hosting | Backend → Render · Frontend → Vercel[cite: 7] |

## Repository layout


```

.
├── backend/            Express + Socket.IO server
│   ├── src/models/     Player, Room, Game (domain logic, no sockets)
│   ├── src/services/   RoomManager, SessionStore, WordService, SocketBroadcaster
│   ├── src/handlers/   lobby / game / drawing / chat socket handlers
│   ├── src/config/     constants, events, settings validation, CORS
│   └── tests/          socket-level integration test
├── frontend/           React app (src/pages, components, context, hooks, lib)
└── render.yaml         Render blueprint (optional)

```

## Quick start (local)

**Requirements:** Node.js **20.19+** (or 22.12+) — required by Vite 7[cite: 7]. Works on Windows, macOS and Linux[cite: 7].

```bash
# 1. install everything (from the repo root)
npm run install:all

# 2. terminal A — backend on http://localhost:3001
cp backend/.env.example backend/.env        # Windows (cmd): copy backend\.env.example backend\.env
npm run dev:backend

# 3. terminal B — frontend on http://localhost:5173
npm run dev:frontend

```

Open `http://localhost:5173` in **two tabs** to play against yourself — each tab is a separate player (identity lives in `sessionStorage`).

### Scripts

| Command (repo root) | What it does |
| --- | --- |
| `npm run install:all` | `npm install` in `backend/` and `frontend/`<br> |
| `npm run dev:backend` / `dev:frontend` | dev servers with reload

 |
| `npm run build` | production build of both (`backend/dist`, `frontend/dist`)

 |
| `npm run typecheck` | `tsc --noEmit` for both

 |
| `npm run test:integration` | boots the server and runs 52 socket-level checks (lobby, random join, drawing + batching, guessing, masking, reconnect, game over)

 |
| `npm run test:unit` | 9 fast checks for the random-room selection rules (no sockets)

 |

Backend only: `npm run dev`, `npm run build`, `npm start`. Frontend only: `npm run dev`, `npm run build`, `npm run preview`.

## Environment variables

**Backend** (`backend/.env` locally, Render dashboard in production)

| Var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3001` | Render injects this automatically

 |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Comma-separated allowed browser origins. `*` is a one-label wildcard: `https://my-app.vercel.app,https://*.vercel.app`<br> |
| `RECONNECT_GRACE_MS` | `30000` | How long a dropped player keeps their seat

 |

**Frontend** (`frontend/.env` locally, Vercel dashboard in production)

| Var | Default | Meaning |
| --- | --- | --- |
| `VITE_SERVER_URL` | `http://localhost:3001` | Backend URL, https, no trailing slash. **Baked into the bundle at build time**, so change it → redeploy. A value set in the Vercel dashboard overrides `frontend/.env.production`.

 |

## Deploy

Order matters because each side needs the other's URL: **backend → frontend → back to backend (CORS)**.

### 1. Backend on Render

1. Push the repo to GitHub.


2. Render → **New + → Web Service** → pick the repo (or use **Blueprint** with the included `render.yaml`).


3. Settings:
| Field | Value |
| --- | --- |
| Root Directory | `backend`<br> |
| Runtime | Node

 |
| Build Command | `npm install --include=dev && npm run build`<br> |
| Start Command | `npm start`<br> |
| Health Check Path | `/health`<br> |
| Instance type | Free

 |
| Env vars | `NODE_VERSION=20`, `CLIENT_ORIGIN=http://localhost:5173` *(temporary)*<br> |


`--include=dev` matters: Render sets `NODE_ENV=production`, which would otherwise skip `typescript` and the build would fail with `tsc: not found`.
Port: nothing to configure — the server listens on `process.env.PORT`.


4. Deploy, then open `https://<service>.onrender.com/health` → `{"status":"ok",…}`. Copy the URL.



### 2. Frontend on Vercel

1. Vercel → **Add New → Project** → import the same repo.


2. Settings:
| Field | Value |
| --- | --- |
| Root Directory | `frontend`<br> |
| Framework Preset | Vite (auto-detected)

 |
| Build Command | `npm run build`<br> |
| Output Directory | `dist`<br> |
| Environment Variable | `VITE_SERVER_URL` = your Render URL

 |


3. Deploy. `frontend/vercel.json` rewrites every path to `index.html`, so invite links like `/room/K7M2Q` work on refresh.



### 3. Close the loop (CORS)

Render → your service → **Environment** → set
`CLIENT_ORIGIN=https://<your-app>.vercel.app,https://*.vercel.app`
(the wildcard also allows Vercel preview deployments; drop it for production-only). Render restarts the service automatically.

### 4. Smoke test

Open the Vercel URL in two browsers/tabs → create room → join via the invite link → start → draw and guess. Put the live URL at the top of this README.

### Hosting notes

* **Why not Vercel/Netlify for the backend?** They run serverless functions that can't hold a long-lived WebSocket connection — the realtime server needs a persistent process, hence Render (or Railway/Fly).


* **Free-tier cold starts:** Render free instances sleep after ~15 min idle. The app shows "Connecting… can take up to a minute". To keep a demo warm, ping `/health` every 5–10 min with a free uptime monitor.


* **Single instance:** room state is in memory, so run exactly one backend instance. A restart/redeploy drops live rooms (players return to the home screen).



## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Red banner "backend URL isn't configured" | `VITE_SERVER_URL` missing or still the placeholder → set it in Vercel, **redeploy**<br> |
| Banner stuck on "Connecting…" | backend asleep (wait ~60 s) or wrong `VITE_SERVER_URL`<br> |
| Browser console CORS error / `403` on `/socket.io/` | `CLIENT_ORIGIN` doesn't include the exact frontend origin (scheme + host, no path)

 |
| 404 when refreshing `/room/ABCDE` | Vercel Root Directory isn't `frontend` (so `vercel.json` isn't applied)

 |
| Render build: `tsc: not found` | build command lacks `--include=dev`<br> |
| Two tabs behave as one player | you switched token storage to `localStorage` in `frontend/src/lib/session.ts`<br> |
| Windows: integration test can't start the server | use the provided `tests/integration.ts` (`npx.cmd` + `shell:true`)

 |

## Known limitations

In-memory state (single instance, no persistence), no accounts, `list_rooms` exists in the backend but has no browse UI, no public-room browse list (only “Join Random Room”), no kick/ban, bucket fill is tolerance-based (faint edge halos possible).

```

```
