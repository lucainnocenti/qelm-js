/** A small observable store. Updates replace top-level keys; unsubscribe when disposing a view. */
export function createStore(initial) {
  let state={...initial}; const listeners=new Set();
  return {get:()=>({...state}), set(patch){state={...state,...patch}; for(const fn of listeners) fn({...state});}, subscribe(fn){listeners.add(fn); return ()=>listeners.delete(fn);}};
}
/** Coalesce redraws to one callback per animation frame. Returns a cancellable scheduler. */
export function scheduleFrame(fn) {
  let id=null; return {request(){if(id===null) id=requestAnimationFrame(()=>{id=null;fn();});}, cancel(){if(id!==null) cancelAnimationFrame(id); id=null;}};
}
/** Resize canvas for device pixel ratio, returning CSS-pixel coordinates. */
export function prepareCanvas(canvas) {
  const rect=canvas.getBoundingClientRect(), dpr=globalThis.devicePixelRatio||1;
  canvas.width=Math.max(1,Math.round(rect.width*dpr)); canvas.height=Math.max(1,Math.round(rect.height*dpr));
  const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return {ctx,width:rect.width,height:rect.height};
}
/** Simple chart with shared x/y scaling; series are {label,color,points:[[x,y],...]}. */
export function drawLineChart(canvas, series, {xLabel='',yLabel='',xRange,yRange}={}) {
  const {ctx,width:w,height:h}=prepareCanvas(canvas), pts=series.flatMap(s=>s.points).filter(p=>p.length===2&&p.every(Number.isFinite));
  ctx.clearRect(0,0,w,h); ctx.fillStyle='#f7fafc'; ctx.fillRect(0,0,w,h);
  if(!pts.length) return;
  const extent=(index,range)=>{let a=range?.[0]??Math.min(...pts.map(p=>p[index])),b=range?.[1]??Math.max(...pts.map(p=>p[index])); if(!Number.isFinite(a)||!Number.isFinite(b)||a>b) throw new RangeError('invalid plot range'); if(a===b){a-=.5;b+=.5;} return [a,b];};
  const [xmin,xmax]=extent(0,xRange),[ymin,ymax]=extent(1,yRange), l=55,r=w-20,t=20,b=h-42;
  const x=v=>l+(v-xmin)/(xmax-xmin)*(r-l), y=v=>b-(v-ymin)/(ymax-ymin)*(b-t);
  ctx.font='12px system-ui'; ctx.strokeStyle='#a9b7c7'; ctx.fillStyle='#46566b'; ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const f=i/4, xx=l+f*(r-l),yy=b-f*(b-t); ctx.beginPath();ctx.moveTo(l,yy);ctx.lineTo(r,yy);ctx.stroke();ctx.fillText((ymin+f*(ymax-ymin)).toPrecision(2),4,yy+4);ctx.fillText((xmin+f*(xmax-xmin)).toPrecision(2),xx-8,b+17);}
  ctx.save();ctx.beginPath();ctx.rect(l,t,r-l,b-t);ctx.clip();
  for(const s of series){ctx.beginPath();ctx.strokeStyle=s.color||'#2463eb';ctx.lineWidth=2;let started=false; for(const p of s.points){if(!p.every(Number.isFinite)){started=false;continue;} if(!started){ctx.moveTo(x(p[0]),y(p[1]));started=true;}else ctx.lineTo(x(p[0]),y(p[1]));}ctx.stroke();}ctx.restore();
  ctx.fillStyle='#46566b';ctx.fillText(xLabel,(l+r)/2,b+35);ctx.save();ctx.translate(13,(t+b)/2);ctx.rotate(-Math.PI/2);ctx.fillText(yLabel,0,0);ctx.restore();
}
/** Download a text artifact. */
export function downloadText(text,filename,type='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([text],{type})), a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
}
/** Run a module worker that answers {id, result} or {id, error}. dispose rejects pending calls. */
export function createWorkerClient(url, WorkerClass=Worker) {
  const worker=new WorkerClass(url,{type:'module'}), pending=new Map(); let next=0, closed=false;
  function failAll(error){for(const {reject} of pending.values()) reject(error);pending.clear();}
  worker.addEventListener('message',({data})=>{const call=pending.get(data?.id);if(!call)return;pending.delete(data.id);if(data.error!=null)call.reject(new Error(String(data.error)));else call.resolve(data.result);});
  worker.addEventListener('error',event=>{closed=true;worker.terminate();failAll(new Error(event.message||'Worker failed'));});
  return {run(payload){if(closed)return Promise.reject(new Error('Worker client disposed'));const id=++next;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});try{worker.postMessage({id,payload});}catch(e){pending.delete(id);reject(e);}});},dispose(){if(closed)return;closed=true;worker.terminate();failAll(new Error('Worker client disposed'));}};
}
