(function(root){
'use strict';
function parse(text){
 if(typeof text!=='string'||text.length>10000000)throw Error('GPXは10MB以下にしてください');
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('外部定義を含むGPXは読込できません');
 const xml=new DOMParser().parseFromString(text,'application/xml'),gpx=xml.documentElement;
 if(xml.getElementsByTagName('parsererror').length||gpx.localName!=='gpx')throw Error('正しいGPXファイルを選んでください');
 const all=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
 const value=(node,name,max=100)=>(all(node,name)[0]?.textContent||'').trim().slice(0,max);
 const parts=[];let total=0,isolated=0;
 const raw=all(gpx,'trkseg');if(!raw.length)throw Error('記録した軌跡（trkseg）がありません');
 if(raw.length>1000)throw Error('GPXの区間が多すぎます');
 for(const segment of raw){
  let points=[],lastTime=null;
  const flush=()=>{if(points.length>=2)parts.push(points);else isolated+=points.length;points=[];};
  for(const point of Array.from(segment.children).filter(n=>n.localName==='trkpt')){
   const lat=point.getAttribute('lat'),lon=point.getAttribute('lon');
   if(lat===null||lon===null||!lat.trim()||!lon.trim())throw Error('GPXの座標がありません');
   const coordinate=[Number(lat),Number(lon)];
   if(coordinate.some(x=>!Number.isFinite(x))||Math.abs(coordinate[0])>85||Math.abs(coordinate[1])>180)throw Error('GPXの座標が不正です');
   if(++total>100000)throw Error('GPXの点が多すぎます');
   const rawTime=value(point,'time'),time=rawTime?Date.parse(rawTime):null;
   if(rawTime&&!Number.isFinite(time))throw Error('GPXの測位日時が不正です');
   if(time!==null&&lastTime!==null&&(time-lastTime>60000||time<lastTime))flush();
   if(points.length>=5000){const last=points.at(-1);flush();points.push(last);}
   points.push(coordinate);lastTime=time;
  }
  flush();
 }
 if(!parts.length)throw Error('2点以上つながった区間がありません。もう少し記録してから書き出してください');
 if(parts.length>1000)throw Error('読込区間が多すぎます');
 const native=gpx.getAttribute('creator')==='ADJUTO Recorder';
 const nativeExtension=name=>gpx.getElementsByTagNameNS('https://adjuto-service.github.io/ADJUTO-SERVICE/ns/1',name)[0]?.textContent?.trim().slice(0,100)||'';
 const id=native?nativeExtension('trackId'):'';
 return {name:value(gpx,'name'),worker:native?nativeExtension('worker'):'',site:native?nativeExtension('site'):'',trackId:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)?id.toLowerCase():'',parts,count:parts.reduce((sum,part)=>sum+part.length,0),isolated};
}
root.AdjutoGPX={parse};
})(typeof globalThis!=='undefined'?globalThis:this);
