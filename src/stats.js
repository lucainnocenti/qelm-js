/** Linear interpolation between ordered observations. */
export function quantile(values,q) {
  if (!values.length || !values.every(Number.isFinite) || !(q>=0&&q<=1)) throw new RangeError('finite nonempty values and q in [0,1] required');
  const x=[...values].sort((a,b)=>a-b), k=(x.length-1)*q, i=Math.floor(k), f=k-i; return x[i]*(1-f)+x[Math.min(i+1,x.length-1)]*f;
}
/** Mean, sample variance, and quantiles. Variance is zero for one observation. */
export function summarize(values) {
  if(!values.length||!values.every(Number.isFinite)) throw new RangeError('finite nonempty values required');
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  return {count:values.length,mean,variance:values.reduce((s,x)=>s+(x-mean)**2,0)/Math.max(1,values.length-1),median:quantile(values,.5),q05:quantile(values,.05),q95:quantile(values,.95)};
}
/** Population bias–variance decomposition of empirical squared error. */
export function predictionMetrics(predictions,truth) {
  if(!Number.isFinite(truth)||!predictions.length||!predictions.every(Number.isFinite)) throw new RangeError('finite predictions and truth required');
  const mean=predictions.reduce((a,b)=>a+b,0)/predictions.length, bias=mean-truth;
  const variance=predictions.reduce((s,x)=>s+(x-mean)**2,0)/predictions.length;
  return {mean,bias,biasSquared:bias*bias,variance,mse:predictions.reduce((s,x)=>s+(x-truth)**2,0)/predictions.length};
}
