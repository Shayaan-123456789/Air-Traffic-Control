# Reliability Engineering, Request Quotas & Failure Modes

## 1. OpenSky Network integration

We use the current officially documented **GET `/states/all`** endpoint. Requests use a **regional bounding box**, not a global query. Each returned state vector is an indexed array; important fields are:

| Index | Field | Unit | Handling |
|---|---|---|---|
| 0 | icao24 | Hex ID | lower-case canonical string |
| 1 | callsign | text or null | trimmed; fall back to ICAO24 |
| 3 | time_position | Unix seconds or null | freshness calculated from this value |
| 4 | last_contact | Unix seconds or null | not mistaken for fresh position time |
| 5–6 | longitude, latitude | degrees or null | exclude only from map when missing/invalid |
| 7 | baro_altitude | metres or null | fallback if geometric altitude missing |
| 8 | on_ground | Boolean | display ground state |
| 9 | velocity | metres/second or null | format as knots; N/A if missing |
| 10 | true_track | true degrees or null | rotate icon and prediction when available |
| 11 | vertical_rate | metres/second or null | display feet/minute |
| 13 | geo_altitude | metres or null | preferred altitude for display |
| 14 | squawk | nullable text | retained in normalized record |
| 16 | category | code | retained in normalized record |

Current OpenSky docs: https://github.com/openskynetwork/opensky-api/blob/master/docs/free/rest.rst

Authentication (if supplied) is **OAuth2 client credentials**, not basic password authentication. The server requests a bearer token and renews it before expiration.

## 2. Quota management

Official docs currently describe anonymous API limits as **400 state-vector credits daily**, with a request's cost determined by the bounding-box area. Quotas and access rules can change; always check upstream.

Protective measures:

1. Each visible browser fetches at most once every **120 seconds** (unless a user explicitly requests refresh).
2. Same-region requests are returned from Python cache for **120 seconds** by default. Explicit refresh does not bypass this cache.
3. Requests from concurrent callers are serialized using an async lock, so only one refresh runs through the proxy at a time.
4. Proxy enforces a conservative **160-credit daily budget in memory**. It estimates credits from box area and charges conservatively for attempted upstream requests.
5. On 429 the proxy honors `X-Rate-Limit-Retry-After-Seconds` or `Retry-After` and imposes a circuit-breaking cooldown.
6. Transient errors cause capped exponential backoff; no immediate retry storm.
7. The poller pauses while the tab is hidden and resumes only when the user returns.

**Limit:** This is a process-local budget, not a persistent, multi-worker distributed credit ledger. One app running 24/7 or several regional viewers can still use the upstream daily quota; choose a tier and conservative budget accordingly.

## 3. Freshness model

The UI uses aircraft **last reported position** time (not a last-contact packet time) to classify:

| Classification | Age of last position | Treatment |
|---|---:|---|
| FRESH | 0–15 seconds | Display measured position |
| DELAYED | >15–60 seconds | Amber if prediction off, purple if estimation on |
| STALE | >60 seconds | Grey; not used for active watch rules above 90 seconds |
| NO FIX | missing last position time | Unreliable; not considered fresh |

Freshness score: `max(0, 100 - 0.95 * position_age_seconds)`. **This is a UX heuristic, not a statistically calibrated probability.** Dashboard "Data Confidence" is the fraction of fresh position reports, not the average of score values.

**Position estimation:** constant ground-track projection is limited to 60 seconds after the last observed position and requires both heading and velocity. Positions are represented by **purple** and tagged "ESTIMATED". Altitude, true track, and speed remain as previously reported, not invented.

## 4. Failure matrix

| Failure | How app behaves | Important disclosure |
|---|---|---|
| Slow upstream | 14-second request timeout, old map stays visible until response | Timestamp remains unchanged |
| HTTP 429 | backoff and cached response or 503 | Explicit stale indicator and notice |
| No coordinates | aircraft omitted from radar markers | Do not hallucinate coordinates |
| Null speed or altitude | shown as N/A; excluded from corresponding alert logic | Cannot infer absent telemetry |
| Browser goes offline but backend UI already loaded | locally stored last LIVE snapshot if available | Marked stale; otherwise synthetic fallback |
| Server has no cache and live API fails | LIVE mode shows clearly labeled SYNTHETIC FALLBACK | Never display sample as authentic live feed |
| Data older than 90s | remains visible if snapshot still present | Excluded from watches |
| Aircraft leaves monitored view | disappears from latest snapshot set; historical points remain for replay | Old track not misrepresented as currently present |
| Browser loses localStorage | local replay and browser cache reset | No cross-device history guarantees |
| User changes region | old selection cleared, map recentered, new request | Tracks kept independently per region |
| Invalid region | proxy returns HTTP 400 | Fixed region allowlist |

## 5. Threat and abuse considerations

- Region validation stops API users from making arbitrary, very expensive global queries through the proxy.
- Credentials are never transferred to the browser; they stay in a server environment variable.
- HTML in callsigns and origin-country names is escaped when inserted into the aircraft manifest and event feed.
- The application does not make upstream state claims beyond OpenSky's returned and cached values.
- Auth is not built for the public deployment: additional per-IP client rate limiting and persistent budgets are recommended before public launch.

## 6. Tests and verification limits

`python -m pytest -q` validates: API health, region allowlist, cost calculation, malformed inputs, caching and stale recovery. `node --test tests/frontend.test.mjs` validates: unit conversions, confidence, prediction cap, geodesic distance, alert pair constraints, deterministic synthetic mode, combined filters, and replay interpolation.

Test fixtures are synthetic. Outbound traffic to OpenSky is not available from the packaging environment, so a real token handshake and production 200/429 response must be validated by the submitter on their machine/account. Details and official OpenSky documentation are linked from the main README.
