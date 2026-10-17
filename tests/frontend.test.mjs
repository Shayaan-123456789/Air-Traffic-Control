import test from 'node:test';
import assert from 'node:assert/strict';
import {predict,reliability,haversineKm,detectProximity,filterAircraft,makeDemo,interpolateSamples,toFeet,toKnots,REGIONS} from '../web/js/core.mjs';

test('units retain correct OpenSky SI interpretation',()=>{assert.equal(toFeet(1000),3281);assert.equal(toKnots(100),194)});
test('invalid position timestamp is never called fresh',()=>{const a={lat:12,lon:77,position_time:null,last_contact:200000};assert.equal(reliability(a,200001).label,'NO FIX')});
test('dead reckoning moves roughly north for 20s, but caps at 60s',()=>{const a={lat:0,lon:0,heading:0,velocity:100,on_ground:false,position_time:100};const p=predict(a,120);assert(p.lat>0.017&&p.lat<0.019);assert.equal(p.estimated,true);assert.equal(predict(a,190).estimated,false)});
test('proximity alerts require horizontal and vertical thresholds',()=>{const now=Date.now()/1000;const a={icao24:'a',callsign:'A',lat:10,lon:77,altitude:8000,on_ground:false,position_time:now};const b={...a,icao24:'b',callsign:'B',lon:77.04,altitude:8180};assert.equal(detectProximity([a,b]).length,1);assert.equal(detectProximity([a,{...b,altitude:9000}]).length,0)});
test('haversine returns realistic small distances',()=>{assert(Math.abs(haversineKm({lat:0,lon:0},{lat:0,lon:1})-111.19)<.5)});
test('generated offline flights stay in region and are explicitly synthetic',()=>{const d=makeDemo('london');assert.equal(d.source,'demo');assert(d.aircraft.length>50);assert(d.aircraft.every(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)))});
test('flight filters compose search, altitude, and flight type',()=>{const a=[{callsign:'ABC',icao24:'x',altitude:6000,velocity:100,on_ground:false},{callsign:'DEF',icao24:'y',altitude:0,velocity:0,on_ground:true}];assert.equal(filterAircraft(a,{search:'ABC',filter:'airborne',altFt:3000}).length,1);assert.equal(filterAircraft(a,{filter:'ground',altFt:1000}).length,0)});
test('history interpolation finds midpoint and refuses extrapolation',()=>{const s=[{t:100,lat:10,lon:10},{t:120,lat:12,lon:14}];assert.deepEqual([interpolateSamples(s,110).lat,interpolateSamples(s,110).lon],[11,12]);assert.equal(interpolateSamples(s,90),null)});
