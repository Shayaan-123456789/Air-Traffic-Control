# SkySentinel ATC — Airspace Intelligence

**CodeChef-VIT Promotional Cycle 2026–27 / Frontend Development / “Air Traffic Control”**

A polished, responsive flight-monitoring dashboard built for the prompt on **pages 8–9 of the official challenge sheet**. It supports OpenSky live aircraft state vectors through a Python API proxy, an interactive cartographic radar, configurable watch rules, recent observation trails, replay, short-horizon position estimation, and cache-aware offline fallback.

**Important: This is an educational visualization, not a real air-traffic-control or collision-avoidance system. The app explicitly marks synthetic, stale, cached, and estimated data.**

## 1. Quick start (Windows)

1. Install **Python 3.10+** (check “Add Python to PATH”). No Node/npm installation required.
2. Extract the ZIP.
3. Double-click **`run.bat`** (or enter `py -m venv .venv`, activate, `pip install -r requirements.txt`, then `python -m uvicorn server.main:app --reload`).
4. Open **http://127.0.0.1:8000**.
5. The dashboard launches in **SIMULATION** with synthetic aircraft. Click **OPENSKY LIVE** to request current aircraft data. Anonymous access is possible but constrained by OpenSky's upstream network policy and quotas.

For macOS/Linux: `bash run.sh`, then open the same URL. To skip virtualenv creation if you already have the dependencies installed: `python -m uvicorn server.main:app --reload --port 8000`.

### Optional OpenSky authentication (recommended)

Create an OpenSky OAuth2 API client on its account page, then copy `.env.example` to `.env`:

```env
OPENSKY_CLIENT_ID=your_id
OPENSKY_CLIENT_SECRET=your_secret
DAILY_CREDIT_BUDGET=160
CACHE_SECONDS=120
```

The server loads the project-root `.env` on startup; you can also supply these variables through your shell or hosting service. If using Docker Compose, `.env` is loaded automatically. The proxy securely obtains OAuth2 access tokens using **client credentials**. **Never paste credentials into `web/`, GitHub, or a frontend hosting provider.**

On Windows PowerShell, to use a local `.env` file without additional tooling, run:

```powershell
.\.venv\Scripts\Activate.ps1
$env:OPENSKY_CLIENT_ID="YOUR_ID"
$env:OPENSKY_CLIENT_SECRET="YOUR_SECRET"
python -m uvicorn server.main:app --reload
```

**Notice:** environment variables have priority over values in `.env`. The app works anonymously without credentials.

## 2. Required features mapped to the prompt

| Required capability | Where to find it |
|---|---|
| Live OpenSky API integration | `server/opensky.py`, `GET /api/aircraft`; browser switch **OPENSKY LIVE** |
| Interactive map | `web/js/map.js`: canvas basemap, pan/zoom, geographic labels, aircraft selection, markers |
| Altitude, velocity, heading, last reported position | Right-side **Flight telemetry** inspector |
| Periodic refresh with limited requests | Browser 120s cadence, visibility-aware, Python TTL cache + shared lock + daily cost budget |
| Region selection and aircraft filters | Left-side region presets, callsign/ICAO search, ground status, altitude, speed |
| Aircraft entering and leaving region | Latest snapshot reconciles aircraft by ICAO24; locally observed trails persist across updates |
| Graceful failure, null fields, rate limits, stale data | Cache and backoff in proxy; explicit per-aircraft freshness states; locally cached live snapshot, synthetic fallback |
| Recent movement visualization | Selected marker shows locally recorded trail; Time Machine enables replay of collected observations |
| Source repository + README | This directory, with documented API, design rationale, assumptions and limitations |

## 3. Bonus checklist

| Bonus from task sheet | Status | Implementation |
|---|---|---|
| Estimate positions between updates | **Implemented** | 60s maximum constant-velocity ground-track projection; purple estimated markers |
| Historical visualization/replay | **Implemented** | Persistent, local observations in live mode; deterministic synthetic timeline in demo mode |
| High aircraft count rendering | **Implemented** | HTML canvas instead of thousands of DOM markers; simple bucket-based proximity lookup |
| Offline mode with recorded/cached data | **Implemented** | Last OpenSky snapshot stored in browser localStorage; synthetic fallback if none exists |
| Configurable alerts (altitude, speed, boundary) | **Implemented** | Left-hand watch rules; click-to-place circular geofence on map |
| Efficient request caching + recovery | **Implemented** | Region-level shared cache, async coalescing lock, local credit budget, backoff, `Retry-After` handling |
| Deployed public application | **Deployment-ready only** | `Dockerfile`, `compose.yaml`, `render.yaml`; **no public URL is included or claimed** |

### Distinctive, beyond-the-brief features

- **Data confidence engine:** labels FRESH / DELAYED / STALE / ESTIMATED; a percentage and reliability context accompany selected flights.
- **Proximity watch:** a coarse 12 km lateral / 300 m vertical heuristic highlights aircraft pairs on radar. It is *not* a prediction of collision.
- **Inspectable event feed:** clicking a watch notification focuses the matching aircraft.
- **Exportable telemetry:** one-click CSV containing source, position, units, time and estimation flag.
- **Demo without accounts:** stable synthetic scenarios for six world regions, including recent movement history.
- **No npm build step:** browser-native ES modules and Canvas; an intentionally lightweight runtime for fast and reproducible interviews.

## 4. Architecture and API

```text
            ┌───────────────────────────────────────────┐
            │ Browser UI (HTML/CSS/modern JS ES modules) │
            │ UI state, Canvas map, history, alert rules │
            └───────────────┬───────────────────────────┘
                            │ same-origin HTTP
                            ▼
            ┌───────────────────────────────────────────┐
            │ Python FastAPI proxy                      │
            │ region allow-list + cache + OAuth2 token  │
            │ coalescing lock + credits + circuit delay │
            └───────────────┬───────────────────────────┘
                            │ HTTPS (server only)
                            ▼
                  OpenSky Network REST API
                     GET /api/states/all
```

Read `docs/ARCHITECTURE.md` and `docs/RELIABILITY.md` for design decisions and failure modes.

### Documented local API endpoints

| Method | Endpoint | Response |
|---|---|---|
| GET | `/api/health` | Backend health / proxy status |
| GET | `/api/regions` | Region preset IDs, names and bounding boxes |
| GET | `/api/aircraft?region=south-india` | `{ time, aircraft, source, stale, cache_age, notice, credits_left_local }` |
| GET | `/api/docs` | Interactive generated OpenAPI / Swagger schema |

Error conditions: `400` invalid region; `503` if upstream is unavailable, unauthorized, rate-limited, or local daily credit budget exhausted and no cached data exists. If a stale cached snapshot exists, the server returns it with `stale: true` and a notice instead.

## 5. Test instructions

```bash
pip install pytest
python -m pytest -q
node --test tests/frontend.test.mjs
```

Requires Node.js only for the optional frontend test suite, not for serving the app. CI runs both suites in `.github/workflows/ci.yml`. Tests use mocks and synthetic inputs; they make **no real OpenSky requests**.

## 6. Run in Docker

```bash
docker compose up --build
# Then open http://localhost:8000
```

Health check: `http://127.0.0.1:8000/api/health`. If port 8000 is in use, change the left side of `ports` in `compose.yaml`.

## 7. Deploy

A `render.yaml` blueprint is provided as a starting point for a Render Python web service. Deploying needs **your own Render account, repository, and environment/secrets**. Under OpenSky's policies, some cloud IP ranges might be restricted. A publicly accessible deployment, provider account or successful upstream data connection is **not** included as a finished deliverable here.

## 8. Limitations and assumptions

- Live state updates are snapshots, **not a WebSocket stream**, and rate-limit budgets vary by access tier. App polls at most every 120 seconds per visible client, with server-side shared 120-second region caching. Force refresh still uses the server's TTL cache.
- The server's daily credit counter and shared cache are per Python process; a restart or multi-worker deployment resets or duplicates them. Use Redis + persistent budget accounting for production.
- Simulated flights **are synthetic**. They must never be represented as OpenSky recordings.
- The offline cache uses localStorage. It is browser/device-specific and limited; browser storage may be cleared. True offline launch still requires service-worker/PWA support and previously loaded UI assets; a service worker is not implemented.
- Replay is **only of observations collected by this running application** (or synthetic demo), *not* OpenSky historical tracks.
- The renderer uses coastline data extracted from GSHHS through the Basemap dataset. It doesn't show controlled airspaces, navigational routes, or accurate flight corridors.
- Dead reckoning ignores wind, maneuvering and acceleration. Confidence scores are **heuristics, not calibrated probabilities**.
- Proximity alerts use approximate lateral and vertical thresholds; they ignore closure rates, flight paths and many real aviation safety factors.
- Live API behavior cannot be validated without outbound access and an available OpenSky endpoint. The integration follows the published API schema and is covered by mocked integration tests.
- OpenSky aircraft with missing coordinates cannot be plotted. Missing speed, altitude or heading fields display as N/A and are excluded from the corresponding alert rule.

## 9. Repository layout

```text
SkySentinel_ATC/
├── web/
│   ├── index.html
│   ├── css/styles.css
│   ├── js/app.js        # UI event handlers, replay, browser snapshot cache
│   ├── js/core.mjs      # Tested geodesy, projection, synthetic data, alert logic
│   ├── js/map.js        # Interactive Canvas cartography + flight rendering
│   └── assets/coastlines.json
├── server/
│   ├── main.py         # Same-origin static web server + JSON API
│   └── opensky.py      # OpenSky OAuth2, bounds, rate limits, caching
├── tests/              # Backend and JS unit/regression tests
├── docs/               # Architecture, reliability, demo script, decisions
├── Dockerfile / compose.yaml / render.yaml
├── run.bat / run.sh
└── README.md
```

## 10. Attribution & terms

- Aircraft data: [OpenSky Network](https://opensky-network.org/) (when LIVE is active, subject to their terms and access limitations).
- Geographic coastline data: [GSHHS](https://www.soest.hawaii.edu/pwessel/gshhg/) distributed through `mpl_toolkits.basemap` / Matplotlib Basemap; simplified for browser rendering.
- Fonts: DM Sans and Space Grotesk, optionally requested from Google Fonts. Browser falls back to local fonts without network access.
- Application code, UI design, and synthetic data generator developed for this project. No third-party templates.

**Review before submitting:** enter your own GitHub repo URL after uploading, add your contact details if the club requires them, and be ready to personally explain design decisions from `docs/DECISIONS.md`.
