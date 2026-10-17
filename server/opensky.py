"""Server-only OpenSky access; bounded polling, OAuth2 and resilient caching.

This API is a visualization source, not safety-critical aviation information.
"""
from __future__ import annotations
import asyncio
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
import httpx
from pathlib import Path
from dotenv import load_dotenv

# Load project-root .env when present, even for the Windows double-click launcher.
load_dotenv(Path(__file__).resolve().parent.parent / '.env')

API_BASE = 'https://opensky-network.org/api/states/all'
TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'
REGIONS = {
    'south-india': {'name': 'South India', 'bbox': (10.0, 75.0, 15.0, 80.0), 'center': (12.5, 77.5)},
    'london': {'name': 'London corridor', 'bbox': (49.5, -2.0, 53.5, 2.0), 'center': (51.5, 0.0)},
    'dubai': {'name': 'Arabian Gulf', 'bbox': (23.0, 52.0, 27.0, 58.0), 'center': (25.0, 55.0)},
    'singapore': {'name': 'Singapore Strait', 'bbox': (-1.0, 101.0, 3.0, 106.0), 'center': (1.0, 103.5)},
    'new-york': {'name': 'New York', 'bbox': (39.0, -76.0, 43.0, -71.0), 'center': (41.0, -73.5)},
    'bay-area': {'name': 'San Francisco Bay', 'bbox': (36.0, -124.0, 40.0, -120.0), 'center': (38.0, -122.0)},
}
CACHE_SECONDS = max(60, int(os.getenv('CACHE_SECONDS', '120')))
DAILY_CREDIT_BUDGET = max(1, int(os.getenv('DAILY_CREDIT_BUDGET', '160')))


def credits_for_bbox(bbox: tuple[float, float, float, float]) -> int:
    lamin, lomin, lamax, lomax = bbox
    area = (lamax - lamin) * (lomax - lomin)
    return 1 if area <= 25 else 2 if area <= 100 else 3 if area <= 400 else 4


def normalized_states(payload: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for r in payload.get('states') or []:
        if not isinstance(r, list) or len(r) < 17 or not isinstance(r[0], str):
            continue
        # Missing coordinates cannot be placed on the map.
        if not isinstance(r[5], (float, int)) or not isinstance(r[6], (float, int)):
            continue
        lat, lon = float(r[6]), float(r[5])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        out.append({
            'icao24': r[0].lower(), 'callsign': (r[1] or '').strip() or r[0].upper(),
            'country': r[2] or 'Unknown', 'position_time': r[3], 'last_contact': r[4],
            'lon': lon, 'lat': lat, 'altitude': r[13] if r[13] is not None else r[7],
            'on_ground': bool(r[8]), 'velocity': r[9], 'heading': r[10],
            'vertical_rate': r[11], 'squawk': r[14], 'category': r[16],
        })
    return out


class UpstreamUnavailable(Exception):
    def __init__(self, message: str, retry_after: int = 0):
        super().__init__(message)
        self.retry_after = retry_after


@dataclass
class CacheEntry:
    payload: dict
    fetched_at: float


class OpenSkyService:
    def __init__(self):
        self.cache: dict[str, CacheEntry] = {}
        self.lock = asyncio.Lock()
        self._token: str | None = None
        self._token_expiry = 0.0
        self._blocked_until = 0.0
        self._failures = 0
        self._date = datetime.now(timezone.utc).date()
        self._credits_spent = 0

    @property
    def credits_left(self) -> int:
        return max(0, DAILY_CREDIT_BUDGET - self._credits_spent)

    def _roll_day(self):
        day = datetime.now(timezone.utc).date()
        if day != self._date:
            self._date, self._credits_spent = day, 0

    async def _bearer(self, client: httpx.AsyncClient) -> str | None:
        client_id, secret = os.getenv('OPENSKY_CLIENT_ID'), os.getenv('OPENSKY_CLIENT_SECRET')
        if not client_id or not secret:
            return None
        if self._token and time.time() < self._token_expiry:
            return self._token
        response = await client.post(TOKEN_URL, data={
            'grant_type': 'client_credentials', 'client_id': client_id, 'client_secret': secret,
        })
        response.raise_for_status()
        data = response.json()
        self._token = data['access_token']
        self._token_expiry = time.time() + max(30, int(data.get('expires_in', 600)) - 45)
        return self._token

    def _cache_response(self, region: str, entry: CacheEntry, stale: bool = False, notice: str = '') -> dict:
        return {**entry.payload, 'cache_age': round(time.time() - entry.fetched_at),
                'stale': stale, 'notice': notice, 'credits_left_local': self.credits_left}

    async def get(self, region: str) -> dict:
        if region not in REGIONS:
            raise ValueError('Unknown region')
        async with self.lock:  # coalesce duplicate client requests, including multi-browser access
            self._roll_day()
            entry = self.cache.get(region)
            now = time.time()
            if entry and now - entry.fetched_at < CACHE_SECONDS:
                return self._cache_response(region, entry)
            if now < self._blocked_until:
                if entry:
                    return self._cache_response(region, entry, True, 'OpenSky is cooling down after an error')
                raise UpstreamUnavailable('Rate limited or temporarily unavailable', int(self._blocked_until - now))
            bbox = REGIONS[region]['bbox']
            cost = credits_for_bbox(bbox)
            if self._credits_spent + cost > DAILY_CREDIT_BUDGET:
                if entry:
                    return self._cache_response(region, entry, True, 'Local daily credit budget reached')
                raise UpstreamUnavailable('Local daily OpenSky credit budget reached')
            try:
                async with httpx.AsyncClient(timeout=14) as client:
                    token = await self._bearer(client)
                    headers = {'Authorization': f'Bearer {token}'} if token else {}
                    lamin, lomin, lamax, lomax = bbox
                    # Deduct conservatively: upstream may charge requests with non-200 status.
                    self._credits_spent += cost
                    r = await client.get(API_BASE, params={'lamin': lamin, 'lomin': lomin,
                          'lamax': lamax, 'lomax': lomax}, headers=headers)
                if r.status_code == 429:
                    retry = r.headers.get('X-Rate-Limit-Retry-After-Seconds') or r.headers.get('Retry-After', '300')
                    try: delay = min(86400, max(60, int(retry)))
                    except (TypeError, ValueError): delay = 300
                    self._blocked_until = time.time() + delay
                    raise UpstreamUnavailable('OpenSky rate limit reached', delay)
                if r.status_code in (401, 403):
                    self._token = None
                    raise UpstreamUnavailable('OpenSky access refused; check API credentials and quota')
                r.raise_for_status()
                body = r.json()
                if not isinstance(body, dict) or not isinstance(body.get('states'), (list, type(None))):
                    raise UpstreamUnavailable('Invalid upstream response')
                payload = {'time': body.get('time', int(time.time())),
                           'aircraft': normalized_states(body), 'source': 'live', 'region': region}
                fresh = CacheEntry(payload, time.time())
                self.cache[region] = fresh
                self._failures = 0
                return self._cache_response(region, fresh)
            except (httpx.HTTPError, ValueError, KeyError, UpstreamUnavailable) as e:
                self._failures += 1
                # Retain 429 retry window; exponential backoff for other errors.
                self._blocked_until = max(self._blocked_until, time.time() + min(300, 15 * 2 ** min(self._failures, 4)))
                if entry:
                    return self._cache_response(region, entry, True, 'Upstream unavailable; showing cached positions')
                if isinstance(e, UpstreamUnavailable):
                    raise
                raise UpstreamUnavailable('OpenSky could not be reached') from e


service = OpenSkyService()
