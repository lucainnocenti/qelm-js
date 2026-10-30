import test from 'node:test';
import assert from 'node:assert/strict';
import {Random,mixSeed,randomPureState,randomIsometry,frameProbabilities,qubitEffects,qubitProbabilities,sampleFrequencies,frequencyCovariance,symmetricEigen,fitReadout,quantile,predictionMetrics,parameterGrid,runSweep,toCSV} from '../src/index.js';
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('seeded streams reproduce and separate',()=>{const a=new Random(4),b=new Random(4),c=new Random(mixSeed(4,1));for(let i=0;i<20;i++) assert.equal(a.normal(),b.normal()); assert.notEqual(c.uniform(),b.uniform());});
test('random frames are isometric and Born probabilities agree with qubit representation',()=>{
 for(let seed=0;seed<10;seed++) {const rng=new Random(seed), f=randomIsometry(7,2,rng), s=randomPureState(2,rng);
  for(let i=0;i<2;i++) for(let j=0;j<2;j++){let re=0,im=0;for(let k=0;k<7;k++){re+=f[i].re[k]*f[j].re[k]+f[i].im[k]*f[j].im[k];im+=f[i].re[k]*f[j].im[k]-f[i].im[k]*f[j].re[k];}near(re,+(i===j));near(im,0);}
  const [a,b]=s.re,[c,d]=s.im,r=[2*(a*b+c*d),2*(a*d-c*b),a*a+c*c-b*b-d*d];
  const p=frameProbabilities(f,s), q=qubitProbabilities(qubitEffects(f),r); p.forEach((x,i)=>near(x,q[i])); near(p.reduce((x,y)=>x+y,0),1);
  near(frameProbabilities(f,s,1).reduce((x,y)=>x+y,0),1);
 }
 assert.throws(()=>randomIsometry(1,2,new Random(1)));assert.throws(()=>qubitProbabilities([{t:1,v:[0,0,0]}],[0,0,0]));
});
test('sampling has expected means and multinomial covariance',()=>{
 const p=[.2,.3,.5], rng=new Random(123), shots=30, n=10000, draws=Array.from({length:n},()=>sampleFrequencies(p,shots,rng));
 for(let i=0;i<3;i++) near(draws.reduce((s,x)=>s+x[i],0)/n,p[i],.004);
 const cov=frequencyCovariance(p,shots); const c=draws.reduce((s,x)=>s+(x[0]-p[0])*(x[1]-p[1]),0)/n;near(c,cov[0][1],.0005);
 assert.deepEqual(sampleFrequencies(p,Infinity,rng),p);assert.throws(()=>sampleFrequencies([.1,.2],2,rng));
});
test('eigenvectors satisfy eigen equation; ridge handles singular and regularized systems',()=>{
 const A=[[2,1],[1,2]], eig=symmetricEigen(A); near(eig[0].value,3);near(eig[1].value,1);
 for(const e of eig) for(let i=0;i<2;i++) near(A[i][0]*e.vector[0]+A[i][1]*e.vector[1],e.value*e.vector[i]);
 const fit=fitReadout([[1,1],[2,2]],[2,4]);near(fit.weights[0],1);near(fit.weights[1],1);assert.equal(fit.rank,1);near(fit.predict([3,3]),6);
 const ridge=fitReadout([[1,0],[0,1]],[2,4],{lambda:1});near(ridge.weights[0],1);near(ridge.weights[1],2);
});
test('statistics, grid, CSV, and cancellation',async()=>{
 near(quantile([3,1,2],.5),2);const m=predictionMetrics([1,2,4],2);near(m.mse,m.biasSquared+m.variance);
 assert.deepEqual(parameterGrid({a:[1,2],b:['x','y']}),[{a:1,b:'x'},{a:1,b:'y'},{a:2,b:'x'},{a:2,b:'y'}]);
 assert.equal(toCSV([{a:'a,b',b:'"x"'}],['a','b']),'a,b\r\n"a,b","""x"""');
 const controller=new AbortController(),seen=[];await assert.rejects(runSweep([1,2],async x=>x*2,{signal:controller.signal,onProgress:p=>{seen.push(p.value);controller.abort();}}),{name:'AbortError'});assert.deepEqual(seen,[2]);
});

test('browser store and worker client manage subscriptions and pending requests',async()=>{
 const {createStore,createWorkerClient}=await import('../src/browser.js');
 const store=createStore({value:1}), seen=[]; const unsubscribe=store.subscribe(s=>seen.push(s.value)); store.set({value:2}); unsubscribe(); store.set({value:3}); assert.deepEqual(seen,[2]); assert.equal(store.get().value,3);
 class FakeWorker { constructor(){this.handlers={};FakeWorker.instance=this;} addEventListener(name,fn){this.handlers[name]=fn;} postMessage(data){this.sent=data;} terminate(){this.terminated=true;} }
 const client=createWorkerClient('worker.js',FakeWorker), promise=client.run({a:1}), worker=FakeWorker.instance; worker.handlers.message({data:{id:worker.sent.id,result:42}});assert.equal(await promise,42);
 const pending=client.run({});client.dispose();await assert.rejects(pending,/disposed/);assert.equal(worker.terminated,true);await assert.rejects(client.run({}),/disposed/);
});
