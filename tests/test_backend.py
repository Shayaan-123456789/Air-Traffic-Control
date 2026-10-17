"""Run: python -m pytest -q (all tests avoid real OpenSky traffic)."""
import asyncio
import httpx
from fastapi.testclient import TestClient
from server.main import app
from server.opensky import OpenSkyService, REGIONS, credits_for_bbox, normalized_states, CacheEntry

client = TestClient(app)

def test_health_and_regions():
    assert client.get('/api/health').json()['status'] == 'ok'
    regions = client.get('/api/regions').json()
    assert len(regions) >= 6
    assert {item['id'] for item in regions} == set(REGIONS)

def test_unknown_region_denied():
    assert client.get('/api/aircraft?region=somewhere').status_code == 400

def test_credit_formula():
    assert credits_for_bbox((0, 0, 5, 5)) == 1
    assert credits_for_bbox((0, 0, 6, 5)) == 2
    assert credits_for_bbox((0, 0, 12, 10)) == 3
    assert credits_for_bbox((0, 0, 30, 20)) == 4

def test_schema_handles_null_fields_and_bad_rows():
    r=['abca12',' TEST123 ','India',200,205,77.2,12.8,None,False,None,90.0,1.5,None,2000.0,None,False,4]
    data=normalized_states({'states':[r,['bad'],['bad',None,None,None,None,None,None]]})
    assert len(data)==1
    assert data[0]['altitude']==2000.0 and data[0]['velocity'] is None
    assert data[0]['callsign']=='TEST123'

def test_single_flight_cached_without_second_upstream_call(monkeypatch):
    counter={'calls':0}
    class Dummy:
        status_code=200; headers={}
        def raise_for_status(self):pass
        def json(self):return {'time':100,'states':[['123abc','AA100','USA',100,100,-73.5,40.5,2500,False,160,90,0,None,2500,None,False,4]]}
    async def fake_get(self,*args,**kwargs):
        counter['calls']+=1
        return Dummy()
    monkeypatch.setattr(httpx.AsyncClient,'get',fake_get)
    s=OpenSkyService()
    async def twice():
        x=await s.get('new-york')
        y=await s.get('new-york')
        return x,y
    x,y=asyncio.run(twice())
    assert counter['calls']==1
    assert x['source']=='live' and y['cache_age']>=0

def test_stale_cache_preserved_during_circuit_breaker():
    s=OpenSkyService()
    import time
    s.cache['london']=CacheEntry({'source':'live','region':'london','time':1,'aircraft':[{'icao24':'a'}]},time.time()-3600)
    s._blocked_until=time.time()+600
    result=asyncio.run(s.get('london'))
    assert result['stale'] and result['aircraft'][0]['icao24']=='a'
