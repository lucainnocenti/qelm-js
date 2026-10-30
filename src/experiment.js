/** Cartesian parameter grid, in object key order. */
export function parameterGrid(axes) {
  return Object.entries(axes).reduce((rows,[key,values])=>{ if(!Array.isArray(values)||!values.length) throw new RangeError(`empty axis: ${key}`); return rows.flatMap(row=>values.map(value=>({...row,[key]:value}))); },[{}]);
}
/** Sequential async sweep with cooperative cancellation and progress callbacks. */
export async function runSweep(tasks, evaluate, {signal,onProgress=()=>{}}={}) {
  const results=[];
  for(let i=0;i<tasks.length;i++) {
    if(signal?.aborted) throw new DOMException('Sweep aborted','AbortError');
    const value=await evaluate(tasks[i],i,signal);
    if(signal?.aborted) throw new DOMException('Sweep aborted','AbortError');
    results.push(value); onProgress({completed:i+1,total:tasks.length,task:tasks[i],value});
  }
  return results;
}
/** Encode rows to RFC 4180-style CSV with explicit columns. */
export function toCSV(rows, columns) {
  const cell=v=>{const s=v==null?'':String(v); return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;};
  return [columns.map(cell).join(','),...rows.map(row=>columns.map(k=>cell(row[k])).join(','))].join('\r\n');
}
