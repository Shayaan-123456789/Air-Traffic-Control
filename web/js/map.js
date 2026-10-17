import {REGIONS,predict,reliability,haversineKm} from './core.mjs';

export class RadarMap {
  constructor(canvas,{onSelect=()=>{},onSetZone=()=>{},onHover=()=>{}}={}) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.onSelect=onSelect;this.onSetZone=onSetZone;this.onHover=onHover;
    this.region='south-india';this.center={lat:12.5,lon:77.5};this.zoom=1;this.coast=[];this.aircraft=[];this.current=[];this.selected=null;this.alerts=[];this.history=[];this.zone=null;this.placeZone=false;
    this.predictPositions=true;this.showTrail=true;this.now=Date.now()/1000;this.replay=false;this.pointer=null;this.drag=null;
    this.canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,y:e.clientY,lat:this.center.lat,lon:this.center.lon,moved:false};this.canvas.setPointerCapture(e.pointerId)});
    this.canvas.addEventListener('pointermove',e=>this.pointerMove(e));
    this.canvas.addEventListener('pointerup',e=>this.pointerUp(e));
    this.canvas.addEventListener('pointerleave',()=>{this.pointer=null;this.onHover(null)});
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.min(14,Math.max(.65,this.zoom*(e.deltaY>0?.85:1.18)));this.draw();},{passive:false});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);
    this.resize();
    fetch(new URL('../assets/coastlines.json', import.meta.url)).then(r=>r.json()).then(json=>{this.coast=json;this.draw()}).catch(()=>{});
  }
  resize(){const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);this.width=rect.width||800;this.height=rect.height||400;this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.draw()}
  setRegion(key){this.region=key;const r=REGIONS[key];this.center={lat:r.center[0],lon:r.center[1]};this.zoom=1;this.draw()}
  baseScale(){const b=REGIONS[this.region].bbox;return Math.min(this.width/((b[3]-b[1])*1.32),this.height/((b[2]-b[0])*1.32))*this.zoom}
  toXY(lat,lon){const s=this.baseScale();return {x:this.width/2+(lon-this.center.lon)*s*Math.cos(this.center.lat*Math.PI/180)*1.05,y:this.height/2-(lat-this.center.lat)*s}}
  toGeo(x,y){const s=this.baseScale();return {lat:this.center.lat-(y-this.height/2)/s,lon:this.center.lon+(x-this.width/2)/(s*Math.cos(this.center.lat*Math.PI/180)*1.05)}}
  pointerPos(e){const box=this.canvas.getBoundingClientRect();return {x:e.clientX-box.left,y:e.clientY-box.top}}
  pointerMove(e){const pt=this.pointerPos(e);if(this.drag){const d=this.drag;if(Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)>5)d.moved=true;if(d.moved){const s=this.baseScale();this.center.lon=d.lon-(e.clientX-d.x)/(s*Math.cos(this.center.lat*Math.PI/180)*1.05);this.center.lat=d.lat+(e.clientY-d.y)/s;this.draw();return}}let nearest=null,best=22;for(const a of this.current){const p=this.toXY(a.lat,a.lon);const dist=Math.hypot(p.x-pt.x,p.y-pt.y);if(dist<best){best=dist;nearest=a}}this.pointer=nearest;this.canvas.style.cursor=nearest?'pointer':'crosshair';this.onHover(nearest,pt);this.draw()}
  pointerUp(e){if(!this.drag)return;const moved=this.drag.moved;this.drag=null;if(moved)return;const pt=this.pointerPos(e);if(this.placeZone){this.onSetZone(this.toGeo(pt.x,pt.y));return;}let near=null,best=22;for(const a of this.current){const p=this.toXY(a.lat,a.lon),dist=Math.hypot(p.x-pt.x,p.y-pt.y);if(dist<best){best=dist;near=a;}}if(near)this.onSelect(near.icao24);}
  focus(lat,lon){this.center={lat,lon};this.zoom=Math.max(1.6,this.zoom);this.draw()}
  draw(){
    if(!this.ctx||!this.width||!this.height)return;
    const {ctx:c,width:w,height:h}=this;
    c.fillStyle='#091c2a';c.fillRect(0,0,w,h);
    const grd=c.createRadialGradient(w*.48,h*.45,0,w*.5,h*.5,w*.8);grd.addColorStop(0,'#123b42');grd.addColorStop(.5,'#0b2937');grd.addColorStop(1,'#081826');c.fillStyle=grd;c.fillRect(0,0,w,h);
    const region=REGIONS[this.region];
    // Geographic grid: WGS-84 approximation with correctly labeled latitude/longitude.
    c.save();c.strokeStyle='#58a6b01a';c.lineWidth=1;c.font='10px monospace';c.fillStyle='#477b8c';
    const g1=this.toGeo(0,h),g2=this.toGeo(w,0),step=this.zoom>4?.5:this.zoom>1.5?1:2;
    for(let lon=Math.floor(g1.lon/step)*step;lon<g2.lon+step;lon+=step){const p=this.toXY(0,lon);c.beginPath();c.moveTo(p.x,0);c.lineTo(p.x,h);c.stroke();if(p.x>10&&p.x<w-30)c.fillText(`${Math.abs(lon).toFixed(step<1?1:0)}°${lon<0?'W':'E'}`,p.x+4,h-11)}
    for(let lat=Math.floor(g1.lat/step)*step;lat<g2.lat+step;lat+=step){const p=this.toXY(lat,0);c.beginPath();c.moveTo(0,p.y);c.lineTo(w,p.y);c.stroke();if(p.y>15&&p.y<h-15)c.fillText(`${Math.abs(lat).toFixed(step<1?1:0)}°${lat<0?'S':'N'}`,7,p.y-5)}c.restore();
    if(this.coast.length){c.save();c.lineWidth=1.2;c.strokeStyle='#4a92965d';c.fillStyle='#4b9b9220';for(const seg of this.coast){let started=false;c.beginPath();for(const [lon,lat] of seg){const p=this.toXY(lat,lon);if(!started){c.moveTo(p.x,p.y);started=true}else c.lineTo(p.x,p.y);}if(started){c.stroke();if(seg.length>3&&Math.hypot(seg[0][0]-seg.at(-1)[0],seg[0][1]-seg.at(-1)[1])<1)c.fill();}}c.restore();}
    // Four radar rings provide scale context without obscuring geographic map.
    const pCenter=this.toXY(region.center[0],region.center[1]);const rings=[.17,.34,.51];
    c.save();c.setLineDash([3,8]);c.strokeStyle='#6bdecb22';for(const r of rings){c.beginPath();c.arc(pCenter.x,pCenter.y,Math.min(w,h)*r,0,Math.PI*2);c.stroke()}c.restore();
    c.save();for(const [label,lat,lon] of region.places){const p=this.toXY(lat,lon);if(p.x<0||p.x>w||p.y<0||p.y>h)continue;c.strokeStyle='#96c8bc70';c.fillStyle='#91ccbb';c.beginPath();c.arc(p.x,p.y,2.2,0,7);c.fill();c.font='800 9px DM Sans, sans-serif';c.fillStyle='#87c6bdab';c.fillText(label,p.x+8,p.y-6)}c.restore();
    if(this.zone){const zp=this.toXY(this.zone.lat,this.zone.lon);const radiusPx=this.zone.radius/111.32*this.baseScale();c.save();c.fillStyle='#93e6a40e';c.strokeStyle='#75eac1bd';c.lineWidth=1.3;c.setLineDash([7,5]);c.beginPath();c.arc(zp.x,zp.y,Math.abs(radiusPx),0,7);c.fill();c.stroke();c.setLineDash([]);c.fillStyle='#a5e6ca';c.font='bold 9px monospace';c.fillText(`WATCH ZONE · ${this.zone.radius} KM`,zp.x+10,zp.y+13);c.restore();}
    const byId=new Map(this.current.map(a=>[a.icao24,a]));
    for(const e of this.alerts.filter(e=>e.kind==='proximity').slice(0,15)){const a=byId.get(e.a),b=byId.get(e.b);if(!a||!b)continue;const p=this.toXY(a.lat,a.lon),q=this.toXY(b.lat,b.lon);c.save();c.beginPath();c.setLineDash([4,4]);c.strokeStyle='#ff9c8eb3';c.lineWidth=1.5;c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();c.restore();}
    // Observations are local and may be sparse. A trail is never reconstructed from OpenSky history.
    if(this.selected&&this.showTrail&&this.history.length>1){c.save();c.beginPath();for(let i=0;i<this.history.length;i++){const p=this.toXY(this.history[i].lat,this.history[i].lon);i===0?c.moveTo(p.x,p.y):c.lineTo(p.x,p.y)}c.strokeStyle='#7beddfa8';c.lineWidth=2.2;c.stroke();for(const ob of this.history.filter((_,i)=>i%5===0)){const p=this.toXY(ob.lat,ob.lon);c.beginPath();c.arc(p.x,p.y,2,0,7);c.fillStyle='#9cffe3';c.fill()}c.restore();}
    for(const a of this.current){const p=this.toXY(a.lat,a.lon);if(p.x < -25||p.x>w+25||p.y < -25||p.y>h+25)continue;const data=reliability(a,this.now);const isSelected=a.icao24===this.selected;const isHovered=a.icao24===this.pointer?.icao24;
      const color=a.estimated?'#b7a2ff':data.kind==='fresh'?'#7cedbb':data.kind==='delayed'?'#ffbd78':'#8094a6';
      c.save();c.translate(p.x,p.y);c.rotate((a.heading||0)*Math.PI/180);
      if(isSelected||isHovered){c.beginPath();c.arc(0,0,isSelected?17:13,0,Math.PI*2);c.strokeStyle=isSelected?'#b3ffebcc':'#ffffff65';c.lineWidth=1.1;c.stroke();c.beginPath();c.arc(0,0,25,0,Math.PI*2);c.strokeStyle='#68e9ca36';c.stroke()}
      if(a.estimated){c.setLineDash([2,3]);c.beginPath();c.arc(0,0,11,0,Math.PI*2);c.strokeStyle='#baa8ff99';c.stroke();c.setLineDash([])}
      c.fillStyle=color;c.strokeStyle='#06151baa';c.lineWidth=1.2;
      c.beginPath();c.moveTo(0,-10);c.lineTo(2.8,-2);c.lineTo(8,2);c.lineTo(8,4);c.lineTo(2.6,3);c.lineTo(2.1,8);c.lineTo(4.3,10);c.lineTo(3.4,11);c.lineTo(0,9);c.lineTo(-3.4,11);c.lineTo(-4.3,10);c.lineTo(-2.1,8);c.lineTo(-2.6,3);c.lineTo(-8,4);c.lineTo(-8,2);c.lineTo(-2.8,-2);c.closePath();c.fill();c.stroke();c.restore();
      if(isSelected||isHovered||this.zoom>=3){c.save();c.font='700 10px Space Grotesk, sans-serif';c.fillStyle=isSelected?'#f7fffd':'#b0d3dc';c.fillText(a.callsign||a.icao24,p.x+12,p.y-9);c.restore();}
    }
    // Subtle corner brackets, scale & north arrow.
    c.save();c.strokeStyle='#69baad52';c.lineWidth=1.5;for(const [x,y,dx,dy] of [[12,12,1,1],[w-12,12,-1,1],[12,h-12,1,-1],[w-12,h-12,-1,-1]]){c.beginPath();c.moveTo(x+dx*15,y);c.lineTo(x,y);c.lineTo(x,y+dy*15);c.stroke();}c.font='bold 11px monospace';c.fillStyle='#a5d3d1';c.fillText('N ↑',w/2-7,22);c.restore();
    this.scaleText=`~${Math.round((120/this.baseScale())*111.32)} KM / 120 PX`;
  }
}
