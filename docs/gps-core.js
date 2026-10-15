(function(root){
'use strict';
const distance=(a,b)=>{const r=Math.PI/180,lat=(b[0]-a[0])*r,lng=(b[1]-a[1])*r;const h=Math.sin(lat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(lng/2)**2;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));};
function sample(position,last,now=Date.now()){
 const c=position.coords||{},point=[c.latitude,c.longitude],time=position.timestamp;
 if(point.some(x=>typeof x!=='number'||!Number.isFinite(x))||Math.abs(point[0])>85||Math.abs(point[1])>180||!Number.isFinite(time)||!Number.isFinite(c.accuracy)||c.accuracy<0)return {error:'位置情報の形式が不正です'};
 if(now-time>30000||time>now+5000)return {error:'古い位置情報を除外しました'};
 if(c.accuracy>50)return {error:'精度が低いため除外しました（50m超）'};
 if(last){const seconds=(time-last.time)/1000;if(seconds<=0)return {error:'重複・逆順の位置情報を除外しました'};const meters=distance(last.point,point);if(meters/seconds>15)return {error:'急な位置の飛びを除外しました'};if(meters<Math.max(5,Math.min(c.accuracy,last.accuracy)*0.5))return {error:'静止中の揺れを除外しました'};}
 return {value:{point,time,accuracy:c.accuracy}};
}
function validate(value){
 if(!value||value.version!==1||typeof value.id!=='string'||value.id.length>100||typeof value.routeId!=='string'||value.routeId.length>100||!['paused','finished','recording'].includes(value.status)||!Array.isArray(value.parts)||value.parts.length>1000)throw Error('GPS一時記録が不正です');
 let total=0;const parts=value.parts.map(part=>{if(!Array.isArray(part)||part.length>5000)throw Error('GPS区間が長すぎます');return part.map(s=>{if(!s||!Array.isArray(s.point)||s.point.length!==2||s.point.some(x=>typeof x!=='number'||!Number.isFinite(x))||Math.abs(s.point[0])>85||Math.abs(s.point[1])>180||!Number.isFinite(s.time)||!Number.isFinite(s.accuracy)||s.accuracy<0||s.accuracy>50||++total>50000)throw Error('GPS地点が不正です');return {point:[...s.point],time:s.time,accuracy:s.accuracy};});});
 return {version:1,id:value.id,routeId:value.routeId,status:value.status,parts};
}
function segments(record){return record.parts.filter(p=>p.length>=2).map((part,i)=>({id:record.id+'-'+i,points:part.map(s=>[...s.point]),confidence:'estimated',reason:'GPS自動記録。端末測位の誤差があるため、地図で確認・手動修正してください。'}));}
const api={distance,sample,validate,segments};root.AdjutoGPS=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
