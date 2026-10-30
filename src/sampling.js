/** Validate probabilities, allowing only roundoff in their sum. */
export function validateProbabilities(p) {
  if (!p || !p.length || !Array.from(p).every(x=>Number.isFinite(x)&&x>=0&&x<=1)) throw new RangeError('probabilities must be finite and in [0, 1]');
  if (Math.abs(Array.from(p).reduce((a,b)=>a+b,0)-1)>1e-8) throw new RangeError('probabilities must sum to one');
}
/** Independent categorical trials; O(shots × outcomes), exact and best for moderate shot counts. */
export function sampleFrequencies(p, shots, rng) {
  validateProbabilities(p);
  if (shots===Infinity) return Array.from(p);
  if (!Number.isSafeInteger(shots) || shots<1) throw new RangeError('shots must be a positive integer or Infinity');
  const counts=Array(p.length).fill(0), total=Array.from(p).reduce((a,b)=>a+b,0);
  for(let k=0;k<shots;k++) { const u=rng.uniform()*total; let sum=0, i=0; for(;i<p.length-1;i++){sum+=p[i]; if(u<sum) break;} counts[i]++; }
  return counts.map(c=>c/shots);
}
/** Covariance of empirical multinomial frequencies. */
export function frequencyCovariance(p, shots) {
  validateProbabilities(p); if (shots!==Infinity && (!Number.isSafeInteger(shots)||shots<1)) throw new RangeError('shots must be a positive integer or Infinity');
  return Array.from(p,(x,i)=>Array.from(p,(y,j)=>(i===j?x:0)-x*y).map(v=>shots===Infinity?0:v/shots));
}
