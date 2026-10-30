function integer(n, name, min = 1) { if (!Number.isInteger(n) || n < min) throw new RangeError(`${name} must be an integer >= ${min}`); }
function complexVector(v, size, name) {
  if (!v || v.re?.length !== size || v.im?.length !== size || !Array.from(v.re).every(Number.isFinite) || !Array.from(v.im).every(Number.isFinite)) throw new TypeError(`${name} must contain finite re and im arrays of length ${size}`);
}
/** Haar-random pure state, represented as {re, im}. */
export function randomPureState(d, rng) {
  integer(d, 'dimension'); const re = [], im = []; let n = 0;
  for (let j = 0; j < d; j++) { re.push(rng.normal()); im.push(rng.normal()); n += re[j] ** 2 + im[j] ** 2; }
  if (!(n > 0)) throw new Error('random stream produced a zero state');
  n = Math.sqrt(n); return {re: re.map(x => x / n), im: im.map(x => x / n)};
}
/** Random m×d complex isometry, as d complex columns, via reorthogonalized Gram–Schmidt. */
export function randomIsometry(m, d, rng) {
  integer(m, 'outcomes'); integer(d, 'dimension'); if (m < d) throw new RangeError('outcomes must be >= dimension');
  const columns = [];
  for (let j = 0; j < d; j++) {
    const re = Array.from({length:m}, () => rng.normal()), im = Array.from({length:m}, () => rng.normal());
    for (let pass = 0; pass < 2; pass++) for (const q of columns) {
      let a = 0, b = 0;
      for (let i = 0; i < m; i++) { a += q.re[i]*re[i] + q.im[i]*im[i]; b += q.re[i]*im[i] - q.im[i]*re[i]; }
      for (let i = 0; i < m; i++) { re[i] -= q.re[i]*a - q.im[i]*b; im[i] -= q.re[i]*b + q.im[i]*a; }
    }
    const n = Math.sqrt(re.reduce((s,x,i) => s + x*x + im[i]*im[i], 0));
    if (!(n > 1e-14)) throw new Error('isometry columns are numerically dependent');
    columns.push({re:re.map(x=>x/n), im:im.map(x=>x/n)});
  }
  return columns;
}
/** Probabilities for Q†|a><a|Q and rho=(1-mix)|psi><psi|+mix I/d. */
export function frameProbabilities(columns, psi, mix = 0) {
  const d = columns?.length; if (!d) throw new TypeError('frame must have columns');
  const m = columns[0].re?.length; integer(m, 'outcomes');
  for (const c of columns) complexVector(c,m,'column'); complexVector(psi,d,'state');
  if (!(mix >= 0 && mix <= 1)) throw new RangeError('mix must be in [0, 1]');
  const stateNorm = psi.re.reduce((s,x,i)=>s+x*x+psi.im[i]*psi.im[i],0);
  if (Math.abs(stateNorm-1)>1e-8) throw new RangeError('state must be normalized');
  const p = Array.from({length:m}, (_,a) => {
    let re=0, im=0, rowNorm=0;
    for(let j=0;j<d;j++) { const c=columns[j]; re+=c.re[a]*psi.re[j]-c.im[a]*psi.im[j]; im+=c.re[a]*psi.im[j]+c.im[a]*psi.re[j]; rowNorm+=c.re[a]**2+c.im[a]**2; }
    return (1-mix)*(re*re+im*im)+mix*rowNorm/d;
  });
  if (Math.abs(p.reduce((s,x)=>s+x,0)-1)>1e-8) throw new RangeError('frame does not define normalized probabilities');
  return p;
}
/** Born probabilities for qubit effects E=(t I + v·σ)/2 and Bloch vector r. */
export function qubitProbabilities(effects, r) {
  if (!Array.isArray(r) || r.length!==3 || !r.every(Number.isFinite) || Math.hypot(...r)>1+1e-10) throw new RangeError('Bloch vector must be finite and inside the unit ball');
  if (!Array.isArray(effects) || !effects.length) throw new TypeError('effects must be nonempty');
  const p = effects.map(e=>{
    if (!Number.isFinite(e.t) || !Array.isArray(e.v) || e.v.length!==3 || !e.v.every(Number.isFinite) || e.t < Math.hypot(...e.v)-1e-10) throw new RangeError('invalid positive qubit effect');
    return (e.t+e.v.reduce((s,x,i)=>s+x*r[i],0))/2;
  });
  const t=effects.reduce((s,e)=>s+e.t,0), v=[0,1,2].map(i=>effects.reduce((s,e)=>s+e.v[i],0));
  if (Math.abs(t-2)>1e-8 || Math.hypot(...v)>1e-8) throw new RangeError('effects must sum to identity');
  return p.map(x=>Math.max(0,x));
}
/** Convert a two-column isometry to qubit effects. */
export function qubitEffects(columns) {
  if (columns.length!==2) throw new RangeError('qubit frame requires two columns');
  const m=columns[0].re.length; columns.forEach(c=>complexVector(c,m,'column'));
  return Array.from({length:m},(_,i)=>{
    const a=columns[0].re[i], b=columns[0].im[i], c=columns[1].re[i], d=columns[1].im[i];
    return {t:a*a+b*b+c*c+d*d, v:[2*(a*c+b*d),-2*(a*d-b*c),a*a+b*b-c*c-d*d]};
  });
}
