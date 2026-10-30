export function dot(a,b) { if(a.length!==b.length) throw new RangeError('vector lengths differ'); return a.reduce((s,x,i)=>s+x*b[i],0); }
/** Symmetric Jacobi eigensolver. Returns descending eigenpairs, eigenvectors in columns. */
export function symmetricEigen(matrix, {tolerance=1e-13, maxSweeps=100}={}) {
  const n=matrix.length;
  if (!n || matrix.some(r=>r.length!==n || !r.every(Number.isFinite))) throw new TypeError('matrix must be finite and square');
  if (!(tolerance>0) || !Number.isInteger(maxSweeps) || maxSweeps<1) throw new RangeError('invalid eigensolver options');
  const a=matrix.map(r=>Array.from(r)), v=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));
  let scale=Math.max(...a.flat().map(Math.abs),Number.MIN_VALUE);
  for(let i=0;i<n;i++) for(let j=0;j<i;j++) if(Math.abs(a[i][j]-a[j][i])>tolerance*scale) throw new RangeError('matrix must be symmetric');
  let converged=n===1;
  for(let sweep=0;sweep<maxSweeps;sweep++) {
    let largest=0;
    for(let p=0;p<n;p++) for(let q=p+1;q<n;q++) {
      const z=a[p][q]; largest=Math.max(largest,Math.abs(z)); if(Math.abs(z)<=tolerance*scale) continue;
      const tau=(a[q][q]-a[p][p])/(2*z), t=(tau>=0?1:-1)/(Math.abs(tau)+Math.hypot(1,tau)), c=1/Math.hypot(1,t), s=t*c;
      const app=a[p][p], aqq=a[q][q]; a[p][p]=app-t*z; a[q][q]=aqq+t*z; a[p][q]=a[q][p]=0;
      for(let k=0;k<n;k++) if(k!==p&&k!==q) { const x=a[k][p], y=a[k][q]; a[k][p]=a[p][k]=c*x-s*y; a[k][q]=a[q][k]=s*x+c*y; }
      for(let k=0;k<n;k++){ const x=v[k][p],y=v[k][q]; v[k][p]=c*x-s*y; v[k][q]=s*x+c*y; }
    }
    if(largest<=tolerance*scale) {converged=true;break;}
  }
  if(!converged) throw new Error('eigensolver did not converge');
  return Array.from({length:n},(_,i)=>({value:a[i][i],vector:v.map(row=>row[i])})).sort((x,y)=>y.value-x.value);
}
/** Ridge regression minimizing ||Xw-y||² + lambda ||w||². lambda=0 uses a truncated pseudoinverse. */
export function fitReadout(X,y,{lambda=0,rcond=1e-10}={}) {
  if(!Array.isArray(X)||!X.length||!X[0].length||X.length!==y.length||X.some(r=>r.length!==X[0].length||!r.every(Number.isFinite))||!y.every(Number.isFinite)) throw new TypeError('X and y must be finite, rectangular, and have matching rows');
  if(!Number.isFinite(lambda)||lambda<0||!Number.isFinite(rcond)||rcond<0||rcond>=1) throw new RangeError('invalid lambda or rcond');
  const n=X[0].length, gram=Array.from({length:n},()=>Array(n).fill(0)), rhs=Array(n).fill(0);
  for(let k=0;k<X.length;k++) for(let i=0;i<n;i++){ rhs[i]+=X[k][i]*y[k]; for(let j=0;j<n;j++) gram[i][j]+=X[k][i]*X[k][j]; }
  const eig=symmetricEigen(gram), cutoff=Math.max(0,eig[0].value)*rcond*rcond, weights=Array(n).fill(0); let rank=0;
  // Gram matrices square the condition number; discard eigenvalues below numerical precision.
  const numerical=Math.max(0,eig[0].value)*Number.EPSILON*n*8;
  for(const e of eig) { if(e.value<=Math.max(cutoff,numerical)) continue; rank++; const a=dot(e.vector,rhs)/(e.value+lambda); e.vector.forEach((v,i)=>weights[i]+=a*v); }
  return {weights,rank,eigenvalues:eig.map(e=>e.value), predict: features=>dot(weights,features)};
}
