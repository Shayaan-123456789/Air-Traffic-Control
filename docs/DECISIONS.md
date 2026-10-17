# DECISIONS — Interview Preparation Notes

> **Customize this in your own words before submission.** The challenge specifically values the author's understanding. Do not claim you independently made every choice if this was AI-assisted.

## Q1. Most technically challenging part

My main technical challenge to explain is **keeping the UI informative without pretending that stale or predicted locations are live**. OpenSky may return an aircraft position that is older than the response itself. The app tracks each aircraft's `time_position`, classifies the data age, and only extrapolates constant-heading ground travel for a bounded 60-second interval. It shows estimated coordinates in purple instead of overwriting the measured record. A useful demo is to select a purple aircraft and explain the difference between `last_contact` and `time_position`.

## Q2. Important design decision

I chose a **small same-origin Python FastAPI proxy and browser-native ES modules with Canvas rendering**. A direct browser request would make reliable shared rate-limiting and OAuth client secret handling more difficult. A canvas view also handles many markers without creating large numbers of DOM elements. The tradeoff is manual map interaction logic and less off-the-shelf accessibility than a full map framework.

## Q3. One limitation

The proximity detector looks at lateral separation within **12 km** and altitude difference within **300 m**. It does **not** model aircraft trajectories or predict collisions, so it is only an experimental highlighting feature. A second limitation is that quota accounting is per process: distributed servers would need Redis or a durable database.

## Q4. Another week: first priority

First, I would add a **durable multi-worker cache and monitoring**, including Redis-based quota accounting and usage metrics, then add a small number of browser end-to-end tests against stubbed OpenSky responses. I would also improve keyboard interaction and map accessibility.

## Short interview Q&A

**What happens on an OpenSky 429?** The proxy applies the specified upstream delay, returns an old snapshot marked `stale: true` if available, or returns HTTP 503. The browser loads a cached live snapshot if it has one, otherwise explicitly switches to synthetic sample data.

**Why is position extrapolation only a bonus?** It estimates movement between REST snapshots; the true current aircraft location may be different due to maneuvers or wind, and it is not used as operational guidance.

**What happens when 2 users open the dashboard?** They share the same Python cached region result if they use the same process, coalescing requests. The client maintains its own local trail history.

**Are the alerts real air-traffic alerts?** No. These are clearly experimental dashboard watch rules, not collision warnings, air traffic control, or aviation safety advisories.

**Why a synthetic demo?** It guarantees an interactive demonstration even if OpenSky is rate-limited. The data source is visibly labeled so the demo does not misrepresent real aircraft.
