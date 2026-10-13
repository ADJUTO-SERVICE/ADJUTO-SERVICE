(function(root){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 function validDate(s){if(s==='')return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
 function addDays(s,n=7){if(!s||!validDate(s))return '';const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
 function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 function project(p){const [lat,lng]=p;return [lng*Math.PI/180*6378137,Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*6378137];}
 function unproject(p){return [(2*Math.atan(Math.exp(p[1]/6378137))-Math.PI/2)*180/Math.PI,p[0]/6378137*180/Math.PI];}
 function transform(anchors){if(anchors.length!==2)throw Error('基準点を2組指定してください');const [a,b]=anchors;const u=[b.pixel[0]-a.pixel[0],-(b.pixel[1]-a.pixel[1])],p=project(a.geo),q=project(b.geo),v=[q[0]-p[0],q[1]-p[1]],den=u[0]*u[0]+u[1]*u[1];if(den<100||Math.hypot(...v)<10)throw Error('基準点は離れた2地点を選んでください');const c=(u[0]*v[0]+u[1]*v[1])/den,s=(u[0]*v[1]-u[1]*v[0])/den;return pixel=>{const x=pixel[0]-a.pixel[0],y=-(pixel[1]-a.pixel[1]);return unproject([p[0]+c*x-s*y,p[1]+s*x+c*y]);};}
 function segmentsFromPixels(paths,anchors){const convert=transform(anchors);return paths.filter(p=>p.length>=2).map((p,i)=>({id:'trace-'+i,points:p.map(convert),confidence:'estimated',reason:'画像の色線から抽出。位置・枝道・文字で隠れた部分は要確認。'}));}
 function inverseTransform(anchors){const [a,b]=anchors,p=project(a.geo),q=project(b.geo),u=[b.pixel[0]-a.pixel[0],-(b.pixel[1]-a.pixel[1])],v=[q[0]-p[0],q[1]-p[1]],den=u[0]*u[0]+u[1]*u[1],c=(u[0]*v[0]+u[1]*v[1])/den,s=(u[0]*v[1]-u[1]*v[0])/den;return geo=>{const t=project(geo),x=t[0]-p[0],y=t[1]-p[1],d=c*c+s*s;return [a.pixel[0]+(c*x+s*y)/d,a.pixel[1]-(-s*x+c*y)/d];};}
 function simplify(points,tolerance=2){if(points.length<3)return points;const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];while(stack.length){const [a,b]=stack.pop(),p=points[a],q=points[b],vx=q[0]-p[0],vy=q[1]-p[1],length=Math.hypot(vx,vy);let furthest=-1,maximum=tolerance;for(let i=a+1;i<b;i++){const r=points[i],d=length?Math.abs(vx*(r[1]-p[1])-vy*(r[0]-p[0]))/length:Math.hypot(r[0]-p[0],r[1]-p[1]);if(d>maximum){maximum=d;furthest=i;}}if(furthest!==-1){keep.add(furthest);stack.push([a,furthest],[furthest,b]);}}return [...keep].sort((a,b)=>a-b).map(i=>points[i]);}
 function due(e,now=today()){if(!e.types.includes('free'))return '対象外';if(e.completed)return '巡回完了';if(!e.planned)return '予定日未設定';return e.planned<now?'期限超過':e.planned===now?'本日回収':'回収予定';}
 function navigationURL(provider,stops){if(!Array.isArray(stops)||!stops.length)return '';const selected=provider==='google'?stops.slice(0,4):stops.slice(0,14);const position=s=>{const p=s.point;if(!Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x))||Math.abs(p[0])>85||Math.abs(p[1])>180)throw Error('ナビ地点の座標が不正です');return p.map(x=>x.toFixed(6)).join(',');};const url=new URL(provider==='google'?'https://www.google.com/maps/dir/':'https://maps.apple.com/directions');url.searchParams.set('destination',position(selected.at(-1)));if(provider==='google'){url.searchParams.set('api','1');url.searchParams.set('travelmode','driving');url.searchParams.set('dir_action','navigate');if(selected.length>1)url.searchParams.set('waypoints',selected.slice(0,-1).map(position).join('|'));}else{url.searchParams.set('mode','driving');selected.slice(0,-1).forEach(s=>url.searchParams.append('waypoint',position(s)));}return url.toString();}
 function validate(data){
  if(!data||![1,2].includes(data.version)||!Array.isArray(data.entries)||data.entries.length>200)throw Error('対応する管理マップJSONではありません（version 1 / 2）');
  const ids=new Set();let count=0;
  const text=(v,max=500)=>{if(v===undefined||v===null)return '';if(typeof v!=='string'||v.length>max)throw Error('文字情報が不正です');return v;};
  const coord=p=>{if(!Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x))||Math.abs(p[0])>85||Math.abs(p[1])>180)throw Error('緯度・経度が不正です');return [...p];};
  const entries=data.entries.map((e,index)=>{
   if(!e||typeof e!=='object')throw Error('ルートの形式が不正です');const id=String(e.id??'route-'+index);if(ids.has(id))throw Error('ルートIDが重複しています');ids.add(id);
   const name=text(e.name,100);if(!name.trim())throw Error('ルート名がありません');
   const types=Array.isArray(e.types)?[...new Set(e.types)]:['normal','free'];if(types.some(t=>!['normal','free'].includes(t)))throw Error('チラシ種別が不正です');
   const segments=data.version===1?(e.paths||[]).map((points,i)=>({id:'legacy-'+i,points,confidence:'estimated',reason:'試作版から引継ぎ'})):e.segments;
   if(!Array.isArray(segments)||segments.length>1000)throw Error('線の形式が不正です');
   const segIds=new Set();const clean=segments.map((s,i)=>{if(!Array.isArray(s.points)||s.points.length<2||s.points.length>5000)throw Error('線は2点以上で登録してください');count+=s.points.length;if(count>100000)throw Error('点の数が多すぎます');const sid=String(s.id??i);if(segIds.has(sid))throw Error('線IDが重複しています');segIds.add(sid);return {id:sid,points:s.points.map(coord),confidence:s.confidence==='confirmed'?'confirmed':'estimated',reason:text(s.reason)};});
   let image=text(e.image,7000000);if(data.version===1&&image&&!image.startsWith('images/'))image='images/'+image;
   if(image&&!/^images\/[\w.-]+\.(png|jpe?g)$/i.test(image)&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))throw Error('画像の形式が不正です');
   const date=text(e.date,10),planned=text(e.planned,10),completedDate=text(e.completedDate,10);if(![date,planned,completedDate].every(validDate))throw Error('日付が不正です');
   let pixelPaths=Array.isArray(e.pixelPaths)?e.pixelPaths:[];if(pixelPaths.length>2000||pixelPaths.some(p=>!Array.isArray(p)||p.length<2||p.length>5000||p.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>30000))))throw Error('画像上の線が不正です');
   const anchors=Array.isArray(e.anchors)?e.anchors.map(a=>{if(!Array.isArray(a.pixel)||a.pixel.length!==2||a.pixel.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000))throw Error('画像の基準点が不正です');return {pixel:[...a.pixel],geo:coord(a.geo),label:text(a.label,100)};}):[];
   if(anchors.length&&anchors.length!==2)throw Error('基準点は2組必要です');
   const navRaw=e.navStops??[];if(!Array.isArray(navRaw)||navRaw.length>14)throw Error('ナビ地点は最大14件です');const navIds=new Set();const navStops=navRaw.map((s,i)=>{if(!s||typeof s!=='object')throw Error('ナビ地点が不正です');const id=text(s.id,100)||'stop-'+i;if(navIds.has(id))throw Error('ナビ地点IDが重複しています');navIds.add(id);if(s.visited!==undefined&&typeof s.visited!=='boolean')throw Error('立寄状態が不正です');return {id,name:text(s.name,80)||'立ち寄り '+(i+1),point:coord(s.point),visited:!!s.visited};});
   const width=e.width??600,height=e.height??1067;if(![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=10000))throw Error('画像サイズが不正です');
   for(const key of ['completed','archived','plannedAuto'])if(e[key]!==undefined&&typeof e[key]!=='boolean')throw Error('状態情報が不正です');
   return {id,name,region:text(e.region,50)||name.replace(/周辺.*$/,''),distance:text(e.distance,50),image,types,date,planned,plannedAuto:typeof e.plannedAuto==='boolean'?e.plannedAuto:!planned,partner:text(e.partner,100),completed:!!e.completed,completedDate,notes:text(e.notes,3000),segments:clean,navStops,pixelPaths:clone(pixelPaths),anchors,width,height,center:e.center?coord(e.center):[35.535,139.647],archived:!!e.archived};
  });return {version:2,entries};
 }
 const api={clone,validDate,addDays,today,project,unproject,transform,inverseTransform,simplify,segmentsFromPixels,navigationURL,due,validate};root.AdjutoCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
