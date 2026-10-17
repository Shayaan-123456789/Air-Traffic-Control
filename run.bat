@echo off
cd /d "%~dp0"
if not exist .venv (py -m venv .venv)
call .venv\Scripts\activate.bat
python -m pip install -r requirements.txt
start "" http://127.0.0.1:8000
python -m uvicorn server.main:app --reload --host 127.0.0.1 --port 8000
pause
