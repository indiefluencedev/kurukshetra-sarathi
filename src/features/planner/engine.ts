// @ts-nocheck — verbatim 1:1 port of the demo's route engine (untyped vanilla JS).
// Typing its internals would add no behaviour; the public shape is used via Itinerary.
import { CONFIG, THEMES } from "@/data/config";
import { D } from "@/data/destinations";
import { reorder, suggestNearby } from "./orienteering";

// Route-building engine — ported verbatim from the demo (pure functions).
export const Engine = (function () {
 const R=6371, rad=d=>d*Math.PI/180;
 function hav(a,b){
   const dLat=rad(b.lat-a.lat), dLng=rad(b.lng-a.lng);
   const s=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
   return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
 }
 const roadKm=(a,b)=>+(hav(a,b)*CONFIG.roadFactor).toFixed(1);
 function travelMin(a,b,mode){
   const km=hav(a,b)*CONFIG.roadFactor, sp=CONFIG.speed[mode]||CONFIG.speed.car;
   return Math.max(2,Math.round(km/sp*60));
 }
 const mins=hhmm=>{const p=hhmm.split(":");return (+p[0])*60+(+p[1]);};
 function openAt(d,wd,m){
   if(d.closed&&d.closed.indexOf(wd)>=0) return false;
   if(!d.hours) return true;
   return m>=mins(d.hours.o)&&m<=mins(d.hours.c);
 }
 /* how well a stop suits the hour it would be reached */
 function timeFit(d,arriveMin){
   const h=Math.floor((((arriveMin%1440)+1440)%1440)/60);
   switch(d.bestKey){
     case "evening": return h>=16?26:(h>=14?8:-14);
     case "morning": return h<11?22:(h<14?2:-10);
     case "midday":  return (h>=11&&h<16)?18:2;
     default:        return 0;
   }
 }

 function build(o){
  const budget=o.budgetMin, mode=o.mode||"car", pace=o.pace||"balanced";
  const cont=CONFIG.contingency[pace]!=null?CONFIG.contingency[pace]:.10;
  const usable=Math.round(budget*(1-cont));
  const vf=CONFIG.paceVisitFactor[pace]||1;
  const f=o.filters||{}, interests=o.interests||[], wantAll=interests.length===0;
  const wd=o.weekday, endPt=o.end;

  /* meal reserved up front so it can never overflow the window */
  const sH=Math.floor(o.startClock/60), eH=Math.floor((o.startClock+budget)/60);
  const spansMeal=(eH-sH)>=4 && sH<=CONFIG.mealWindow[1] && eH>=CONFIG.mealWindow[0];
  const meal=(f.meal&&spansMeal)?CONFIG.mealBreakMin:0;
  const spendable=usable-meal;

  let pool=D.filter(function(d){
    if(d.pending) return false;              /* coordinates not yet verified */
    if(o.onlyIds&&o.onlyIds.indexOf(d.id)<0) return false;
    if(f.free&&!d.free) return false;
    if(f.indoor&&!d.indoor) return false;
    if(!wantAll&&!o.onlyIds&&!d.themes.some(t=>interests.indexOf(t)>=0)) return false;
    return true;
  });

  const score={};
  pool.forEach(function(d){
    let s=d.rank*.4+d.first*.3;
    if(!wantAll){
      const hits=d.themes.filter(t=>interests.indexOf(t)>=0).length;
      s+=hits*34;
    }
    if(o.bias&&o.bias[d.id]) s+=o.bias[d.id];
    score[d.id]=s;
  });

  const stops=[], dropped=[];
  let cur={lat:o.start.lat,lng:o.start.lng}, clock=o.startClock, used=0;
  const left=pool.slice();

  while(left.length){
    let best=null,bv=-1e9,bi=-1,bt=0,bw=0;
    for(let i=0;i<left.length;i++){
      const d=left[i];
      const t=travelMin(cur,d,mode), visit=Math.round(d.visit.rec*vf);
      let arrive=clock+t, wait=0;
      if(d.closed&&d.closed.indexOf(wd)>=0) continue;
      if(d.hours){                                   /* wait rather than discard */
        const op=mins(d.hours.o), day=((arrive%1440)+1440)%1440;
        if(day<op){ wait=op-day; arrive+=wait; }
      }
      if(!openAt(d,wd,((arrive%1440)+1440)%1440)) continue;
      if(!openAt(d,wd,(((arrive+visit)%1440)+1440)%1440)) continue;  /* shuts mid-visit */
      const back=travelMin(d,endPt,mode);
      if(used+t+wait+visit+CONFIG.parkingBufferMin+back>spendable) continue;
      const v=score[d.id]+timeFit(d,arrive)-t*1.6-wait*1.3;
      if(v>bv){ bv=v;best=d;bi=i;bt=t;bw=wait; }
    }
    if(!best) break;
    const visit=Math.round(best.visit.rec*vf), arrive=clock+bt+bw;
    stops.push({d:best,travel:bt,km:roadKm(cur,best),wait:bw,arrive:arrive,visit:visit,depart:arrive+visit});
    used+=bt+bw+visit+CONFIG.parkingBufferMin;
    clock=arrive+visit+CONFIG.parkingBufferMin;
    cur=best; left.splice(bi,1);
  }

  /* 2-opt: shorten the tour without breaking opening hours (orienteering.ts) */
  const rctx={start:o.start,end:endPt,mode:mode,wd:wd,vf:vf,startClock:o.startClock,
    parking:CONFIG.parkingBufferMin,travelMin:travelMin,roadKm:roadKm,openAt:openAt};
  const imp=reorder(stops,rctx);
  if(imp){ stops.length=0; imp.stops.forEach(s=>stops.push(s)); cur=imp.cur; }

  const closeT=stops.length?travelMin(cur,endPt,mode):0;
  used+=closeT;

  left.sort((a,b)=>score[b.id]-score[a.id]);
  left.slice(0,4).forEach(function(d){
    const noMatch=!wantAll&&!d.themes.some(t=>interests.indexOf(t)>=0);
    const shut=d.closed&&d.closed.indexOf(wd)>=0;
    dropped.push({d:d,why:shut?"closed":(noMatch?"theme":"time")});
  });

  const travel=stops.reduce((a,s)=>a+s.travel,0)+closeT;
  const visitT=stops.reduce((a,s)=>a+s.visit,0);
  const waitT =stops.reduce((a,s)=>a+s.wait,0);
  const park  =stops.length*CONFIG.parkingBufferMin;
  const km    =+(stops.reduce((a,s)=>a+s.km,0)+(stops.length?roadKm(cur,endPt):0)).toFixed(1);
  const mealU =stops.length?meal:0;
  const total =travel+visitT+waitT+park+mealU;

  /* nearby-fit: unused POIs that still fit the spare time, cheapest-insertion first.
     Drawn from ALL valid places (not just the theme-filtered pool) so a themed
     route can still surface a close-by extra worth adding. */
  const slack=spendable-(travel+visitT+waitT+park);
  const suggestPool=D.filter(function(d){
    if(d.pending) return false;
    if(f.free&&!d.free) return false;
    if(f.indoor&&!d.indoor) return false;
    return true;
  });
  const suggest=suggestNearby(stops,suggestPool,rctx,slack,score).map(x=>({id:x.d.id,addMin:x.addMin}));

  return {stops:stops,dropped:dropped,suggest:suggest,
    totals:{travel:travel,visit:visitT,wait:waitT,park:park,meal:mealU,
            buffer:park+waitT+mealU+(budget-usable),km:km,total:total,
            budget:budget,finish:o.startClock+total},
    meta:{mode:mode,pace:pace,start:o.start,end:endPt,startClock:o.startClock,weekday:wd,
          interests:interests,contingency:cont,at:Date.now(),liveTraffic:false},
    warn:stops.length?[]:["nofit"]};
 }

 function generate(o){
  const primary=build(o), alts=[];
  if(o.pace!=="relaxed") alts.push({tag:"relaxed",it:build(Object.assign({},o,{pace:"relaxed"}))});
  const other=THEMES.find(t=>(o.interests||[]).indexOf(t.id)<0);
  if(other){ const b={}; D.forEach(d=>{ if(d.themes.indexOf(other.id)>=0) b[d.id]=42; });
    alts.push({tag:other.id,it:build(Object.assign({},o,{bias:b}))}); }
  const key=it=>it.stops.map(s=>s.d.id).join(">");
  const seen={}; seen[key(primary)]=1; const uniq=[];
  alts.forEach(a=>{const k=key(a.it); if(!seen[k]&&a.it.stops.length){seen[k]=1;uniq.push(a);}});
  return {primary:primary,alts:uniq.slice(0,2)};
 }

 function recalc(it,from,fromClock,ids){
  const m=it.meta;
  return build({budgetMin:Math.max(30,m.startClock+it.totals.total-fromClock),
    start:from,end:m.end,interests:m.interests,mode:m.mode,pace:m.pace,
    startClock:fromClock,weekday:m.weekday,filters:{},onlyIds:ids});
 }

 /* Multi-day: a window longer than one sensible day is split into
    days of at most DAY_MAX active minutes, each starting fresh in the
    morning. Places already used on an earlier day are not repeated. */
 const DAY_MAX=9*60, DAY_START=9*60;
 function buildDays(o){
  const totalDays=Math.max(1,Math.min(7,Math.ceil(o.budgetMin/DAY_MAX)));
  if(totalDays===1) return null;
  const used={}; const days=[];
  for(let n=0;n<totalDays;n++){
    const left=o.budgetMin-n*DAY_MAX;
    if(left<=45) break;
    const pool=D.filter(d=>!used[d.id]).map(d=>d.id);
    if(!pool.length) break;
    const day=build(Object.assign({},o,{
      budgetMin:Math.min(DAY_MAX,left),
      startClock:DAY_START,
      weekday:(o.weekday+n)%7,
      onlyIds:pool
    }));
    if(!day.stops.length) break;
    day.stops.forEach(s=>{used[s.d.id]=1});
    days.push(day);
  }
  if(days.length<2) return null;
  const sum=days.reduce((a,d)=>({
    travel:a.travel+d.totals.travel, visit:a.visit+d.totals.visit,
    wait:a.wait+d.totals.wait, park:a.park+d.totals.park, meal:a.meal+d.totals.meal,
    km:+(a.km+d.totals.km).toFixed(1), total:a.total+d.totals.total, stops:a.stops+d.stops.length
  }),{travel:0,visit:0,wait:0,park:0,meal:0,km:0,total:0,stops:0});
  return {days:days,totals:sum,meta:days[0].meta};
 }
 return {build,generate,recalc,buildDays,travelMin,roadKm,openAt,timeFit,DAY_MAX};
})();
