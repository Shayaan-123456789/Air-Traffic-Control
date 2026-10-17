"""SkySentinel ATC: same-origin static frontend + server-side OpenSky proxy."""
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .opensky import REGIONS, service, UpstreamUnavailable

WEB = Path(__file__).resolve().parent.parent / 'web'
app = FastAPI(title='SkySentinel ATC', version='1.0.0', docs_url='/api/docs')

@app.get('/api/health')
def health():
    return {'status': 'ok', 'data_source': 'OpenSky Network', 'proxy': 'active'}

@app.get('/api/regions')
def regions():
    return [{'id': k, **v} for k, v in REGIONS.items()]

@app.get('/api/aircraft')
async def aircraft(region: str = 'south-india'):
    if region not in REGIONS:
        raise HTTPException(400, 'Unsupported region')
    try:
        return await service.get(region)
    except UpstreamUnavailable as e:
        raise HTTPException(503, detail={'message': str(e), 'retry_after': e.retry_after}) from e

app.mount('/assets', StaticFiles(directory=WEB / 'assets'), name='assets')
app.mount('/css', StaticFiles(directory=WEB / 'css'), name='css')
app.mount('/js', StaticFiles(directory=WEB / 'js'), name='js')

@app.get('/')
def root():
    return FileResponse(WEB / 'index.html', media_type='text/html')
