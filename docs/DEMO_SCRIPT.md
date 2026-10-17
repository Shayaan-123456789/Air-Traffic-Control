# CodeChef-VIT Interview Demo — 4 to 5 Minutes

## Before you begin

Start `run.bat`; open **http://127.0.0.1:8000**. Have your terminal ready. Keep it in the default **SIMULATION ACTIVE** mode for a guaranteed demo. The local aircraft are **synthetic**, not live.

## 00:00–00:35 — Set the scene

> “My solution is SkySentinel, a flight-data observability cockpit. The main problem isn't just plotting aircraft. It's keeping the UI honest when OpenSky data is missing, stale, or rate-limited.”

Point to the tracked count, currently airborne count, data-confidence metric and responsive radar.

## 00:35–01:15 — Interactive flight map

Select **London** (or Dubai) in the region dropdown. Pan/zoom the map and click a marker. Show the aircraft detail panel: ICAO24, flight callsign, country, speed in knots, altitude in feet, true track, coordinates, and age of position fix. Explain why the Python server normalizes OpenSky's indexed arrays to readable JSON fields.

## 01:15–02:10 — Bonus intelligence

Select a purple airplane and point to **ESTIMATED POSITION**, the age/quality indicator, and the movement trail. Explain constant-velocity dead reckoning and the 60-second cutoff. Toggle “Show estimated positions” off to compare measured and estimated views.

Enable **Proximity watch** and show the event feed and highlighted line where the heuristic detects a close aircraft pair. Clearly say it is **not** a collision prediction.

## 02:10–02:45 — Geofence watch

Click **SET ZONE**, click a point in the radar, and demonstrate a circular geofence with the radius control. Alter the “Low altitude watch” threshold and show the alert count updating. Note that the alerts are user-defined watch rules.

## 02:45–03:30 — Time Machine / Replay

Click an aircraft, choose **REPLAY**, scrub the slider backward, and click **PLAY** to replay collected observations. Explain that live mode records only positions your own browser observed; it does not claim access to unrequested OpenSky historical data.

## 03:30–04:25 — Resilience and live integration

Switch to **OPENSKY LIVE** on a network where OpenSky is available. Explain server-side OAuth2 and why keys never go to the browser. If rate-limited, deliberately show the explicit cached / synthetic fallback rather than hide the error. Point out 120-second polling, shared cache, async request lock, daily credit cap, backoff and tab visibility handling.

Open `http://127.0.0.1:8000/api/docs` to demonstrate API documentation. Run tests in terminal: `python -m pytest -q` and `node --test tests/frontend.test.mjs` (if Node installed).

## 04:25–05:00 — Finish

> “I focused on reliability and data integrity: what's reported, what's cached, what's estimated, and what's only a demo are never visually confused. This is a frontend dashboard with a minimal Python proxy, delivered with tests, documented limitations, and Docker/deployment scaffolding.”

Possible follow-up question: “What would you improve?” Answer: durable caching and per-user quotas, a service worker for genuine offline launch, accessibility improvements and browser-level end-to-end testing.
