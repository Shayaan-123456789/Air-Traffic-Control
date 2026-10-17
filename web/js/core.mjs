/** Pure, tested flight-domain logic. No data in this file is safety-certified. */
export const REGIONS = {
  'south-india': {name:'SOUTH INDIA', friendly:'South India · BLR / MAA',bbox:[10,75,15,80],center:[12.5,77.5],places:[['BENGALURU',12.97,77.59],['CHENNAI',13.08,80.27],['MYSURU',12.30,76.64],['SALEM',11.65,78.16],['TIRUPATI',13.63,79.41]]},
  london: {name:'LONDON CORRIDOR', friendly:'United Kingdom · London',bbox:[49.5,-2,53.5,2],center:[51.5,0],places:[['LONDON',51.51,-.12],['HEATHROW',51.47,-.45],['STANSTED',51.89,.24],['OXFORD',51.75,-1.25]]},
  dubai: {name:'ARABIAN GULF', friendly:'UAE · Dubai',bbox:[23,52,27,58],center:[25,55],places:[['DUBAI',25.20,55.27],['ABU DHABI',24.45,54.37],['SHARJAH',25.34,55.42],['AL AIN',24.13,55.8]]},
  singapore: {name:'SINGAPORE STRAIT',friendly:'Singapore · SIN',bbox:[-1,101,3,106],center:[1,103.5],places:[['SINGAPORE',1.35,103.82],['JOHOR BAHRU',1.49,103.76],['BATAM',1.13,104.05]]},
  'new-york': {name:'NEW YORK',friendly:'United States · New York',bbox:[39,-76,43,-71],center:[41,-73.5],places:[['NEW YORK',40.71,-74],['NEWARK',40.73,-74.17],['PHILADELPHIA',39.95,-75.17],['HARTFORD',41.76,-72.68]]},
  'bay-area': {name:'SAN FRANCISCO BAY',friendly:'United States · Bay Area',bbox:[36,-124,40,-120],center:[38,-122],places:[['SAN FRANCISCO',37.77,-122.42],['SAN JOSE',37.34,-121.89],['OAKLAND',37.8,-122.27],['SACRAMENTO',38.58,-121.49]]},
};
export const toFeet = m => m == null ? null : Math.round(m*3.28084);
export const toKnots = ms => ms == null ? null : Math.round(ms*1.943844);
export const formatNum = (n,suffix='') => n == null || !Number.isFinite(+n) ? 'N/A' : Math.round(n).toLocaleString('en-US')+suffix;
export const safeTime = value => typeof value === 'number' && value > 0 ? value : 0;
export const positionAge = (a, now=Date.now()/1000) => Math.max(0,now-safeTime(a.position_time || 0));
export const reliability = (a,now=Date.now()/1000) => {
  if (!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||!a.position_time) return {label:'NO FIX',value:0,kind:'stale',age:Infinity};
  const age=positionAge(a,now);
  return {label:age<=15?'FRESH':age<=60?'DELAYED':'STALE',value:Math.max(0,Math.round(100-age*.95)),kind:age<=15?'fresh':age<=60?'delayed':'stale',age};
};
export function predict(a, now=Date.now()/1000, enabled=true) {
  // Constant-heading ground-track projection using WGS-84's approximate metres/degree.
  // This is a visual-only estimate with a hard 60-second horizon, NOT aircraft guidance.
  const age=positionAge(a,now);
  if (!enabled || !Number.isFinite(a.heading)||!Number.isFinite(a.velocity)||a.on_ground || age<=15 || age>60) return {...a, estimated:false};
  const angle=a.heading*Math.PI/180, metres=a.velocity*age;
  const dLat=metres*Math.cos(angle)/111320;
  const dLon=metres*Math.sin(angle)/(111320*Math.max(.12,Math.cos(a.lat*Math.PI/180)));
  return {...a,lat:Math.max(-90,Math.min(90,a.lat+dLat)),lon:Math.max(-180,Math.min(180,a.lon+dLon)),estimated:true,estimatedAge:age};
}
export function haversineKm(a,b){
  const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
  const v=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(v)));
}
export function detectProximity(aircraft, opts={}) {
  // Coarse buckets avoid naive quadratic comparison of all global aircraft.
  // Flags horizontal proximity + altitude band ONLY: never a collision prediction.
  const maxKm=opts.maxKm??12, maxVertM=opts.maxVertM??300;
  const grid=new Map(),result=[];
  const valid=aircraft.filter(a=>!a.on_ground&&Number.isFinite(a.altitude)&&Number.isFinite(a.lat)&&Number.isFinite(a.lon) && positionAge(a) < 80);
  for(const a of valid){
    const gx=Math.floor(a.lon*4),gy=Math.floor(a.lat*4);
    for(let x=gx-1;x<=gx+1;x++)for(let y=gy-1;y<=gy+1;y++){
      for(const b of grid.get(`${x}:${y}`)||[]){
        if(Math.abs(a.altitude-b.altitude)>maxVertM)continue;
        const km=haversineKm(a,b);
        if(km<=maxKm)result.push({kind:'proximity',a:a.icao24,b:b.icao24,title:'Potential proximity',detail:`${a.callsign} / ${b.callsign} · ${km.toFixed(1)} km lateral`,distance:km,altitudeGap:Math.abs(a.altitude-b.altitude)});
      }
    }
    const key=`${gx}:${gy}`;
    if(!grid.has(key))grid.set(key,[]);
    grid.get(key).push(a);
  }
  return result.sort((a,b)=>a.distance-b.distance).slice(0,25);
}
export function createAlerts(aircraft, config) {
  const items=[];
  if(config.proximity) items.push(...detectProximity(aircraft));
  for (const a of aircraft) {
    if(positionAge(a)>90)continue; // stale aircraft are NOT used for live watch rules
    if(config.lowAltitude&&!a.on_ground&&a.altitude!=null&&toFeet(a.altitude)<config.lowAltFt) items.push({kind:'altitude',a:a.icao24,title:'Low altitude watch',detail:`${a.callsign} · ${formatNum(toFeet(a.altitude))} ft`});
    if(config.highSpeed&&a.velocity!=null&&toKnots(a.velocity)>config.highSpeedKts) items.push({kind:'speed',a:a.icao24,title:'High speed watch',detail:`${a.callsign} · ${formatNum(toKnots(a.velocity))} kts`});
    if(config.zone&&Number.isFinite(a.lat)&&haversineKm(a,config.zone)<=config.zone.radius)items.push({kind:'zone',a:a.icao24,title:'Entered watch zone',detail:`${a.callsign} · ${haversineKm(a,config.zone).toFixed(1)} km from zone center`});
  }
  return items.slice(0,80);
}
export function filterAircraft(aircraft,{search='',filter='all',altFt=0,speedKts=0,now=Date.now()/1000}={}) {
  const q=search.toLowerCase().trim();
  return aircraft.filter(a=>(!q||[a.callsign,a.icao24,a.country].some(s=>String(s||'').toLowerCase().includes(q)))&&
    (filter==='all'||filter==='airborne'&&!a.on_ground||filter==='ground'&&a.on_ground||filter==='stale'&&reliability(a,now).kind==='stale')&&
    (toFeet(a.altitude)??0)>=altFt&&(toKnots(a.velocity)??0)>=speedKts);
}
const frac=n=>n-Math.floor(n);
const noise=(n,s=1)=>frac(Math.sin(n*127.1+s*311.7)*43758.5453123);
/** Unambiguously synthetic repeatable demo, with one intentionally close pair. */
export function makeDemo(regionKey, at=Date.now()/1000, total=72) {
  const region=REGIONS[regionKey], [minLat,minLon,maxLat,maxLon]=region.bbox;
  const latSpan=maxLat-minLat,lonSpan=maxLon-minLon;
  const names=['SKY','AIX','IGO','UAE','SIA','BAW','DLH','QTR','EZY','DAL','AAL','ETH','SWA','KLM','TAM','JBU'];
  const planes=[];
  for(let i=0;i<total;i++){
    const seed=i+17;
    let lat=minLat+(.1+.8*noise(seed,1))*latSpan, lon=minLon+(.1+.8*noise(seed,2))*lonSpan;
    let alt=Math.round(300+noise(seed,3)*11900),vel=Math.round(70+noise(seed,4)*205),heading=Math.round(noise(seed,5)*359);
    const on_ground=i>0 && i%23===0;
    if(on_ground){alt=0;vel=0;}
    // Demo playback frame generates a coherent continuous path.
    const past=at-(at%30);
    const seconds=(past-1700000000)%1200;
    const motion=vel*seconds;
    lat+=Math.cos(heading*Math.PI/180)*motion/111320;
    lon+=Math.sin(heading*Math.PI/180)*motion/(111320*Math.max(.12,Math.cos(lat*Math.PI/180)));
    lat=minLat+(((lat-minLat)%latSpan)+latSpan)%latSpan;
    lon=minLon+(((lon-minLon)%lonSpan)+lonSpan)%lonSpan;
    if(i===1 && planes[0]) {lat=planes[0].lat+.035;lon=planes[0].lon+.038;alt=planes[0].altitude+100;vel=planes[0].velocity+5;heading=planes[0].heading+15;}
    const age=i%16===0?135:i%9===0?45:i%6===0?23:3+Math.round(noise(seed,6)*11);
    planes.push({icao24:`${(0xa10000+i*971).toString(16)}`,callsign:`${names[i%names.length]}${String(100+i*37)}`,country:['India','United Kingdom','United Arab Emirates','Singapore','United States'][['south-india','london','dubai','singapore','new-york','bay-area'].indexOf(regionKey)===5?4:['south-india','london','dubai','singapore','new-york'].indexOf(regionKey)],lat,lon,altitude:alt,velocity:vel,heading,vertical_rate:i%5===0?3.5:i%8===0?-5:0,on_ground,position_time:Math.floor(at)-age,last_contact:Math.floor(at)-Math.min(5,age),category:4,squawk:'1200'});
  }
  return {time:Math.floor(at),aircraft:planes,source:'demo',region:regionKey,stale:false,cache_age:0,notice:'SYNTHETIC DEMO DATA — NOT LIVE AIRCRAFT'};
}
export function interpolateSamples(samples,at) {
  if(!samples?.length)return null;
  let lower=samples[0],upper=samples[samples.length-1];
  for(let i=0;i<samples.length;i++){if(samples[i].t<=at)lower=samples[i];if(samples[i].t>=at){upper=samples[i];break;}}
  if(at<samples[0].t||at>samples[samples.length-1].t)return null;
  const delta=upper.t-lower.t,f=delta>0?(at-lower.t)/delta:0;
  return {lat:lower.lat+(upper.lat-lower.lat)*f,lon:lower.lon+(upper.lon-lower.lon)*f,altitude:lower.altitude,heading:lower.heading};
}
