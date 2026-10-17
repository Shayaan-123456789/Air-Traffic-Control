#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
exec python -m uvicorn server.main:app --reload --host 127.0.0.1 --port 8000
